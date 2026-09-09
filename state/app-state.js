import { createSourceState } from './source-state.js';
import { createMappingState } from './mapping-state.js';
import { createPipelineState } from './pipeline-state.js';
import { createViewState } from './view-state.js';

export const RUN_STATES=Object.freeze(['EMPTY','FILE_SELECTED','PREFLIGHT_COMPLETE','MAPPING_REVIEW','MAPPING_CONFIRMED','PREPARED','VALIDATION_REVIEW','READY_TO_CALCULATE','CALCULATING','ASSURANCE_REVIEW','FINALIZING','COMPLETE','INVALIDATED','FAILED']);

function isPlain(value){return Array.isArray(value)||Boolean(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype);}
export function deepFreezeState(value){if(!isPlain(value)||Object.isFrozen(value))return value;for(const child of Object.values(value))deepFreezeState(child);return Object.freeze(value);}
function initialState(){return deepFreezeState({runState:'EMPTY',currentRoute:'home',source:createSourceState(),mapping:createMappingState(),draftRevision:0,completedRun:null,invalidatedReason:null,pipeline:createPipelineState(),error:null,presentation:createViewState()});}

export function createAppStateStore(){
  let state=initialState();const subs=new Set();const notify=()=>subs.forEach(fn=>fn(state));
  const assign=patch=>{state=deepFreezeState({...state,...patch});notify();return state;};
  return Object.freeze({
    getState:()=>state,
    patch:assign,
    setRunState(runState){if(!RUN_STATES.includes(runState))throw new Error(`Unknown run state: ${runState}`);return assign({runState});},
    setPipeline(stage,status,progress=null){return assign({pipeline:{stage,status,progress}});},
    bumpDraft(reason){return assign({draftRevision:state.draftRevision+1,runState:'INVALIDATED',invalidatedReason:reason,completedRun:null,error:null});},
    reset(){state=initialState();notify();return state;},
    subscribe(fn){subs.add(fn);fn(state);return()=>subs.delete(fn);}
  });
}
