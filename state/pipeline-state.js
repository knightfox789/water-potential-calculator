export const createPipelineState=({stage=null,status='idle',progress=null}={})=>Object.freeze({stage,status,progress});
