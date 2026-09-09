import { sha256Hex } from '../core/hash.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

function isBlank(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function normalizeText(value, policy) {
  const form = policy?.textPolicy?.unicodeNormalization || 'NFC';
  let out = String(value).normalize(form);
  if (policy?.textPolicy?.trimOuterWhitespace !== false) out = out.trim();
  if (policy?.textPolicy?.collapseInternalWhitespace) out = out.replace(/\s+/g, ' ');
  return out;
}

function parseNumber(value, policy) {
  if (typeof value === 'number') return Number.isFinite(value) ? { ok:true, value } : { ok:false, reason:'non-finite-number' };
  if (typeof value !== 'string') return { ok:false, reason:'not-numeric' };
  let s=value.trim();
  if (!s) return { ok:false, reason:'blank' };
  if (policy?.numberPolicy?.allowThousandsSeparators) {
    const western=/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
    const indian=/^[+-]?\d{1,2}(?:,\d{2})*,\d{3}(?:\.\d+)?$/;
    if (s.includes(',')) {
      if (!(western.test(s) || indian.test(s))) return { ok:false, reason:'invalid-thousands-grouping' };
      s=s.replace(/,/g,'');
    }
  }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) return { ok:false, reason:'not-numeric' };
  const n=Number(s);
  if (!Number.isFinite(n)) return { ok:false, reason:'non-finite-number' };
  return { ok:true, value:n };
}

function validIsoDateParts(y,m,d) {
  const dt=new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear()===y && dt.getUTCMonth()===m-1 && dt.getUTCDate()===d;
}

function parseDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return {ok:true,value:value.toISOString().slice(0,10)};
  if (typeof value !== 'string') return {ok:false,reason:'not-iso-date'};
  const s=value.trim();
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (!m) return {ok:false,reason:'ambiguous-or-invalid-date-text'};
  const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
  if (!validIsoDateParts(y,mo,d)) return {ok:false,reason:'invalid-calendar-date'};
  return {ok:true,value:`${m[1]}-${m[2]}-${m[3]}`};
}

function normalizeUnitToken(value='') {
  return String(value).normalize('NFKC').toLowerCase().trim()
    .replace(/²/g,'2').replace(/³/g,'3')
    .replace(/\s+/g,' ')
    .replace(/^sq\.?\s*m$/,'sq m');
}

function headerUnitToken(header='') {
  const s=String(header).trim();
  const bracket=s.match(/[\[(]\s*([^\])]+?)\s*[\])]\s*$/);
  if (bracket) return { explicit:true, token:normalizeUnitToken(bracket[1]), raw:bracket[1] };
  const knownTail=s.match(/(?:\s|_|-)(m²|m2|m³|m3|ha|mm\/day|mm\/d|cm\/day|cm\/d|mm\/hour|mm\/hr|mm\/h|cm\/hour|cm\/hr|cm\/h|decimal degrees|degrees|deg|cm|mm|ft|feet|hours|hour|hrs|hr|person-days|person days|percent|percentage|%)$/i);
  if (knownTail) return { explicit:true, token:normalizeUnitToken(knownTail[1]), raw:knownTail[1] };
  return { explicit:false, token:null, raw:null };
}

function unitResolution(canonicalUnit, sourceHeader, unitPolicy) {
  const policy=unitPolicy?.units?.[canonicalUnit] || {canonical:[],conversions:{},passthrough:true};
  if (policy.passthrough || !canonicalUnit) return {status:'passthrough',sourceUnit:canonicalUnit||null,canonicalUnit:canonicalUnit||null,factor:1};
  const explicit=headerUnitToken(sourceHeader);
  if (!explicit.explicit) return {status:'assumed-canonical-by-schema',sourceUnit:canonicalUnit,canonicalUnit,factor:1};
  const token=explicit.token;
  const canon=new Set((policy.canonical||[]).map(normalizeUnitToken));
  if (canon.has(token)) return {status:'explicit-canonical',sourceUnit:explicit.raw,canonicalUnit,factor:1};
  const conv=Object.fromEntries(Object.entries(policy.conversions||{}).map(([k,v])=>[normalizeUnitToken(k),v]));
  if (Object.prototype.hasOwnProperty.call(conv,token)) return {status:'converted',sourceUnit:explicit.raw,canonicalUnit,factor:Number(conv[token])};
  return {status:'unsupported-explicit-unit',sourceUnit:explicit.raw,canonicalUnit,factor:null};
}

function canonicalizeValue(sourceValue, field, mapping, policy) {
  const base={
    fieldId:field.field_id,
    dataType:field.data_type,
    canonicalUnit:field.unit_format || null,
    sourceSheet:mapping.sourceSheet,
    sourceHeader:mapping.sourceHeader,
    sourceColumnIndex:mapping.sourceColumnIndex,
    mappingMethod:mapping.method,
    sourceValue,
    canonicalValue:null,
    sourceUnit:null,
    unitStatus:'not-applicable',
    conversionFactor:1,
    status:'canonical',
    diagnosticCode:null,
  };
  if (mapping.sourceHeader===null || mapping.sourceColumnIndex===null) return {...base,status:'unmapped',diagnosticCode:'UNMAPPED_FIELD'};
  if (isBlank(sourceValue)) return {...base,status:'blank',diagnosticCode:null};

  if (field.data_type==='Text' || field.data_type==='Dropdown') {
    return {...base,canonicalValue:normalizeText(sourceValue,policy),status:'canonical'};
  }
  if (field.data_type==='Date') {
    const parsed=parseDate(sourceValue);
    return parsed.ok ? {...base,canonicalValue:parsed.value,status:'canonical',sourceUnit:'date',unitStatus:'passthrough'}
      : {...base,status:'type-error',diagnosticCode:'DATE_TYPE_ERROR',diagnosticDetail:parsed.reason,sourceUnit:'date',unitStatus:'passthrough'};
  }
  if (field.data_type==='Decimal' || field.data_type==='Integer') {
    const parsed=parseNumber(sourceValue,policy);
    if (!parsed.ok) return {...base,status:'type-error',diagnosticCode:'NUMBER_TYPE_ERROR',diagnosticDetail:parsed.reason};
    if (field.data_type==='Integer' && !Number.isInteger(parsed.value)) return {...base,status:'type-error',diagnosticCode:'INTEGER_TYPE_ERROR',diagnosticDetail:'non-integer-number'};
    const units=unitResolution(field.unit_format||'',mapping.sourceHeader||'',policy);
    if (units.status==='unsupported-explicit-unit') return {...base,sourceUnit:units.sourceUnit,unitStatus:units.status,conversionFactor:null,status:'unit-error',diagnosticCode:'UNSUPPORTED_SOURCE_UNIT'};
    const canonical=parsed.value*(units.factor??1);
    return {...base,sourceUnit:units.sourceUnit,unitStatus:units.status,conversionFactor:units.factor??1,canonicalValue:canonical,status:units.status==='converted'?'converted':'canonical'};
  }
  return {...base,canonicalValue:sourceValue,status:'canonical'};
}

function fieldById(inputSchema) {
  return new Map(inputSchema.fields.map(f=>[f.field_id,f]));
}

function mappingById(mapping) {
  return new Map(mapping.fieldMappings.map(m=>[m.fieldId,m]));
}

function sourceSheetByName(raw) {
  return new Map(raw.sheets.map(s=>[s.name,s]));
}

function tableGrain(inputSchema, sheet) {
  const grainMap={
    '01_Control':'one row per reporting run',
    '02_Structures':'one row per structure/intervention',
    '03_Technical':'one technical row per physical structure',
    '04_Catchments':'one catchment row per structure',
    '05_Cascade_Links':'one upstream-to-downstream link',
    '06_Daily_Rainfall':'one station-date observation',
    '07_Hydro_Params':'one hydro parameter group',
    '08_Stage_Area_Optional':'one stage-area observation',
    '09_Silt_Assessment':'one silt assessment/application',
    '10_Person_Days':'one person-day claim/work record',
    '11_Evidence':'one evidence item'
  };
  return grainMap[sheet] || inputSchema.workbook_contract?.[`${sheet}_grain`] || 'controlled record';
}

function summarizeTables(tables) {
  const stats={
    tableCount:tables.length,recordCount:0,cellCount:0,canonicalCount:0,blankCount:0,zeroCount:0,
    convertedCount:0,typeErrorCount:0,unitErrorCount:0,unmappedCellCount:0,diagnosticCount:0,
    sourceUnitConversions:{},tables:{}
  };
  for (const t of tables) {
    const ts={records:t.records.length,cells:0,canonical:0,blank:0,zeros:0,converted:0,typeErrors:0,unitErrors:0,unmapped:0};
    stats.recordCount+=t.records.length;
    for (const r of t.records) for (const cell of Object.values(r.cells)) {
      ts.cells++;stats.cellCount++;
      if (cell.status==='blank'){ts.blank++;stats.blankCount++;}
      else if(cell.status==='converted'){ts.converted++;stats.convertedCount++;ts.canonical++;stats.canonicalCount++;const key=`${cell.sourceUnit}->${cell.canonicalUnit}`;stats.sourceUnitConversions[key]=(stats.sourceUnitConversions[key]||0)+1;}
      else if(cell.status==='type-error'){ts.typeErrors++;stats.typeErrorCount++;stats.diagnosticCount++;}
      else if(cell.status==='unit-error'){ts.unitErrors++;stats.unitErrorCount++;stats.diagnosticCount++;}
      else if(cell.status==='unmapped'){ts.unmapped++;stats.unmappedCellCount++;}
      else {ts.canonical++;stats.canonicalCount++;}
      if (cell.canonicalValue===0) {ts.zeros++;stats.zeroCount++;}
    }
    stats.tables[t.expectedSheet]=ts;
  }
  return stats;
}

function makePublicSummary(snapshot) {
  return {
    engine:'E03',engineContractVersion:'E03-v0.3.0',
    sourceSessionId:snapshot.sourceSessionId,sourceWorkbookSha256:snapshot.sourceWorkbookSha256,
    mappingSnapshotHash:snapshot.mappingSnapshotHash,schemaVersion:snapshot.schemaVersion,
    canonicalizationPolicyVersion:snapshot.canonicalizationPolicyVersion,canonicalContentHash:snapshot.canonicalContentHash,
    canonicalSnapshotHash:snapshot.canonicalSnapshotHash,status:snapshot.status,stats:snapshot.stats,
    tableInventory:snapshot.tables.map(t=>({expectedSheet:t.expectedSheet,sourceSheet:t.sourceSheet,grain:t.grain,recordCount:t.records.length,fieldCount:t.fieldIds.length})),
    diagnostics:snapshot.diagnostics.slice(0,100),
    notes:[
      'Source values are preserved alongside canonical values in the private immutable canonical snapshot.',
      'Blank/null stays null and numeric zero stays zero.',
      'Engine 3 performs type/unit normalization only; route-requiredness and readiness validation belong to Engine 4.',
      'Unsupported explicit units and unparseable typed values become diagnostics; Engine 3 does not invent replacement values.',
      'Canonical data remains browser-memory-only and is not encoded in the URL.'
    ]
  };
}

export function buildCanonicalTables({raw,mapping,inputSchema,policy}) {
  if (!mapping?.immutableSnapshot || !mapping?.snapshotHash) throw new Error('Engine 3 requires a finalized Engine 2 mapping snapshot.');
  const fields=fieldById(inputSchema), maps=mappingById(mapping), sources=sourceSheetByName(raw);
  const expectedSheets=[...new Set(inputSchema.fields.map(f=>f.sheet))];
  const tables=[]; const diagnostics=[];
  for (const expectedSheet of expectedSheets) {
    const fieldsForSheet=inputSchema.fields.filter(f=>f.sheet===expectedSheet);
    const sheetMap=mapping.sheetMappings.find(s=>s.expectedSheet===expectedSheet);
    const source=sources.get(sheetMap?.sourceSheet)||null;
    const records=[];
    if (source) {
      for (const sourceRecord of source.records) {
        const cells={}; const values={};
        for (const field of fieldsForSheet) {
          const m=maps.get(field.field_id);
          const sourceValue=m?.sourceColumnIndex===null || m?.sourceColumnIndex===undefined ? null : sourceRecord.values[m.sourceColumnIndex] ?? null;
          const cell=canonicalizeValue(sourceValue,field,m||{sourceSheet:null,sourceHeader:null,sourceColumnIndex:null,method:'unmapped'},policy);
          cells[field.field_id]=cell; values[field.field_id]=cell.canonicalValue;
          if (cell.status==='type-error'||cell.status==='unit-error') diagnostics.push({
            code:cell.diagnosticCode,expectedSheet,sourceSheet:source.name,sourceRowNumber:sourceRecord.sourceRowNumber,
            fieldId:field.field_id,sourceHeader:cell.sourceHeader,status:cell.status,detail:cell.diagnosticDetail||null,
            note:'Diagnostic only at Engine 3; Design 4 decides readiness impact.'
          });
        }
        records.push({
          canonicalRecordKey:`${expectedSheet}:${source.name}:${sourceRecord.sourceRowNumber}`,
          expectedSheet,sourceSheet:source.name,sourceRowNumber:sourceRecord.sourceRowNumber,
          values,cells
        });
      }
    }
    tables.push({
      expectedSheet,sourceSheet:source?.name??null,grain:tableGrain(inputSchema,expectedSheet),
      fieldIds:fieldsForSheet.map(f=>f.field_id),records,
      status:source?'canonicalized':'source-sheet-unmapped'
    });
  }
  return {tables,diagnostics};
}

export async function runEngine03({config},{store,bus}={}) {
  const state=store?.getState();
  const raw=state?.raw, mapping=state?.mapping;
  if (!raw) throw new Error('Engine 3 cannot start before Engine 1 source intake.');
  if (!mapping?.immutableSnapshot || !mapping?.snapshotHash) throw new Error('Engine 3 cannot start before Engine 2 mapping is finalized.');
  if (!config?.canonicalizationPolicy) throw new Error('Engine 3 canonicalization policy is not loaded.');
  store?.patch({lifecycle:'canonicalization_processing',canonicalization:null,canonical:null,error:null});
  bus?.emit('canonicalization:started',{sourceSessionId:raw.sourceSessionId,mappingSnapshotHash:mapping.snapshotHash});
  const built=buildCanonicalTables({raw,mapping,inputSchema:config.inputSchema,policy:config.canonicalizationPolicy});
  const stats=summarizeTables(built.tables);
  const status=(stats.typeErrorCount||stats.unitErrorCount)?'canonical_complete_with_diagnostics':'canonical_complete';
  const contentCore={
    sourceWorkbookSha256:raw.sourceWorkbookSha256,schemaVersion:config.inputSchema.schema_version,
    canonicalizationPolicyVersion:config.canonicalizationPolicy.policyVersion,tables:built.tables,diagnostics:built.diagnostics,stats,status
  };
  const canonicalContentHash=await sha256Hex(new TextEncoder().encode(stableJson(contentCore)).buffer);
  const core={
    engine:'E03',engineContractVersion:'E03-v0.3.0',sourceSessionId:raw.sourceSessionId,
    sourceWorkbookSha256:raw.sourceWorkbookSha256,mappingSnapshotHash:mapping.snapshotHash,
    schemaVersion:config.inputSchema.schema_version,canonicalizationPolicyVersion:config.canonicalizationPolicy.policyVersion,
    canonicalContentHash,tables:built.tables,diagnostics:built.diagnostics,stats,status
  };
  const canonicalSnapshotHash=await sha256Hex(new TextEncoder().encode(stableJson(core)).buffer);
  const immutableSnapshot=deepFreeze({...core,canonicalSnapshotHash});
  const canonical=Object.freeze({immutableSnapshot,canonicalSnapshotHash,getSnapshot:()=>immutableSnapshot});
  const summary=makePublicSummary(immutableSnapshot);
  store?.patch({lifecycle:'canonical_ready',canonicalization:summary,canonical,error:null});
  bus?.emit('canonicalization:completed',{canonicalSnapshotHash,status:summary.status,stats:summary.stats});
  return summary;
}

export { canonicalizeValue, parseNumber, parseDate, unitResolution, headerUnitToken };
