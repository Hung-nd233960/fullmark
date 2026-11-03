import { watch as fsWatch } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * The file watcher of `build --watch` (COMMANDS.md, `--watch`; TECHNICAL_DESIGN.md, section 3, Watching). It watches by
 * folder, so an editor that saves by writing a temporary file and renaming it over the original is seen; changes are
 * gathered for 100 ms and then reported once, as the keys of what they touched. It knows nothing of quizzes: a caller
 * says which files matter to which key, and again after each rebuild, since a quiz may start or stop using a file.
 * The file system and the clock are injected, so a test never waits for either.
 */

/** Watches one folder (not its subfolders); `onEvent` gets the name of what changed in it, or null when the platform does not say. */
export type FolderWatch = (dir: string, onEvent: (name: string | null) => void) => { close(): void };
export type WatchClock = { setTimer(fire: () => void, ms: number): () => void };

/** The real folder watch: `node:fs.watch`. A folder that cannot be watched (gone, or no permission) is not watched. */
export const realFolderWatch: FolderWatch = (dir, onEvent) => {
  try {
    const w = fsWatch(dir, { persistent: true }, (_event, name) => onEvent(name === null ? null : String(name)));
    w.on("error", () => w.close());
    return { close: () => w.close() };
  } catch {
    return { close: () => undefined };
  }
};

export const realWatchClock: WatchClock = {
  setTimer(fire, ms) {
    const handle = setTimeout(fire, ms);
    return () => clearTimeout(handle);
  },
};

export const DEBOUNCE_MS = 100;

export type WatcherOptions = {
  watch: FolderWatch;
  clock: WatchClock;
  /**
   * Called with the keys whose files changed, once per burst. The next call waits until this one has settled, and
   * gathers what changed meanwhile.
   */
  onChange(keys: string[]): void | Promise<void>;
  debounceMs?: number;
};

export type Watcher = {
  /** Replaces the files that matter to `key` (absolute paths); their folders are watched, and folders no key needs any more are not. */
  set(key: string, files: readonly string[]): void;
  remove(key: string): void;
  /** the folders watched now, sorted */
  folders(): string[];
  /** resolves when nothing is pending and no `onChange` is running (for tests and for a clean stop) */
  idle(): Promise<void>;
  close(): void;
};

const same = (path: string): string => (process.platform === "win32" ? path.toLowerCase() : path);

export function createWatcher(options: WatcherOptions): Watcher {
  const debounce = options.debounceMs ?? DEBOUNCE_MS;
  const filesOf = new Map<string, Set<string>>();
  const open = new Map<string, { close(): void }>();
  const pending = new Set<string>();
  let cancel: (() => void) | null = null;
  let running: Promise<void> | null = null;
  let closed = false;
  let settle: (() => void)[] = [];

  /** which keys care about this file */
  const keysFor = (file: string): string[] => {
    const found: string[] = [];
    for (const [key, files] of filesOf) if (files.has(same(file))) found.push(key);
    return found;
  };
  const note = (dir: string, name: string | null): void => {
    if (closed) return;
    // no name: anything in the folder may have changed
    const keys =
      name === null
        ? [...filesOf].filter(([, files]) => [...files].some((f) => same(dirname(f)) === same(dir))).map(([k]) => k)
        : keysFor(resolve(dir, name));
    if (keys.length === 0) return;
    for (const key of keys) pending.add(key);
    arm();
  };
  const arm = (): void => {
    if (cancel !== null || running !== null) return;
    cancel = options.clock.setTimer(flush, debounce);
  };
  const flush = (): void => {
    cancel = null;
    if (closed || pending.size === 0) return finish();
    const keys = [...pending];
    pending.clear();
    running = new Promise<void>((done) => done(options.onChange(keys))).then(
      () => undefined,
      () => undefined,
    );
    running.then(() => {
      running = null;
      if (pending.size > 0) arm();
      else finish();
    });
  };
  const finish = (): void => {
    if (cancel !== null || running !== null || pending.size > 0) return;
    const waiting = settle;
    settle = [];
    for (const done of waiting) done();
  };

  const refresh = (): void => {
    const wanted = new Set<string>();
    for (const files of filesOf.values()) for (const f of files) wanted.add(dirname(f));
    for (const [dir, handle] of open) {
      if (!wanted.has(dir)) {
        handle.close();
        open.delete(dir);
      }
    }
    for (const dir of wanted) {
      if (!open.has(dir))
        open.set(
          dir,
          options.watch(dir, (name) => note(dir, name)),
        );
    }
  };

  return {
    set(key, files) {
      if (closed) return;
      // the set holds the case-folded form on Windows; the folder to watch comes from the path as given
      const folded = new Set(files.map((f) => same(resolve(f))));
      filesOf.set(key, folded);
      refresh();
    },
    remove(key) {
      filesOf.delete(key);
      refresh();
    },
    folders: () => [...open.keys()].sort(),
    idle: () =>
      cancel === null && running === null && pending.size === 0
        ? Promise.resolve()
        : new Promise<void>((done) => {
            settle.push(done);
          }),
    close() {
      closed = true;
      cancel?.();
      cancel = null;
      pending.clear();
      for (const handle of open.values()) handle.close();
      open.clear();
      finish();
    },
  };
}
