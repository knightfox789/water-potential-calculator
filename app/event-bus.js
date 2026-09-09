export function createEventBus(){
  const handlers=new Map();
  return Object.freeze({
    on(type,fn){const set=handlers.get(type)||new Set();set.add(fn);handlers.set(type,set);return()=>set.delete(fn);},
    emit(type,payload){for(const fn of handlers.get(type)||[])fn(payload);},
    clear(){handlers.clear();}
  });
}
