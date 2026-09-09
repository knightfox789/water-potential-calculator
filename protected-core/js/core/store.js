function cloneStateForListener(state) {
  return {
    lifecycle: state.lifecycle,
    view: state.view,
    session: state.session,
    intake: state.intake,
    mapping: state.mapping,
    canonicalization: state.canonicalization,
    validation: state.validation,
    routing: state.routing,
    calculation: state.calculation,
    assurance: state.assurance,
    aggregation: state.aggregation,
    audit: state.audit,
    error: state.error
  };
}

const INVALIDATION = {
  source: ['mapping','canonicalization','canonical','validation','validated','routing','routed','calculation','calculated','assurance','assured','aggregation','aggregated','audit','audited'],
  mapping: ['canonicalization','canonical','validation','validated','routing','routed','calculation','calculated','assurance','assured','aggregation','aggregated','audit','audited'],
  canonical: ['validation','validated','routing','routed','calculation','calculated','assurance','assured','aggregation','aggregated','audit','audited'],
  validation: ['routing','routed','calculation','calculated','assurance','assured','aggregation','aggregated','audit','audited'],
  routing: ['calculation','calculated','assurance','assured','aggregation','aggregated','audit','audited'],
  calculation: ['assurance','assured','aggregation','aggregated','audit','audited'],
  assurance: ['aggregation','aggregated','audit','audited'],
  aggregation: ['audit','audited'],
  audit: []
};

export function createStore() {
  let state = {
    lifecycle: 'idle', view: 'landing', session: null, intake: null, mapping: null, canonicalization: null, validation: null, routing: null, calculation: null, assurance: null, aggregation: null, audit: null,
    raw: null, canonical: null, validated: null, routed: null, calculated: null, assured: null, aggregated: null, audited: null, error: null
  };
  const subscribers = new Set();

  function notify() {
    const publicState = cloneStateForListener(state);
    for (const fn of subscribers) fn(publicState);
  }
  function invalidationPatch(layer) {
    return Object.fromEntries((INVALIDATION[layer]||[]).map(key=>[key,null]));
  }

  return {
    getState: () => state,
    getPublicState: () => cloneStateForListener(state),
    patch(patch) { state = { ...state, ...patch }; notify(); },
    patchFrom(layer, patch) { state = { ...state, ...invalidationPatch(layer), ...patch }; notify(); },
    invalidateFrom(layer) { state = { ...state, ...invalidationPatch(layer) }; notify(); },
    setLifecycle(lifecycle) { state = { ...state, lifecycle }; notify(); },
    clear() { state = { lifecycle:'idle',view:'landing',session:null,intake:null,mapping:null,canonicalization:null,validation:null,routing:null,calculation:null,assurance:null,aggregation:null,audit:null,raw:null,canonical:null,validated:null,routed:null,calculated:null,assured:null,aggregated:null,audited:null,error:null }; notify(); },
    subscribe(fn) { subscribers.add(fn); fn(cloneStateForListener(state)); return () => subscribers.delete(fn); }
  };
}
