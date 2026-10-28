import type { Attempt } from "../core/attempt";

/**
 * The attach point (TECHNICAL_DESIGN.md, foundation 9): the page core only emits these events. A server module, added
 * to pages that are served, listens to them; a shared page has nothing listening and carries no server code.
 */
export type PageEvents = {
  ready: { quizIds: string[] };
  progress: { quizId: string; attempt: Attempt };
  submit: { quizId: string; attempt: Attempt };
};

type Listener<K extends keyof PageEvents> = (event: PageEvents[K]) => void;

export type Events = {
  on<K extends keyof PageEvents>(name: K, listener: Listener<K>): () => void;
  emit<K extends keyof PageEvents>(name: K, event: PageEvents[K]): void;
};

export function createEvents(): Events {
  const listeners = new Map<string, Set<Listener<keyof PageEvents>>>();
  return {
    on(name, listener) {
      const set = listeners.get(name) ?? new Set();
      set.add(listener as Listener<keyof PageEvents>);
      listeners.set(name, set);
      return () => {
        set.delete(listener as Listener<keyof PageEvents>);
      };
    },
    emit(name, event) {
      for (const listener of listeners.get(name) ?? []) (listener as Listener<typeof name>)(event);
    },
  };
}
