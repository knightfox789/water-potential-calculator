function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.freeze(value);for(const v of Object.values(value))deepFreeze(v);return value;}
function frozenCopy(value){return deepFreeze(structuredClone(value));}
export function createSnapshotRegistry(){
  const snapshots=new Map();const completed=[];let locked=false;
  const ensureDraft=()=>{if(locked)throw new Error('Completed run snapshots are immutable. Start a new draft before replacing snapshots.');};
  return Object.freeze({
    set(stage,snapshot){ensureDraft();if(snapshots.has(stage))throw new Error(`Snapshot already exists for ${stage}`);const frozen=frozenCopy(snapshot);snapshots.set(stage,frozen);return frozen;},
    replaceDraft(stage,snapshot){ensureDraft();const frozen=frozenCopy(snapshot);snapshots.set(stage,frozen);return frozen;},
    get:stage=>snapshots.get(stage)||null,
    has:stage=>snapshots.has(stage),
    clearFrom(stage,order){ensureDraft();const i=order.indexOf(stage);if(i<0)return;for(const s of order.slice(i))snapshots.delete(s);},
    complete(meta={}){if(locked)throw new Error('Current snapshot lineage is already completed.');const archive=deepFreeze({meta:frozenCopy(meta),snapshots:Object.freeze([...snapshots.entries()].map(([stage,snapshot])=>Object.freeze({stage,snapshot})))});completed.push(archive);locked=true;return archive;},
    startNewDraft(stage,order){if(locked)locked=false;const i=order.indexOf(stage);if(i<0)return;for(const s of order.slice(i))snapshots.delete(s);},
    clearAll({preserveCompleted=false}={}){snapshots.clear();locked=false;if(!preserveCompleted)completed.length=0;},
    isCompletedLocked:()=>locked,
    list:()=>Object.freeze([...snapshots.entries()].map(([stage,snapshot])=>Object.freeze({stage,snapshot}))),
    listCompleted:()=>Object.freeze([...completed])
  });
}
