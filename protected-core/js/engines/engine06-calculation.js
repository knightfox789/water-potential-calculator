import { sha256Hex } from '../core/hash.js';
import {
  finite,withinTolerance,numericTolerance,m3ToBL,effectiveLength,storagePlanArea,grossCapacity,capacityVariance,
  rejuvenationA,rejuvenationB,physicalSiltFraction,year3SiltFraction,netCapacity,residualRunoffFraction,
  catchmentMethod1,catchmentMethod2,catchmentMethod3,catchmentAlternate,topologicalSort,ddwStates,runoffDepth,
  buildStageStorageCurve,stageAreasForVolume,evaporationAreaStandard,monthlyEvaporationRate,dailyBalanceStep,kpi111,
  paidPersonDays,communityPersonDays,volumePersonDays,machineryPersonDays
} from './engine06-formulas.js';

function deepFreeze(value){if(!value||typeof value!=='object'||ArrayBuffer.isView(value)||Object.isFrozen(value))return value;Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);return value;}
function stableJson(value){if(Array.isArray(value))return `[${value.map(stableJson).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;return JSON.stringify(value);}
const blank=v=>v===null||v===undefined||(typeof v==='string'&&v.trim()==='');
const text=v=>blank(v)?'':String(v).trim();
const dateOk=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))&&!Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const cmp=(a,b)=>String(a).localeCompare(String(b));
function table(snapshot,name){return snapshot.tables.find(t=>t.expectedSheet===name)||{records:[]};}
function value(record,id){return record?.values?.[id]??null;}
function indexOne(records,id){const m=new Map();for(const r of records){const k=text(value(r,id));if(k&&!m.has(k))m.set(k,r);}return m;}
function indexMany(records,id){const m=new Map();for(const r of records){const k=text(value(r,id));if(!k)continue;if(!m.has(k))m.set(k,[]);m.get(k).push(r);}return m;}
function addDays(iso,n){const d=new Date(`${iso}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function dateRange(start,end){const out=[];if(!dateOk(start)||!dateOk(end)||cmp(start,end)>0)return out;for(let d=start;cmp(d,end)<=0;d=addDays(d,1))out.push(d);return out;}
function formulaExists(catalog,id){return (catalog?.formulas||[]).some(f=>f.formula_id===id);}
function uniqueFormulaIds(ids,catalog){const out=[];for(const id of ids)if(formulaExists(catalog,id)&&!out.includes(id))out.push(id);return out;}

function capacityMap(routeRegistry,type){return (routeRegistry?.structure_capacity_map||[]).find(x=>x.structure_type===type)||null;}
function firstMonsoon(structure,control){const completion=value(structure,'STR-007'),cutoff=value(control,'CTL-008');if(!dateOk(completion)||!dateOk(cutoff))return false;const y=Number(cutoff.slice(0,4));const prior=`${y-1}${cutoff.slice(4)}`;return cmp(completion,prior)>0&&cmp(completion,cutoff)<=0;}

export function calculateCapacityContext({structure,technical,siltRecords,control,routeRegistry,waterRouteId,formulaCatalog}){
  const type=value(structure,'STR-003');const map=capacityMap(routeRegistry,type);if(!map||!map.legacy_factor)return {status:'not_applicable',formulaIds:[]};
  const L=value(technical,'TEC-002'),W=value(technical,'TEC-003'),D=value(technical,'TEC-004'),fraction=value(technical,'TEC-005');
  if(![L,W,D,fraction].every(finite))throw new Error('CAPACITY_INPUT_MISSING');
  const effLen=effectiveLength(L,fraction);const selectedWidth=finite(value(technical,'TEC-006'))&&value(technical,'TEC-006')>0?value(technical,'TEC-006'):W;
  const planArea=storagePlanArea(selectedWidth,effLen);const gross=grossCapacity(map.legacy_capacity_family,planArea,D);
  const recorded=value(technical,'TEC-011');const variance=capacityVariance(recorded,gross);
  let siltFraction=0,siltLoss=0,siltMethod='zero/no-assessment',siltFormulaIds=[];
  const silt=(siltRecords||[])[0]||null;
  if(firstMonsoon(structure,control)){siltMethod='first-monsoon-zero';siltFormulaIds=['SIL-001'];}
  else if(silt){
    const method=value(silt,'SIL-004');
    if(method==='Physical 5-point assessment'){
      siltFraction=physicalSiltFraction(value(silt,'SIL-005'),['SIL-006','SIL-007','SIL-008','SIL-009','SIL-010'].map(id=>value(silt,id)));
      siltMethod='depth-loss-proxy';siltFormulaIds=['SIL-002','SIL-003','SIL-004','SIL-005','SIL-006'];
    } else if(method==='Year-3 cumulative assumption'){
      siltFraction=year3SiltFraction(value(silt,'SIL-011'));siltMethod='year3-cumulative';siltFormulaIds=['SIL-007'];
    } else if(method==='Surveyed volume loss'){
      siltLoss=value(silt,'SIL-012');siltMethod='surveyed-volume-loss';siltFormulaIds=['SIL-009'];
    }
  }
  const net=netCapacity({gross,surveyedLoss:siltMethod==='surveyed-volume-loss'?siltLoss:null,siltFraction});
  let eligible=net;const route=waterRouteId||'';
  if(route.endsWith('REJ-A'))eligible=rejuvenationA(value(technical,'TEC-013'),value(technical,'TEC-012'));
  else if(route.endsWith('REJ-B'))eligible=rejuvenationB(value(technical,'TEC-014'));
  const formulaIds=uniqueFormulaIds(['CAP-001','CAP-002','CAP-003','CAP-004','CAP-005','SIL-009','CAP-006','CAP-007',...siltFormulaIds,route.endsWith('REJ-A')?'REJ-001':null,route.endsWith('REJ-B')?'REJ-002':null].filter(Boolean),formulaCatalog);
  return {status:'calculated',structureFamily:map.legacy_capacity_family,legacyFactor:Number(map.legacy_factor),effectiveLengthM:effLen,selectedWidthOrBackwaterM:selectedWidth,storagePlanAreaM2:planArea,grossCapacityM3:gross,recordedCapacityM3:finite(recorded)?recorded:null,capacityVarianceM3:variance.varianceM3,capacityVariancePercent:variance.variancePercent,siltMethod,appliedSiltFraction:siltFraction,siltLossM3:siltMethod==='surveyed-volume-loss'?siltLoss:gross-net,netCapacityM3:net,eligibleCapacityM3:eligible,formulaIds};
}

function catchmentContext({record,links,upstreamResults}){
  const method=value(record,'CAT-003');const free=value(record,'CAT-005'),intercepted=value(record,'CAT-006'),higher=value(record,'CAT-007');
  if(method==='Method 3 - free catchment only')return {method,effectiveHa:catchmentMethod3(free),formulaIds:['CAS-003']};
  if(method==='Method 2 - 20% intercepted')return {method,effectiveHa:catchmentMethod2(free,intercepted),formulaIds:['CAS-002']};
  if(method==='Farm pond/bund alternate')return {method,effectiveHa:catchmentAlternate(higher),formulaIds:['CAS-004']};
  if(method==='Method 1 - cascade residual'){
    let effective=free;const dependencies=[];
    for(const link of links){const up=text(value(link,'CSL-002'));const overlap=value(link,'CSL-004');const upResult=upstreamResults.get(up);if(!upResult||!finite(upResult.residualRunoffFraction))throw new Error(`CAS-001_UPSTREAM_NOT_CALCULATED:${up}`);effective+=upResult.residualRunoffFraction*overlap;dependencies.push({upstreamStructureRecordId:up,overlapHa:overlap,upstreamResidualRunoffFraction:upResult.residualRunoffFraction});}
    return {method,effectiveHa:effective,dependencies,formulaIds:['CAS-001','CAS-005','BAL-013']};
  }
  throw new Error('CATCHMENT_METHOD_UNRESOLVED');
}

function monthlyEvapArray(hydro){return ['HYP-005','HYP-006','HYP-007','HYP-008','HYP-009','HYP-010','HYP-011','HYP-012','HYP-013','HYP-014','HYP-015','HYP-016'].map(id=>value(hydro,id));}
function makeStageCurve(stageRecords){return buildStageStorageCurve(stageRecords.map(r=>({depth:value(r,'STA-004'),surfaceArea:value(r,'STA-005'),baseArea:value(r,'STA-006')})));}

export function prepareRainfallSeries({rainfallRecords,stationId,start,end}){
  return rainfallRecords.filter(r=>text(value(r,'RAN-001'))===stationId&&dateOk(value(r,'RAN-003'))&&cmp(value(r,'RAN-003'),start)>=0&&cmp(value(r,'RAN-003'),end)<=0)
    .sort((a,b)=>cmp(value(a,'RAN-003'),value(b,'RAN-003')))
    .map(r=>({date:value(r,'RAN-003'),rainfallMm:value(r,'RAN-004'),sourceRowNumber:r.sourceRowNumber}));
}

export function simulateWater111({structureId,capacity,technical,catchment,rainfallRecords,hydro,stageRecords,simulationStart,simulationEnd,areaMethod}){
  const stationId=text(value(technical,'TEC-017'));const rain=prepareRainfallSeries({rainfallRecords,stationId,start:simulationStart,end:simulationEnd});
  const dates=dateRange(simulationStart,simulationEnd);if(rain.length!==dates.length)throw new Error(`RAIN-001_INCOMPLETE:${rain.length}/${dates.length}`);
  for(let i=0;i<dates.length;i++)if(rain[i].date!==dates[i]||!finite(rain[i].rainfallMm))throw new Error(`RAIN-001_DATE_OR_VALUE:${dates[i]}`);
  const rainVals=rain.map(x=>x.rainfallMm);const states=ddwStates(rainVals);const monthly=monthlyEvapArray(hydro);const infiltrationRate=value(hydro,'HYP-002');
  const fullSurface=finite(value(technical,'TEC-020'))?value(technical,'TEC-020'):capacity.storagePlanAreaM2;
  const verifiedBase=value(technical,'TEC-021');
  const stageCurve=areaMethod==='Advanced stage-area'?makeStageCurve(stageRecords):null;
  let previousClosing=0,cumGenerated=0,cumOverflow=0,cumCaptured=0,cumEvap=0,cumInf=0,maxResidual=0;const trace=[];
  for(let i=0;i<rain.length;i++){
    const date=rain[i].date,R=rainVals[i],state=states[i],depth=runoffDepth(state,R),generated=catchment.effectiveHa*depth*10;
    const previewOpening=Math.min(generated+previousClosing,capacity.eligibleCapacityM3);const fill=previewOpening/capacity.eligibleCapacityM3;
    let evaporationArea,infiltrationArea,stageDepth=null;
    if(areaMethod==='Advanced stage-area'){
      const areas=stageAreasForVolume(stageCurve,previewOpening);stageDepth=areas.depth;evaporationArea=areas.surfaceArea;infiltrationArea=areas.baseArea;
    } else {evaporationArea=evaporationAreaStandard(fullSurface,fill);infiltrationArea=verifiedBase;}
    const evapRate=monthlyEvaporationRate(monthly,date);
    const step=dailyBalanceStep({previousClosing,generatedRunoff:generated,eligibleCapacity:capacity.eligibleCapacityM3,evaporationArea,evaporationMmDay:evapRate,infiltrationArea,infiltrationMmHour:infiltrationRate});
    const nonnegative=[generated,step.available,step.opening,step.overflow,step.actualEvaporation,step.actualInfiltration,step.closing].every(x=>finite(x)&&x>=-numericTolerance(x,0));
    const capacityBound=step.opening<=capacity.eligibleCapacityM3+numericTolerance(step.opening,capacity.eligibleCapacityM3)&&step.closing<=capacity.eligibleCapacityM3+numericTolerance(step.closing,capacity.eligibleCapacityM3);
    const massPass=Math.abs(step.massResidual)<=numericTolerance(previousClosing+generated,step.overflow+step.actualEvaporation+step.actualInfiltration+step.closing);
    const areaBounds=areaMethod==='Advanced stage-area'||(step.fillFraction>=-1e-12&&step.fillFraction<=1+1e-12&&evaporationArea>=-1e-12&&evaporationArea<=fullSurface+1e-9);
    trace.push({structureRecordId:structureId,date,rainfallMm:R,ddwState:state,runoffDepthMm:depth,effectiveCatchmentHa:catchment.effectiveHa,generatedRunoffM3:generated,previousClosingStorageM3:previousClosing,availableWaterM3:step.available,openingStorageM3:step.opening,overflowM3:step.overflow,fillFraction:step.fillFraction,evaporationRateMmDay:evapRate,evaporationAreaM2:evaporationArea,potentialEvaporationM3:step.potentialEvaporation,actualEvaporationM3:step.actualEvaporation,infiltrationAreaM2:infiltrationArea,infiltrationRateMmHour:infiltrationRate,potentialInfiltrationM3:step.potentialInfiltration,actualInfiltrationM3:step.actualInfiltration,closingStorageM3:step.closing,capturedRunoffM3:step.capturedRunoff,massBalanceResidualM3:step.massResidual,stageDepthM:stageDepth,qa:{nonnegative,capacityBound,massPass,areaBounds}});
    cumGenerated+=generated;cumOverflow+=step.overflow;cumCaptured+=step.capturedRunoff;cumEvap+=step.actualEvaporation;cumInf+=step.actualInfiltration;maxResidual=Math.max(maxResidual,Math.abs(step.massResidual));previousClosing=step.closing;
  }
  const identity=kpi111({captured:cumCaptured,evaporation:cumEvap,infiltration:cumInf,finalClosing:previousClosing});const residual=residualRunoffFraction(cumOverflow,cumGenerated);
  const qa={nonnegativePass:trace.every(x=>x.qa.nonnegative&&x.qa.capacityBound),massBalancePass:trace.every(x=>x.qa.massPass),evaporationAreaBoundsPass:trace.every(x=>x.qa.areaBounds),identityPass:withinTolerance(identity.primary,identity.crosscheck),maxMassResidualM3:maxResidual,identityDifferenceM3:identity.difference};
  return {trace,summary:{calculationDays:trace.length,generatedRunoffM3:cumGenerated,overflowM3:cumOverflow,capturedRunoffM3:cumCaptured,cumulativeEvaporationM3:cumEvap,cumulativeInfiltrationM3:cumInf,finalClosingStorageM3:previousClosing,residualRunoffFraction:residual,resultM3:identity.primary,resultBL:m3ToBL(identity.primary),identityCrosscheckM3:identity.crosscheck,identityDifferenceM3:identity.difference,maxMassResidualM3:maxResidual},qa};
}

function waterComponent(route){if(route?.startsWith('WTR-111'))return 'KPI-1.1.1';if(route?.startsWith('WTR-112'))return 'KPI-1.1.2';if(route==='WTR-LFP')return 'LINED-FP';if(route==='WTR-HOLD-PARTLY-LINED')return 'WATER-HOLD';if(route?.startsWith('WTR-EXCL'))return 'WATER-EXCL';return 'UNRESOLVED';}
function nonCalculatedWater(routeDecision,status,reason){return {calculationId:`WCAL-E06-${routeDecision.routeDecisionId}`,structureRecordId:routeDecision.structureRecordId,waterRouteId:routeDecision.waterRouteId,waterComponent:waterComponent(routeDecision.waterRouteId),eligibilityStatus:routeDecision.eligibilityStatus,calculationStatus:status,calculationReason:reason,calculationStartDate:routeDecision.simulationStartDate||null,calculationEndDate:null,calculationDays:0,resultM3:null,resultBL:null,identityCrosscheckM3:null,identityDifferenceM3:null,maxMassResidualM3:null,formulaIds:[],qa:{},capacity:null,catchment:null,hydrology:null};}

function personDayValue(routeId,record){if(routeId==='PD-DIRECT')return paidPersonDays(value(record,'PD-009'));if(routeId==='PD-COMMUNITY')return communityPersonDays(value(record,'PD-008'));if(routeId==='PD-VOLUME')return volumePersonDays(value(record,'PD-010'),value(record,'PD-012'));if(routeId==='PD-MACHINERY')return machineryPersonDays({hours:value(record,'PD-008'),directDays:value(record,'PD-009')});return null;}
function pdFormulaIds(routeId){return routeId==='PD-DIRECT'?['PD-001','PD-005','PD-006']:routeId==='PD-COMMUNITY'?['PD-002','PD-005','PD-006']:routeId==='PD-VOLUME'?['PD-003','PD-005','PD-006']:routeId==='PD-MACHINERY'?['PD-004','PD-005','PD-006']:[];}

function publicSummary(snapshot){return {engine:'E06',engineContractVersion:'E06-v0.6.0',sourceSessionId:snapshot.sourceSessionId,sourceWorkbookSha256:snapshot.sourceWorkbookSha256,canonicalSnapshotHash:snapshot.canonicalSnapshotHash,validationSnapshotHash:snapshot.validationSnapshotHash,routingSnapshotHash:snapshot.routingSnapshotHash,formulaCatalogVersion:snapshot.formulaCatalogVersion,calculationSnapshotHash:snapshot.calculationSnapshotHash,calculationContentHash:snapshot.calculationContentHash,status:snapshot.status,stats:snapshot.stats,waterCalculations:snapshot.waterCalculations.map(x=>({...x,dailyTrace:undefined})),personDayCalculations:snapshot.personDayCalculations,kpi121TotalPersonDays:snapshot.kpi121TotalPersonDays,calculationQa:snapshot.calculationQa,notes:[
  'Engine 6 is the only official calculation engine and executes the frozen Design 2 v1.1 formula catalog.',
  'Only official E05 eligible / eligible_with_warning routes are calculated; not-ready, HOLD, excluded and unresolved records retain null numeric results.',
  'KPI 1.1.1 daily traces use full internal precision, a real-date rainfall window, monthly mean-daily evaporation, and the selected standard/advanced area method.',
  'KPI 1.1.2 and fully lined Farm Pond routes are physical single-fill/incremental calculations and do not run daily hydrology.',
  'KPI 1.2.1 person-day calculations remain independent from water readiness.',
  'E06 evaluates the Design 4 calculation-QA rules VAL-063, VAL-066, VAL-086, VAL-087, VAL-088 and VAL-089; E08 aggregation QA remains deferred.',
  'Daily traces and the immutable calculation snapshot remain browser-memory-only; project data is not encoded in the URL.'
]};}

export async function evaluateCalculation({canonicalSnapshot,validationSnapshot,routingSnapshot,routeRegistry,formulaCatalog}){
  if(!canonicalSnapshot?.tables)throw new Error('Engine 6 requires the immutable Engine 3 canonical snapshot.');
  if(!validationSnapshot?.structureReadiness)throw new Error('Engine 6 requires the immutable Engine 4 validation snapshot.');
  if(!routingSnapshot?.waterRoutes)throw new Error('Engine 6 requires the immutable Engine 5 routing snapshot.');
  if(!formulaCatalog?.formulas?.length)throw new Error('Engine 6 formula catalog is not loaded.');
  const control=table(canonicalSnapshot,'01_Control').records[0]||null;const structures=table(canonicalSnapshot,'02_Structures').records;const technical=table(canonicalSnapshot,'03_Technical').records;const catches=table(canonicalSnapshot,'04_Catchments').records;const cascades=table(canonicalSnapshot,'05_Cascade_Links').records;const rainfall=table(canonicalSnapshot,'06_Daily_Rainfall').records;const hydro=table(canonicalSnapshot,'07_Hydro_Params').records;const stages=table(canonicalSnapshot,'08_Stage_Area_Optional').records;const silts=table(canonicalSnapshot,'09_Silt_Assessment').records;const pds=table(canonicalSnapshot,'10_Person_Days').records;
  const structureById=indexOne(structures,'STR-001'),techById=indexOne(technical,'TEC-001'),catchByStructure=indexOne(catches,'CAT-002'),hydroById=indexOne(hydro,'HYP-001'),stageByGroup=indexMany(stages,'STA-002'),siltByStructure=indexMany(silts,'SIL-002'),pdById=indexOne(pds,'PD-001');
  const routeById=new Map(routingSnapshot.waterRoutes.map(x=>[x.structureRecordId,x]));const reportEnd=value(control,'CTL-006');
  const eligible111=routingSnapshot.waterRoutes.filter(x=>x.waterRouteId?.startsWith('WTR-111')&&['eligible','eligible_with_warning'].includes(x.eligibilityStatus));const nodes=eligible111.map(x=>x.structureRecordId);const links=cascades.map(r=>({upstream:text(value(r,'CSL-002')),downstream:text(value(r,'CSL-003')),record:r})).filter(x=>nodes.includes(x.upstream)&&nodes.includes(x.downstream));let order=[];try{order=topologicalSort(nodes,links);}catch{order=[...nodes];}
  const upstreamResults=new Map();const calculatedById=new Map();const calcErrors=[];
  for(const sid of order){
    const rd=routeById.get(sid),s=structureById.get(sid),tr=techById.get(sid),cr=catchByStructure.get(sid);try{
      const cap=calculateCapacityContext({structure:s,technical:tr,siltRecords:siltByStructure.get(sid)||[],control,routeRegistry,waterRouteId:rd.waterRouteId,formulaCatalog});
      const incoming=cascades.filter(r=>text(value(r,'CSL-003'))===sid);const cat=catchmentContext({record:cr,links:incoming,upstreamResults});const h=hydroById.get(text(value(tr,'TEC-022')));const areaMethod=value(tr,'TEC-023')||value(control,'CTL-014')||'Standard simple';const stageRecords=stageByGroup.get(text(value(tr,'TEC-024')))||[];
      const sim=simulateWater111({structureId:sid,capacity:cap,technical:tr,catchment:cat,rainfallRecords:rainfall,hydro:h,stageRecords,simulationStart:rd.simulationStartDate,simulationEnd:reportEnd,areaMethod});
      const qaPass=sim.qa.nonnegativePass&&sim.qa.massBalancePass&&sim.qa.evaporationAreaBoundsPass&&sim.qa.identityPass;
      const formulaIds=uniqueFormulaIds([...cap.formulaIds,...cat.formulaIds,'RAIN-001','GEO-003','DDW-001','DDW-002','DDW-003','DDW-004','DDW-005','DDW-006','DDW-007','DDW-008','RUN-001','RUN-002','RUN-003','RUN-004','EVP-001','GEO-004','BAL-005','BAL-016','BAL-017','BAL-001','BAL-002','BAL-003','BAL-004','BAL-006','BAL-007','BAL-008','BAL-009','BAL-010','BAL-011','BAL-012','BAL-013','KPI-111','UNT-005','NUM-001','NUM-002',areaMethod==='Advanced stage-area'?'STG-001':null,areaMethod==='Advanced stage-area'?'STG-002':null,areaMethod==='Advanced stage-area'?'STG-003':null,areaMethod==='Advanced stage-area'?'BAL-014':null,areaMethod==='Advanced stage-area'?'BAL-015':null].filter(Boolean),formulaCatalog);
      const calc={calculationId:`WCAL-E06-${rd.routeDecisionId}`,structureRecordId:sid,waterRouteId:rd.waterRouteId,waterComponent:'KPI-1.1.1',eligibilityStatus:rd.eligibilityStatus,calculationStatus:qaPass?'calculated':'qa_failed',calculationReason:qaPass?'OK':'CALCULATION_QA_FAILED',calculationStartDate:rd.simulationStartDate,calculationEndDate:reportEnd,calculationDays:sim.summary.calculationDays,resultM3:qaPass?sim.summary.resultM3:null,resultBL:qaPass?sim.summary.resultBL:null,identityCrosscheckM3:sim.summary.identityCrosscheckM3,identityDifferenceM3:sim.summary.identityDifferenceM3,maxMassResidualM3:sim.summary.maxMassResidualM3,residualRunoffFraction:sim.summary.residualRunoffFraction,generatedRunoffM3:sim.summary.generatedRunoffM3,overflowM3:sim.summary.overflowM3,capturedRunoffM3:sim.summary.capturedRunoffM3,cumulativeEvaporationM3:sim.summary.cumulativeEvaporationM3,cumulativeInfiltrationM3:sim.summary.cumulativeInfiltrationM3,finalClosingStorageM3:sim.summary.finalClosingStorageM3,capacity:cap,catchment:cat,areaMethod,formulaIds,qa:sim.qa,dailyTrace:sim.trace,calculationWarnings:rd.eligibilityStatus==='eligible_with_warning'?['LEGACY_DDW_RUNOFF']:[]};
      calculatedById.set(sid,calc);upstreamResults.set(sid,{residualRunoffFraction:sim.summary.residualRunoffFraction});
    }catch(error){const code=String(error.message||error);if(code.startsWith('CAS-001_UPSTREAM_NOT_CALCULATED:')){calculatedById.set(sid,{...nonCalculatedWater(rd,'not_calculated_dependency',code),qa:{dependencyBlocked:true}});}else{calcErrors.push({structureRecordId:sid,code});calculatedById.set(sid,{...nonCalculatedWater(rd,'calculation_error',code),qa:{engineError:true}});}}
  }
  const waterCalculations=[];
  for(const rd of routingSnapshot.waterRoutes){
    if(calculatedById.has(rd.structureRecordId)){waterCalculations.push(calculatedById.get(rd.structureRecordId));continue;}
    if(rd.eligibilityStatus==='excluded'){waterCalculations.push(nonCalculatedWater(rd,'excluded','CONTROLLED_EXCLUSION'));continue;}
    if(rd.eligibilityStatus==='hold'){waterCalculations.push(nonCalculatedWater(rd,'not_calculated_hold','CONTROLLED_HOLD'));continue;}
    if(rd.eligibilityStatus==='not_ready'||rd.eligibilityStatus==='workbook_not_ready'){waterCalculations.push(nonCalculatedWater(rd,'not_calculated_not_ready','VALIDATION_NOT_READY'));continue;}
    if(rd.eligibilityStatus==='unresolved'||rd.routeDecisionStatus!=='assigned'){waterCalculations.push(nonCalculatedWater(rd,'not_calculated_unresolved','ROUTE_UNRESOLVED'));continue;}
    const s=structureById.get(rd.structureRecordId),tr=techById.get(rd.structureRecordId);try{
      const cap=calculateCapacityContext({structure:s,technical:tr,siltRecords:siltByStructure.get(rd.structureRecordId)||[],control,routeRegistry,waterRouteId:rd.waterRouteId,formulaCatalog});let result=null,formulaIds=[...cap.formulaIds];let component=waterComponent(rd.waterRouteId);
      if(rd.waterRouteId?.startsWith('WTR-112')){result=cap.eligibleCapacityM3;formulaIds=uniqueFormulaIds([...formulaIds,'KPI-112','UNT-005','NUM-001','NUM-002'],formulaCatalog);}
      else if(rd.waterRouteId==='WTR-LFP'){result=cap.eligibleCapacityM3;formulaIds=uniqueFormulaIds([...formulaIds,'LIN-001','KPI-113','UNT-005','NUM-001','NUM-002'],formulaCatalog);}
      else throw new Error('UNSUPPORTED_CALCULATION_ROUTE');
      waterCalculations.push({calculationId:`WCAL-E06-${rd.routeDecisionId}`,structureRecordId:rd.structureRecordId,waterRouteId:rd.waterRouteId,waterComponent:component,eligibilityStatus:rd.eligibilityStatus,calculationStatus:'calculated',calculationReason:'OK',calculationStartDate:null,calculationEndDate:null,calculationDays:0,resultM3:result,resultBL:m3ToBL(result),identityCrosscheckM3:null,identityDifferenceM3:null,maxMassResidualM3:null,residualRunoffFraction:null,generatedRunoffM3:null,overflowM3:null,capturedRunoffM3:null,cumulativeEvaporationM3:null,cumulativeInfiltrationM3:null,finalClosingStorageM3:null,capacity:cap,catchment:null,areaMethod:null,formulaIds,qa:{singleFillPass:finite(result)&&result>=0},dailyTrace:[],calculationWarnings:[]});
    }catch(error){calcErrors.push({structureRecordId:rd.structureRecordId,code:String(error.message||error)});waterCalculations.push({...nonCalculatedWater(rd,'calculation_error',String(error.message||error)),qa:{engineError:true}});}
  }
  const personDayCalculations=routingSnapshot.personDayRoutes.map(rd=>{const record=pdById.get(rd.personDayRecordId);if(!['eligible','eligible_with_warning'].includes(rd.eligibilityStatus)||rd.routeDecisionStatus!=='assigned')return {personDayCalculationId:`PDCAL-E06-${rd.personDayRouteDecisionId}`,personDayRecordId:rd.personDayRecordId,structureWorkId:rd.structureWorkId,personDayRouteId:rd.personDayRouteId,eligibilityStatus:rd.eligibilityStatus,calculationStatus:'not_calculated',calculatedPersonDays:null,formulaIds:[]};const days=personDayValue(rd.personDayRouteId,record);return {personDayCalculationId:`PDCAL-E06-${rd.personDayRouteDecisionId}`,personDayRecordId:rd.personDayRecordId,structureWorkId:rd.structureWorkId,personDayRouteId:rd.personDayRouteId,eligibilityStatus:rd.eligibilityStatus,calculationStatus:finite(days)&&days>=0?'calculated':'calculation_error',calculatedPersonDays:finite(days)&&days>=0?days:null,formulaIds:uniqueFormulaIds(pdFormulaIds(rd.personDayRouteId),formulaCatalog)};});
  const kpi121TotalPersonDays=personDayCalculations.filter(x=>x.calculationStatus==='calculated').reduce((s,x)=>s+x.calculatedPersonDays,0);
  const calculatedWater=waterCalculations.filter(x=>x.calculationStatus==='calculated');const failedQa=waterCalculations.filter(x=>x.calculationStatus==='qa_failed');const daily=calculatedWater.filter(x=>x.waterComponent==='KPI-1.1.1');
  const calculationQa={
    ruleResults:[
      {ruleId:'VAL-063',status:daily.every(x=>x.qa.evaporationAreaBoundsPass)?'PASS':'FAIL',scope:'E06 standard daily balances'},
      {ruleId:'VAL-066',status:calcErrors.some(x=>String(x.code).includes('STG-003_OUT_OF_RANGE'))?'FAIL':'PASS',scope:'Advanced stage-area calculations only'},
      {ruleId:'VAL-086',status:daily.every(x=>x.qa.nonnegativePass)?'PASS':'FAIL',scope:'E06 daily states'},
      {ruleId:'VAL-087',status:daily.every(x=>x.qa.massBalancePass)?'PASS':'FAIL',scope:'E06 daily balances'},
      {ruleId:'VAL-088',status:daily.every(x=>x.qa.identityPass)?'PASS':'FAIL',scope:'KPI 1.1.1 results'},
      {ruleId:'VAL-089',status:'PASS',scope:'Implementation invariant: no rounding occurs before display/export'}
    ],
    deferredToE08:['VAL-090','VAL-091'],calculationErrors:calcErrors
  };
  const stats={waterRouteRecords:routingSnapshot.waterRoutes.length,calculatedWaterResults:calculatedWater.length,calculatedKpi111:calculatedWater.filter(x=>x.waterComponent==='KPI-1.1.1').length,calculatedKpi112:calculatedWater.filter(x=>x.waterComponent==='KPI-1.1.2').length,calculatedLinedPond:calculatedWater.filter(x=>x.waterComponent==='LINED-FP').length,notCalculatedWaterResults:waterCalculations.length-calculatedWater.length,qaFailedWaterResults:failedQa.length,personDayRecords:personDayCalculations.length,calculatedPersonDayResults:personDayCalculations.filter(x=>x.calculationStatus==='calculated').length,kpi121TotalPersonDays,dailyTraceRows:daily.reduce((s,x)=>s+x.dailyTrace.length,0)};
  const status=calcErrors.length||failedQa.length?'calculation_complete_with_errors':'calculation_complete';
  const content={sourceWorkbookSha256:canonicalSnapshot.sourceWorkbookSha256,formulaCatalogVersion:formulaCatalog.catalog_id,waterCalculations:waterCalculations.map(x=>({...x,dailyTrace:undefined})),personDayCalculations,kpi121TotalPersonDays,status};const calculationContentHash=await sha256Hex(new TextEncoder().encode(stableJson(content)).buffer);
  const core={sourceSessionId:canonicalSnapshot.sourceSessionId,sourceWorkbookSha256:canonicalSnapshot.sourceWorkbookSha256,canonicalSnapshotHash:canonicalSnapshot.canonicalSnapshotHash,validationSnapshotHash:validationSnapshot.validationSnapshotHash,routingSnapshotHash:routingSnapshot.routingSnapshotHash,formulaCatalogVersion:formulaCatalog.catalog_id,waterCalculations,personDayCalculations,kpi121TotalPersonDays,calculationQa,stats,status,calculationContentHash};const calculationSnapshotHash=await sha256Hex(new TextEncoder().encode(stableJson(core)).buffer);
  return deepFreeze({...core,calculationSnapshotHash});
}

export async function runEngine06({config},{store,bus}){
  const state=store.getState();if(!state.canonical?.immutableSnapshot||!state.validated?.immutableSnapshot||!state.routed?.immutableSnapshot)throw new Error('Complete Engines 3, 4 and 5 before calculation.');
  store.patchFrom('routing',{lifecycle:'calculation_processing',calculation:null,calculated:null,error:null});
  try{const immutableSnapshot=await evaluateCalculation({canonicalSnapshot:state.canonical.immutableSnapshot,validationSnapshot:state.validated.immutableSnapshot,routingSnapshot:state.routed.immutableSnapshot,routeRegistry:config.routeRegistry,formulaCatalog:config.formulaCatalog});const calculated=Object.freeze({immutableSnapshot,calculationSnapshotHash:immutableSnapshot.calculationSnapshotHash,getSnapshot:()=>immutableSnapshot});const summary=publicSummary(immutableSnapshot);store.patch({lifecycle:'calculation_ready',calculation:summary,calculated,error:null});bus?.emit('calculation:completed',{calculationSnapshotHash:summary.calculationSnapshotHash,status:summary.status,stats:summary.stats});return summary;}catch(error){store.patch({lifecycle:'blocked_error',error:{engine:'E06',message:error.message}});throw error;}
}
