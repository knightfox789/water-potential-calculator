function plain(value){return Boolean(value&&typeof value==='object'&&(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype));}
function clone(value){if(typeof structuredClone==='function')return structuredClone(value);return JSON.parse(JSON.stringify(value));}
function deepFreeze(value){if(!plain(value))return value;for(const child of Object.values(value))deepFreeze(child);return Object.isFrozen(value)?value:Object.freeze(value);}
function issue(level,code,message,detail=null){return Object.freeze({level,code,message,detail});}
function toDateText(value){if(value==null||value==='')return null;return String(value);}
function shortHash(value){return typeof value==='string'&&value.length>20?`${value.slice(0,12)}…${value.slice(-8)}`:value||null;}

export function buildWorkbookPreflight(e01Result,{supportedTemplateVersion}={}){
  if(!supportedTemplateVersion)throw new Error('Workbook preflight requires the governed supported template version.');
  const summary=e01Result?.summary??e01Result;
  if(!summary||typeof summary!=='object')throw new Error('Workbook preflight requires the protected E01 intake summary.');
  const source=summary.sourceWorkbook||{};
  const control=summary.controlMetadataHint||{};
  const hint=summary.templateHint||{};
  const inventory=Array.isArray(summary.sheetInventory)?summary.sheetInventory:[];
  const byName=new Map(inventory.map(row=>[row?.name,row]));
  const missingSheets=Array.isArray(hint.missingSheets)?hint.missingSheets.filter(Boolean):[];
  const extraSheets=Array.isArray(hint.extraSheets)?hint.extraSheets.filter(Boolean):[];
  const extraSet=new Set(extraSheets);
  const recognizedSheets=inventory.map(row=>row?.name).filter(name=>name&&!extraSet.has(name));
  const expectedSheetCount=Number(hint.expectedSheetCount)||recognizedSheets.length+missingSheets.length;
  const templateVersion=control['Template Version']||null;
  const start=toDateText(control['Reporting Start Date']);
  const end=toDateText(control['Reporting End Date']);
  const formulaCellCount=inventory.reduce((sum,row)=>sum+(Number(row?.formulaCellCount)||0),0);
  const structureRowCount=Number(byName.get('02_Structures')?.rowCount)||0;
  const governedRecordCount=inventory.filter(row=>!extraSet.has(row?.name)&&!['00_Instructions','01_Control','99_Lookups'].includes(row.name)).reduce((sum,row)=>sum+(Number(row?.rowCount)||0),0);
  const issues=[];

  if(!templateVersion)issues.push(issue('error','PREFLIGHT_TEMPLATE_VERSION_MISSING','Template version was not detected. The workbook will not be silently interpreted as the current controlled schema.'));
  else if(templateVersion!==supportedTemplateVersion)issues.push(issue('error','PREFLIGHT_TEMPLATE_VERSION_UNSUPPORTED',`Template version ${templateVersion} is not the supported ${supportedTemplateVersion}.`,{detected:templateVersion,supported:supportedTemplateVersion}));
  else issues.push(issue('information','PREFLIGHT_TEMPLATE_SUPPORTED',`Supported controlled template detected: ${supportedTemplateVersion}.`));

  if(missingSheets.length)issues.push(issue('error','PREFLIGHT_REQUIRED_SHEETS_MISSING',`${missingSheets.length} required controlled sheet${missingSheets.length===1?' is':'s are'} missing.`,{sheets:missingSheets}));
  else issues.push(issue('information','PREFLIGHT_REQUIRED_SHEETS_PRESENT','All required controlled sheets are present.'));

  if(extraSheets.length)issues.push(issue('warning','PREFLIGHT_EXTRA_SHEETS',`${extraSheets.length} unexpected sheet${extraSheets.length===1?' is':'s are'} present.`,{sheets:extraSheets}));
  if(formulaCellCount>0)issues.push(issue('warning','PREFLIGHT_FORMULAS_PRESENT',`${formulaCellCount} formula cell${formulaCellCount===1?' was':'s were'} found in the workbook. Preflight reports their presence only; it does not reinterpret them.`));
  else issues.push(issue('information','PREFLIGHT_NO_FORMULAS','No formula cells were detected by protected E01 intake.'));
  if(!start||!end)issues.push(issue('warning','PREFLIGHT_REPORTING_PERIOD_INCOMPLETE','Reporting period could not be fully detected from workbook control metadata.'));
  else issues.push(issue('information','PREFLIGHT_REPORTING_PERIOD_DETECTED',`Reporting period detected: ${start} to ${end}.`));

  const order={error:0,warning:1,information:2};issues.sort((a,b)=>order[a.level]-order[b.level]||a.code.localeCompare(b.code));
  const errors=issues.filter(x=>x.level==='error');
  const warnings=issues.filter(x=>x.level==='warning');
  const information=issues.filter(x=>x.level==='information');
  const sheetRows=inventory.map(row=>Object.freeze({
    name:row?.name||'Unnamed sheet',
    controlled:!extraSet.has(row?.name),
    role:row?.expectedRoleHint||null,
    rowCount:Number(row?.rowCount)||0,
    columnCount:Number(row?.columnCount)||0,
    formulaCellCount:Number(row?.formulaCellCount)||0
  }));
  for(const missing of missingSheets)sheetRows.push(Object.freeze({name:missing,controlled:true,role:null,rowCount:0,columnCount:0,formulaCellCount:0,missing:true}));

  const model={
    schema:'HUF-IMP7BC-PREFLIGHT-v1',
    source:Object.freeze({
      fileName:source.fileName||null,
      byteLength:Number(source.byteLength)||0,
      sha256:source.sha256||null,
      shortSha256:shortHash(source.sha256),
      sourceSessionId:summary.sourceSessionId||null
    }),
    template:Object.freeze({detectedVersion:templateVersion,supportedVersion:supportedTemplateVersion,compatibility:!templateVersion?'blocked':templateVersion===supportedTemplateVersion?'supported':'blocked',intakeHintStatus:hint.status||null}),
    reportingPeriod:Object.freeze({start,end,detected:Boolean(start&&end),label:start&&end?`${start} — ${end}`:'Not fully detected'}),
    sheets:Object.freeze({recognizedCount:recognizedSheets.length,expectedCount:expectedSheetCount,missingCount:missingSheets.length,extraCount:extraSheets.length,rows:Object.freeze(sheetRows)}),
    records:Object.freeze({structures:structureRowCount,governedDataRows:governedRecordCount}),
    formulas:Object.freeze({cellCount:formulaCellCount,present:formulaCellCount>0}),
    issues:Object.freeze({errors:Object.freeze(errors),warnings:Object.freeze(warnings),information:Object.freeze(information),ordered:Object.freeze(issues)}),
    overallStatus:errors.length?'needs_attention':'ready_for_mapping',
    canContinueToMapping:errors.length===0,
    advanced:Object.freeze({
      engine:summary.engine||'E01',
      engineContractVersion:summary.engineContractVersion||null,
      parser:clone(summary.parser||null),
      workbook:clone(summary.workbook||null),
      intakeNotes:clone(summary.intakeNotes||[])
    }),
    boundaryNote:'Workbook Preflight summarizes protected E01 intake only. It is not Design-4 validation.'
  };
  return deepFreeze(model);
}

