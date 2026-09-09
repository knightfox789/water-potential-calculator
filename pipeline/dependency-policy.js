export const STAGE_ORDER=Object.freeze(['E01','E02','E03','E04','E05','E06','E07','E08','E09']);
export const CORRECTION_DEPENDENCY=Object.freeze({
  WORKBOOK_REPLACEMENT:'E01',HEADER_OR_SHEET_INTERPRETATION:'E02',MAPPING:'E03',SOURCE_VALUE:'E03',
  VALIDATION_OR_ELIGIBILITY_EVIDENCE:'E04',ROUTE_GOVERNING_INPUT:'E04',CALCULATION_INPUT:'E04',ASSURANCE_ONLY_EVIDENCE:'E07',PRESENTATION_FILTER:null
});
export function earliestAffectedStage(kind){if(!(kind in CORRECTION_DEPENDENCY))throw new Error(`Unknown correction class: ${kind}`);return CORRECTION_DEPENDENCY[kind];}
export function downstreamStages(stage){if(stage===null)return Object.freeze([]);const i=STAGE_ORDER.indexOf(stage);if(i<0)throw new Error(`Unknown stage: ${stage}`);return Object.freeze(STAGE_ORDER.slice(i));}
