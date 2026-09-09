export function createEventBus() {
  const listeners = new Map();
  return {
    on(type, handler) {
      const set = listeners.get(type) ?? new Set();
      set.add(handler);
      listeners.set(type, set);
      return () => set.delete(handler);
    },
    emit(type, payload) {
      for (const handler of listeners.get(type) ?? []) handler(payload);
    }
  };
}
