import { sha256Hex } from '../core/hash.js';

function deepFreeze(value){if(!value||typeof value!=='object'||ArrayBuffer.isView(value)||Object.isFrozen(value))return value;Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);return value;}
function stableJson(value){if(Array.isArray(value))return `[${value.map(stableJson).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;return JSON.stringify(value);}
const blank=v=>v===null||v===undefined||(typeof v==='string'&&v.trim()==='');
const text=v=>blank(v)?'':String(v).trim();
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function table(snapshot,name){return snapshot.tables.find(t=>t.expectedSheet===name)||{records:[]};}
function value(record,id){return record?.values?.[id]??null;}
function indexOne(records,id){const m=new Map();for(const r of records){const k=text(value(r,id));if(k&&!m.has(k))m.set(k,r);}return m;}
function escKey(v){return text(v).replaceAll('|','¦');}
function levelNode(level,key,label,parentKey=null){return {level,key,label:label||key,parentKey};}
function hierarchyForStructure(structure,control,structureId){
  const projectId=text(value(control,'CTL-002'))||'UNSPECIFIED_PROJECT';
  const projectName=text(value(control,'CTL-003'))||projectId;
  const pia=text(value(control,'CTL-004'));
  const state=text(value(structure,'STR-009')),district=text(value(structure,'STR-010')),block=text(value(structure,'STR-011')),gp=text(value(structure,'STR-012')),village=text(value(structure,'STR-013'));
  const pKey=`PROJECT:${escKey(projectId)}`;
  const piaKey=pia?`PIA:${escKey(pia)}`:null;
  const dKey=district?`DISTRICT:${escKey(state)}|${escKey(district)}`:null;
  const bKey=block?`BLOCK:${escKey(state)}|${escKey(district)}|${escKey(block)}`:null;
  const gKey=gp?`GP:${escKey(state)}|${escKey(district)}|${escKey(block)}|${escKey(gp)}`:null;
  const vKey=village?`VILLAGE:${escKey(state)}|${escKey(district)}|${escKey(block)}|${escKey(gp)}|${escKey(village)}`:null;
  const sKey=structureId?`STRUCTURE:${escKey(structureId)}`:null;
  const nodes=[];
  if(sKey)nodes.push(levelNode('structure',sKey,text(value(structure,'STR-002'))||structureId,vKey||gKey||bKey||dKey||piaKey||pKey));
  if(vKey)nodes.push(levelNode('village',vKey,village,gKey||bKey||dKey||piaKey||pKey));
  if(gKey)nodes.push(levelNode('gram_panchayat',gKey,gp,bKey||dKey||piaKey||pKey));
  if(bKey)nodes.push(levelNode('block',bKey,block,dKey||piaKey||pKey));
  if(dKey)nodes.push(levelNode('district',dKey,district,piaKey||pKey));
  if(piaKey)nodes.push(levelNode('PIA',piaKey,pia,pKey));
  nodes.push(levelNode('project',pKey,projectName,null));
  return nodes;
}
function numericStatus(status,policy){return (policy.numeric_statuses||[]).includes(status);}
function terminalStatus(status,policy){return (policy.terminal_non_numeric_statuses||[]).includes(status);}
function sourceFactId(kind,resultId){return `${kind}:${resultId}`;}
function makeWaterFacts({canonicalSnapshot,calculationSnapshot,assuranceSnapshot,policy}){
  const structures=table(canonicalSnapshot,'02_Structures').records,control=table(canonicalSnapshot,'01_Control').records[0]||null;
  const structureById=indexOne(structures,'STR-001');const calcById=new Map(calculationSnapshot.waterCalculations.map(x=>[x.calculationId,x]));
  const facts=[];const joinIssues=[];
  for(const a of assuranceSnapshot.waterAssurance||[]){
    const calc=calcById.get(a.resultId);if(!calc){joinIssues.push({kind:'water',resultId:a.resultId,code:'CALCULATION_RESULT_NOT_FOUND'});continue;}
    const structure=structureById.get(a.structureRecordId)||null;if(!structure){joinIssues.push({kind:'water',resultId:a.resultId,code:'STRUCTURE_NOT_FOUND'});}
    const isNumeric=numericStatus(a.assuranceStatus,policy),isTerminal=terminalStatus(a.assuranceStatus,policy);
    facts.push({
      sourceResultId:sourceFactId('water',a.resultId),resultType:'water',resultId:a.resultId,sourceRecordId:a.structureRecordId,
      component:a.waterComponent,status:a.assuranceStatus,paths:hierarchyForStructure(structure,control,a.structureRecordId),
      waterResultM3:isNumeric&&finite(calc.resultM3)?calc.resultM3:null,
      personDays:null,generatedRunoffM3:isNumeric&&finite(calc.generatedRunoffM3)?calc.generatedRunoffM3:null,
      overflowM3:isNumeric&&finite(calc.overflowM3)?calc.overflowM3:null,capturedRunoffM3:isNumeric&&finite(calc.capturedRunoffM3)?calc.capturedRunoffM3:null,
      evaporationM3:isNumeric&&finite(calc.cumulativeEvaporationM3)?calc.cumulativeEvaporationM3:null,
      infiltrationM3:isNumeric&&finite(calc.cumulativeInfiltrationM3)?calc.cumulativeInfiltrationM3:null,
      finalClosingStorageM3:isNumeric&&finite(calc.finalClosingStorageM3)?calc.finalClosingStorageM3:null,
      maxMassResidualM3:isNumeric&&finite(calc.maxMassResidualM3)?calc.maxMassResidualM3:null,
      pendingEvidence:a.pendingEvidenceCount>0,methodWarning:(a.methodWarningCodes||[]).length>0,
      calcHadNumeric:finite(calc.resultM3),isNumericStatus:isNumeric,isTerminalStatus:isTerminal
    });
  }
  return {facts,joinIssues};
}
function makePersonFacts({canonicalSnapshot,calculationSnapshot,assuranceSnapshot,policy}){
  const structures=table(canonicalSnapshot,'02_Structures').records,control=table(canonicalSnapshot,'01_Control').records[0]||null;
  const structureById=indexOne(structures,'STR-001');const calcById=new Map(calculationSnapshot.personDayCalculations.map(x=>[x.personDayCalculationId,x]));
  const facts=[];const joinIssues=[];
  for(const a of assuranceSnapshot.personDayAssurance||[]){
    const calc=calcById.get(a.resultId);if(!calc){joinIssues.push({kind:'person-day',resultId:a.resultId,code:'CALCULATION_RESULT_NOT_FOUND'});continue;}
    const structure=structureById.get(a.structureWorkId)||null;const isNumeric=numericStatus(a.assuranceStatus,policy),isTerminal=terminalStatus(a.assuranceStatus,policy);
    facts.push({
      sourceResultId:sourceFactId('person-day',a.resultId),resultType:'person-day',resultId:a.resultId,sourceRecordId:a.personDayRecordId,
      component:policy.person_day_component||'KPI-1.2.1',status:a.assuranceStatus,paths:hierarchyForStructure(structure,control,a.structureWorkId||a.personDayRecordId),
      waterResultM3:null,personDays:isNumeric&&finite(calc.calculatedPersonDays)?calc.calculatedPersonDays:null,
      generatedRunoffM3:null,overflowM3:null,capturedRunoffM3:null,evaporationM3:null,infiltrationM3:null,finalClosingStorageM3:null,maxMassResidualM3:null,
      pendingEvidence:a.pendingEvidenceCount>0,methodWarning:(a.methodWarningCodes||[]).length>0,
      calcHadNumeric:finite(calc.calculatedPersonDays),isNumericStatus:isNumeric,isTerminalStatus:isTerminal
    });
  }
  return {facts,joinIssues};
}
function sumNullable(items,key){const vals=items.map(x=>x[key]).filter(finite);return vals.length?vals.reduce((a,b)=>a+b,0):null;}
function maxNullable(items,key){const vals=items.map(x=>x[key]).filter(finite);return vals.length?Math.max(...vals):null;}
async function buildAggregateRecords(facts,policy){
  const groups=new Map();
  for(const fact of facts){for(const p of fact.paths){const k=[p.level,p.key,fact.component,fact.status].join('\u001f');if(!groups.has(k))groups.set(k,{path:p,component:fact.component,status:fact.status,facts:[]});groups.get(k).facts.push(fact);}}
  const records=[];let i=0;
  for(const group of [...groups.values()].sort((a,b)=>[a.path.level,a.path.key,a.component,a.status].join('|').localeCompare([b.path.level,b.path.key,b.component,b.status].join('|')))){
    const items=group.facts,sourceResultIds=items.map(x=>x.sourceResultId).sort();
    const waterResultM3=sumNullable(items,'waterResultM3'),personDays=sumNullable(items,'personDays');
    const sourceHash=await sha256Hex(new TextEncoder().encode(stableJson(items.map(x=>({id:x.sourceResultId,status:x.status,component:x.component,water:x.waterResultM3,pd:x.personDays})))).buffer);
    records.push({
      aggregateResultId:`AGG-E08-${String(++i).padStart(5,'0')}`,reportingLevel:group.path.level,reportingKey:group.path.key,reportingLabel:group.path.label,parentReportingKey:group.path.parentKey,
      component:group.component,assuranceStatusBucket:group.status,structureRecordCount:items.length,calculatedResultCount:items.filter(x=>x.waterResultM3!==null||x.personDays!==null).length,
      notCalculatedCount:group.status==='not-calculated'?items.length:0,excludedCount:group.status==='excluded'?items.length:0,
      waterResultM3,waterResultBL:waterResultM3===null?null:waterResultM3/1_000_000,personDays,
      generatedRunoffM3:sumNullable(items,'generatedRunoffM3'),overflowM3:sumNullable(items,'overflowM3'),capturedRunoffM3:sumNullable(items,'capturedRunoffM3'),
      evaporationM3:sumNullable(items,'evaporationM3'),infiltrationM3:sumNullable(items,'infiltrationM3'),finalClosingStorageM3:sumNullable(items,'finalClosingStorageM3'),
      warningRecordCount:group.status==='calculated-warning'?items.length:0,pendingEvidenceRecordCount:items.filter(x=>x.pendingEvidence).length,methodWarningRecordCount:items.filter(x=>x.methodWarning).length,
      maximumMassResidualM3:maxNullable(items,'maxMassResidualM3'),sourceResultCount:items.length,aggregationRuleVersion:policy.policy_id,sourceResultHash:sourceHash,sourceResultIds
    });
  }
  return records;
}
function buildProjectSummary(aggregateRecords,policy){
  const project=aggregateRecords.filter(x=>x.reportingLevel==='project');const components=[...new Set(project.map(x=>x.component))].sort();
  return components.map(component=>{
    const rows=project.filter(x=>x.component===component),isPd=component===(policy.person_day_component||'KPI-1.2.1');
    const numericValue=status=>{const row=rows.find(x=>x.assuranceStatusBucket===status);return row?(isPd?row.personDays:row.waterResultM3):null;};
    const accepted=numericValue('accepted-certified'),provisional=numericValue('provisional-evidence-pending'),warning=numericValue('calculated-warning');
    const numeric=[accepted,provisional,warning].filter(finite);const calculatedTotal=numeric.length?numeric.reduce((a,b)=>a+b,0):null;
    const count=status=>rows.filter(x=>x.assuranceStatusBucket===status).reduce((s,x)=>s+x.sourceResultCount,0);
    const total=rows.reduce((s,x)=>s+x.sourceResultCount,0),excluded=count('excluded'),eligibleDen=Math.max(0,total-excluded);
    const calculatedCount=rows.reduce((s,x)=>s+x.calculatedResultCount,0);
    return {component,resultUnit:isPd?'person-days':'m3',acceptedCertifiedResult:accepted,provisionalEvidencePendingResult:provisional,calculatedWarningResult:warning,calculatedTotal,
      acceptedCertifiedCount:count('accepted-certified'),provisionalCount:count('provisional-evidence-pending'),warningCount:count('calculated-warning'),notCalculatedCount:count('not-calculated'),excludedCount:excluded,
      totalSourceRecordCount:total,coveragePercentage:eligibleDen?calculatedCount/eligibleDen*100:0,pendingEvidenceRecordCount:rows.reduce((s,x)=>s+x.pendingEvidenceRecordCount,0),methodWarningRecordCount:rows.reduce((s,x)=>s+x.methodWarningRecordCount,0)};
  });
}
function evaluateQa({facts,aggregateRecords,assuranceSnapshot,policy,joinIssues}){
  const validStatuses=new Set(policy.assurance_statuses||[]),numericStatuses=new Set(policy.numeric_statuses||[]),terminalStatuses=new Set(policy.terminal_non_numeric_statuses||[]);
  const val090Problems=[];
  for(const f of facts){if(!validStatuses.has(f.status))val090Problems.push(`${f.sourceResultId}:INVALID_STATUS:${f.status}`);if(terminalStatuses.has(f.status)&&f.calcHadNumeric)val090Problems.push(`${f.sourceResultId}:TERMINAL_STATUS_HAS_E06_NUMERIC`);if(numericStatuses.has(f.status)&&!f.calcHadNumeric)val090Problems.push(`${f.sourceResultId}:NUMERIC_STATUS_WITHOUT_E06_NUMERIC`);}
  for(const a of aggregateRecords){if(terminalStatuses.has(a.assuranceStatusBucket)&&(a.waterResultM3!==null||a.personDays!==null))val090Problems.push(`${a.aggregateResultId}:TERMINAL_AGGREGATE_NUMERIC`);}
  const project=aggregateRecords.filter(x=>x.reportingLevel==='project');
  for(const component of new Set(facts.map(x=>x.component))){for(const status of policy.assurance_statuses||[]){const sf=facts.filter(x=>x.component===component&&x.status===status);const rows=project.filter(x=>x.component===component&&x.assuranceStatusBucket===status);if(sf.length!==rows.reduce((s,x)=>s+x.sourceResultCount,0))val090Problems.push(`PROJECT_BUCKET_MISMATCH:${component}:${status}`);}}
  const allAssuranceCount=(assuranceSnapshot.waterAssurance||[]).length+(assuranceSnapshot.personDayAssurance||[]).length;
  const val091Problems=[...joinIssues.map(x=>`${x.kind}:${x.resultId}:${x.code}`)];
  const ids=facts.map(x=>x.sourceResultId);if(new Set(ids).size!==ids.length)val091Problems.push('DUPLICATE_SOURCE_RESULT_FACT');if(facts.length!==allAssuranceCount)val091Problems.push(`FACT_COUNT:${facts.length}!=ASSURANCE_COUNT:${allAssuranceCount}`);
  for(const level of policy.reporting_hierarchy||[]){const expected=facts.filter(f=>f.paths.some(p=>p.level===level)).length;const actual=aggregateRecords.filter(a=>a.reportingLevel===level).reduce((s,a)=>s+a.sourceResultCount,0);if(actual!==expected)val091Problems.push(`LEVEL_COVERAGE:${level}:${actual}!=${expected}`);}
  const projectCount=project.reduce((s,a)=>s+a.sourceResultCount,0);if(projectCount!==facts.length)val091Problems.push(`PROJECT_SOURCE_COUNT:${projectCount}!=${facts.length}`);
  for(const f of facts){for(const p of f.paths){const memberships=aggregateRecords.filter(a=>a.reportingLevel===p.level&&a.reportingKey===p.key&&a.component===f.component&&a.assuranceStatusBucket===f.status&&a.sourceResultIds.includes(f.sourceResultId));if(memberships.length!==1)val091Problems.push(`${f.sourceResultId}:${p.level}:MEMBERSHIP_${memberships.length}`);}}
  return {ruleResults:[
    {ruleId:'VAL-090',name:'Aggregation status segregation',status:val090Problems.length?'FAIL':'PASS',problemCount:val090Problems.length,problems:val090Problems},
    {ruleId:'VAL-091',name:'Aggregation coverage reconciliation',status:val091Problems.length?'FAIL':'PASS',problemCount:val091Problems.length,problems:val091Problems}
  ],passed:!val090Problems.length&&!val091Problems.length};
}
function publicAggregate(a){const {sourceResultIds,...x}=a;return x;}
function publicSummary(snapshot){return {engine:'E08',engineContractVersion:'E08-v0.8.0',sourceSessionId:snapshot.sourceSessionId,sourceWorkbookSha256:snapshot.sourceWorkbookSha256,assuranceSnapshotHash:snapshot.assuranceSnapshotHash,aggregationPolicyVersion:snapshot.aggregationPolicyVersion,aggregationContentHash:snapshot.aggregationContentHash,aggregationSnapshotHash:snapshot.aggregationSnapshotHash,status:snapshot.status,stats:snapshot.stats,statusCounts:snapshot.statusCounts,hierarchyCounts:snapshot.hierarchyCounts,projectSummary:snapshot.projectSummary,aggregateResults:snapshot.aggregateResults.map(publicAggregate),aggregationQa:snapshot.aggregationQa,notes:[
  'E08 aggregates finalized E07 assurance buckets only; it never changes E06 calculations or E07 assurance assignments.',
  'accepted-certified, provisional-evidence-pending, calculated-warning, not-calculated and excluded remain separate at every reporting level.',
  'Calculated Total may combine accepted + provisional + warning for display, but it must never be labelled Certified Total.',
  'not-calculated and excluded buckets keep null numeric totals; HOLD/excluded records are represented by counts rather than misleading zeroes.',
  'VAL-090 and VAL-091 are executed here. An aggregation QA failure withholds aggregate readiness without altering source result truth.',
  'Detailed source-result membership and the immutable aggregate snapshot remain browser-memory-only; project data is not encoded in the URL.'
]};}

export async function evaluateAggregation({canonicalSnapshot,calculationSnapshot,assuranceSnapshot,aggregationPolicy}){
  if(!canonicalSnapshot?.tables)throw new Error('Engine 8 requires the immutable Engine 3 canonical snapshot.');
  if(!calculationSnapshot?.waterCalculations)throw new Error('Engine 8 requires the immutable Engine 6 calculation snapshot.');
  if(!assuranceSnapshot?.waterAssurance)throw new Error('Engine 8 requires the immutable Engine 7 assurance snapshot.');
  if(!aggregationPolicy?.reporting_hierarchy?.length)throw new Error('Engine 8 aggregation policy is not loaded.');
  const water=makeWaterFacts({canonicalSnapshot,calculationSnapshot,assuranceSnapshot,policy:aggregationPolicy});
  const pd=makePersonFacts({canonicalSnapshot,calculationSnapshot,assuranceSnapshot,policy:aggregationPolicy});
  const facts=[...water.facts,...pd.facts],joinIssues=[...water.joinIssues,...pd.joinIssues];
  const aggregateResults=await buildAggregateRecords(facts,aggregationPolicy),projectSummary=buildProjectSummary(aggregateResults,aggregationPolicy);
  const aggregationQa=evaluateQa({facts,aggregateRecords:aggregateResults,assuranceSnapshot,policy:aggregationPolicy,joinIssues});
  const status=aggregationQa.passed?'aggregation_complete':'aggregation_not_ready';
  const statusCounts=Object.fromEntries((aggregationPolicy.assurance_statuses||[]).map(s=>[s,facts.filter(x=>x.status===s).length]));
  const hierarchyCounts=Object.fromEntries((aggregationPolicy.reporting_hierarchy||[]).map(level=>[level,{aggregateRows:aggregateResults.filter(x=>x.reportingLevel===level).length,sourceMemberships:aggregateResults.filter(x=>x.reportingLevel===level).reduce((s,x)=>s+x.sourceResultCount,0)}]));
  const stats={sourceAssuranceRecords:facts.length,waterSourceResults:water.facts.length,personDaySourceResults:pd.facts.length,aggregateRows:aggregateResults.length,projectAggregateRows:aggregateResults.filter(x=>x.reportingLevel==='project').length,reportingLevels:(aggregationPolicy.reporting_hierarchy||[]).length,qaPassed:aggregationQa.passed,qaFailedRules:aggregationQa.ruleResults.filter(x=>x.status==='FAIL').length};
  const content={sourceWorkbookSha256:canonicalSnapshot.sourceWorkbookSha256,assuranceSnapshotHash:assuranceSnapshot.assuranceSnapshotHash,aggregationPolicyVersion:aggregationPolicy.policy_id,aggregateResults:aggregateResults.map(({sourceResultIds,...x})=>x),projectSummary,status};
  const aggregationContentHash=await sha256Hex(new TextEncoder().encode(stableJson(content)).buffer);
  const core={sourceSessionId:canonicalSnapshot.sourceSessionId,sourceWorkbookSha256:canonicalSnapshot.sourceWorkbookSha256,canonicalSnapshotHash:canonicalSnapshot.canonicalSnapshotHash,calculationSnapshotHash:calculationSnapshot.calculationSnapshotHash,assuranceSnapshotHash:assuranceSnapshot.assuranceSnapshotHash,aggregationPolicyVersion:aggregationPolicy.policy_id,aggregateResults,projectSummary,aggregationQa,statusCounts,hierarchyCounts,stats,status,aggregationContentHash};
  const aggregationSnapshotHash=await sha256Hex(new TextEncoder().encode(stableJson({...core,aggregateResults:aggregateResults.map(({sourceResultIds,...x})=>x)})).buffer);
  return deepFreeze({...core,aggregationSnapshotHash});
}

export async function runEngine08({config},{store,bus}){
  const state=store.getState();if(!state.canonical?.immutableSnapshot||!state.calculated?.immutableSnapshot||!state.assured?.immutableSnapshot)throw new Error('Complete Engines 3, 6 and 7 before aggregation.');
  store.patchFrom('assurance',{lifecycle:'aggregation_processing',aggregation:null,aggregated:null,error:null});
  try{const immutableSnapshot=await evaluateAggregation({canonicalSnapshot:state.canonical.immutableSnapshot,calculationSnapshot:state.calculated.immutableSnapshot,assuranceSnapshot:state.assured.immutableSnapshot,aggregationPolicy:config.aggregationPolicy});const aggregated=Object.freeze({immutableSnapshot,aggregationSnapshotHash:immutableSnapshot.aggregationSnapshotHash,getSnapshot:()=>immutableSnapshot});const summary=publicSummary(immutableSnapshot);store.patch({lifecycle:'aggregation_ready',aggregation:summary,aggregated,error:null});bus?.emit('aggregation:completed',{aggregationSnapshotHash:summary.aggregationSnapshotHash,status:summary.status,stats:summary.stats});return summary;}catch(error){store.patch({lifecycle:'blocked_error',error:{engine:'E08',message:error.message}});throw error;}
}
