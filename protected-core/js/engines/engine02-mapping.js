import { sha256Hex } from '../core/hash.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function compact(value) { return normalizeHeader(value).replace(/\s+/g, ''); }

function levenshtein(a, b) {
  const x=compact(a), y=compact(b);
  if (x===y) return 0;
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  const prev=Array.from({length:y.length+1},(_,i)=>i);
  const cur=new Array(y.length+1);
  for (let i=1;i<=x.length;i++) {
    cur[0]=i;
    for (let j=1;j<=y.length;j++) {
      cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));
    }
    for (let j=0;j<=y.length;j++) prev[j]=cur[j];
  }
  return prev[y.length];
}

function similarity(a,b) {
  const aa=compact(a), bb=compact(b);
  if (!aa || !bb) return 0;
  if (aa===bb) return 1;
  return 1 - levenshtein(aa,bb)/Math.max(aa.length,bb.length);
}

function valueKind(value) {
  if (value === null || value === undefined || value === '') return 'blank';
  if (typeof value === 'number' && Number.isFinite(value)) return 'number';
  if (typeof value === 'boolean') return 'boolean';
  const s=String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'date';
  if (s !== '' && Number.isFinite(Number(s))) return 'numberish';
  return 'text';
}

function profileColumn(sheet, index) {
  const counts={blank:0,number:0,numberish:0,date:0,text:0,boolean:0};
  for (const r of sheet.records.slice(0,100)) counts[valueKind(r.values[index])]++;
  const nonblank=Math.max(1,counts.number+counts.numberish+counts.date+counts.text+counts.boolean);
  return {counts, numericRatio:(counts.number+counts.numberish)/nonblank, dateRatio:counts.date/nonblank};
}

function typeCompatibility(field, profile) {
  if (!profile) return 1;
  if (field.data_type === 'Date') return profile.dateRatio >= .5 ? 1 : .7;
  if (field.data_type === 'Decimal' || field.data_type === 'Integer') return profile.numericRatio >= .5 ? 1 : .65;
  return 1;
}

function isCritical(field) {
  if (field.requirement_class === 'Core') return true;
  if (field.requirement_class !== 'Conditional') return false;
  return /^(TEC|CAT|RAN|HYP|STA|SIL|PD)-/.test(field.field_id);
}

function sourceColumns(sheet) {
  if (!sheet) return [];
  return sheet.headers.map((header,index)=>({
    header: header ?? '', index, normalized:normalizeHeader(header), profile:profileColumn(sheet,index)
  })).filter(c=>c.normalized);
}

function bestSheetMapping(expectedName, rawSheets, aliases) {
  const exact=rawSheets.find(s=>s.name===expectedName);
  if (exact) return {expectedSheet:expectedName, sourceSheet:exact.name, method:'exact-sheet-name',confidence:1,needsConfirmation:false,confirmed:true};
  const norm=normalizeHeader(expectedName);
  const normalized=rawSheets.find(s=>normalizeHeader(s.name)===norm);
  if (normalized) return {expectedSheet:expectedName,sourceSheet:normalized.name,method:'normalized-sheet-name',confidence:1,needsConfirmation:false,confirmed:true};
  const aliasSet=(aliases?.sheet_aliases?.[expectedName]||[]).map(normalizeHeader);
  const alias=rawSheets.find(s=>aliasSet.includes(normalizeHeader(s.name)));
  if (alias) return {expectedSheet:expectedName,sourceSheet:alias.name,method:'sheet-alias',confidence:.97,needsConfirmation:true,confirmed:false};
  let best=null;
  for (const s of rawSheets) {
    const score=similarity(expectedName,s.name);
    if (!best || score>best.score) best={sheet:s,score};
  }
  if (best && best.score >= .88) return {expectedSheet:expectedName,sourceSheet:best.sheet.name,method:'sheet-fuzzy',confidence:best.score,needsConfirmation:true,confirmed:false};
  return {expectedSheet:expectedName,sourceSheet:null,method:'unmapped',confidence:0,needsConfirmation:false,confirmed:false};
}

function matchField(field, sourceSheet, aliases, fuzzyConfig) {
  const cols=sourceColumns(sourceSheet);
  if (!sourceSheet) return unmapped(field,'missing-source-sheet');
  const fieldIdNorm=normalizeHeader(field.field_id);
  let col=cols.find(c=>c.normalized===fieldIdNorm);
  if (col) return mapped(field,sourceSheet,col,'exact-field-id',1,false);
  const expectedNorm=normalizeHeader(field.column_label);
  col=cols.find(c=>c.normalized===expectedNorm);
  if (col) return mapped(field,sourceSheet,col,'normalized-header',1,false);
  const aliasNorms=(aliases?.field_aliases?.[field.field_id]||[]).map(normalizeHeader);
  col=cols.find(c=>aliasNorms.includes(c.normalized));
  if (col) return mapped(field,sourceSheet,col,'alias',.97,isCritical(field));

  const candidates=cols.map(c=>{
    const scores=[similarity(field.column_label,c.header), similarity(field.field_id,c.header), ...aliasNorms.map(a=>similarity(a,c.header))];
    const headerScore=Math.max(...scores);
    const compat=typeCompatibility(field,c.profile);
    return {...c, score:headerScore*compat, headerScore, compat};
  }).sort((a,b)=>b.score-a.score);
  const top=candidates[0], second=candidates[1];
  const min=fuzzyConfig?.minimum_score ?? .82;
  const margin=fuzzyConfig?.minimum_margin ?? .05;
  if (top && top.score>=min && (!second || top.score-second.score>=margin)) {
    const result=mapped(field,sourceSheet,top,'fuzzy',top.score,true);
    result.suggestions=candidates.slice(0,fuzzyConfig?.max_suggestions_per_field ?? 3).map(c=>({header:c.header,columnIndex:c.index,score:c.score}));
    return result;
  }
  const result=unmapped(field,'no-confident-match');
  result.suggestions=candidates.slice(0,fuzzyConfig?.max_suggestions_per_field ?? 3).map(c=>({header:c.header,columnIndex:c.index,score:c.score}));
  return result;
}

function mapped(field,sheet,col,method,confidence,needsConfirmation) {
  return {
    fieldId:field.field_id, expectedSheet:field.sheet, expectedHeader:field.column_label,
    requirementClass:field.requirement_class, dataType:field.data_type, critical:isCritical(field),
    sourceSheet:sheet.name, sourceHeader:col.header, sourceColumnIndex:col.index,
    method, confidence:Number(confidence.toFixed(4)), needsConfirmation,
    confirmed:!needsConfirmation, userSelected:false, conflict:false, suggestions:[]
  };
}
function unmapped(field,reason) {
  return {
    fieldId:field.field_id,expectedSheet:field.sheet,expectedHeader:field.column_label,
    requirementClass:field.requirement_class,dataType:field.data_type,critical:isCritical(field),
    sourceSheet:null,sourceHeader:null,sourceColumnIndex:null,method:'unmapped',confidence:0,
    needsConfirmation:false,confirmed:false,userSelected:false,conflict:false,unmappedReason:reason,suggestions:[]
  };
}

function flagConflicts(fieldMappings) {
  const groups=new Map();
  for (const m of fieldMappings) {
    m.conflict=false;
    if (m.sourceSheet==null || m.sourceColumnIndex==null) continue;
    const key=`${m.sourceSheet}::${m.sourceColumnIndex}`;
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(m);
  }
  for (const group of groups.values()) if (group.length>1) for (const m of group) m.conflict=true;
}

function statsOf(fieldMappings,sheetMappings) {
  const methods=Counter(fieldMappings.map(m=>m.method));
  const fieldPending=fieldMappings.filter(m=>m.needsConfirmation && !m.confirmed).length;
  const sheetPending=sheetMappings.filter(m=>m.needsConfirmation && !m.confirmed).length;
  return {
    expectedFields:fieldMappings.length,
    mappedFields:fieldMappings.filter(m=>m.sourceHeader!==null).length,
    unmappedFields:fieldMappings.filter(m=>m.sourceHeader===null).length,
    fieldConfirmationRequired:fieldPending,
    sheetConfirmationRequired:sheetPending,
    confirmationRequired:fieldPending+sheetPending,
    conflicts:fieldMappings.filter(m=>m.conflict).length,
    expectedSheets:sheetMappings.length,
    mappedSheets:sheetMappings.filter(m=>m.sourceSheet).length,
    methods
  };
}
function Counter(values){const out={};for(const v of values)out[v]=(out[v]||0)+1;return out;}

export function buildMappingPreview({raw,inputSchema,aliases}) {
  if (!raw?.sheets) throw new Error('Engine 2 requires the immutable E01 raw source snapshot.');
  if (!inputSchema?.fields) throw new Error('Engine 2 input schema is not loaded.');
  const expectedSheets=[...new Set(inputSchema.fields.map(f=>f.sheet))];
  const sheetMappings=expectedSheets.map(name=>bestSheetMapping(name,raw.sheets,aliases));
  const sheetMap=new Map(sheetMappings.map(m=>[m.expectedSheet,raw.sheets.find(s=>s.name===m.sourceSheet)??null]));
  const fieldMappings=inputSchema.fields.map(field=>matchField(field,sheetMap.get(field.sheet),aliases,aliases?.fuzzy));
  flagConflicts(fieldMappings);
  return {sheetMappings,fieldMappings,stats:statsOf(fieldMappings,sheetMappings)};
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value==='object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function hashSnapshot(snapshot) {
  return sha256Hex(new TextEncoder().encode(stableJson(snapshot)).buffer);
}

export async function runEngine02({config},{store,bus}={}) {
  const state=store?.getState();
  const raw=state?.raw;
  if (!raw) throw new Error('Engine 2 cannot start before Engine 1 has created a raw source snapshot.');
  store?.patch({lifecycle:'mapping_processing',error:null});
  bus?.emit('mapping:started',{sourceSessionId:raw.sourceSessionId});
  const preview=buildMappingPreview({raw,inputSchema:config.inputSchema,aliases:config.mappingAliases});
  const mapping={
    engine:'E02',engineContractVersion:'E02-v0.2.0',
    sourceSessionId:raw.sourceSessionId,sourceWorkbookSha256:raw.sourceWorkbookSha256,
    schemaVersion:config.inputSchema.schema_version,
    sourceCatalog: raw.sheets.map(s=>({name:s.name,headers:s.headers.map((h,index)=>({header:h??'',index})).filter(x=>normalizeHeader(x.header))})),
    sheetMappings:preview.sheetMappings,fieldMappings:preview.fieldMappings,stats:preview.stats,
    status:'mapping_review',snapshotHash:null,
    notes:[
      'Mapping changes references only; Engine 2 never edits source workbook values.',
      'Exact field-ID/header matches are accepted automatically.',
      'Alias/fuzzy suggestions on critical fields require explicit confirmation.',
      'Unmapped fields remain unmapped/null for downstream handling; Engine 2 does not zero-fill or validate route requiredness.'
    ]
  };
  store?.patch({lifecycle:'mapping_review',mapping});
  bus?.emit('mapping:review',{stats:mapping.stats});
  return mapping;
}

export function updateSheetMapping(mapping,raw,inputSchema,aliases,expectedSheet,sourceSheetName) {
  const next=structuredClone(mapping);
  const item=next.sheetMappings.find(m=>m.expectedSheet===expectedSheet);
  if (!item) throw new Error(`Unknown expected sheet: ${expectedSheet}`);
  const source=sourceSheetName ? raw.sheets.find(s=>s.name===sourceSheetName) : null;
  if (sourceSheetName && !source) throw new Error('Invalid manual source sheet selection.');
  Object.assign(item,{sourceSheet:source?.name??null,method:source?'manual-sheet':'unmapped',confidence:source?1:0,needsConfirmation:false,confirmed:Boolean(source),userSelected:true});
  for (const field of inputSchema.fields.filter(f=>f.sheet===expectedSheet)) {
    const idx=next.fieldMappings.findIndex(m=>m.fieldId===field.field_id);
    next.fieldMappings[idx]=matchField(field,source,aliases,aliases?.fuzzy);
  }
  flagConflicts(next.fieldMappings);
  next.stats=statsOf(next.fieldMappings,next.sheetMappings);
  next.status='mapping_review'; next.snapshotHash=null;
  return next;
}

export function confirmSheetMapping(mapping,expectedSheet,confirmed=true) {
  const next=structuredClone(mapping);
  const item=next.sheetMappings.find(m=>m.expectedSheet===expectedSheet);
  if (!item) throw new Error(`Unknown expected sheet: ${expectedSheet}`);
  if (!item.sourceSheet) return next;
  item.confirmed=Boolean(confirmed); item.needsConfirmation=!item.confirmed;
  next.stats=statsOf(next.fieldMappings,next.sheetMappings);
  next.status='mapping_review'; next.snapshotHash=null;
  return next;
}

export function updateFieldMapping(mapping,raw,fieldId,sourceSheet,sourceColumnIndex) {
  const next=structuredClone(mapping);
  const item=next.fieldMappings.find(m=>m.fieldId===fieldId);
  if (!item) throw new Error(`Unknown field mapping: ${fieldId}`);
  if (sourceSheet==='' || sourceColumnIndex==='' || sourceColumnIndex===null || sourceColumnIndex===undefined) {
    Object.assign(item,{sourceSheet:null,sourceHeader:null,sourceColumnIndex:null,method:'unmapped',confidence:0,needsConfirmation:false,confirmed:false,userSelected:true});
  } else {
    const sheet=raw.sheets.find(s=>s.name===sourceSheet);
    const idx=Number(sourceColumnIndex);
    if (!sheet || !Number.isInteger(idx) || idx<0 || idx>=sheet.headers.length) throw new Error('Invalid manual source column selection.');
    Object.assign(item,{sourceSheet:sheet.name,sourceHeader:sheet.headers[idx]??'',sourceColumnIndex:idx,method:'manual',confidence:1,needsConfirmation:false,confirmed:true,userSelected:true});
  }
  flagConflicts(next.fieldMappings);
  next.stats=statsOf(next.fieldMappings,next.sheetMappings);
  next.status='mapping_review'; next.snapshotHash=null;
  return next;
}

export function confirmFieldMapping(mapping,fieldId,confirmed=true) {
  const next=structuredClone(mapping);
  const item=next.fieldMappings.find(m=>m.fieldId===fieldId);
  if (!item) throw new Error(`Unknown field mapping: ${fieldId}`);
  if (item.sourceHeader===null) return next;
  item.confirmed=Boolean(confirmed); item.needsConfirmation=!item.confirmed;
  next.stats=statsOf(next.fieldMappings,next.sheetMappings);
  next.status='mapping_review'; next.snapshotHash=null;
  return next;
}

export function confirmAllSuggested(mapping) {
  const next=structuredClone(mapping);
  for (const sheet of next.sheetMappings) { if (sheet.sourceSheet) { sheet.confirmed=true; sheet.needsConfirmation=false; } }
  for (const item of next.fieldMappings) {
    if (item.sourceHeader!==null && !item.conflict) { item.confirmed=true; item.needsConfirmation=false; }
  }
  next.stats=statsOf(next.fieldMappings,next.sheetMappings);
  return next;
}

export async function finalizeMapping(mapping) {
  const next=structuredClone(mapping);
  if (next.fieldMappings.some(m=>m.conflict)) throw new Error('Resolve mapping conflicts before confirming the mapping snapshot.');
  if (next.sheetMappings.some(m=>m.needsConfirmation && !m.confirmed) || next.fieldMappings.some(m=>m.needsConfirmation && !m.confirmed)) throw new Error('Confirm or change all pending sheet/field mapping suggestions before finalizing.');
  const immutableCore={
    sourceSessionId:next.sourceSessionId,sourceWorkbookSha256:next.sourceWorkbookSha256,schemaVersion:next.schemaVersion,
    sheetMappings:next.sheetMappings.map(x=>({...x})),
    fieldMappings:next.fieldMappings.map(({suggestions,...x})=>({...x})),
    stats:next.stats
  };
  next.snapshotHash=await hashSnapshot(immutableCore);
  next.status=next.stats.unmappedFields ? 'mapping_confirmed_with_unmapped' : 'mapping_confirmed';
  next.confirmedAt=new Date().toISOString();
  next.immutableSnapshot=deepFreeze({...immutableCore,snapshotHash:next.snapshotHash,status:next.status});
  return next;
}
