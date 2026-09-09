export const STATUS_LABELS=Object.freeze({'accepted-certified':'Accepted','provisional-evidence-pending':'Evidence pending','calculated-warning':'Calculated with warning','not-calculated':'Not calculated','excluded':'Excluded'});
const sum=values=>{const n=values.filter(v=>typeof v==='number'&&Number.isFinite(v));return n.length?n.reduce((a,b)=>a+b,0):null;};
export function createResultModel(pack){
 const aggregate=pack.aggregation.aggregateResults, scopes=[...new Map(aggregate.map(a=>[a.reportingKey,{key:a.reportingKey,label:a.reportingLabel,level:a.reportingLevel,parent:a.parentReportingKey}])).values()];
 const identities=new Map((pack.productContext?.structures||[]).map(v=>[v['STR-001'],v]));
 const routes=new Map(pack.routing.waterRoutes.map(r=>[r.structureRecordId,r]));
 const assurance=new Map([...pack.assurance.waterAssurance,...pack.assurance.personDayAssurance].map(a=>[a.resultId,a]));
 const rows=[...pack.calculation.waterCalculations.map(c=>({id:'water:'+c.calculationId,resultId:c.calculationId,recordId:c.structureRecordId,type:'water',component:c.waterComponent,value:c.resultM3,unit:'m3',route:c.waterRouteId,structureType:routes.get(c.structureRecordId)?.structureType,calculation:c,routeDetail:routes.get(c.structureRecordId)})),...pack.calculation.personDayCalculations.map(c=>({id:'person-day:'+c.personDayCalculationId,resultId:c.personDayCalculationId,recordId:c.personDayRecordId,structureId:c.structureWorkId,type:'person-day',component:'KPI-1.2.1',value:c.calculatedPersonDays,unit:'person-days',route:c.personDayRouteId,structureType:routes.get(c.structureWorkId)?.structureType,calculation:c}))].map(r=>({...r,identity:identities.get(r.structureId||r.recordId)||{},sourceBasis:(pack.productContext?.personDays||[]).find(p=>p['PD-001']===r.recordId),name:identities.get(r.structureId||r.recordId)?.['STR-002']||r.recordId,status:assurance.get(r.resultId)?.assuranceStatus,statusLabel:STATUS_LABELS[assurance.get(r.resultId)?.assuranceStatus]||'Not calculated',assurance:assurance.get(r.resultId),memberships:aggregate.filter(a=>a.sourceResultIds.includes(r.id)).map(a=>a.reportingKey)}));
 return Object.freeze({pack,rows,scopes,defaultScope:scopes.find(s=>s.level==='project')?.key});
}
export function selectResults(model,filter={}){
 const scope=filter.scope||model.defaultScope;
 return model.rows.filter(r=>(!scope||r.memberships.includes(scope))&&(!filter.resultIds||filter.resultIds.includes(r.id))&&(!filter.subtype||r.identity?.['STR-004']===filter.subtype)&&(!filter.route||r.route===filter.route)&&(!filter.status||r.status===filter.status)&&(!filter.component||r.component===filter.component)&&(!filter.structureType||r.structureType===filter.structureType)&&(!filter.search||[r.recordId,r.name,r.route,r.structureType].join(' ').toLowerCase().includes(filter.search.toLowerCase())));
}
export function summarizeResults(rows){
 return [...new Set(rows.map(r=>r.component))].sort().map(component=>{
 const c=rows.filter(r=>r.component===component),numeric=c.filter(r=>!['excluded','not-calculated'].includes(r.status));
 const bucket=s=>sum(c.filter(r=>r.status===s).map(r=>r.value));
 return {component,unit:c[0].unit,calculatedTotal:sum(numeric.map(r=>r.value)),accepted:bucket('accepted-certified'),provisional:bucket('provisional-evidence-pending'),warning:bucket('calculated-warning'),records:c.length,calculated:numeric.filter(r=>r.value!==null).length,notCalculated:c.filter(r=>r.status==='not-calculated').length,excluded:c.filter(r=>r.status==='excluded').length,pendingEvidence:c.filter(r=>r.assurance?.pendingEvidenceCount>0).length};
 });
}
export function scopeMetadata(model,filter,synthetic){const rows=selectResults(model,filter);return {runId:model.pack.audit.runManifest.runId,runTimestamp:model.pack.audit.runManifest.runTimestamp,sourceWorkbookSha256:model.pack.audit.runManifest.sourceWorkbookSha256,reportingStartDate:model.pack.audit.runManifest.reportingStartDate,reportingEndDate:model.pack.audit.runManifest.reportingEndDate,scope:model.scopes.find(s=>s.key===(filter.scope||model.defaultScope)),filters:{...filter},includedResultIds:rows.map(r=>r.id),units:'m3 / person-days; full precision',synthetic:Boolean(synthetic),methodology:model.pack.audit.versionIds,formalHufConfirmation:model.pack.assurance.externalGovernanceStatus};}

export function bulkScopes(model,filter,level){const ids=selectResults(model,filter).map(r=>r.id);return model.scopes.filter(s=>s.level===level).map(scope=>({scope,filter:{...filter,scope:scope.key,resultIds:ids}})).filter(s=>selectResults(model,s.filter).length);}
