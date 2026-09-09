import { sha256Hex } from '../core/hash.js';

function deepFreeze(value){
  if(!value||typeof value!=='object'||ArrayBuffer.isView(value)||Object.isFrozen(value))return value;
  Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);return value;
}
function stableJson(value){
  if(Array.isArray(value))return `[${value.map(stableJson).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
const blank=v=>v===null||v===undefined||(typeof v==='string'&&v.trim()==='');
const text=v=>blank(v)?'':String(v).trim();
const dateOk=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))&&!Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const cmp=(a,b)=>String(a).localeCompare(String(b));
function table(snapshot,name){return snapshot.tables.find(t=>t.expectedSheet===name)||{records:[]};}
function value(record,id){return record?.values?.[id]??null;}
function byId(records,id){const m=new Map();for(const r of records){const k=text(value(r,id));if(k&&!m.has(k))m.set(k,r);}return m;}
function validationById(validation,key){return new Map((validation||[]).filter(x=>x?.[key]).map(x=>[String(x[key]),x]));}

function routeMeta(routeRegistry,routeId){return (routeRegistry?.water_routes||[]).find(r=>r.route_id===routeId)||null;}
function knownSurfaceType(routeRegistry,type){return (routeRegistry?.structure_capacity_map||[]).some(x=>x.structure_type===type&&x.auto_water_route!=='excluded');}

export function resolveOfficialWaterRoute({structure,control,routeRegistry,workbookReadiness='ready'}){
  if(workbookReadiness==='workbook_not_ready')return {waterRouteId:null,decisionStatus:'withheld_workbook_not_ready',reasonCode:'WORKBOOK_NOT_READY',timingMethod:null,timingClass:null,simulationStartDate:null};
  if(!structure)return {waterRouteId:null,decisionStatus:'unresolved',reasonCode:'MISSING_STRUCTURE',timingMethod:null,timingClass:null,simulationStartDate:null};
  const type=value(structure,'STR-003');
  const intervention=value(structure,'STR-005');
  const lining=value(structure,'STR-006');
  const completion=value(structure,'STR-007');
  const functional=value(structure,'STR-008');
  const rejuv=value(structure,'STR-020');
  const timing=value(structure,'STR-019')||value(control,'CTL-009');
  const cutoff=value(control,'CTL-008');
  const reportStart=value(control,'CTL-005');

  if(intervention==='Governance-related')return {waterRouteId:'WTR-EXCL-GOV',decisionStatus:'assigned',reasonCode:'GOVERNANCE_EXCLUSION',timingMethod:timing||null,timingClass:'excluded',simulationStartDate:null};
  if(type==='Subsurface recharge structure - excluded unless approved')return {waterRouteId:'WTR-EXCL-SUB',decisionStatus:'assigned',reasonCode:'SUBSURFACE_EXCLUSION',timingMethod:timing||null,timingClass:'excluded',simulationStartDate:null};
  if(lining==='Partly lined')return {waterRouteId:'WTR-HOLD-PARTLY-LINED',decisionStatus:'assigned',reasonCode:'PARTLY_LINED_HOLD',timingMethod:timing||null,timingClass:'hold',simulationStartDate:null};
  if(type==='Farm Pond'&&lining==='Fully lined')return {waterRouteId:'WTR-LFP',decisionStatus:'assigned',reasonCode:'FULLY_LINED_FARM_POND',timingMethod:timing||null,timingClass:'lined_farm_pond',simulationStartDate:null};

  if(!knownSurfaceType(routeRegistry,type))return {waterRouteId:null,decisionStatus:'unresolved',reasonCode:'UNRESOLVED_STRUCTURE_TYPE',timingMethod:timing||null,timingClass:null,simulationStartDate:null};
  if(!['New construction','Rejuvenation/repair'].includes(intervention))return {waterRouteId:null,decisionStatus:'unresolved',reasonCode:'UNRESOLVED_INTERVENTION_TYPE',timingMethod:timing||null,timingClass:null,simulationStartDate:null};
  if(!['Strict cutoff','Actual functional date - partial season'].includes(timing))return {waterRouteId:null,decisionStatus:'unresolved',reasonCode:'UNRESOLVED_TIMING_METHOD',timingMethod:timing||null,timingClass:null,simulationStartDate:null};

  let prefix=null,simulationStartDate=null,timingClass=null;
  if(timing==='Actual functional date - partial season'){
    if(!dateOk(functional))return {waterRouteId:null,decisionStatus:'unresolved',reasonCode:'MISSING_FUNCTIONAL_DATE',timingMethod:timing,timingClass:null,simulationStartDate:null};
    prefix='WTR-111';timingClass='KPI 1.1.1';
    simulationStartDate=dateOk(reportStart)&&cmp(functional,reportStart)<0?reportStart:functional;
  }else{
    if(!dateOk(completion)||!dateOk(cutoff))return {waterRouteId:null,decisionStatus:'unresolved',reasonCode:'MISSING_COMPLETION_OR_CUTOFF',timingMethod:timing,timingClass:null,simulationStartDate:null};
    prefix=cmp(completion,cutoff)<=0?'WTR-111':'WTR-112';
    timingClass=prefix==='WTR-111'?'KPI 1.1.1':'KPI 1.1.2';
    simulationStartDate=prefix==='WTR-111'?(dateOk(reportStart)?reportStart:null):null;
  }

  let suffix='NEW';
  if(intervention==='Rejuvenation/repair'){
    if(rejuv==='Post-intervention minus baseline capacity')suffix='REJ-A';
    else if(rejuv==='Verified desilted volume')suffix='REJ-B';
    else return {waterRouteId:null,decisionStatus:'unresolved',reasonCode:'UNRESOLVED_REJUVENATION_METHOD',timingMethod:timing,timingClass,simulationStartDate};
  }
  const waterRouteId=`${prefix}-${suffix}`;
  if(!routeMeta(routeRegistry,waterRouteId))return {waterRouteId:null,decisionStatus:'unresolved',reasonCode:'ROUTE_NOT_IN_FROZEN_REGISTRY',timingMethod:timing,timingClass,simulationStartDate};
  return {waterRouteId,decisionStatus:'assigned',reasonCode:`${timing==='Strict cutoff'?'STRICT_CUTOFF':'PARTIAL_SEASON'}_${suffix}`,timingMethod:timing,timingClass,simulationStartDate};
}

export function resolvePersonDayRoute(category,routingPolicy){
  const found=(routingPolicy?.person_day_routes||[]).find(r=>r.category===category);
  return found?{personDayRouteId:found.route_id,decisionStatus:'assigned',basis:found.basis,independent:found.independent!==false}:{personDayRouteId:null,decisionStatus:'unresolved',basis:null,independent:true};
}

function eligibilityFrom(readiness,decision){
  if(decision.decisionStatus!=='assigned')return decision.decisionStatus==='withheld_workbook_not_ready'?'workbook_not_ready':'unresolved';
  if(readiness==='excluded')return 'excluded';
  if(readiness==='hold')return 'hold';
  if(readiness==='not_ready'||readiness==='workbook_not_ready')return 'not_ready';
  if(readiness==='ready_with_warning')return 'eligible_with_warning';
  return 'eligible';
}

function publicSummary(snapshot){
  return {
    engine:'E05',engineContractVersion:'E05-v0.5.0',sourceSessionId:snapshot.sourceSessionId,
    sourceWorkbookSha256:snapshot.sourceWorkbookSha256,canonicalSnapshotHash:snapshot.canonicalSnapshotHash,
    validationSnapshotHash:snapshot.validationSnapshotHash,routeRegistryVersion:snapshot.routeRegistryVersion,
    routingPolicyVersion:snapshot.routingPolicyVersion,routingSnapshotHash:snapshot.routingSnapshotHash,
    routingContentHash:snapshot.routingContentHash,status:snapshot.status,stats:snapshot.stats,
    waterRoutes:snapshot.waterRoutes,personDayRoutes:snapshot.personDayRoutes,
    unresolved:snapshot.unresolved,
    notes:[
      'Engine 5 owns the official routing truth layer and assigns at most one frozen water route to each routable structure/run.',
      'Validation readiness is propagated into eligibility status; a validation failure never silently reroutes a structure.',
      'Governance, subsurface and partly-lined outcomes remain official excluded/HOLD routes rather than generic errors.',
      'KPI 1.2.1 person-day routing is parallel and independent from water-route readiness.',
      'Engine 5 does not calculate water volumes, person-days, assurance or aggregates.',
      'The immutable routing snapshot remains browser-memory-only and project data is not encoded in the URL.'
    ]
  };
}

export async function evaluateRouting({canonicalSnapshot,validationSnapshot,routeRegistry,routingPolicy}){
  if(!canonicalSnapshot?.tables)throw new Error('Engine 5 requires the immutable Engine 3 canonical snapshot.');
  if(!validationSnapshot?.structureReadiness)throw new Error('Engine 5 requires the immutable Engine 4 validation snapshot.');
  if(!routeRegistry?.water_routes?.length)throw new Error('Engine 5 route registry is not loaded.');
  if(!routingPolicy?.person_day_routes?.length)throw new Error('Engine 5 routing policy is not loaded.');

  const controls=table(canonicalSnapshot,'01_Control').records;
  const structures=table(canonicalSnapshot,'02_Structures').records;
  const personDays=table(canonicalSnapshot,'10_Person_Days').records;
  const control=controls[0]||null;
  const vStruct=validationById(validationSnapshot.structureReadiness,'structureRecordId');
  const vPd=validationById(validationSnapshot.personDayReadiness,'personDayRecordId');
  const workbookReadiness=validationSnapshot.workbookReadiness;
  const seenIds=new Set();
  const waterRoutes=[];const unresolved=[];

  for(let i=0;i<structures.length;i++){
    const s=structures[i],sid=text(value(s,'STR-001'));
    if(!sid){unresolved.push({entityType:'structure',sourceRowNumber:s.sourceRowNumber||null,reasonCode:'MISSING_STRUCTURE_ID'});continue;}
    if(seenIds.has(sid)){unresolved.push({entityType:'structure',structureRecordId:sid,sourceRowNumber:s.sourceRowNumber||null,reasonCode:'DUPLICATE_STRUCTURE_ID'});continue;}
    seenIds.add(sid);
    const validation=vStruct.get(sid)||{validationReadiness:workbookReadiness==='workbook_not_ready'?'workbook_not_ready':'not_ready',blockingIssueCount:1,warningIssueCount:0};
    const decision=resolveOfficialWaterRoute({structure:s,control,routeRegistry,workbookReadiness});
    const meta=decision.waterRouteId?routeMeta(routeRegistry,decision.waterRouteId):null;
    const routeDecision={
      routeDecisionId:`WRT-E05-${String(waterRoutes.length+1).padStart(4,'0')}`,
      structureRecordId:sid,waterRouteId:decision.waterRouteId,routeDecisionStatus:decision.decisionStatus,
      routeName:meta?.route_name||null,waterResult:meta?.water_result||null,aggregationBucket:meta?.aggregation_bucket||null,
      calculationReadiness:validation.validationReadiness,eligibilityStatus:eligibilityFrom(validation.validationReadiness,decision),
      blockingIssueCount:validation.blockingIssueCount||0,warningIssueCount:validation.warningIssueCount||0,
      timingMethod:decision.timingMethod,timingClass:decision.timingClass,simulationStartDate:decision.simulationStartDate,
      completionDate:value(s,'STR-007'),functionalDate:value(s,'STR-008'),interventionType:value(s,'STR-005'),
      structureType:value(s,'STR-003'),liningStatus:value(s,'STR-006'),rejuvenationMethod:value(s,'STR-020'),
      routeReasonCode:decision.reasonCode,mutualExclusionGroup:meta?.mutual_exclusion_group||'water_route_per_structure',
      routeRegistryVersion:routeRegistry.registry_id,validationSnapshotHash:validationSnapshot.validationSnapshotHash
    };
    waterRoutes.push(routeDecision);
    if(decision.decisionStatus!=='assigned')unresolved.push({entityType:'structure',structureRecordId:sid,sourceRowNumber:s.sourceRowNumber||null,reasonCode:decision.reasonCode});
  }

  const personDayRoutes=personDays.map((r,i)=>{
    const id=text(value(r,'PD-001'));
    const decision=resolvePersonDayRoute(value(r,'PD-007'),routingPolicy);
    const vr=vPd.get(id)||{validationReadiness:workbookReadiness==='workbook_not_ready'?'workbook_not_ready':'not_ready',blockingIssueCount:1,warningIssueCount:0};
    if(decision.decisionStatus!=='assigned')unresolved.push({entityType:'person-day',personDayRecordId:id||null,sourceRowNumber:r.sourceRowNumber||null,reasonCode:'UNRESOLVED_PERSON_DAY_CATEGORY'});
    return {
      personDayRouteDecisionId:`PDRT-E05-${String(i+1).padStart(4,'0')}`,personDayRecordId:id||null,
      structureWorkId:value(r,'PD-002'),workScopeActivity:value(r,'PD-003'),category:value(r,'PD-007'),
      personDayRouteId:decision.personDayRouteId,routeDecisionStatus:decision.decisionStatus,basis:decision.basis,
      calculationReadiness:vr.validationReadiness,eligibilityStatus:eligibilityFrom(vr.validationReadiness,decision),
      blockingIssueCount:vr.blockingIssueCount||0,warningIssueCount:vr.warningIssueCount||0,
      independentFromWater:true,routeRegistryVersion:'HUF-DESIGN1-PERSON-DAY-ROUTES-v1.1',validationSnapshotHash:validationSnapshot.validationSnapshotHash
    };
  });

  const routeCounts={};for(const x of waterRoutes){const k=x.waterRouteId||'UNRESOLVED';routeCounts[k]=(routeCounts[k]||0)+1;}
  const pdRouteCounts={};for(const x of personDayRoutes){const k=x.personDayRouteId||'UNRESOLVED';pdRouteCounts[k]=(pdRouteCounts[k]||0)+1;}
  const eligibilityCounts={};for(const x of waterRoutes){eligibilityCounts[x.eligibilityStatus]=(eligibilityCounts[x.eligibilityStatus]||0)+1;}
  const stats={
    structureRecords:structures.length,waterRouteDecisions:waterRoutes.length,assignedWaterRoutes:waterRoutes.filter(x=>x.routeDecisionStatus==='assigned').length,
    unresolvedWaterRoutes:waterRoutes.filter(x=>x.routeDecisionStatus!=='assigned').length,personDayRecords:personDays.length,
    assignedPersonDayRoutes:personDayRoutes.filter(x=>x.routeDecisionStatus==='assigned').length,unresolvedPersonDayRoutes:personDayRoutes.filter(x=>x.routeDecisionStatus!=='assigned').length,
    routeCounts,pdRouteCounts,eligibilityCounts
  };
  const status=workbookReadiness==='workbook_not_ready'?'routing_withheld':stats.unresolvedWaterRoutes||stats.unresolvedPersonDayRoutes?'routing_incomplete':'routing_ready';
  const content={sourceWorkbookSha256:canonicalSnapshot.sourceWorkbookSha256,routeRegistryVersion:routeRegistry.registry_id,routingPolicyVersion:routingPolicy.policy_id,waterRoutes:waterRoutes.map(x=>({...x,validationSnapshotHash:undefined})),personDayRoutes:personDayRoutes.map(x=>({...x,validationSnapshotHash:undefined})),status};
  const routingContentHash=await sha256Hex(new TextEncoder().encode(stableJson(content)).buffer);
  const core={
    sourceSessionId:canonicalSnapshot.sourceSessionId,sourceWorkbookSha256:canonicalSnapshot.sourceWorkbookSha256,
    canonicalSnapshotHash:canonicalSnapshot.canonicalSnapshotHash,validationSnapshotHash:validationSnapshot.validationSnapshotHash,
    routeRegistryVersion:routeRegistry.registry_id,routingPolicyVersion:routingPolicy.policy_id,
    waterRoutes,personDayRoutes,unresolved,stats,status,routingContentHash
  };
  const routingSnapshotHash=await sha256Hex(new TextEncoder().encode(stableJson(core)).buffer);
  return deepFreeze({...core,routingSnapshotHash});
}

export async function runEngine05({config},{store,bus}){
  const state=store.getState();
  if(!state.canonical?.immutableSnapshot||!state.validated?.immutableSnapshot)throw new Error('Complete Engines 3 and 4 before official routing.');
  store.patchFrom('validation',{lifecycle:'routing_processing',routing:null,routed:null,error:null});
  try{
    const immutableSnapshot=await evaluateRouting({canonicalSnapshot:state.canonical.immutableSnapshot,validationSnapshot:state.validated.immutableSnapshot,routeRegistry:config.routeRegistry,routingPolicy:config.routingPolicy});
    const routed=Object.freeze({immutableSnapshot,routingSnapshotHash:immutableSnapshot.routingSnapshotHash,getSnapshot:()=>immutableSnapshot});
    const summary=publicSummary(immutableSnapshot);
    store.patch({lifecycle:'routing_ready',routing:summary,routed,error:null});
    bus?.emit('routing:completed',{routingSnapshotHash:immutableSnapshot.routingSnapshotHash,status:summary.status,stats:summary.stats});
    return summary;
  }catch(error){store.patch({lifecycle:'blocked_error',error:{engine:'E05',message:error.message}});throw error;}
}
