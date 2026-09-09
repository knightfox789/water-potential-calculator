import { validateWorkbookFile, workbookArrayBuffer } from '../adapters/workbook-adapter.js';
import { sha256Hex } from '../adapters/crypto-adapter.js';

export const SAMPLE_WORKBOOKS=Object.freeze({
  leap:Object.freeze({id:'leap',label:'Leap-year validation sample',filename:'GOLDEN_E2E_LEAP_FY2023-24.xlsx',url:new URL('../samples/leap/GOLDEN_E2E_LEAP_FY2023-24.xlsx',import.meta.url),synthetic:true}),
  nonleap:Object.freeze({id:'nonleap',label:'Non-leap validation sample',filename:'GOLDEN_E2E_NONLEAP_FY2024-25.xlsx',url:new URL('../samples/nonleap/GOLDEN_E2E_NONLEAP_FY2024-25.xlsx',import.meta.url),synthetic:true})
});

export async function prepareSelectedWorkbook(file,{kind='upload',synthetic=false,sampleId=null}={}){
  validateWorkbookFile(file);
  const bytes=await workbookArrayBuffer(file);
  const sha256=await sha256Hex(bytes);
  return Object.freeze({
    file,
    metadata:Object.freeze({
      name:file.name||null,
      size:Number.isFinite(file.size)?file.size:bytes.byteLength,
      sha256,
      templateVersion:null,
      sourceSessionId:null,
      kind,
      synthetic:Boolean(synthetic)||['e1a592ce49e3a308b8d402ca65a090f5d5f0e39b7bda3484be6e653ddc015f56','7c6ba9498f8c87790503331f848cf4a83db577ab95c056473e202efd22fdddeb'].includes(sha256),
      sampleId:sampleId||null,
      lastModified:Number.isFinite(file.lastModified)?file.lastModified:null
    })
  });
}

export async function loadSampleWorkbook(sampleId,{fetchImpl=globalThis.fetch,FileCtor=globalThis.File}={}){
  const descriptor=SAMPLE_WORKBOOKS[sampleId];
  if(!descriptor)throw new Error(`Unknown controlled sample: ${sampleId}`);
  if(typeof fetchImpl!=='function')throw new Error('Sample loading requires browser fetch support.');
  if(typeof FileCtor!=='function')throw new Error('Sample loading requires browser File API support.');
  const response=await fetchImpl(descriptor.url);
  if(!response?.ok)throw new Error(`Could not load ${descriptor.label}.`);
  const blob=await response.blob();
  const file=new FileCtor([blob],descriptor.filename,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  return prepareSelectedWorkbook(file,{kind:'sample',synthetic:true,sampleId});
}
