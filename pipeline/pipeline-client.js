import { loadProtectedConfig } from '../adapters/protected-config-adapter.js';
import { createProtectedPipelineAdapter } from './pipeline-adapter.js';
import { createWorkerPipelineClient } from './worker-client.js';
import { ensureLocalJsZip } from './worker-runtime.js';

function wrapSameThread(adapter,reason){
  return Object.freeze({
    mode:'same-thread',fallbackReason:reason||null,
    runIntake:file=>adapter.runIntake(file),
    getPreparationDetail:()=>adapter.getPreparationDetail(),getResultPackage:()=>adapter.getResultPackage(),applySourceCorrection:c=>adapter.applySourceCorrection(c),
    getMappingMetadata:()=>adapter.getMappingMetadata(),
    buildMapping:()=>adapter.buildMapping(),
    updateSheetMapping:(expectedSheet,sourceSheetName)=>adapter.updateSheetMapping(expectedSheet,sourceSheetName),
    confirmSheetMapping:(expectedSheet,confirmed=true)=>adapter.confirmSheetMapping(expectedSheet,confirmed),
    updateFieldMapping:(fieldId,sourceSheet,sourceColumnIndex)=>adapter.updateFieldMapping(fieldId,sourceSheet,sourceColumnIndex),
    confirmFieldMapping:(fieldId,confirmed=true)=>adapter.confirmFieldMapping(fieldId,confirmed),
    confirmAllSuggested:()=>adapter.confirmAllSuggested(),
    confirmMapping:()=>adapter.confirmMapping(),
    runStage:s=>adapter.runStage(s),getPublicProtectedState:()=>adapter.getPublicProtectedState(),reset:()=>adapter.reset(),terminate(){}
  });
}

export function workerSupportsControlledXlsx(capabilities){return Boolean(capabilities?.xlsxIntakeCompatible&&capabilities?.domParser&&capabilities?.jszip&&capabilities?.fileApi&&capabilities?.crypto);}

export async function createSameThreadPipelineClient({configLoader=loadProtectedConfig,adapterFactory=createProtectedPipelineAdapter,reason='worker-unavailable-or-incompatible'}={}){
  await ensureLocalJsZip();
  if(typeof DOMParser==='undefined')throw new Error('Controlled XLSX intake requires DOMParser in the active browser context.');
  const adapter=adapterFactory(await configLoader());
  return wrapSameThread(adapter,reason);
}

export async function createPipelineClient({preferWorker=true,WorkerCtor=globalThis.Worker,workerClientFactory=createWorkerPipelineClient,configLoader=loadProtectedConfig,adapterFactory=createProtectedPipelineAdapter}={}){
  if(preferWorker&&typeof WorkerCtor==='function'){
    let client=null;
    try{
      client=workerClientFactory({WorkerCtor});
      const capabilities=await client.getCapabilities();
      if(workerSupportsControlledXlsx(capabilities))return Object.freeze({...client,capabilities});
      client.terminate();
      return createSameThreadPipelineClient({configLoader,adapterFactory,reason:'worker-missing-controlled-xlsx-dom-capability'});
    }catch(error){
      client?.terminate?.();
      return createSameThreadPipelineClient({configLoader,adapterFactory,reason:`worker-probe-failed:${error.message}`});
    }
  }
  return createSameThreadPipelineClient({configLoader,adapterFactory,reason:'worker-unavailable'});
}
