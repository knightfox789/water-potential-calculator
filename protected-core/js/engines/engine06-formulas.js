export const NUMERIC_ABS_TOLERANCE_M3 = 1e-6;
export const NUMERIC_REL_TOLERANCE = 1e-9;

export function numericTolerance(lhs, rhs) {
  return Math.max(NUMERIC_ABS_TOLERANCE_M3, NUMERIC_REL_TOLERANCE * Math.max(1, Math.abs(lhs||0), Math.abs(rhs||0)));
}
export function withinTolerance(lhs, rhs) {
  return Number.isFinite(lhs) && Number.isFinite(rhs) && Math.abs(lhs-rhs) <= numericTolerance(lhs,rhs);
}
export const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
export const finite=x=>typeof x==='number'&&Number.isFinite(x);
export const areaHaToM2=ha=>ha*10000;
export const depthAreaToVolume=(areaHa,depthMm)=>areaHa*depthMm*10;
export const m3ToBL=m3=>m3/1000000;
export const slopePercent=(high,low,distance)=>{if(!(finite(distance)&&distance>0))throw new Error('SLP-001_DISTANCE');return (high-low)/distance*100;};
export const estimatedBackwater=(height,slopePct)=>{if(!(finite(slopePct)&&slopePct>0))throw new Error('BWL-001_SLOPE');return height/slopePct*100;};
export const effectiveLength=(length,fraction)=>length*fraction;
export const storagePlanArea=(widthOrBackwater,effectiveLen)=>widthOrBackwater*effectiveLen;
export function grossCapacity(family,planArea,depth){if(family==='FULL')return planArea*depth;if(family==='HALF')return 0.5*planArea*depth;throw new Error('CAP-004_FAMILY');}
export function capacityVariance(recorded,calculated){if(!finite(recorded)||!finite(calculated))return {varianceM3:null,variancePercent:null};const varianceM3=recorded-calculated;return {varianceM3,variancePercent:calculated>0?varianceM3/calculated*100:null};}
export const rejuvenationA=(post,baseline)=>Math.max(0,post-baseline);
export const rejuvenationB=verified=>Math.max(0,verified);
export function average(values){if(!values.length||values.some(v=>!finite(v)))throw new Error('AVG_INVALID');return values.reduce((a,b)=>a+b,0)/values.length;}
export function physicalSiltFraction(originalDepth,depths){if(!(finite(originalDepth)&&originalDepth>0))throw new Error('SIL-004_ORIGINAL_DEPTH');const avg=average(depths);return clamp((originalDepth-avg)/originalDepth,0,1);}
export const year3SiltFraction=priorYear2Percent=>clamp((2*priorYear2Percent)/100,0,1);
export function netCapacity({gross,surveyedLoss=null,siltFraction=0}){if(!finite(gross)||gross<0)throw new Error('CAP-006_GROSS');if(finite(surveyedLoss))return Math.max(0,gross-surveyedLoss);return Math.max(0,gross*(1-clamp(siltFraction||0,0,1)));}
export function residualRunoffFraction(overflow,generated){if(!finite(generated)||generated<=0)return null;return overflow/generated;}
export const catchmentMethod1=(free,upstreamResidual,overlap)=>free+(upstreamResidual||0)*overlap;
export const catchmentMethod2=(free,intercepted)=>free+0.20*intercepted;
export const catchmentMethod3=free=>free;
export const catchmentAlternate=higher=>higher;

export function topologicalSort(nodes, links){
  const indeg=new Map(nodes.map(n=>[n,0])); const adj=new Map(nodes.map(n=>[n,[]]));
  for(const {upstream,downstream} of links){if(!indeg.has(upstream)||!indeg.has(downstream))continue;adj.get(upstream).push(downstream);indeg.set(downstream,indeg.get(downstream)+1);}
  const q=[...nodes].filter(n=>indeg.get(n)===0).sort(); const out=[];
  while(q.length){const n=q.shift();out.push(n);for(const d of adj.get(n)){indeg.set(d,indeg.get(d)-1);if(indeg.get(d)===0){q.push(d);q.sort();}}}
  if(out.length!==nodes.length)throw new Error('CAS-005_CYCLE'); return out;
}

function rollingSum(values,i,n){let s=0;for(let j=Math.max(0,i-n+1);j<=i;j++)s+=values[j];return s;}
export function ddwStates(rainfall){
  const states=[];
  for(let i=0;i<rainfall.length;i++){
    const R=rainfall[i]; let state;
    if(i===0) state=R>64?'Wet':R<5?'Dry':'Damp';
    else {
      const prev=states[i-1];
      if(R>=64)state='Wet';
      else if(R<=3)state='Dry';
      else if(R>3&&R<=5)state=prev==='Damp'?'Damp':'Dry';
      else {
        const s2=rollingSum(rainfall,i,2),s3=rollingSum(rainfall,i,3),s4=rollingSum(rainfall,i,4),s5=rollingSum(rainfall,i,5),s7=rollingSum(rainfall,i,7),s10=rollingSum(rainfall,i,10);
        if(prev==='Dry')state=(R>6||s3>12||s7>25||s10>38)?'Damp':'Dry';
        else if(prev==='Damp'){
          if(R>8||s2>12||s3>25||s5>38)state='Wet';
          else if(R<3||s3<6||s7<12||s10<15)state='Dry';
          else state='Damp';
        } else state=(R<4||s2<6||s4<12||s5<20)?'Damp':'Wet';
      }
    }
    states.push(state);
  }
  return states;
}
export function runoffDepth(state,R){
  if(state==='Dry')return R>5?Math.max(0,0.004*R*R-0.1088*R+0.7667):0;
  if(state==='Damp')return Math.max(0,0.0053*R*R-0.0369*R+0.2034);
  if(state==='Wet')return R<=100?Math.max(0,0.0071*R*R-0.0157*R+0.3364):0.7*R;
  throw new Error('RUN_STATE');
}

export function validateStageCurve(points){
  const sorted=[...points].sort((a,b)=>a.depth-b.depth);
  if(sorted.length<2)throw new Error('STG-001_MIN_POINTS');
  for(let i=0;i<sorted.length;i++){
    const p=sorted[i]; if(![p.depth,p.surfaceArea,p.baseArea].every(finite)||p.surfaceArea<0||p.baseArea<0)throw new Error('STG-001_VALUE');
    if(i&&p.depth<=sorted[i-1].depth)throw new Error('STG-001_DEPTH_ORDER');
  }
  return sorted;
}
export function buildStageStorageCurve(points){
  const sorted=validateStageCurve(points); let cumulative=0; const out=[{...sorted[0],cumulativeVolume:0}];
  for(let i=1;i<sorted.length;i++){
    const prev=sorted[i-1],cur=sorted[i]; cumulative+=((prev.surfaceArea+cur.surfaceArea)/2)*(cur.depth-prev.depth); out.push({...cur,cumulativeVolume:cumulative});
  }
  return out;
}
export function stageFromStoredVolume(curve,volume){
  if(!(finite(volume)&&volume>=0))throw new Error('STG-003_VOLUME');
  if(volume<curve[0].cumulativeVolume-NUMERIC_ABS_TOLERANCE_M3||volume>curve.at(-1).cumulativeVolume+NUMERIC_ABS_TOLERANCE_M3)throw new Error('STG-003_OUT_OF_RANGE');
  if(volume<=curve[0].cumulativeVolume)return curve[0].depth;
  for(let i=1;i<curve.length;i++)if(volume<=curve[i].cumulativeVolume){const a=curve[i-1],b=curve[i],span=b.cumulativeVolume-a.cumulativeVolume;if(span===0)return a.depth;const f=(volume-a.cumulativeVolume)/span;return a.depth+f*(b.depth-a.depth);}
  return curve.at(-1).depth;
}
export function interpolateAreaAtDepth(curve,depth,key='surfaceArea'){
  if(depth<curve[0].depth||depth>curve.at(-1).depth)throw new Error('STG_INTERP_OUT_OF_RANGE');
  if(depth===curve[0].depth)return curve[0][key];
  for(let i=1;i<curve.length;i++)if(depth<=curve[i].depth){const a=curve[i-1],b=curve[i],f=(depth-a.depth)/(b.depth-a.depth);return a[key]+f*(b[key]-a[key]);}
  return curve.at(-1)[key];
}
export function stageAreasForVolume(curve,volume){const depth=stageFromStoredVolume(curve,volume);return {depth,surfaceArea:interpolateAreaAtDepth(curve,depth,'surfaceArea'),baseArea:interpolateAreaAtDepth(curve,depth,'baseArea')};}

export function evaporationAreaStandard(fullSurfaceArea,fillFraction){return fullSurfaceArea*fillFraction;}
export function monthlyEvaporationRate(monthly,dateIso){const month=Number(String(dateIso).slice(5,7));if(!(month>=1&&month<=12))throw new Error('EVP-001_DATE');const v=monthly[month-1];if(!finite(v))throw new Error('EVP-001_MISSING_MONTH');return v;}
export const potentialEvaporation=(areaM2,evapMmDay)=>areaM2*evapMmDay/1000;
export const potentialInfiltration=(areaM2,rateMmHour)=>areaM2*rateMmHour*24/1000;

export function dailyBalanceStep({previousClosing,generatedRunoff,eligibleCapacity,evaporationArea,evaporationMmDay,infiltrationArea,infiltrationMmHour}){
  if(!(finite(eligibleCapacity)&&eligibleCapacity>0))throw new Error('BAL-004_ZERO_CAPACITY');
  const available=generatedRunoff+previousClosing;
  const opening=Math.min(available,eligibleCapacity);
  const overflow=Math.max(0,available-opening);
  const fillFraction=opening/eligibleCapacity;
  const potEvap=potentialEvaporation(evaporationArea,evaporationMmDay);
  const actualEvap=Math.min(opening,Math.max(0,potEvap));
  const potInf=potentialInfiltration(infiltrationArea,infiltrationMmHour);
  const actualInf=Math.min(Math.max(0,opening-actualEvap),Math.max(0,potInf));
  const closing=Math.max(0,opening-actualEvap-actualInf);
  const captured=generatedRunoff-overflow;
  const residual=previousClosing+generatedRunoff-overflow-actualEvap-actualInf-closing;
  return {available,opening,overflow,fillFraction,potentialEvaporation:potEvap,actualEvaporation:actualEvap,potentialInfiltration:potInf,actualInfiltration:actualInf,closing,capturedRunoff:captured,massResidual:residual};
}
export function kpi111({captured,evaporation,infiltration,finalClosing}){const primary=infiltration+finalClosing,crosscheck=captured-evaporation;return {primary,crosscheck,difference:primary-crosscheck};}
export const paidPersonDays=days=>days;
export const communityPersonDays=hours=>hours/8;
export const volumePersonDays=(quantity,norm)=>quantity/norm;
export const machineryPersonDays=({hours=null,directDays=null})=>finite(directDays)?directDays:finite(hours)?hours/8:null;
export function personDayDuplicateKey({participant,date,work,scope}){return [participant,date,work,scope].map(x=>String(x||'').trim().toLowerCase()).join('|');}
export function hasPersonDayConflict(rows){const seen=new Set();for(const r of rows){const k=personDayDuplicateKey(r);if(seen.has(k))return true;seen.add(k);}return false;}
