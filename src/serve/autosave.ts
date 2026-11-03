/**
 * The writer behind `quiz serve --autosave` (COMMANDS.md): the page's progress arrives as often as the learner answers
 * and is written at most once a second, the last body winning. Pure of the file system and of the clock: the caller
 * gives `write`, `remove`, `now` and a timer, so the rate is tested without waiting.
 */
export type Autosaver = {
  /** keeps this text as the latest; it is written now, or when a second has passed since the last write */
  save(text: string): void;
  /** writes what waits, and resolves when every write has ended: the server stopped without a submit */
  flush(): Promise<void>;
  /** the results are written: nothing more is saved, writes in flight end, and the file is removed */
  finish(): Promise<void>;
};

export type AutosaverOptions = {
  write(text: string): Promise<void>;
  remove(): Promise<void>;
  now(): number;
  setTimer(fire: () => void, ms: number): () => void;
  /** called with each write that failed (the autosave goes on trying with the next progress) */
  onError(error: unknown): void;
  /** milliseconds between writes; 1000 */
  intervalMs?: number;
};

export function createAutosaver(options: AutosaverOptions): Autosaver {
  const interval = options.intervalMs ?? 1000;
  let last = Number.NEGATIVE_INFINITY;
  let waiting: string | null = null;
  let cancel: (() => void) | null = null;
  let closed = false;
  let chain: Promise<void> = Promise.resolve();

  const writeWaiting = (): void => {
    if (waiting === null) return;
    const text = waiting;
    waiting = null;
    last = options.now();
    chain = chain.then(() => options.write(text)).catch(options.onError);
  };
  const stopTimer = (): void => {
    cancel?.();
    cancel = null;
  };

  return {
    save(text) {
      if (closed) return;
      waiting = text;
      if (cancel !== null) return;
      const wait = last + interval - options.now();
      if (wait <= 0) writeWaiting();
      else {
        cancel = options.setTimer(() => {
          cancel = null;
          writeWaiting();
        }, wait);
      }
    },
    async flush() {
      stopTimer();
      writeWaiting();
      await chain;
    },
    async finish() {
      closed = true;
      stopTimer();
      waiting = null;
      await chain;
      await options.remove();
    },
  };
}
