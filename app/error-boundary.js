export function normalizeAppError(error,stage='application'){
  return Object.freeze({stage,message:error?.message||String(error),name:error?.name||'Error',timestamp:new Date().toISOString()});
}
