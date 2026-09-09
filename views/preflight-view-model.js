function formatCount(value,singular,plural=`${singular}s`){const n=Number(value)||0;return `${n} ${n===1?singular:plural}`;}
function friendlyTemplate(value){const text=String(value||'');const match=text.match(/v(\d+(?:\.\d+)*)/i);return match?`Input Template v${match[1]}`:(text?'Input Template':'Not detected');}
export function createPreflightViewModel(preflight){
  if(!preflight)throw new Error('Preflight view model requires a workbook preflight result.');
  const cards=Object.freeze([
    Object.freeze({label:'Template version',value:friendlyTemplate(preflight.template.detectedVersion),tone:preflight.template.compatibility==='supported'?'ready':'error'}),
    Object.freeze({label:'Reporting period',value:preflight.reportingPeriod.label,tone:preflight.reportingPeriod.detected?'neutral':'warning'}),
    Object.freeze({label:'Recognized sheets',value:`${preflight.sheets.recognizedCount}/${preflight.sheets.expectedCount}`,tone:preflight.sheets.missingCount?'error':'ready'}),
    Object.freeze({label:'Structures detected',value:String(preflight.records.structures),tone:'neutral'}),
    Object.freeze({label:'Formula presence',value:preflight.formulas.present?formatCount(preflight.formulas.cellCount,'formula cell'):'None detected',tone:preflight.formulas.present?'warning':'ready'}),
    Object.freeze({label:'Workbook status',value:preflight.canContinueToMapping?'Ready to continue':'Needs attention',tone:preflight.canContinueToMapping?'ready':'error'})
  ]);
  return Object.freeze({
    cards,
    sheetRows:preflight.sheets.rows,
    groups:Object.freeze([
      Object.freeze({id:'errors',label:'Errors',tone:'error',items:preflight.issues.errors}),
      Object.freeze({id:'warnings',label:'Warnings',tone:'warning',items:preflight.issues.warnings}),
      Object.freeze({id:'information',label:'Information',tone:'neutral',items:preflight.issues.information})
    ]),
    source:preflight.source,
    template:preflight.template,
    reportingPeriod:preflight.reportingPeriod,
    advanced:preflight.advanced,
    canContinueToMapping:preflight.canContinueToMapping,
    overallStatus:preflight.overallStatus,
    boundaryNote:preflight.boundaryNote
  });
}
