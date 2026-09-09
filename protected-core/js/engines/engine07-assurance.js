import { sha256Hex } from '../core/hash.js';

function deepFreeze(value){if(!value||typeof value!=='object'||ArrayBuffer.isView(value)||Object.isFrozen(value))return value;Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);return value;}
function stableJson(value){if(Array.isArray(value))return `[${value.map(stableJson).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;return JSON.stringify(value);}
const blank=v=>v===null||v===undefined||(typeof v==='string'&&v.trim()==='');
const text=v=>blank(v)?'':String(v).trim();
function table(snapshot,name){return snapshot.tables.find(t=>t.expectedSheet===name)||{records:[]};}
function value(record,id){return record?.values?.[id]??null;}
function indexOne(records,id){const m=new Map();for(const r of records){const k=text(value(r,id));if(k&&!m.has(k))m.set(k,r);}return m;}
function evidenceIndex(records){const m=new Map();for(const r of records){const k=text(value(r,'EVD-003'));if(!k)continue;if(!m.has(k))m.set(k,[]);m.get(k).push(r);}return m;}
function relatedIssues(validationSnapshot,sid){return (validationSnapshot.issues||[]).filter(i=>i.entityId===sid||(i.affectedStructureIds||[]).includes(sid));}
function issueIds(items,pred=()=>true){return [...new Set(items.filter(pred).map(i=>i.ruleId))];}
function isVerifiedEvidence(r,type){return value(r,'EVD-004')===type&&value(r,'EVD-005')==='Available/verified'&&!blank(value(r,'EVD-006'));}
function requirement(name,records,type){const matching=(records||[]).filter(r=>value(r,'EVD-004')===type);const verified=matching.some(r=>isVerifiedEvidence(r,type));return {name,type,verified,pending:!verified,evidenceIds:matching.map(r=>value(r,'EVD-001')).filter(Boolean)};}
function waterEvidence({calc,route,technical,evidenceByRelated,policy}){
  if(route?.eligibilityStatus==='excluded')return {completeness:'not-required',requirements:[],requiredCount:0,verifiedCount:0,pendingCount:0,warningCodes:[]};
  const component=calc.waterComponent;const spec=policy.evidence_requirements?.[component];
  if(!spec){
    const req=requirement('completion evidence',evidenceByRelated.get(calc.structureRecordId)||[],'Completion/functional evidence');
    return summarizeEvidence([req]);
  }
  const reqs=[];const direct=evidenceByRelated.get(calc.structureRecordId)||[];
  for(const typ of spec.direct_structure||[])reqs.push(requirement(`structure:${typ}`,direct,typ));
  if(spec.shared_rainfall?.length){const station=text(value(technical,'TEC-017'));const rows=evidenceByRelated.get(station)||[];for(const typ of spec.shared_rainfall)reqs.push(requirement(`rainfall:${typ}`,rows,typ));}
  if(spec.shared_hydro?.length){const hydro=text(value(technical,'TEC-022'));const rows=evidenceByRelated.get(hydro)||[];for(const typ of spec.shared_hydro)reqs.push(requirement(`hydro:${typ}`,rows,typ));}
  return summarizeEvidence(reqs);
}
function personEvidence({calc,route,evidenceByRelated,policy}){
  const types=policy.evidence_requirements?.['KPI-1.2.1']?.[route?.personDayRouteId]||[];const rows=evidenceByRelated.get(calc.personDayRecordId)||[];return summarizeEvidence(types.map(t=>requirement(`person-day:${t}`,rows,t)));
}
function summarizeEvidence(requirements){const verified=requirements.filter(r=>r.verified).length,pending=requirements.length-verified;return {completeness:requirements.length===0?'not-required':pending?'pending':'complete',requirements,requiredCount:requirements.length,verifiedCount:verified,pendingCount:pending,warningCodes:requirements.filter(r=>r.pending).map(r=>`EVIDENCE_PENDING:${r.type}`)};}
function assuranceStatus({route,calc,evidence,methodWarningCodes}){
  if(route?.eligibilityStatus==='excluded')return 'excluded';
  if(route?.eligibilityStatus==='hold'||route?.eligibilityStatus==='not_ready'||route?.eligibilityStatus==='unresolved'||route?.eligibilityStatus==='workbook_not_ready')return 'not-calculated';
  if(calc?.calculationStatus!=='calculated')return 'not-calculated';
  if(methodWarningCodes.length)return 'calculated-warning';
  if(evidence.completeness==='pending')return 'provisional-evidence-pending';
  return 'accepted-certified';
}
function reason(status,{calc,evidence,methodWarningCodes}){
  if(status==='excluded')return 'Controlled excluded route; no automatic compliant numeric result.';
  if(status==='not-calculated')return calc?.calculationReason||'Calculation was not produced for this controlled route/readiness state.';
  if(status==='calculated-warning')return `Numeric result retained with calculation/method warning(s): ${methodWarningCodes.join(', ')}.`;
  if(status==='provisional-evidence-pending')return `Numeric result retained; ${evidence.pendingCount} required evidence item(s) are pending.`;
  return 'Calculation and required evidence are complete under the configured controlled methodology.';
}
function publicSummary(snapshot){return {engine:'E07',engineContractVersion:'E07-v0.7.0',sourceSessionId:snapshot.sourceSessionId,sourceWorkbookSha256:snapshot.sourceWorkbookSha256,calculationSnapshotHash:snapshot.calculationSnapshotHash,assurancePolicyVersion:snapshot.assurancePolicyVersion,assuranceContentHash:snapshot.assuranceContentHash,assuranceSnapshotHash:snapshot.assuranceSnapshotHash,status:snapshot.status,stats:snapshot.stats,statusCounts:snapshot.statusCounts,waterAssurance:snapshot.waterAssurance,personDayAssurance:snapshot.personDayAssurance,externalGovernanceStatus:snapshot.externalGovernanceStatus,notes:[
  'E07 never changes an E06 numeric result; it only references the immutable calculation record and assigns reporting assurance.',
  'Method/calculation warnings map to calculated-warning; ordinary evidence gaps map to provisional-evidence-pending when the calculation itself is otherwise valid.',
  'HOLD/not-ready/dependency/QA failures remain not-calculated and excluded routes remain excluded; null is never replaced with zero.',
  'accepted-certified means accepted under the configured controlled methodology only. Formal HUF confirmation remains a separate governance field.',
  'Assurance evidence details and the immutable assurance snapshot remain browser-memory-only; project data is not encoded in the URL.'
]};}

export async function evaluateAssurance({canonicalSnapshot,validationSnapshot,routingSnapshot,calculationSnapshot,assurancePolicy}){
  if(!canonicalSnapshot?.tables)throw new Error('Engine 7 requires the immutable Engine 3 canonical snapshot.');
  if(!validationSnapshot?.issues)throw new Error('Engine 7 requires the immutable Engine 4 validation snapshot.');
  if(!routingSnapshot?.waterRoutes)throw new Error('Engine 7 requires the immutable Engine 5 routing snapshot.');
  if(!calculationSnapshot?.waterCalculations)throw new Error('Engine 7 requires the immutable Engine 6 calculation snapshot.');
  if(!assurancePolicy?.assurance_statuses?.length)throw new Error('Engine 7 assurance policy is not loaded.');
  const evidence=table(canonicalSnapshot,'11_Evidence').records,technical=table(canonicalSnapshot,'03_Technical').records;
  const evidenceByRelated=evidenceIndex(evidence),techBySid=indexOne(technical,'TEC-001');
  const waterRouteBySid=new Map(routingSnapshot.waterRoutes.map(r=>[r.structureRecordId,r]));
  const pdRouteById=new Map(routingSnapshot.personDayRoutes.map(r=>[r.personDayRecordId,r]));
  const assessedAt=new Date().toISOString();
  const waterAssurance=calculationSnapshot.waterCalculations.map((calc,i)=>{
    const route=waterRouteBySid.get(calc.structureRecordId)||null,issues=relatedIssues(validationSnapshot,calc.structureRecordId);
    const evidenceState=waterEvidence({calc,route,technical:techBySid.get(calc.structureRecordId),evidenceByRelated,policy:assurancePolicy});
    const methodWarningRuleIds=issueIds(issues,x=>x.severity==='WARNING'&&x.scopeEffect!=='ASSURANCE_DOWNGRADE');
    const methodWarningCodes=[];if(methodWarningRuleIds.includes('VAL-013'))methodWarningCodes.push('LEGACY_DDW_RUNOFF');
    for(const code of calc.calculationWarnings||[])if(code!=='LEGACY_DDW_RUNOFF'&&!methodWarningCodes.includes(code))methodWarningCodes.push(code);
    const evidenceRuleIds=issueIds(issues,x=>x.scopeEffect==='ASSURANCE_DOWNGRADE'||(assurancePolicy.evidence_gap_rule_ids||[]).includes(x.ruleId));
    const status=assuranceStatus({route,calc,evidence:evidenceState,methodWarningCodes});
    return {assuranceRecordId:`ASR-E07-W-${String(i+1).padStart(4,'0')}`,resultType:'water',resultId:calc.calculationId,structureRecordId:calc.structureRecordId,waterRouteId:calc.waterRouteId,waterComponent:calc.waterComponent,calculationReadiness:route?.calculationReadiness||null,calculationStatus:calc.calculationStatus,assuranceStatus:status,evidenceCompleteness:evidenceState.completeness,requiredEvidenceCount:evidenceState.requiredCount,verifiedEvidenceCount:evidenceState.verifiedCount,pendingEvidenceCount:evidenceState.pendingCount,blockingValidationRuleIds:issueIds(issues,x=>['BLOCKING_ERROR','SCOPED_ERROR'].includes(x.severity)),warningRuleIds:[...new Set([...methodWarningRuleIds,...evidenceRuleIds])],methodWarningCodes,evidenceWarningCodes:evidenceState.warningCodes,statusReason:reason(status,{calc,evidence:evidenceState,methodWarningCodes}),assuranceBasis:'Configured HUF controlled methodology baseline v1.1/v1.0',externalHufConfirmationStatus:assurancePolicy.external_governance_status,assessedAt,evidenceRequirements:evidenceState.requirements};
  });
  const personDayAssurance=calculationSnapshot.personDayCalculations.map((calc,i)=>{
    const route=pdRouteById.get(calc.personDayRecordId)||null;const evidenceState=personEvidence({calc,route,evidenceByRelated,policy:assurancePolicy});
    const status=route?.eligibilityStatus==='excluded'?'excluded':calc.calculationStatus!=='calculated'?'not-calculated':evidenceState.completeness==='pending'?'provisional-evidence-pending':'accepted-certified';
    return {assuranceRecordId:`ASR-E07-P-${String(i+1).padStart(4,'0')}`,resultType:'person-day',resultId:calc.personDayCalculationId,personDayRecordId:calc.personDayRecordId,structureWorkId:calc.structureWorkId,personDayRouteId:calc.personDayRouteId,calculationReadiness:route?.calculationReadiness||null,calculationStatus:calc.calculationStatus,assuranceStatus:status,evidenceCompleteness:evidenceState.completeness,requiredEvidenceCount:evidenceState.requiredCount,verifiedEvidenceCount:evidenceState.verifiedCount,pendingEvidenceCount:evidenceState.pendingCount,blockingValidationRuleIds:[],warningRuleIds:[],methodWarningCodes:[],evidenceWarningCodes:evidenceState.warningCodes,statusReason:reason(status,{calc,evidence:evidenceState,methodWarningCodes:[]}),assuranceBasis:'Configured HUF controlled methodology baseline v1.1/v1.0',externalHufConfirmationStatus:assurancePolicy.external_governance_status,assessedAt,evidenceRequirements:evidenceState.requirements};
  });
  const all=[...waterAssurance,...personDayAssurance],statusCounts=Object.fromEntries(assurancePolicy.assurance_statuses.map(s=>[s,all.filter(x=>x.assuranceStatus===s).length]));
  const stats={assuranceRecords:all.length,waterAssuranceRecords:waterAssurance.length,personDayAssuranceRecords:personDayAssurance.length,pendingEvidenceRecords:all.filter(x=>x.pendingEvidenceCount>0).length,methodWarningRecords:all.filter(x=>x.methodWarningCodes.length>0).length,calculatedNumericRecords:calculationSnapshot.waterCalculations.filter(x=>x.resultM3!==null).length+calculationSnapshot.personDayCalculations.filter(x=>x.calculatedPersonDays!==null).length};
  const status='assurance_complete';
  const content={sourceWorkbookSha256:canonicalSnapshot.sourceWorkbookSha256,calculationSnapshotHash:calculationSnapshot.calculationSnapshotHash,assurancePolicyVersion:assurancePolicy.policy_id,waterAssurance:waterAssurance.map(({assessedAt,evidenceRequirements,...x})=>x),personDayAssurance:personDayAssurance.map(({assessedAt,evidenceRequirements,...x})=>x),status};
  const assuranceContentHash=await sha256Hex(new TextEncoder().encode(stableJson(content)).buffer);
  const core={sourceSessionId:canonicalSnapshot.sourceSessionId,sourceWorkbookSha256:canonicalSnapshot.sourceWorkbookSha256,canonicalSnapshotHash:canonicalSnapshot.canonicalSnapshotHash,validationSnapshotHash:validationSnapshot.validationSnapshotHash,routingSnapshotHash:routingSnapshot.routingSnapshotHash,calculationSnapshotHash:calculationSnapshot.calculationSnapshotHash,assurancePolicyVersion:assurancePolicy.policy_id,externalGovernanceStatus:assurancePolicy.external_governance_status,waterAssurance,personDayAssurance,statusCounts,stats,status,assuranceContentHash};
  const assuranceSnapshotHash=await sha256Hex(new TextEncoder().encode(stableJson({...core,waterAssurance:waterAssurance.map(({assessedAt,...x})=>x),personDayAssurance:personDayAssurance.map(({assessedAt,...x})=>x)})).buffer);
  return deepFreeze({...core,assuranceSnapshotHash});
}

export async function runEngine07({config},{store,bus}){
  const state=store.getState();if(!state.canonical?.immutableSnapshot||!state.validated?.immutableSnapshot||!state.routed?.immutableSnapshot||!state.calculated?.immutableSnapshot)throw new Error('Complete Engines 3–6 before assurance.');
  store.patchFrom('calculation',{lifecycle:'assurance_processing',assurance:null,assured:null,error:null});
  try{const immutableSnapshot=await evaluateAssurance({canonicalSnapshot:state.canonical.immutableSnapshot,validationSnapshot:state.validated.immutableSnapshot,routingSnapshot:state.routed.immutableSnapshot,calculationSnapshot:state.calculated.immutableSnapshot,assurancePolicy:config.assurancePolicy});const assured=Object.freeze({immutableSnapshot,assuranceSnapshotHash:immutableSnapshot.assuranceSnapshotHash,getSnapshot:()=>immutableSnapshot});const summary=publicSummary(immutableSnapshot);store.patch({lifecycle:'assurance_ready',assurance:summary,assured,error:null});bus?.emit('assurance:completed',{assuranceSnapshotHash:summary.assuranceSnapshotHash,status:summary.status,stats:summary.stats});return summary;}catch(error){store.patch({lifecycle:'blocked_error',error:{engine:'E07',message:error.message}});throw error;}
}
