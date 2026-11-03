import type { FolderWatch } from "../../src/cli/watcher";

/** A file system that reports what a test says, and a clock that moves when a test says: nothing here waits. */
export function fakes() {
  const folders = new Map<string, (name: string | null) => void>();
  const closed: string[] = [];
  const watch: FolderWatch = (dir, onEvent) => {
    folders.set(dir, onEvent);
    return {
      close() {
        folders.delete(dir);
        closed.push(dir);
      },
    };
  };
  const timers: { at: number; fire: () => void; live: boolean }[] = [];
  let now = 0;
  const clock = {
    setTimer(fire: () => void, ms: number) {
      const t = { at: now + ms, fire, live: true };
      timers.push(t);
      return () => {
        t.live = false;
      };
    },
  };
  const advance = (ms: number): void => {
    now += ms;
    for (const t of timers.filter((x) => x.live && x.at <= now)) {
      t.live = false;
      t.fire();
    }
  };
  const touch = (dir: string, name: string | null): void => folders.get(dir)?.(name);
  return { watch, clock, folders, closed, advance, touch, live: () => timers.filter((t) => t.live).length };
}
