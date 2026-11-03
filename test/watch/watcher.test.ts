import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createWatcher, DEBOUNCE_MS, type FolderWatch } from "../../src/cli/watcher";

/** A file system that reports what a test says, and a clock that moves when a test says: nothing here waits. */
function fakes() {
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

/** lets the promises of a finished rebuild settle (not a timer: the fake clock holds those) */
const settled = (): Promise<void> => new Promise((done) => setImmediate(done));

const at = (...parts: string[]): string => resolve("/work", ...parts);

describe("the watcher", () => {
  it("gathers a burst of changes for 100 ms and reports once", async () => {
    const f = fakes();
    const calls: string[][] = [];
    const w = createWatcher({ ...f, onChange: (keys) => void calls.push(keys) });
    w.set("quiz", [at("quiz.md"), at("img/a.png")]);
    f.touch(at(), "quiz.md");
    f.advance(DEBOUNCE_MS - 1);
    f.touch(at("img"), "a.png");
    f.touch(at(), "quiz.md");
    expect(calls).toEqual([]);
    f.advance(1);
    expect(calls).toEqual([["quiz"]]);
    await settled();
    // the window does not slide: a later change starts a new one
    f.touch(at(), "quiz.md");
    f.advance(DEBOUNCE_MS - 1);
    expect(calls).toHaveLength(1);
    f.advance(1);
    expect(calls).toHaveLength(2);
  });

  it("watches folders, not files: one watch for two files of one folder, and a rename save is seen", () => {
    const f = fakes();
    const calls: string[][] = [];
    const w = createWatcher({ ...f, onChange: (keys) => void calls.push(keys) });
    w.set("quiz", [at("quiz.md"), at("sheet.md"), at("img/a.png")]);
    expect(w.folders()).toEqual([at(), at("img")].sort());
    // an editor writes `.quiz.md.swp`, then renames it over `quiz.md`: the folder reports both names
    f.touch(at(), ".quiz.md.swp");
    f.advance(DEBOUNCE_MS);
    expect(calls).toEqual([]);
    f.touch(at(), "quiz.md");
    f.advance(DEBOUNCE_MS);
    expect(calls).toEqual([["quiz"]]);
  });

  it("ignores what no key cares about, such as the page it writes itself", () => {
    const f = fakes();
    const calls: string[][] = [];
    createWatcher({ ...f, onChange: (keys) => void calls.push(keys) }).set("quiz", [at("quiz.md")]);
    f.touch(at(), "quiz.html");
    expect(f.live()).toBe(0);
    expect(calls).toEqual([]);
  });

  it("follows the last build: a file the quiz starts to use is watched, one it stops using is not", () => {
    const f = fakes();
    const calls: string[][] = [];
    const w = createWatcher({ ...f, onChange: (keys) => void calls.push(keys) });
    w.set("quiz", [at("quiz.md"), at("img/a.png")]);
    w.set("quiz", [at("quiz.md"), at("more/b.png")]);
    expect(f.closed).toEqual([at("img")]);
    expect(w.folders()).toEqual([at(), at("more")].sort());
    f.touch(at("more"), "b.png");
    f.advance(DEBOUNCE_MS);
    expect(calls).toEqual([["quiz"]]);
  });

  it("names every key a changed file belongs to, and several keys for several files", () => {
    const f = fakes();
    const calls: string[][] = [];
    const w = createWatcher({ ...f, onChange: (keys) => void calls.push(keys) });
    w.set("a", [at("a.md"), at("shared.png")]);
    w.set("b", [at("b.md"), at("shared.png")]);
    w.set("build", [at("build.toml")]);
    f.touch(at(), "shared.png");
    f.touch(at(), "build.toml");
    f.advance(DEBOUNCE_MS);
    expect(calls).toEqual([["a", "b", "build"]]);
  });

  it("a folder event with no name touches every key that has a file in the folder", () => {
    const f = fakes();
    const calls: string[][] = [];
    const w = createWatcher({ ...f, onChange: (keys) => void calls.push(keys) });
    w.set("a", [at("a.md")]);
    w.set("b", [at("sub/b.md")]);
    f.touch(at(), null);
    f.advance(DEBOUNCE_MS);
    expect(calls).toEqual([["a"]]);
  });

  it("a change while a rebuild runs waits for it, then is reported on its own", async () => {
    const f = fakes();
    const calls: string[][] = [];
    let release: () => void = () => undefined;
    const w = createWatcher({
      ...f,
      onChange(keys) {
        calls.push(keys);
        return calls.length === 1
          ? new Promise<void>((done) => {
              release = done;
            })
          : undefined;
      },
    });
    w.set("quiz", [at("quiz.md")]);
    f.touch(at(), "quiz.md");
    f.advance(DEBOUNCE_MS);
    expect(calls).toHaveLength(1);
    f.touch(at(), "quiz.md");
    f.advance(DEBOUNCE_MS * 5);
    expect(calls).toHaveLength(1);
    release();
    await settled();
    f.advance(DEBOUNCE_MS);
    await w.idle();
    expect(calls).toEqual([["quiz"], ["quiz"]]);
  });

  it("a deleted file is still a change, and a throwing rebuild does not stop the watching", async () => {
    const f = fakes();
    let n = 0;
    const w = createWatcher({
      ...f,
      onChange() {
        n++;
        throw new Error("read error");
      },
    });
    w.set("quiz", [at("quiz.md")]);
    f.touch(at(), "quiz.md");
    f.advance(DEBOUNCE_MS);
    await w.idle();
    f.touch(at(), "quiz.md");
    f.advance(DEBOUNCE_MS);
    await w.idle();
    expect(n).toBe(2);
  });

  it("close() stops every watch and drops what was pending", () => {
    const f = fakes();
    const calls: string[][] = [];
    const w = createWatcher({ ...f, onChange: (keys) => void calls.push(keys) });
    w.set("quiz", [at("quiz.md"), at("img/a.png")]);
    f.touch(at(), "quiz.md");
    w.close();
    f.advance(DEBOUNCE_MS);
    expect(calls).toEqual([]);
    expect(f.folders.size).toBe(0);
  });

  it("remove(key) stops watching what only that key needed", () => {
    const f = fakes();
    const w = createWatcher({ ...f, onChange: () => undefined });
    w.set("a", [at("a/a.md")]);
    w.set("b", [at("b/b.md")]);
    w.remove("a");
    expect(w.folders()).toEqual([at("b")]);
  });
});
