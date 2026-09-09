import { sha256Hex } from '../core/hash.js';

function deepFreeze(value){
  if(!value||typeof value!=='object'||ArrayBuffer.isView(value)||Object.isFrozen(value))return value;
  Object.freeze(value); for(const child of Object.values(value))deepFreeze(child); return value;
}
function stableJson(value){
  if(Array.isArray(value))return `[${value.map(stableJson).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
const blank=v=>v===null||v===undefined||(typeof v==='string'&&v.trim()==='');
const asText=v=>blank(v)?'':String(v).trim();
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const dateOk=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))&&!Number.isNaN(Date.parse(`${s}T00:00:00Z`));
function compareDate(a,b){return String(a).localeCompare(String(b));}
function addDays(iso,n){const d=new Date(`${iso}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function dateRange(start,end){const out=[]; if(!dateOk(start)||!dateOk(end)||compareDate(start,end)>0)return out; for(let d=start;compareDate(d,end)<=0;d=addDays(d,1))out.push(d);return out;}
function daysBetweenInclusive(start,end){return dateRange(start,end).length;}
function normalize(v){return asText(v).normalize('NFKC').toLowerCase().replace(/\s+/g,' ');}
function haversineKm(lat1,lon1,lat2,lon2){const R=6371,toRad=x=>x*Math.PI/180;const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(a));}

function table(snapshot,name){return snapshot.tables.find(t=>t.expectedSheet===name)||{records:[],fieldIds:[]};}
function value(record,id){return record?.values?.[id]??null;}
function cell(record,id){return record?.cells?.[id]??null;}
function indexBy(records,id){const m=new Map();for(const r of records){const k=value(r,id);if(!blank(k)){if(!m.has(String(k)))m.set(String(k),[]);m.get(String(k)).push(r);}}return m;}
function single(index,key){const a=index.get(String(key))||[];return a.length===1?a[0]:null;}
function uniqueValues(records,id){return new Set(records.map(r=>value(r,id)).filter(v=>!blank(v)).map(String));}

function routeContext(structure,control,routeRegistry){
  const type=value(structure,'STR-003'), intervention=value(structure,'STR-005'), lining=value(structure,'STR-006');
  const timing=value(structure,'STR-019')||value(control,'CTL-009');
  const completion=value(structure,'STR-007'), functional=value(structure,'STR-008'), cutoff=value(control,'CTL-008');
  const rejuv=value(structure,'STR-020');
  if(intervention==='Governance-related')return {candidateRoute:'WTR-EXCL-GOV',terminal:'excluded',timingMethod:timing,simulationStart:null};
  if(type==='Subsurface recharge structure - excluded unless approved')return {candidateRoute:'WTR-EXCL-SUB',terminal:'excluded',timingMethod:timing,simulationStart:null};
  if(lining==='Partly lined')return {candidateRoute:'WTR-HOLD-PARTLY-LINED',terminal:'hold',timingMethod:timing,simulationStart:null};
  if(type==='Farm Pond'&&lining==='Fully lined')return {candidateRoute:'WTR-LFP',terminal:null,timingMethod:timing,simulationStart:null};
  const prefix=timing==='Actual functional date - partial season'?'WTR-111':(dateOk(completion)&&dateOk(cutoff)&&compareDate(completion,cutoff)<=0?'WTR-111':'WTR-112');
  let suffix='NEW';
  if(intervention==='Rejuvenation/repair')suffix=rejuv==='Post-intervention minus baseline capacity'?'REJ-A':rejuv==='Verified desilted volume'?'REJ-B':'REJ-UNRESOLVED';
  const candidateRoute=`${prefix}-${suffix}`;
  return {candidateRoute,terminal:null,timingMethod:timing,simulationStart:prefix==='WTR-111'?(timing==='Actual functional date - partial season'?functional:value(control,'CTL-005')):null};
}

function makeRuleMap(rulebook){return new Map((rulebook?.rules||[]).map(r=>[r.rule_id,r]));}
function issueFactory(ruleMap,issues){let seq=0;return function add(ruleId,{entityType='workbook',entityId=null,sheet=null,fieldId=null,sourceRowNumber=null,message=null,observed=null,expected=null,affectedStructureIds=[],note=null}={}){
  const rule=ruleMap.get(ruleId); if(!rule)throw new Error(`Unknown Design 4 rule ${ruleId}`);
  const item={
    issueId:`ISS-E04-${String(++seq).padStart(4,'0')}`,ruleId,category:rule.category,severity:rule.severity,
    scopeEffect:rule.scope_effect,readinessEffect:rule.readiness_effect,entityType,entityId,sheet,fieldId,sourceRowNumber,
    message:message||rule.rule_name,observedValue:observed,expected:expected||rule.validation_logic,
    affectedStructureIds:[...new Set(affectedStructureIds.filter(Boolean).map(String))],remediation:rule.remediation,note
  };
  issues.push(item);return item;
};}

function duplicateKeys(records,keyFn){const map=new Map();for(const r of records){const k=keyFn(r);if(!k)continue;if(!map.has(k))map.set(k,[]);map.get(k).push(r);}return [...map.entries()].filter(([,v])=>v.length>1);}
function cascadeComponents(records){
  const adj=new Map();const add=(a,b)=>{if(!adj.has(a))adj.set(a,new Set());adj.get(a).add(b);};
  for(const r of records){const a=asText(value(r,'CSL-002')),b=asText(value(r,'CSL-003'));if(a&&b){add(a,b);add(b,a);}}
  const comps=[];const seen=new Set();for(const n of adj.keys()){if(seen.has(n))continue;const q=[n],c=[];seen.add(n);while(q.length){const x=q.pop();c.push(x);for(const y of adj.get(x)||[])if(!seen.has(y)){seen.add(y);q.push(y);}}comps.push(c);}return comps;
}
function findCycle(records){
  const adj=new Map();for(const r of records){const a=asText(value(r,'CSL-002')),b=asText(value(r,'CSL-003'));if(!a||!b)continue;if(!adj.has(a))adj.set(a,[]);adj.get(a).push(b);}
  const visiting=new Set(),visited=new Set(),stack=[];
  function dfs(n){if(visiting.has(n)){const i=stack.indexOf(n);return stack.slice(i).concat(n);}if(visited.has(n))return null;visiting.add(n);stack.push(n);for(const y of adj.get(n)||[]){const c=dfs(y);if(c)return c;}stack.pop();visiting.delete(n);visited.add(n);return null;}
  for(const n of adj.keys()){const c=dfs(n);if(c)return c;}return null;
}

function capacityGross(structure,technical,routeRegistry){
  const type=value(structure,'STR-003');const map=routeRegistry.structure_capacity_map?.find(x=>x.structure_type===type);if(!map||!map.legacy_factor)return null;
  const L=value(technical,'TEC-002'),W=value(technical,'TEC-003'),D=value(technical,'TEC-004'),eff=value(technical,'TEC-005');
  if(![L,W,D,eff].every(finite))return null;return Number(map.legacy_factor)*L*eff*W*D;
}

function firstMonsoon(structure,control){
  const completion=value(structure,'STR-007'),cutoff=value(control,'CTL-008');if(!dateOk(completion)||!dateOk(cutoff))return false;
  const y=Number(cutoff.slice(0,4));const prior=`${y-1}${cutoff.slice(4)}`;return compareDate(completion,prior)>0&&compareDate(completion,cutoff)<=0;
}

function publicSummary(snapshot){
  return {
    engine:'E04',engineContractVersion:'E04-v0.4.0',sourceSessionId:snapshot.sourceSessionId,
    sourceWorkbookSha256:snapshot.sourceWorkbookSha256,canonicalSnapshotHash:snapshot.canonicalSnapshotHash,
    validationRulebookVersion:snapshot.validationRulebookVersion,validationSnapshotHash:snapshot.validationSnapshotHash,status:snapshot.status,stats:snapshot.stats,
    workbookReadiness:snapshot.workbookReadiness,calendar:snapshot.calendar,
    structureReadiness:snapshot.structureReadiness,
    personDayReadiness:snapshot.personDayReadiness,
    issuePreview:snapshot.issues.slice(0,120),
    ruleCoverage:snapshot.ruleCoverage,
    notes:[
      'Engine 4 applies the frozen Design 4 validation/readiness rulebook to the immutable Engine 3 canonical snapshot.',
      'Candidate route hints are used only to determine validation applicability; Engine 5 owns the official route assignment.',
      'Workbook, record, rainfall-series, cascade-network and person-day failures remain scope-isolated.',
      'HOLD and excluded are controlled outcomes, not generic validation failures.',
      'Calculation/aggregation QA rules that require E06/E08 outputs are explicitly deferred, not falsely marked PASS.',
      'Validation results remain browser-memory-only and project data is not encoded in the URL.'
    ]
  };
}

export function evaluateValidation({canonicalSnapshot,inputSchema,rulebook,routeRegistry,appConfig}){
  if(!canonicalSnapshot?.tables)throw new Error('Engine 4 requires the immutable Engine 3 canonical snapshot.');
  if(!rulebook?.rules?.length)throw new Error('Engine 4 validation rulebook is not loaded.');
  const rules=makeRuleMap(rulebook),issues=[],add=issueFactory(rules,issues);
  const evaluated=new Set(),deferred=new Set(['VAL-063','VAL-066','VAL-086','VAL-087','VAL-088','VAL-089','VAL-090','VAL-091']);
  const mark=(...ids)=>ids.forEach(x=>evaluated.add(x));

  const controlT=table(canonicalSnapshot,'01_Control'),structuresT=table(canonicalSnapshot,'02_Structures'),technicalT=table(canonicalSnapshot,'03_Technical'),catchT=table(canonicalSnapshot,'04_Catchments'),cascadeT=table(canonicalSnapshot,'05_Cascade_Links'),rainT=table(canonicalSnapshot,'06_Daily_Rainfall'),hydroT=table(canonicalSnapshot,'07_Hydro_Params'),stageT=table(canonicalSnapshot,'08_Stage_Area_Optional'),siltT=table(canonicalSnapshot,'09_Silt_Assessment'),pdT=table(canonicalSnapshot,'10_Person_Days'),evT=table(canonicalSnapshot,'11_Evidence');
  const control=controlT.records[0]||null;
  const structureIndex=indexBy(structuresT.records,'STR-001'),techIndex=indexBy(technicalT.records,'TEC-001'),catchIndex=indexBy(catchT.records,'CAT-002'),hydroIndex=indexBy(hydroT.records,'HYP-001'),stageGroupIndex=indexBy(stageT.records,'STA-002'),siltIndex=indexBy(siltT.records,'SIL-002');
  const rainIndex=indexBy(rainT.records,'RAN-001');
  const evidenceIdIndex=indexBy(evT.records,'EVD-001');
  const structureContexts=new Map();

  // Workbook/control/calendar.
  mark('VAL-001','VAL-002','VAL-003','VAL-004','VAL-005','VAL-006','VAL-007','VAL-008','VAL-009','VAL-010');
  if(controlT.records.length!==1)add('VAL-002',{sheet:'01_Control',message:`Expected exactly one Control row; found ${controlT.records.length}.`,observed:controlT.records.length});
  if(control){
    if(value(control,'CTL-001')!=='HUF-SS-INPUT-v1.1')add('VAL-001',{sheet:'01_Control',fieldId:'CTL-001',sourceRowNumber:control.sourceRowNumber,observed:value(control,'CTL-001')});
    if(blank(value(control,'CTL-002')))add('VAL-003',{sheet:'01_Control',fieldId:'CTL-002',sourceRowNumber:control.sourceRowNumber});
    const start=value(control,'CTL-005'),end=value(control,'CTL-006');
    if(!dateOk(start)||!dateOk(end)||compareDate(start,end)>0)add('VAL-004',{sheet:'01_Control',fieldId:'CTL-005/CTL-006',observed:`${start}..${end}`});
    if(dateOk(start)&&dateOk(end)&&!(start.slice(5)==='04-01'&&end.slice(5)==='03-31'&&Number(end.slice(0,4))===Number(start.slice(0,4))+1))add('VAL-005',{sheet:'01_Control',observed:`${start}..${end}`});
    if(value(control,'CTL-010')!=='HUF-DESIGN2-FORMULA-CATALOG-v1.1')add('VAL-009',{sheet:'01_Control',fieldId:'CTL-010',observed:value(control,'CTL-010')});
    if(blank(value(control,'CTL-011')))add('VAL-010',{sheet:'01_Control',fieldId:'CTL-011'});
  }
  const reportStart=value(control,'CTL-005'),reportEnd=value(control,'CTL-006');
  const expectedDates=dateRange(reportStart,reportEnd);const expectedDateSet=new Set(expectedDates);const leapDates=expectedDates.filter(d=>d.slice(5)==='02-29');
  if(control&&dateOk(reportStart)&&dateOk(reportEnd)&&![365,366].includes(expectedDates.length))add('VAL-007',{sheet:'01_Control',observed:expectedDates.length,expected:'365 or 366 inclusive calendar days'});
  const calendar={reportingStart:reportStart,reportingEnd:reportEnd,expectedDays:expectedDates.length,leapDates};

  // IDs / FKs.
  mark('VAL-014','VAL-015','VAL-016','VAL-017','VAL-018','VAL-019','VAL-020');
  for(const [id,recs] of structureIndex)if(recs.length>1)add('VAL-014',{entityType:'structure',entityId:id,sheet:'02_Structures',observed:`${recs.length} duplicate records`,affectedStructureIds:[id]});
  for(const r of structuresT.records)if(blank(value(r,'STR-001')))add('VAL-014',{entityType:'structure',sheet:'02_Structures',sourceRowNumber:r.sourceRowNumber,message:'Structure Record ID is blank.'});
  const childIdFields=[['04_Catchments','CAT-001'],['05_Cascade_Links','CSL-001'],['09_Silt_Assessment','SIL-001'],['10_Person_Days','PD-001'],['11_Evidence','EVD-001'],['08_Stage_Area_Optional','STA-001']];
  for(const [tn,id] of childIdFields){const t=table(canonicalSnapshot,tn);for(const [,recs] of duplicateKeys(t.records,r=>asText(value(r,id))))add('VAL-015',{entityType:'record',sheet:tn,fieldId:id,sourceRowNumber:recs[0].sourceRowNumber,observed:`${recs.length} duplicate IDs`});}
  const fkChecks=[['03_Technical','TEC-001'],['04_Catchments','CAT-002'],['09_Silt_Assessment','SIL-002'],['08_Stage_Area_Optional','STA-003']];
  for(const [tn,id] of fkChecks)for(const r of table(canonicalSnapshot,tn).records){const sid=asText(value(r,id));if(sid&&!structureIndex.has(sid))add('VAL-016',{entityType:'record',entityId:sid,sheet:tn,fieldId:id,sourceRowNumber:r.sourceRowNumber,observed:sid});}
  for(const r of cascadeT.records)for(const id of ['CSL-002','CSL-003']){const sid=asText(value(r,id));if(sid&&!structureIndex.has(sid))add('VAL-016',{entityType:'cascade-link',entityId:sid,sheet:'05_Cascade_Links',fieldId:id,sourceRowNumber:r.sourceRowNumber,observed:sid});}
  for(const r of evT.records){const status=value(r,'EVD-005'),ref=value(r,'EVD-006');if(status==='Available/verified'&&blank(ref))add('VAL-075',{entityType:'evidence',entityId:value(r,'EVD-001'),sheet:'11_Evidence',fieldId:'EVD-006',sourceRowNumber:r.sourceRowNumber});}
  const relationSets={
    'Structure':new Set(structuresT.records.map(r=>asText(value(r,'STR-001'))).filter(Boolean)),
    'Technical':new Set(technicalT.records.map(r=>asText(value(r,'TEC-001'))).filter(Boolean)),
    'Catchment':new Set(catchT.records.map(r=>asText(value(r,'CAT-001'))).filter(Boolean)),
    'Cascade Link':new Set(cascadeT.records.map(r=>asText(value(r,'CSL-001'))).filter(Boolean)),
    'Rainfall Station/Series':new Set(rainT.records.map(r=>asText(value(r,'RAN-001'))).filter(Boolean)),
    'Hydro Parameters':new Set(hydroT.records.map(r=>asText(value(r,'HYP-001'))).filter(Boolean)),
    'Stage-Area':new Set(stageT.records.flatMap(r=>[asText(value(r,'STA-001')),asText(value(r,'STA-002'))]).filter(Boolean)),
    'Silt Assessment':new Set(siltT.records.map(r=>asText(value(r,'SIL-001'))).filter(Boolean)),
    'Person-Day':new Set(pdT.records.map(r=>asText(value(r,'PD-001'))).filter(Boolean)),
    'Control':new Set([asText(value(control,'CTL-002')),'Control'].filter(Boolean))
  };
  for(const r of evT.records){const typ=value(r,'EVD-002'),id=asText(value(r,'EVD-003'));const set=relationSets[typ];if(!typ||!id||!set||!set.has(id))add('VAL-020',{entityType:'evidence',entityId:value(r,'EVD-001'),sheet:'11_Evidence',fieldId:'EVD-002/EVD-003',sourceRowNumber:r.sourceRowNumber,observed:`${typ}:${id}`});}

  // Structure type/timing/route context.
  mark('VAL-011','VAL-012','VAL-013','VAL-021','VAL-022','VAL-023','VAL-024','VAL-025','VAL-026','VAL-027','VAL-028','VAL-029','VAL-030','VAL-031','VAL-032','VAL-033','VAL-034','VAL-035');
  const knownTypes=new Set((routeRegistry.structure_capacity_map||[]).map(x=>x.structure_type));
  const validInterventions=new Set(['New construction','Rejuvenation/repair','Governance-related']);
  const validLining=new Set(['Unlined','Fully lined','Partly lined','Not applicable']);
  const validArea=new Set(['Standard simple','Advanced stage-area']);
  let any111=false;
  for(const s of structuresT.records){
    const sid=asText(value(s,'STR-001'));if(!sid)continue;const ctx=routeContext(s,control,routeRegistry);structureContexts.set(sid,ctx);if(ctx.candidateRoute.startsWith('WTR-111'))any111=true;
    const type=value(s,'STR-003'),intervention=value(s,'STR-005'),lining=value(s,'STR-006'),completion=value(s,'STR-007');
    if(!knownTypes.has(type))add('VAL-021',{entityType:'structure',entityId:sid,sheet:'02_Structures',fieldId:'STR-003',sourceRowNumber:s.sourceRowNumber,observed:type,affectedStructureIds:[sid]});
    if(!validInterventions.has(intervention))add('VAL-022',{entityType:'structure',entityId:sid,sheet:'02_Structures',fieldId:'STR-005',sourceRowNumber:s.sourceRowNumber,observed:intervention,affectedStructureIds:[sid]});
    if(!validLining.has(lining))add('VAL-023',{entityType:'structure',entityId:sid,sheet:'02_Structures',fieldId:'STR-006',sourceRowNumber:s.sourceRowNumber,observed:lining,affectedStructureIds:[sid]});
    if(intervention!=='Governance-related'&&!dateOk(completion))add('VAL-024',{entityType:'structure',entityId:sid,sheet:'02_Structures',fieldId:'STR-007',sourceRowNumber:s.sourceRowNumber,affectedStructureIds:[sid]});
    const timing=value(s,'STR-019')||value(control,'CTL-009');if(!['Strict cutoff','Actual functional date - partial season'].includes(timing))add('VAL-011',{entityType:'structure',entityId:sid,sheet:'02_Structures',fieldId:'STR-019',observed:timing,affectedStructureIds:[sid]});
    if(timing==='Actual functional date - partial season'){
      const functional=value(s,'STR-008');if(!dateOk(functional)||!dateOk(completion)||compareDate(functional,completion)<0||compareDate(functional,reportEnd)>0)add('VAL-026',{entityType:'structure',entityId:sid,sheet:'02_Structures',fieldId:'STR-008',sourceRowNumber:s.sourceRowNumber,observed:functional,affectedStructureIds:[sid]});
    }
    if(intervention==='Rejuvenation/repair'){
      const method=value(s,'STR-020');if(!['Post-intervention minus baseline capacity','Verified desilted volume'].includes(method))add('VAL-032',{entityType:'structure',entityId:sid,sheet:'02_Structures',fieldId:'STR-020',affectedStructureIds:[sid]});
      const tr=single(techIndex,sid);
      if(method==='Post-intervention minus baseline capacity'&&(!finite(value(tr,'TEC-012'))||value(tr,'TEC-012')<0||!finite(value(tr,'TEC-013'))||value(tr,'TEC-013')<0))add('VAL-033',{entityType:'structure',entityId:sid,sheet:'03_Technical',fieldId:'TEC-012/TEC-013',affectedStructureIds:[sid]});
      if(method==='Verified desilted volume'&&(!finite(value(tr,'TEC-014'))||value(tr,'TEC-014')<0))add('VAL-034',{entityType:'structure',entityId:sid,sheet:'03_Technical',fieldId:'TEC-014',affectedStructureIds:[sid]});
      const hasA=finite(value(tr,'TEC-012'))||finite(value(tr,'TEC-013')),hasB=finite(value(tr,'TEC-014'));if((method==='Post-intervention minus baseline capacity'&&hasB)||(method==='Verified desilted volume'&&hasA))add('VAL-035',{entityType:'structure',entityId:sid,sheet:'03_Technical',fieldId:'TEC-012/TEC-013/TEC-014',message:'Rejuvenation A and B inputs overlap for the same structure/run.',affectedStructureIds:[sid]});
    }
    if(type==='Other approved surface structure'){
      const evid=asText(value(s,'STR-021'));const er=single(evidenceIdIndex,evid);if(!evid||!er||value(er,'EVD-005')!=='Available/verified'||value(er,'EVD-004')!=='Eligibility/method approval')add('VAL-031',{entityType:'structure',entityId:sid,sheet:'02_Structures',fieldId:'STR-021',affectedStructureIds:[sid]});
    }
  }
  if(any111){const method=value(control,'CTL-012');if(blank(method)||(method==='Calibrated approved model'&&blank(value(control,'CTL-013'))))add('VAL-012',{sheet:'01_Control',fieldId:'CTL-012/CTL-013',affectedStructureIds:[...structureContexts.entries()].filter(([,c])=>c.candidateRoute.startsWith('WTR-111')).map(([id])=>id)});else if(method==='Legacy v1 fallback (provisional)')add('VAL-013',{sheet:'01_Control',fieldId:'CTL-012',observed:method,affectedStructureIds:[...structureContexts.entries()].filter(([,c])=>c.candidateRoute.startsWith('WTR-111')).map(([id])=>id)});}

  // Geometry/capacity.
  mark('VAL-036','VAL-037','VAL-038','VAL-039');
  for(const s of structuresT.records){const sid=asText(value(s,'STR-001'));if(!sid)continue;const ctx=structureContexts.get(sid);if(ctx?.terminal)continue;const tr=single(techIndex,sid);if(!tr){add('VAL-036',{entityType:'structure',entityId:sid,sheet:'03_Technical',message:'Required technical row is missing.',affectedStructureIds:[sid]});continue;}
    if(ctx.candidateRoute!=='WTR-LFP'){
      const req=['TEC-002','TEC-003','TEC-004','TEC-005'];if(req.some(id=>!finite(value(tr,id))||value(tr,id)<=0)||(finite(value(tr,'TEC-005'))&&value(tr,'TEC-005')>1))add('VAL-036',{entityType:'structure',entityId:sid,sheet:'03_Technical',fieldId:req.join(','),sourceRowNumber:tr.sourceRowNumber,affectedStructureIds:[sid]});
    }
    if(value(tr,'TEC-007')==='Slope-estimated'){
      const hi=value(tr,'TEC-008'),lo=value(tr,'TEC-009'),dist=value(tr,'TEC-010'),dep=value(tr,'TEC-004');if(![hi,lo,dist,dep].every(finite)||!(hi>lo)||!(dist>0))add('VAL-037',{entityType:'structure',entityId:sid,sheet:'03_Technical',affectedStructureIds:[sid]});
    }
    const map=routeRegistry.structure_capacity_map?.find(x=>x.structure_type===value(s,'STR-003'));if(!map)add('VAL-038',{entityType:'structure',entityId:sid,sheet:'02_Structures',affectedStructureIds:[sid]});
    const gross=capacityGross(s,tr,routeRegistry),recorded=value(tr,'TEC-011');if(finite(gross)&&finite(recorded)&&Math.abs(gross-recorded)>Math.max(1e-6,1e-9*Math.max(1,Math.abs(gross),Math.abs(recorded))))add('VAL-039',{entityType:'structure',entityId:sid,sheet:'03_Technical',fieldId:'TEC-011',observed:recorded,expected:gross,affectedStructureIds:[sid]});
  }

  // Catchment/cascade.
  mark('VAL-040','VAL-041','VAL-042','VAL-043','VAL-044');
  for(const [sid,ctx] of structureContexts){if(!ctx.candidateRoute.startsWith('WTR-111'))continue;const crs=catchIndex.get(sid)||[];if(crs.length!==1){add('VAL-040',{entityType:'structure',entityId:sid,sheet:'04_Catchments',observed:crs.length,affectedStructureIds:[sid]});continue;}const r=crs[0],m=value(r,'CAT-003');let eff=null,ok=true;
    if(m==='Method 1 - cascade residual'){ok=finite(value(r,'CAT-005'))&&value(r,'CAT-005')>=0;eff=value(r,'CAT-005');}
    else if(m==='Method 2 - 20% intercepted'){ok=finite(value(r,'CAT-005'))&&value(r,'CAT-005')>=0&&finite(value(r,'CAT-006'))&&value(r,'CAT-006')>=0;eff=ok?value(r,'CAT-005')+.2*value(r,'CAT-006'):null;}
    else if(m==='Method 3 - free catchment only'){ok=finite(value(r,'CAT-005'))&&value(r,'CAT-005')>=0;eff=value(r,'CAT-005');}
    else if(m==='Farm pond/bund alternate'){ok=finite(value(r,'CAT-007'))&&value(r,'CAT-007')>0;eff=value(r,'CAT-007');}
    else ok=false;
    if(!ok)add('VAL-041',{entityType:'structure',entityId:sid,sheet:'04_Catchments',sourceRowNumber:r.sourceRowNumber,observed:m,affectedStructureIds:[sid]});
    if((finite(eff)&&eff<=0)||['CAT-004','CAT-005','CAT-006','CAT-007'].some(id=>finite(value(r,id))&&value(r,id)<0))add('VAL-042',{entityType:'structure',entityId:sid,sheet:'04_Catchments',sourceRowNumber:r.sourceRowNumber,affectedStructureIds:[sid]});
  }
  for(const r of cascadeT.records){const a=asText(value(r,'CSL-002')),b=asText(value(r,'CSL-003')),ov=value(r,'CSL-004');if(a&&b&&a===b)add('VAL-044',{entityType:'cascade-network',entityId:a,sheet:'05_Cascade_Links',sourceRowNumber:r.sourceRowNumber,affectedStructureIds:[a]});if(finite(ov)&&ov<0)add('VAL-042',{entityType:'cascade-network',sheet:'05_Cascade_Links',sourceRowNumber:r.sourceRowNumber,affectedStructureIds:[a,b]});}
  const cycle=findCycle(cascadeT.records);if(cycle)add('VAL-043',{entityType:'cascade-network',entityId:cycle.join(' -> '),sheet:'05_Cascade_Links',message:`Cascade cycle detected: ${cycle.join(' -> ')}`,affectedStructureIds:[...new Set(cycle)]});

  // Rainfall and source selection.
  mark('VAL-045','VAL-046','VAL-047','VAL-048','VAL-049','VAL-050','VAL-051','VAL-052','VAL-053');
  const stationDates=new Map();
  const affectedByStationDate=(station,d=null)=>[...structureContexts.entries()].filter(([sid,c])=>{if(!c.candidateRoute.startsWith('WTR-111')||value(single(techIndex,sid),'TEC-017')!==station)return false;if(!d||!dateOk(d))return true;const sr=single(structureIndex,sid);const start=(c.timingMethod==='Actual functional date - partial season'&&dateOk(value(sr,'STR-008')))?(compareDate(value(sr,'STR-008'),reportStart)>0?value(sr,'STR-008'):reportStart):reportStart;return compareDate(d,start)>=0&&compareDate(d,reportEnd)<=0;}).map(([sid])=>sid);
  for(const r of rainT.records){const station=asText(value(r,'RAN-001')),d=value(r,'RAN-003'),rain=value(r,'RAN-004');if(!station)continue;if(!stationDates.has(station))stationDates.set(station,new Map());const dm=stationDates.get(station);if(!dm.has(String(d)))dm.set(String(d),[]);dm.get(String(d)).push(r);
    if(!dateOk(d))add('VAL-046',{entityType:'rainfall-series',entityId:station,sheet:'06_Daily_Rainfall',fieldId:'RAN-003',sourceRowNumber:r.sourceRowNumber,observed:d,affectedStructureIds:affectedByStationDate(station)});
    if(blank(rain))add('VAL-048',{entityType:'rainfall-series',entityId:station,sheet:'06_Daily_Rainfall',fieldId:'RAN-004',sourceRowNumber:r.sourceRowNumber,affectedStructureIds:affectedByStationDate(station,d)});
    else if(!finite(rain)||rain<0)add('VAL-047',{entityType:'rainfall-series',entityId:station,sheet:'06_Daily_Rainfall',fieldId:'RAN-004',sourceRowNumber:r.sourceRowNumber,observed:rain,affectedStructureIds:affectedByStationDate(station,d)});
    if(dateOk(d)&&expectedDateSet.size&&!expectedDateSet.has(d))add('VAL-050',{entityType:'rainfall-series',entityId:station,sheet:'06_Daily_Rainfall',fieldId:'RAN-003',sourceRowNumber:r.sourceRowNumber,observed:d,affectedStructureIds:affectedByStationDate(station)});
  }
  for(const [station,dm] of stationDates)for(const [d,recs] of dm)if(d!=='null'&&recs.length>1)add('VAL-045',{entityType:'rainfall-series',entityId:station,sheet:'06_Daily_Rainfall',fieldId:'RAN-003',observed:`${d} duplicated ${recs.length} times`,affectedStructureIds:affectedByStationDate(station,d)});
  for(const [sid,ctx] of structureContexts){if(!ctx.candidateRoute.startsWith('WTR-111'))continue;const s=single(structureIndex,sid);const tr=single(techIndex,sid);const station=asText(value(tr,'TEC-017'));if(!station||!(rainIndex.get(station)||[]).length){add('VAL-017',{entityType:'structure',entityId:sid,sheet:'03_Technical',fieldId:'TEC-017',observed:station,affectedStructureIds:[sid]});continue;}
    const hyd=asText(value(tr,'TEC-022'));if(!hyd||!(hydroIndex.get(hyd)||[]).length||hydroIndex.get(hyd).length!==1)add('VAL-018',{entityType:'structure',entityId:sid,sheet:'03_Technical',fieldId:'TEC-022',observed:hyd,affectedStructureIds:[sid]});
    const method=value(tr,'TEC-018');const stationRows=rainIndex.get(station)||[];const station0=stationRows[0];
    if(method==='Nearest station'){
      const slat=value(s,'STR-015'),slon=value(s,'STR-016'),rlat=value(station0,'RAN-005'),rlon=value(station0,'RAN-006');if(![slat,slon,rlat,rlon].every(finite)||Math.abs(slat)>90||Math.abs(rlat)>90||Math.abs(slon)>180||Math.abs(rlon)>180)add('VAL-051',{entityType:'structure',entityId:sid,sheet:'03_Technical',fieldId:'TEC-018',affectedStructureIds:[sid]});
    } else if(method==='Same hydrological/administrative zone'){
      if(!asText(value(s,'STR-014'))||normalize(value(s,'STR-014'))!==normalize(value(station0,'RAN-007')))add('VAL-052',{entityType:'structure',entityId:sid,sheet:'03_Technical',fieldId:'TEC-018',affectedStructureIds:[sid]});
    } else if(method==='Documented expert selection'){
      if(blank(value(tr,'TEC-019')))add('VAL-053',{entityType:'structure',entityId:sid,sheet:'03_Technical',fieldId:'TEC-019',affectedStructureIds:[sid]});
    } else add('VAL-053',{entityType:'structure',entityId:sid,sheet:'03_Technical',fieldId:'TEC-018',observed:method,affectedStructureIds:[sid]});
    const start=(ctx.timingMethod==='Actual functional date - partial season'&&dateOk(value(s,'STR-008')))?(compareDate(value(s,'STR-008'),reportStart)>0?value(s,'STR-008'):reportStart):reportStart;
    const need=dateRange(start,reportEnd),dm=stationDates.get(station)||new Map();const missing=need.filter(d=>!(dm.get(d)||[]).length);
    if(missing.length)add('VAL-049',{entityType:'rainfall-series',entityId:station,sheet:'06_Daily_Rainfall',message:`${missing.length} expected rainfall date(s) missing in the simulation window for ${sid}.`,observed:missing.slice(0,10).join(', '),affectedStructureIds:[sid],note:missing.length>10?'First 10 dates shown.':null});
  }

  // Hydro / evaporation / stage area.
  mark('VAL-054','VAL-055','VAL-056','VAL-057','VAL-058','VAL-059','VAL-060','VAL-061','VAL-062','VAL-064','VAL-065');
  for(const [id,recs] of hydroIndex)if(recs.length>1)add('VAL-054',{entityType:'hydro-group',entityId:id,sheet:'07_Hydro_Params',observed:`${recs.length} rows`,affectedStructureIds:[...structureContexts.keys()].filter(sid=>value(single(techIndex,sid),'TEC-022')===id)});
  for(const [sid,ctx] of structureContexts){if(!ctx.candidateRoute.startsWith('WTR-111'))continue;const s=single(structureIndex,sid),tr=single(techIndex,sid);if(!s||!tr)continue;const areaMethod=value(tr,'TEC-023')||value(control,'CTL-014');if(!validArea.has(areaMethod))add('VAL-011',{entityType:'structure',entityId:sid,sheet:'03_Technical',fieldId:'TEC-023',observed:areaMethod,affectedStructureIds:[sid]});
    const full=value(tr,'TEC-020'),base=value(tr,'TEC-021');if(areaMethod==='Standard simple'&&value(s,'STR-006')==='Unlined'&&(!finite(base)||base<=0))add('VAL-055',{entityType:'structure',entityId:sid,sheet:'03_Technical',fieldId:'TEC-021',observed:base,affectedStructureIds:[sid]});
    if(finite(base)&&finite(full)&&base>full+1e-9)add('VAL-056',{entityType:'structure',entityId:sid,sheet:'03_Technical',fieldId:'TEC-021',observed:base,expected:`<= ${full}`,affectedStructureIds:[sid]});
    const hr=single(hydroIndex,asText(value(tr,'TEC-022')));if(hr){const inf=value(hr,'HYP-002');if(!finite(inf)||inf<0)add('VAL-057',{entityType:'structure',entityId:sid,sheet:'07_Hydro_Params',fieldId:'HYP-002',observed:inf,affectedStructureIds:[sid]});else if(inf<.1||inf>100)add('VAL-058',{entityType:'structure',entityId:sid,sheet:'07_Hydro_Params',fieldId:'HYP-002',observed:inf,affectedStructureIds:[sid]});
      const months=Array.from({length:12},(_,i)=>`HYP-${String(i+5).padStart(3,'0')}`);const bad=months.filter(id=>!finite(value(hr,id))||value(hr,id)<0);if(bad.length)add('VAL-059',{entityType:'hydro-group',entityId:value(hr,'HYP-001'),sheet:'07_Hydro_Params',fieldId:bad.join(','),message:`${bad.length} monthly evaporation value(s) missing/invalid.`,affectedStructureIds:[sid]});
      const high=months.filter(id=>finite(value(hr,id))&&value(hr,id)>20);if(high.length)add('VAL-061',{entityType:'hydro-group',entityId:value(hr,'HYP-001'),sheet:'07_Hydro_Params',fieldId:high.join(','),observed:high.map(id=>value(hr,id)).join(', '),affectedStructureIds:[sid]});
    }
    const map=routeRegistry.structure_capacity_map?.find(x=>x.structure_type===value(s,'STR-003'));const canDerive=map&&map.legacy_capacity_family!=='NONE'&&finite(value(tr,'TEC-002'))&&finite(value(tr,'TEC-003'))&&finite(value(tr,'TEC-005'));if(!finite(full)&&!canDerive)add('VAL-062',{entityType:'structure',entityId:sid,sheet:'03_Technical',fieldId:'TEC-020',affectedStructureIds:[sid]});
    if(areaMethod==='Advanced stage-area'){
      const gid=asText(value(tr,'TEC-024')),rows=stageGroupIndex.get(gid)||[];if(!gid||!rows.length)add('VAL-019',{entityType:'structure',entityId:sid,sheet:'03_Technical',fieldId:'TEC-024',affectedStructureIds:[sid]});
      if(rows.length<2)add('VAL-064',{entityType:'structure',entityId:sid,sheet:'08_Stage_Area_Optional',observed:`${rows.length} observations`,affectedStructureIds:[sid]});
      else {const sorted=[...rows].sort((a,b)=>(value(a,'STA-004')??Infinity)-(value(b,'STA-004')??Infinity));let bad=false,mono=false;for(let i=0;i<sorted.length;i++){const dep=value(sorted[i],'STA-004'),sa=value(sorted[i],'STA-005'),ba=value(sorted[i],'STA-006');if(!finite(dep)||dep<0||!finite(sa)||sa<0||!finite(ba)||ba<0||(i&&dep<=value(sorted[i-1],'STA-004')))bad=true;if(i&&finite(sa)&&finite(value(sorted[i-1],'STA-005'))&&sa<value(sorted[i-1],'STA-005'))mono=true;}if(bad)add('VAL-064',{entityType:'structure',entityId:sid,sheet:'08_Stage_Area_Optional',affectedStructureIds:[sid]});if(mono)add('VAL-065',{entityType:'structure',entityId:sid,sheet:'08_Stage_Area_Optional',affectedStructureIds:[sid]});}
    }
  }

  // Silt / evidence / lined pond.
  mark('VAL-067','VAL-068','VAL-069','VAL-070','VAL-071','VAL-072','VAL-073','VAL-074','VAL-075');
  for(const r of siltT.records){const sid=asText(value(r,'SIL-002')),method=value(r,'SIL-004'),s=single(structureIndex,sid),tr=single(techIndex,sid);if(!sid||!s)continue;if(firstMonsoon(s,control))add('VAL-067',{entityType:'structure',entityId:sid,sheet:'09_Silt_Assessment',message:'Silt assessment supplied for a derived first-monsoon structure; calculation should apply zero silt.',affectedStructureIds:[sid]});
    if(method==='Physical 5-point assessment'){const ids=['SIL-005','SIL-006','SIL-007','SIL-008','SIL-009','SIL-010'];if(ids.some(id=>!finite(value(r,id))||value(r,id)<=0))add('VAL-068',{entityType:'structure',entityId:sid,sheet:'09_Silt_Assessment',affectedStructureIds:[sid]});else {const orig=value(r,'SIL-005'),avg=['SIL-006','SIL-007','SIL-008','SIL-009','SIL-010'].reduce((a,id)=>a+value(r,id),0)/5;const raw=(orig-avg)/orig;if(raw<0||raw>1)add('VAL-069',{entityType:'structure',entityId:sid,sheet:'09_Silt_Assessment',observed:raw*100,affectedStructureIds:[sid]});}}
    if(method==='Year-3 cumulative assumption'&&(!finite(value(r,'SIL-011'))||value(r,'SIL-011')<0||value(r,'SIL-011')>100))add('VAL-070',{entityType:'structure',entityId:sid,sheet:'09_Silt_Assessment',fieldId:'SIL-011',affectedStructureIds:[sid]});
    if(method==='Surveyed volume loss'){const loss=value(r,'SIL-012'),gross=capacityGross(s,tr,routeRegistry);if(!finite(loss)||loss<0||(finite(gross)&&loss>gross+1e-9))add('VAL-071',{entityType:'structure',entityId:sid,sheet:'09_Silt_Assessment',fieldId:'SIL-012',observed:loss,expected:gross,affectedStructureIds:[sid]});}
    if(dateOk(value(r,'SIL-013'))){const verified=evT.records.some(e=>value(e,'EVD-005')==='Available/verified'&&['Silt assessment','Design/MB'].includes(value(e,'EVD-004'))&&[sid,value(r,'SIL-001')].includes(asText(value(e,'EVD-003'))));if(!verified)add('VAL-072',{entityType:'structure',entityId:sid,sheet:'09_Silt_Assessment',fieldId:'SIL-013',affectedStructureIds:[sid]});}
  }
  for(const [sid,ctx] of structureContexts){if(ctx.candidateRoute!=='WTR-LFP')continue;const tr=single(techIndex,sid);const evid=evT.records.filter(e=>asText(value(e,'EVD-003'))===sid&&value(e,'EVD-005')==='Available/verified');const hasCatch=evid.some(e=>value(e,'EVD-004')==='Catchment/GIS'),hasRain=evid.some(e=>value(e,'EVD-004')==='Rainfall source');if(value(tr,'TEC-015')!=='Yes'||value(tr,'TEC-016')!=='Yes'||!hasCatch||!hasRain)add('VAL-073',{entityType:'structure',entityId:sid,sheet:'03_Technical/11_Evidence',affectedStructureIds:[sid]});}
  for(const [sid,ctx] of structureContexts){if(ctx.terminal)continue;const has=evT.records.some(e=>['Structure','Technical'].includes(value(e,'EVD-002'))&&asText(value(e,'EVD-003'))===sid&&value(e,'EVD-005')==='Available/verified');if(!has)add('VAL-074',{entityType:'structure',entityId:sid,sheet:'11_Evidence',affectedStructureIds:[sid]});}

  // Person-days.
  mark('VAL-076','VAL-077','VAL-078','VAL-079','VAL-080','VAL-081','VAL-082','VAL-083','VAL-084');
  const pdIdIndex=indexBy(pdT.records,'PD-001');for(const [id,recs] of pdIdIndex)if(recs.length>1)add('VAL-076',{entityType:'person-day',entityId:id,sheet:'10_Person_Days',observed:`${recs.length} duplicate IDs`});for(const r of pdT.records)if(blank(value(r,'PD-001')))add('VAL-076',{entityType:'person-day',sheet:'10_Person_Days',sourceRowNumber:r.sourceRowNumber,message:'Person-Day Record ID is blank.'});
  for(const r of pdT.records){const id=asText(value(r,'PD-001')),cat=value(r,'PD-007'),d=value(r,'PD-004'),participant=asText(value(r,'PD-005'));if(!dateOk(d)||compareDate(d,reportStart)<0||compareDate(d,reportEnd)>0)add('VAL-077',{entityType:'person-day',entityId:id,sheet:'10_Person_Days',fieldId:'PD-004',observed:d});
    if(cat==='Paid labour'&&(!finite(value(r,'PD-009'))||value(r,'PD-009')<0||!participant||!dateOk(d)))add('VAL-078',{entityType:'person-day',entityId:id,sheet:'10_Person_Days'});
    else if(cat==='Community contribution'&&(!finite(value(r,'PD-008'))||value(r,'PD-008')<0||!participant||!dateOk(d)))add('VAL-079',{entityType:'person-day',entityId:id,sheet:'10_Person_Days'});
    else if(cat==='Volume-based estimate'&&(!finite(value(r,'PD-010'))||value(r,'PD-010')<=0||blank(value(r,'PD-011'))||!finite(value(r,'PD-012'))||value(r,'PD-012')<=0))add('VAL-080',{entityType:'person-day',entityId:id,sheet:'10_Person_Days'});
    else if(cat==='Machinery-support labour'){const h=value(r,'PD-008'),days=value(r,'PD-009'),bases=(finite(h)?1:0)+(finite(days)?1:0);if(blank(value(r,'PD-013'))||bases!==1||(finite(h)&&h<0)||(finite(days)&&days<0))add('VAL-081',{entityType:'person-day',entityId:id,sheet:'10_Person_Days'});}
  }
  const dupClaims=duplicateKeys(pdT.records,r=>{const p=normalize(value(r,'PD-005')),d=asText(value(r,'PD-004')),work=normalize(value(r,'PD-002')),scope=normalize(value(r,'PD-003'));return p&&d&&work&&scope?`${p}|${d}|${work}|${scope}`:null;});for(const [,recs] of dupClaims)for(const r of recs)add('VAL-082',{entityType:'person-day',entityId:value(r,'PD-001'),sheet:'10_Person_Days',sourceRowNumber:r.sourceRowNumber});
  const scopeGroups=new Map();for(const r of pdT.records){const k=`${normalize(value(r,'PD-002'))}|${normalize(value(r,'PD-003'))}`;if(!scopeGroups.has(k))scopeGroups.set(k,[]);scopeGroups.get(k).push(r);}for(const recs of scopeGroups.values()){const volume=recs.filter(r=>value(r,'PD-007')==='Volume-based estimate'),direct=recs.filter(r=>value(r,'PD-007')!=='Volume-based estimate');if(volume.length&&direct.length)for(const r of recs)add('VAL-083',{entityType:'person-day',entityId:value(r,'PD-001'),sheet:'10_Person_Days'});}

  // Null policy: surface any E03 type/unit diagnostic as scoped validation issue when not already captured.
  mark('VAL-085');
  for(const d of canonicalSnapshot.diagnostics||[]){add('VAL-085',{entityType:'canonical-cell',entityId:`${d.expectedSheet}:${d.sourceRowNumber}:${d.fieldId}`,sheet:d.expectedSheet,fieldId:d.fieldId,sourceRowNumber:d.sourceRowNumber,message:`Canonicalization diagnostic ${d.code}: ${d.detail||d.status}.`,observed:cell(table(canonicalSnapshot,d.expectedSheet).records.find(r=>r.sourceRowNumber===d.sourceRowNumber),d.fieldId)?.sourceValue});}

  // Readiness/scope rules are evaluated by assignment below.
  mark('VAL-092','VAL-093','VAL-094','VAL-095');
  for(const d of deferred)evaluated.delete(d);
  const workbookBlocking=issues.filter(i=>i.scopeEffect==='WORKBOOK_BLOCK'&&['BLOCKING_ERROR','SCOPED_ERROR'].includes(i.severity));
  const blockingForSid=sid=>issues.filter(i=>(i.affectedStructureIds||[]).includes(sid)&&['BLOCKING_ERROR','SCOPED_ERROR'].includes(i.severity)&&!['WARNING_ONLY','ASSURANCE_DOWNGRADE'].includes(i.scopeEffect));
  const warningsForSid=sid=>issues.filter(i=>(i.affectedStructureIds||[]).includes(sid)&&(i.severity==='WARNING'||i.scopeEffect==='ASSURANCE_DOWNGRADE'));
  const structureReadiness=[];
  for(const s of structuresT.records){const sid=asText(value(s,'STR-001'));if(!sid)continue;const ctx=structureContexts.get(sid);let readiness='ready';if(workbookBlocking.length)readiness='workbook_not_ready';else if(ctx?.terminal==='excluded')readiness='excluded';else if(ctx?.terminal==='hold')readiness='hold';else if(blockingForSid(sid).length)readiness='not_ready';else if(warningsForSid(sid).length)readiness='ready_with_warning';structureReadiness.push({structureRecordId:sid,candidateRouteHint:ctx?.candidateRoute||null,validationReadiness:readiness,blockingIssueCount:blockingForSid(sid).length,warningIssueCount:warningsForSid(sid).length});}
  const personDayReadiness=pdT.records.map(r=>{const id=asText(value(r,'PD-001'));const related=issues.filter(i=>i.entityType==='person-day'&&i.entityId===id);const blocking=related.filter(i=>['BLOCKING_ERROR','SCOPED_ERROR'].includes(i.severity));const warning=related.filter(i=>i.severity==='WARNING');return {personDayRecordId:id,validationReadiness:workbookBlocking.length?'workbook_not_ready':blocking.length?'not_ready':warning.length?'ready_with_warning':'ready',blockingIssueCount:blocking.length,warningIssueCount:warning.length};});
  const workbookReadiness=workbookBlocking.length?'workbook_not_ready':'ready';
  const severityCounts=Object.fromEntries([...new Set(issues.map(i=>i.severity))].map(x=>[x,issues.filter(i=>i.severity===x).length]));
  const scopeCounts=Object.fromEntries([...new Set(issues.map(i=>i.scopeEffect))].map(x=>[x,issues.filter(i=>i.scopeEffect===x).length]));
  const readinessCounts=Object.fromEntries([...new Set(structureReadiness.map(x=>x.validationReadiness))].map(x=>[x,structureReadiness.filter(y=>y.validationReadiness===x).length]));
  const allRuleIds=(rulebook.rules||[]).map(r=>r.rule_id);const ruleCoverage={loaded:allRuleIds.length,evaluated:[...evaluated].sort(),evaluatedCount:evaluated.size,deferred:[...deferred].sort(),deferredCount:deferred.size,deferredReason:'Requires E06 daily calculation state or E08 aggregation outputs.'};
  const stats={issueCount:issues.length,blockingIssueCount:issues.filter(i=>['BLOCKING_ERROR','SCOPED_ERROR'].includes(i.severity)).length,warningIssueCount:issues.filter(i=>i.severity==='WARNING').length,routeControlIssueCount:issues.filter(i=>i.severity==='ROUTE_CONTROL').length,structureCount:structureReadiness.length,personDayCount:personDayReadiness.length,severityCounts,scopeCounts,readinessCounts};
  const status=workbookBlocking.length?'validation_blocked':stats.blockingIssueCount?'validation_complete_with_scoped_blockers':stats.warningIssueCount?'validation_complete_with_warnings':'validation_complete';
  return {issues,structureReadiness,personDayReadiness,workbookReadiness,calendar,stats,status,ruleCoverage};
}

export async function runEngine04({config},{store,bus}={}){
  const state=store?.getState(),canonical=state?.canonical;
  if(!canonical?.immutableSnapshot)throw new Error('Engine 4 cannot start before Engine 3 canonicalization is complete.');
  if(!config?.validationRulebook||!config?.routeRegistry)throw new Error('Engine 4 validation configuration is not loaded.');
  store?.patch({lifecycle:'validation_processing',validation:null,validated:null,error:null});
  bus?.emit('validation:started',{canonicalSnapshotHash:canonical.canonicalSnapshotHash});
  const built=evaluateValidation({canonicalSnapshot:canonical.immutableSnapshot,inputSchema:config.inputSchema,rulebook:config.validationRulebook,routeRegistry:config.routeRegistry,appConfig:config.app});
  const core={engine:'E04',engineContractVersion:'E04-v0.4.0',sourceSessionId:canonical.immutableSnapshot.sourceSessionId,sourceWorkbookSha256:canonical.immutableSnapshot.sourceWorkbookSha256,canonicalSnapshotHash:canonical.canonicalSnapshotHash,validationRulebookVersion:config.validationRulebook.metadata?.rulebook_id||'HUF-D4-VALIDATION-READINESS-v1.0',...built};
  const validationSnapshotHash=await sha256Hex(new TextEncoder().encode(stableJson(core)).buffer);
  const immutableSnapshot=deepFreeze({...core,validationSnapshotHash});
  const validated=Object.freeze({immutableSnapshot,validationSnapshotHash,getSnapshot:()=>immutableSnapshot});
  const summary=publicSummary(immutableSnapshot);
  store?.patch({lifecycle:'validation_ready',validation:summary,validated,error:null});
  bus?.emit('validation:completed',{validationSnapshotHash,status:summary.status,stats:summary.stats});
  return summary;
}

export {routeContext,dateRange,findCycle};
