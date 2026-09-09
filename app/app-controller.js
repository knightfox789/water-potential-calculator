import { createAppStateStore } from '../state/app-state.js';
import { createSourceState } from '../state/source-state.js';
import { createMappingState } from '../state/mapping-state.js';
import { createPipelineState } from '../state/pipeline-state.js';
import { createEventBus } from './event-bus.js';
import { createSnapshotRegistry } from '../pipeline/snapshot-registry.js';
import { createPipelineOrchestrator } from '../pipeline/orchestrator.js';
import { prepareSelectedWorkbook,loadSampleWorkbook } from '../services/source-intake-service.js';

export function createAppController({adapter=null,appState=createAppStateStore(),bus=createEventBus(),snapshots=createSnapshotRegistry(),sourcePreparer=prepareSelectedWorkbook,sampleLoader=loadSampleWorkbook,supportedTemplateVersion=null}={}){
  const orchestrator=adapter?createPipelineOrchestrator({adapter,appState,bus,snapshotRegistry:snapshots,supportedTemplateVersion}):null;
  const requirePipeline=()=>{if(!orchestrator)throw new Error('Controlled pipeline is not initialized.');return orchestrator;};
  let selectedWorkbook=null;
  async function clearControlledState({emit=true}={}){
    await adapter?.reset?.();
    snapshots.clearAll({preserveCompleted:false});
    appState.reset();
    selectedWorkbook=null;
    if(emit)bus.emit('source:cleared',{});
  }
  async function selectPrepared(prepared){
    if(!prepared?.file||!prepared?.metadata)throw new Error('Prepared workbook selection is invalid.');
    const replacing=Boolean(selectedWorkbook||appState.getState().source?.name);
    if(replacing)await clearControlledState({emit:false});
    selectedWorkbook=prepared.file;
    appState.patch({
      runState:'FILE_SELECTED',
      source:createSourceState(prepared.metadata),
      mapping:createMappingState(),
      completedRun:null,
      invalidatedReason:replacing?'Source workbook replaced':null,
      pipeline:createPipelineState(),
      error:null
    });
    bus.emit('source:selected',{source:appState.getState().source,replacing});
    return appState.getState().source;
  }
  const api={
    getState:()=>appState.getState(),
    subscribe:fn=>appState.subscribe(fn),
    navigate(route){appState.patch({currentRoute:route});bus.emit('navigation:changed',{route});},
    async reset(){await clearControlledState();bus.emit('application:reset',{});},
    async selectWorkbook(file,options={}){return selectPrepared(await sourcePreparer(file,options));},
    async loadSample(sampleId){return selectPrepared(await sampleLoader(sampleId));},
    async clearWorkbook(){await clearControlledState();return appState.getState();},
    async reviewSelectedWorkbook(){if(!selectedWorkbook)throw new Error('Select a workbook before review.');return requirePipeline().intake(selectedWorkbook);},
    intake:file=>requirePipeline().intake(file),
    mappingPreview:()=>requirePipeline().mappingPreview(),
    mappingMetadata:()=>adapter?.getMappingMetadata?.()??Promise.resolve([]),
    updateSheetMapping:(expectedSheet,sourceSheetName)=>requirePipeline().updateSheetMapping(expectedSheet,sourceSheetName),
    confirmSheetMapping:(expectedSheet,confirmed=true)=>requirePipeline().confirmSheetMapping(expectedSheet,confirmed),
    updateFieldMapping:(fieldId,sourceSheet,sourceColumnIndex)=>requirePipeline().updateFieldMapping(fieldId,sourceSheet,sourceColumnIndex),
    confirmFieldMapping:(fieldId,confirmed=true)=>requirePipeline().confirmFieldMapping(fieldId,confirmed),
    confirmAllSuggested:()=>requirePipeline().confirmAllSuggested(),
    confirmMapping:()=>requirePipeline().confirmMapping(),
    preparationDetail:()=>adapter.getPreparationDetail(),
    resultPackage:()=>adapter.getResultPackage(),
    async correctSource(correction){const entry=await adapter.applySourceCorrection(correction);requirePipeline().invalidateFrom('E03','Source correction applied');appState.setRunState('MAPPING_CONFIRMED');return entry;},
    publicState:()=>adapter.getPublicProtectedState(),
    prepareData:()=>requirePipeline().prepareData(),
    validateData:()=>requirePipeline().validateData(),
    prepareAndValidate:()=>requirePipeline().prepareAndValidate(),
    calculateToAudit:()=>requirePipeline().calculateToAudit(),
    invalidateFrom:(stage,reason)=>requirePipeline().invalidateFrom(stage,reason)
  };
  return Object.freeze(api);
}
