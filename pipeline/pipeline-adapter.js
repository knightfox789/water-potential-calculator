import { createStore as createProtectedStore } from '../protected-core/js/core/store.js';
import { createEventBus as createProtectedEventBus } from '../protected-core/js/core/events.js';
import { runEngine01 } from '../protected-core/js/engines/engine01-intake.js';
import {
  runEngine02, finalizeMapping,
  updateSheetMapping as protectedUpdateSheetMapping,
  confirmSheetMapping as protectedConfirmSheetMapping,
  updateFieldMapping as protectedUpdateFieldMapping,
  confirmFieldMapping as protectedConfirmFieldMapping,
  confirmAllSuggested as protectedConfirmAllSuggested
} from '../protected-core/js/engines/engine02-mapping.js';
import { runEngine03 } from '../protected-core/js/engines/engine03-canonicalization.js';
import { runEngine04 } from '../protected-core/js/engines/engine04-validation.js';
import { runEngine05 } from '../protected-core/js/engines/engine05-routing.js';
import { runEngine06 } from '../protected-core/js/engines/engine06-calculation.js';
import { runEngine07 } from '../protected-core/js/engines/engine07-assurance.js';
import { runEngine08 } from '../protected-core/js/engines/engine08-aggregation.js';
import { runEngine09 } from '../protected-core/js/engines/engine09-audit.js';

const PROTECTED_STAGE_FUNCTIONS=Object.freeze({E03:runEngine03,E04:runEngine04,E05:runEngine05,E06:runEngine06,E07:runEngine07,E08:runEngine08,E09:runEngine09});
function isFreezable(value){return Array.isArray(value)||Boolean(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype);}
function freezeDeep(value){if(!isFreezable(value)||Object.isFrozen(value))return value;for(const child of Object.values(value))freezeDeep(child);return Object.freeze(value);}

export function createProtectedPipelineAdapter(config){
  const store=createProtectedStore();
  let originalRaw=null;const corrections=[];
  const bus=createProtectedEventBus();
  const requireMapping=()=>{const state=store.getState();if(!state.mapping)throw new Error('Engine 2 mapping review has not been created.');return state;};
  const commitMappingReview=next=>{const frozen=freezeDeep(next);store.patchFrom('mapping',{lifecycle:'mapping_review',mapping:frozen,error:null});return frozen;};
  const adapter={
    async runIntake(file){const result=await runEngine01({file,config},{store,bus});originalRaw=store.getState().raw;corrections.length=0;return result;},
    getMappingMetadata(){return freezeDeep(config.inputSchema.fields.map(field=>({fieldId:field.field_id,expectedSheet:field.sheet,controlledField:field.column_label,dataType:field.data_type,unitFormat:field.unit_format||'',requirementClass:field.requirement_class,applicableWhen:field.applicable_when||'',missingValuePolicy:field.missing_value_policy||''})));},
    async buildMapping(){return freezeDeep(await runEngine02({config},{store,bus}));},
    async updateSheetMapping(expectedSheet,sourceSheetName){const state=requireMapping();return commitMappingReview(protectedUpdateSheetMapping(state.mapping,state.raw,config.inputSchema,config.mappingAliases,expectedSheet,sourceSheetName));},
    async confirmSheetMapping(expectedSheet,confirmed=true){const state=requireMapping();return commitMappingReview(protectedConfirmSheetMapping(state.mapping,expectedSheet,confirmed));},
    async updateFieldMapping(fieldId,sourceSheet,sourceColumnIndex){const state=requireMapping();return commitMappingReview(protectedUpdateFieldMapping(state.mapping,state.raw,fieldId,sourceSheet,sourceColumnIndex));},
    async confirmFieldMapping(fieldId,confirmed=true){const state=requireMapping();return commitMappingReview(protectedConfirmFieldMapping(state.mapping,fieldId,confirmed));},
    async confirmAllSuggested(){const state=requireMapping();return commitMappingReview(protectedConfirmAllSuggested(state.mapping));},
    async confirmMapping(){const state=requireMapping();const frozen=freezeDeep(await finalizeMapping(state.mapping));store.patchFrom('mapping',{lifecycle:'mapping_confirmed',mapping:frozen,error:null});return frozen;},
    async runStage(stage){const fn=PROTECTED_STAGE_FUNCTIONS[stage];if(!fn)throw new Error(`Stage ${stage} requires a governed adapter method or is unknown.`);return fn({config},{store,bus});},
    getPreparationDetail(){const s=store.getState();return freezeDeep({tables:s.canonical?.immutableSnapshot?.tables||[],validation:s.validated?.immutableSnapshot||null,corrections:[...corrections]});},
    getResultPackage(){const s=store.getState();if(!s.audited)throw new Error('Complete calculation before viewing results.');return freezeDeep({publicState:store.getPublicState(),aggregation:s.aggregated.immutableSnapshot,calculation:s.calculated.immutableSnapshot,routing:s.routed.immutableSnapshot,assurance:s.assured.immutableSnapshot,audit:s.audited.getStandardExport(),productContext:{evidence:s.canonical.immutableSnapshot.tables.find(t=>t.expectedSheet==='11_Evidence')?.records.map(r=>Object.fromEntries(Object.entries(r.values).filter(([id])=>['EVD-001','EVD-002','EVD-003','EVD-004','EVD-005','EVD-006'].includes(id))))||[],personDays:s.canonical.immutableSnapshot.tables.find(t=>t.expectedSheet==='10_Person_Days')?.records.map(r=>Object.fromEntries(Object.entries(r.values).filter(([id])=>!['PD-005','PD-006','PD-014'].includes(id))))||[],validation:s.validated.immutableSnapshot.issues.map(({observedValue,...issue})=>issue),structures:s.canonical.immutableSnapshot.tables.find(t=>t.expectedSheet==='02_Structures')?.records.map(r=>r.values)||[],cascade:s.canonical.immutableSnapshot.tables.find(t=>t.expectedSheet==='05_Cascade_Links')?.records.map(r=>r.values)||[]},methodology:{routes:config.routeRegistry,rules:config.validationRulebook,formulas:config.formulaCatalog},corrections:[...corrections]});},
    async applySourceCorrection({sourceSheet,sourceRowNumber,fieldId,correctedValue,reason}){
      if(!reason?.trim())throw new Error('Record a reason for this correction.');
      if(!originalRaw)throw new Error('Select a workbook first.');
      if(correctedValue!==null&&!['string','number','boolean'].includes(typeof correctedValue))throw new Error('Use a single source value.');
      const mapping=store.getState().mapping;
      const field=mapping?.fieldMappings?.find(f=>f.fieldId===fieldId&&f.sourceSheet===sourceSheet);
      if(!field||field.sourceColumnIndex===null)throw new Error('Select a mapped field.');
      const originalSheet=originalRaw.sheets.find(t=>t.name===sourceSheet);
      const originalRecord=originalSheet?.records.find(r=>r.sourceRowNumber===Number(sourceRowNumber));
      if(!originalRecord)throw new Error('Source record is not available.');
      const old=store.getState().raw.sheets.find(t=>t.name===sourceSheet).records.find(r=>r.sourceRowNumber===Number(sourceRowNumber));
      const entry=freezeDeep({id:`COR-${corrections.length+1}`,sourceSheet,sourceRowNumber:Number(sourceRowNumber),fieldId,sourceHeader:field.sourceHeader,sourceColumnIndex:field.sourceColumnIndex,originalValue:originalRecord.values[field.sourceColumnIndex]??null,previousValue:old.values[field.sourceColumnIndex]??null,correctedValue,reason:reason.trim(),correctionTimestamp:new Date().toISOString()});
      const next=[...corrections,entry];
      const sheets=originalRaw.sheets.map(sheet=>({...sheet,records:sheet.records.map(record=>{const values=[...record.values];for(const c of next)if(c.sourceSheet===sheet.name&&c.sourceRowNumber===record.sourceRowNumber)values[c.sourceColumnIndex]=c.correctedValue;return {...record,values};})}));
      store.patchFrom('mapping',{raw:Object.freeze({...originalRaw,sheets:freezeDeep(sheets)}),lifecycle:'mapping_confirmed'});
      corrections.push(entry);return entry;
    },
    getPublicProtectedState(){return store.getPublicState();},
    reset(){store.clear();originalRaw=null;corrections.length=0;}
  };
  return Object.freeze(adapter);
}
