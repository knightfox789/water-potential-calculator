function isFreezable(value){return Array.isArray(value)||Boolean(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype);}
function freezeDeep(value){if(!isFreezable(value))return value;for(const child of Object.values(value))freezeDeep(child);return Object.freeze(value);}
function cloneSnapshot(snapshot){if(snapshot===null||snapshot===undefined)return null;return structuredClone(snapshot);}

export function createMappingState(snapshot=null,status=snapshot?'confirmed':'empty'){
  const immutableSnapshot=snapshot===null||snapshot===undefined?null:freezeDeep(cloneSnapshot(snapshot));
  return Object.freeze({snapshot:immutableSnapshot,status});
}
