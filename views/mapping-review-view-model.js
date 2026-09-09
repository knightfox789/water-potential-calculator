function pct(value){const n=Number(value);return Number.isFinite(n)?`${Math.round(n*100)}%`:'—';}
function byField(metadata=[]){return new Map(metadata.map(item=>[item.fieldId,item]));}
function fieldStatus(row){
  if(row.conflict)return {id:'conflict',label:'Resolve',tone:'error',attention:true,blocking:true};
  if(row.sourceHeader===null){
    const required=row.requirementClass==='Core';
    return {id:required?'unmapped_required':'unmapped_optional',label:required?'Map required':'Unmapped optional',tone:required?'error':'warning',attention:true,blocking:required};
  }
  if(row.needsConfirmation&&!row.confirmed)return {id:'confirmation',label:'Confirm',tone:'warning',attention:true,blocking:true};
  if(row.confirmed)return {id:'confirmed',label:row.userSelected?'Confirmed · manual':'Confirmed',tone:'ready',attention:false,blocking:false};
  return {id:'confirmation',label:'Confirm',tone:'warning',attention:true,blocking:true};
}
function sheetStatus(row){
  if(!row.sourceSheet)return {id:'unmapped_sheet',label:'Choose source',tone:'error',attention:true,blocking:true};
  if(row.needsConfirmation&&!row.confirmed)return {id:'sheet_confirmation',label:'Confirm sheet',tone:'warning',attention:true,blocking:true};
  return {id:'confirmed',label:'Confirmed',tone:'ready',attention:false,blocking:false};
}
export function createMappingReviewViewModel(mapping,metadata=[],filter='attention'){
  if(!mapping||!Array.isArray(mapping.fieldMappings))throw new Error('Mapping Review requires a governed E02 mapping snapshot.');
  const meta=byField(metadata);
  const sourceCatalog=Array.isArray(mapping.sourceCatalog)?mapping.sourceCatalog:[];
  const fields=mapping.fieldMappings.map(item=>{
    const m=meta.get(item.fieldId)||{};const status=fieldStatus(item);
    return Object.freeze({...item,controlledField:m.controlledField||item.expectedHeader||item.fieldId,unitFormat:m.unitFormat||'',applicableWhen:m.applicableWhen||'',missingValuePolicy:m.missingValuePolicy||'',status,confidenceLabel:pct(item.confidence),candidateCount:Array.isArray(item.suggestions)?item.suggestions.length:0});
  });
  const sheets=(mapping.sheetMappings||[]).map(item=>Object.freeze({...item,status:sheetStatus(item),confidenceLabel:pct(item.confidence)}));
  const fieldPending=fields.filter(x=>x.status.id==='confirmation').length;
  const sheetPending=sheets.filter(x=>x.status.id==='sheet_confirmation'||x.status.id==='unmapped_sheet').length;
  const conflicts=fields.filter(x=>x.status.id==='conflict').length;
  const unmappedRequired=fields.filter(x=>x.status.id==='unmapped_required').length;
  const unmappedOptional=fields.filter(x=>x.status.id==='unmapped_optional').length;
  const mappedAutomatically=fields.filter(x=>x.sourceHeader!==null&&x.confirmed&&!x.userSelected&&!x.conflict).length;
  const attention=fields.filter(x=>x.status.attention);
  const confirmed=fields.filter(x=>x.status.id==='confirmed');
  const selected=filter==='confirmed'?confirmed:filter==='all'||filter==='advanced'?fields:attention;
  const blocking=conflicts+unmappedRequired+fieldPending+sheetPending;
  return Object.freeze({
    engine:mapping.engine||'E02',engineContractVersion:mapping.engineContractVersion||null,status:mapping.status||'mapping_review',snapshotHash:mapping.snapshotHash||null,
    sourceSessionId:mapping.sourceSessionId||null,sourceWorkbookSha256:mapping.sourceWorkbookSha256||null,schemaVersion:mapping.schemaVersion||null,
    summary:Object.freeze({mappedAutomatically,needsConfirmation:fieldPending+sheetPending,conflicts,unmappedRequired,unmappedOptional,blocking}),
    fields:Object.freeze(fields),sheets:Object.freeze(sheets),rows:Object.freeze(selected),sourceCatalog:Object.freeze(sourceCatalog),notes:Object.freeze(mapping.notes||[]),
    filter,canConfirm:blocking===0,
    filters:Object.freeze([
      Object.freeze({id:'attention',label:'Needs attention',count:attention.length+sheetPending}),
      Object.freeze({id:'confirmed',label:'Confirmed',count:confirmed.length}),
      Object.freeze({id:'all',label:'All fields',count:fields.length}),
      Object.freeze({id:'advanced',label:'Advanced',count:fields.length})
    ])
  });
}
