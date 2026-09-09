import { STAGE_ORDER,downstreamStages } from './dependency-policy.js';
import { createSourceState } from '../state/source-state.js';
import { createMappingState } from '../state/mapping-state.js';
import { buildWorkbookPreflight } from '../services/preflight-service.js';

export function createPipelineOrchestrator({adapter,appState,bus,snapshotRegistry,supportedTemplateVersion}){
  if(!adapter||!appState)throw new Error('Pipeline orchestrator requires adapter and appState.');
  if(!supportedTemplateVersion)throw new Error('Pipeline orchestrator requires the governed supported template version.');
  const publicState=async()=>await adapter.getPublicProtectedState?.();
  async function executeOperation(stage,operation,{snapshotStage=null,onSuccess=null}={}){
    const previousRunState=appState.getState().runState;
    appState.setPipeline(stage,'running');bus?.emit('pipeline:stage',{stage,status:'running'});
    try{
      const result=await operation();
      if(snapshotStage)snapshotRegistry?.replaceDraft(snapshotStage,result);
      appState.setPipeline(stage,'complete');appState.patch({error:null});bus?.emit('pipeline:stage',{stage,status:'complete'});
      if(onSuccess)await onSuccess(result);
      return result;
    }catch(error){
      appState.patch({runState:'FAILED',error:{stage,message:error.message,previousRunState},pipeline:{stage,status:'failed',progress:null}});
      bus?.emit('pipeline:stage',{stage,status:'failed',error});throw error;
    }
  }
  async function executeStages(stages){for(const stage of stages)await executeOperation(stage,()=>adapter.runStage(stage),{snapshotStage:stage});}
  function invalidateMappingDependents(reason){
    const downstream=STAGE_ORDER.slice(STAGE_ORDER.indexOf('E03'));
    const hasDownstream=downstream.some(stage=>snapshotRegistry?.has?.(stage));
    const wasLocked=Boolean(snapshotRegistry?.isCompletedLocked?.());
    if(wasLocked)snapshotRegistry?.startNewDraft('E03',STAGE_ORDER);else snapshotRegistry?.clearFrom('E03',STAGE_ORDER);
    if(hasDownstream||wasLocked)appState.bumpDraft(reason);
  }
  async function mappingReviewOperation(operation,{invalidateDownstream=false,reason='Mapping changed'}={}){
    if(invalidateDownstream)invalidateMappingDependents(reason);
    const mapping=await executeOperation('E02',operation);
    const safeState=createMappingState(mapping,'review');
    appState.patch({mapping:safeState});appState.setRunState('MAPPING_REVIEW');
    return safeState.snapshot;
  }
  return Object.freeze({
    async intake(file){
      appState.setRunState('FILE_SELECTED');
      const result=await executeOperation('E01',()=>adapter.runIntake(file),{snapshotStage:'E01'});
      const summary=result?.summary??result;
      const src=summary?.sourceWorkbook||{};
      const selected=appState.getState().source||{};
      const preflight=buildWorkbookPreflight(result,{supportedTemplateVersion});
      appState.patch({source:createSourceState({
        name:src.fileName??file?.name??selected.name??null,
        size:src.byteLength??file?.size??selected.size??null,
        sha256:src.sha256??selected.sha256??null,
        templateVersion:summary?.controlMetadataHint?.['Template Version']??selected.templateVersion??null,
        sourceSessionId:summary?.sourceSessionId??selected.sourceSessionId??null,
        kind:selected.kind??'upload',synthetic:selected.synthetic??false,sampleId:selected.sampleId??null,lastModified:selected.lastModified??file?.lastModified??null,
        preflight
      })});
      appState.setRunState('PREFLIGHT_COMPLETE');return result;
    },
    async mappingPreview(){return mappingReviewOperation(()=>adapter.buildMapping());},
    updateSheetMapping(expectedSheet,sourceSheetName){return mappingReviewOperation(()=>adapter.updateSheetMapping(expectedSheet,sourceSheetName),{invalidateDownstream:true,reason:`Sheet mapping changed: ${expectedSheet}`});},
    confirmSheetMapping(expectedSheet,confirmed=true){return mappingReviewOperation(()=>adapter.confirmSheetMapping(expectedSheet,confirmed),{invalidateDownstream:true,reason:`Sheet mapping confirmation changed: ${expectedSheet}`});},
    updateFieldMapping(fieldId,sourceSheet,sourceColumnIndex){return mappingReviewOperation(()=>adapter.updateFieldMapping(fieldId,sourceSheet,sourceColumnIndex),{invalidateDownstream:true,reason:`Field mapping changed: ${fieldId}`});},
    confirmFieldMapping(fieldId,confirmed=true){return mappingReviewOperation(()=>adapter.confirmFieldMapping(fieldId,confirmed),{invalidateDownstream:true,reason:`Field mapping confirmation changed: ${fieldId}`});},
    confirmAllSuggested(){return mappingReviewOperation(()=>adapter.confirmAllSuggested(),{invalidateDownstream:true,reason:'Suggested mappings confirmed'});},
    async confirmMapping(){
      const current=appState.getState().mapping?.snapshot;
      if(!current)throw new Error('Create the Mapping Review before confirming mapping.');
      const requiredUnmapped=(current.fieldMappings||[]).filter(item=>item.requirementClass==='Core'&&item.sourceHeader===null);
      if(requiredUnmapped.length)throw new Error(`Map all required Core fields before confirming mapping (${requiredUnmapped.length} unresolved).`);
      invalidateMappingDependents('Mapping confirmation starts a new prepared draft');
      const frozen=await executeOperation('E02',()=>adapter.confirmMapping(),{snapshotStage:'E02'});
      const safeState=createMappingState(frozen,'confirmed');
      appState.patch({mapping:safeState});appState.setRunState('MAPPING_CONFIRMED');return safeState.snapshot;
    },
    async prepareData(){
      if(appState.getState().runState!=='MAPPING_CONFIRMED')throw new Error('Confirm mapping before preparing data.');
      await executeStages(['E03']);appState.setRunState('PREPARED');return publicState();
    },
    async validateData(){
      if(!snapshotRegistry?.has('E03'))throw new Error('Prepare data before validation.');
      if(snapshotRegistry?.isCompletedLocked?.()){snapshotRegistry.startNewDraft('E04',STAGE_ORDER);appState.bumpDraft('Revalidation requested');}
      await executeStages(['E04']);appState.setRunState('VALIDATION_REVIEW');return publicState();
    },
    async prepareAndValidate(){await executeStages(['E03','E04']);appState.setRunState('VALIDATION_REVIEW');return publicState();},
    async calculateToAudit(){
      const validation=(await publicState())?.validation;if(validation?.workbookReadiness==='workbook_not_ready')throw new Error('Resolve workbook blockers before calculation.');
      if(!snapshotRegistry?.has('E04'))throw new Error('Validate data before calculation.');
      if(snapshotRegistry?.isCompletedLocked?.()){snapshotRegistry.startNewDraft('E05',STAGE_ORDER);appState.bumpDraft('Calculation requested');}
      appState.setRunState('CALCULATING');await executeStages(['E05','E06','E07','E08']);appState.setRunState('FINALIZING');await executeStages(['E09']);
      const state=await publicState();const audit=state?.audit??null;
      if(state?.aggregation?.status==='aggregation_not_ready'){appState.patch({runState:'FAILED',error:{stage:'E08',message:'Aggregation QA did not pass. Audit evidence is retained; results are not current.'}});throw new Error('Aggregation QA did not pass. Review validation and audit evidence.');}
      snapshotRegistry?.complete({runId:audit?.runId??audit?.runManifest?.runId??null,audit});
      appState.patch({runState:'COMPLETE',completedRun:audit,error:null});return audit;
    },
    invalidateFrom(stage,reason='Upstream state changed'){
      if(snapshotRegistry?.isCompletedLocked?.())snapshotRegistry.startNewDraft(stage,STAGE_ORDER);else snapshotRegistry?.clearFrom(stage,STAGE_ORDER);
      appState.bumpDraft(reason);bus?.emit('pipeline:invalidated',{stage,downstream:downstreamStages(stage),reason});
    },
    stages:STAGE_ORDER
  });
}
