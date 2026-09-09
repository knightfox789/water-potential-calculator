function makeError(error){const e=new Error(error?.message||'Worker command failed.');e.name=error?.name||'WorkerError';return e;}

export function createWorkerPipelineClient({WorkerCtor=globalThis.Worker,workerUrl=new URL('./worker-entry.js',import.meta.url),timeoutMs=45000}={}){
  if(typeof WorkerCtor!=='function')throw new Error('Web Worker is not available.');
  const worker=new WorkerCtor(workerUrl,{type:'module',name:'huf-kpi-protected-pipeline'});
  let seq=0;
  const pending=new Map();
  let closed=false;
  const rejectAll=error=>{for(const {reject,timer} of pending.values()){clearTimeout(timer);reject(error);}pending.clear();};
  const failClosed=error=>{if(!closed){closed=true;try{worker.terminate();}catch{}}rejectAll(error);};
  worker.onmessage=event=>{
    const msg=event.data||{};const slot=pending.get(msg.requestId);if(!slot)return;
    if(msg.status==='partial'){
      if(msg.payload?.kind==='header')slot.result=msg.payload.value;
      else if(msg.payload?.kind==='water'&&slot.result)slot.result.calculation.waterCalculations.push(...msg.payload.value);
      else{failClosed(new Error('Invalid result transfer chunk.'));return;}
      setTimeout(()=>{if(!closed&&pending.has(msg.requestId))worker.postMessage({requestId:msg.requestId,command:'ACK_RESULT_CHUNK'});},0);
      return;
    }
    pending.delete(msg.requestId);clearTimeout(slot.timer);
    if(msg.status==='complete')slot.resolve(slot.result??msg.payload);else slot.reject(makeError(msg.error));
  };
  worker.onerror=event=>{event?.preventDefault?.();failClosed(new Error(event?.message||'Pipeline Worker failed.'));};
  worker.onmessageerror=()=>failClosed(new Error('Pipeline Worker message could not be deserialized.'));
  const rpc=(command,payload=null)=>new Promise((resolve,reject)=>{
    if(closed){reject(new Error('Pipeline Worker client is closed.'));return;}
    const requestId=`W-${++seq}`;
    const timer=setTimeout(()=>{failClosed(new Error(`Worker command timed out: ${command}`));},timeoutMs);
    pending.set(requestId,{resolve,reject,timer});
    try{worker.postMessage({requestId,command,payload});}catch(error){pending.delete(requestId);clearTimeout(timer);failClosed(error);reject(error);}
  });
  return Object.freeze({
    mode:'worker',
    getCapabilities:()=>rpc('GET_CAPABILITIES'),
    getMappingMetadata:()=>rpc('GET_MAPPING_METADATA'),
    runIntake:file=>rpc('RUN_INTAKE',{file}),
    getPreparationDetail:()=>rpc('GET_PREPARATION_DETAIL'),getResultPackage:()=>rpc('GET_RESULT_PACKAGE'),applySourceCorrection:correction=>rpc('APPLY_SOURCE_CORRECTION',correction),
    buildMapping:()=>rpc('BUILD_MAPPING'),
    updateSheetMapping:(expectedSheet,sourceSheetName)=>rpc('UPDATE_SHEET_MAPPING',{expectedSheet,sourceSheetName}),
    confirmSheetMapping:(expectedSheet,confirmed=true)=>rpc('CONFIRM_SHEET_MAPPING',{expectedSheet,confirmed}),
    updateFieldMapping:(fieldId,sourceSheet,sourceColumnIndex)=>rpc('UPDATE_FIELD_MAPPING',{fieldId,sourceSheet,sourceColumnIndex}),
    confirmFieldMapping:(fieldId,confirmed=true)=>rpc('CONFIRM_FIELD_MAPPING',{fieldId,confirmed}),
    confirmAllSuggested:()=>rpc('CONFIRM_ALL_SUGGESTED'),
    confirmMapping:()=>rpc('CONFIRM_MAPPING'),
    runStage:stage=>rpc('RUN_STAGE',{stage}),
    getPublicProtectedState:()=>rpc('GET_PUBLIC_STATE'),
    reset:()=>rpc('RESET'),
    terminate(){failClosed(new Error('Pipeline Worker terminated.'));}
  });
}
