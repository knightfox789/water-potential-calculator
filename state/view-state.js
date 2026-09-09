export const createViewState=({scope=null,filters={},displayUnit='canonical'}={})=>Object.freeze({scope,filters:Object.freeze({...filters}),displayUnit});
