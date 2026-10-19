import type { LiveEvent } from "@shopcrew/shared";

type Listener = (event: LiveEvent) => void;
const listeners = new Set<Listener>();

export const bus = {
  emit(event: LiveEvent) {
    for (const listener of listeners) listener(event);
  },
  on(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
