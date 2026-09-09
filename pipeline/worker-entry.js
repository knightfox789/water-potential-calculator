import { loadProtectedConfig } from '../adapters/protected-config-adapter.js';
import { createProtectedPipelineAdapter } from './pipeline-adapter.js';
import { ensureLocalJsZip, ensureWorkerDomParser, probePipelineRuntimeCapabilities } from './worker-runtime.js';

let adapterPromise=null;
async function adapter(){
  adapterPromise??=(async()=>{
    await ensureLocalJsZip();
    await ensureWorkerDomParser();
    return createProtectedPipelineAdapter(await loadProtectedConfig());
  })();
  return adapterPromise;
}

export const envelope=(requestId,command,status,payload=null,error=null)=>Object.freeze({contractVersion:'HUF-WORKER-v1.2',requestId,command,status,payload,error});

export async function handleWorkerCommand(command,payload={}){
  if(command==='GET_CAPABILITIES')return probePipelineRuntimeCapabilities();
  const a=await adapter();
  switch(command){
    case'RESET':a.reset();return {reset:true};
    case'GET_PREPARATION_DETAIL':return a.getPreparationDetail();
    case'GET_RESULT_PACKAGE':return a.getResultPackage();
    case'APPLY_SOURCE_CORRECTION':return a.applySourceCorrection(payload);
    case'GET_PUBLIC_STATE':return a.getPublicProtectedState();
    case'GET_MAPPING_METADATA':return a.getMappingMetadata();
    case'RUN_INTAKE':return a.runIntake(payload.file);
    case'BUILD_MAPPING':return a.buildMapping();
    case'UPDATE_SHEET_MAPPING':return a.updateSheetMapping(payload.expectedSheet,payload.sourceSheetName);
    case'CONFIRM_SHEET_MAPPING':return a.confirmSheetMapping(payload.expectedSheet,payload.confirmed);
    case'UPDATE_FIELD_MAPPING':return a.updateFieldMapping(payload.fieldId,payload.sourceSheet,payload.sourceColumnIndex);
    case'CONFIRM_FIELD_MAPPING':return a.confirmFieldMapping(payload.fieldId,payload.confirmed);
    case'CONFIRM_ALL_SUGGESTED':return a.confirmAllSuggested();
    case'CONFIRM_MAPPING':return a.confirmMapping();
    case'RUN_STAGE':return a.runStage(payload.stage);
    default:throw new Error(`Unknown worker command: ${command}`);
  }
}

const chunkAcks=new Map();
async function sendResultPackage(requestId,command,pack){
  const send=payload=>new Promise(resolve=>{chunkAcks.set(requestId,resolve);self.postMessage(envelope(requestId,command,'partial',payload));});
  await send({kind:'header',value:{...pack,calculation:{...pack.calculation,waterCalculations:[]}}});
  for(let i=0;i<pack.calculation.waterCalculations.length;i+=20)await send({kind:'water',value:pack.calculation.waterCalculations.slice(i,i+20)});
  self.postMessage(envelope(requestId,command,'complete'));
}

if(typeof self!=='undefined'&&'postMessage' in self){
  self.onmessage=async event=>{
    const {requestId,command,payload}=event.data||{};
    if(command==='ACK_RESULT_CHUNK'){const ack=chunkAcks.get(requestId);chunkAcks.delete(requestId);ack?.();return;}
    try{const result=await handleWorkerCommand(command,payload);if(command==='GET_RESULT_PACKAGE')await sendResultPackage(requestId,command,result);else self.postMessage(envelope(requestId,command,'complete',result));}
    catch(error){self.postMessage(envelope(requestId,command,'failed',null,{message:error.message,name:error.name}));}
  };
}
