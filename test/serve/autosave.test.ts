import { describe, expect, it } from "vitest";
import { createAutosaver } from "../../src/serve/autosave";

/** The once-a-second rule of `--autosave`, driven by a clock and a timer the test holds (no real waiting). */
function rig(intervalMs?: number) {
  let clock = 1000;
  const written: string[] = [];
  const errors: unknown[] = [];
  let removed = 0;
  let timer: { fire(): void; ms: number } | null = null;
  let timers = 0;
  let failNext = false;
  let release: (() => void) | null = null;
  let hold = false;
  const saver = createAutosaver({
    ...(intervalMs === undefined ? {} : { intervalMs }),
    now: () => clock,
    write: async (text) => {
      if (failNext) {
        failNext = false;
        throw new Error("disk full");
      }
      if (hold) await new Promise<void>((resolve) => (release = resolve));
      written.push(text);
    },
    remove: async () => {
      removed += 1;
    },
    setTimer: (fire, ms) => {
      timers += 1;
      const mine = { fire, ms };
      timer = mine;
      return () => {
        if (timer === mine) timer = null;
      };
    },
    onError: (e) => errors.push(e),
  });
  return {
    saver,
    written,
    errors,
    removed: () => removed,
    timer: () => timer,
    timers: () => timers,
    advance: (ms: number) => {
      clock += ms;
    },
    fail: () => {
      failNext = true;
    },
    hold: () => {
      hold = true;
    },
    release: () => {
      hold = false;
      release?.();
    },
    settle: () => new Promise((r) => setTimeout(r, 0)),
  };
}

describe("the autosaver", () => {
  it("writes the first progress at once", async () => {
    const t = rig();
    t.saver.save("one");
    await t.settle();
    expect(t.written).toEqual(["one"]);
    expect(t.timer()).toBeNull();
  });

  it("writes at most once a second: the rest wait, and the last body wins", async () => {
    const t = rig();
    t.saver.save("one");
    await t.settle();
    t.advance(100);
    t.saver.save("two");
    t.advance(100);
    t.saver.save("three");
    t.advance(100);
    t.saver.save("four");
    await t.settle();
    expect(t.written).toEqual(["one"]);
    // one timer for the rest of the second, set when the first waiting body arrived
    expect(t.timers()).toBe(1);
    expect(t.timer()?.ms).toBe(900);
    t.advance(900);
    t.timer()?.fire();
    await t.settle();
    expect(t.written).toEqual(["one", "four"]);
  });

  it("writes at once again after a quiet second", async () => {
    const t = rig();
    t.saver.save("one");
    await t.settle();
    t.advance(1000);
    t.saver.save("two");
    await t.settle();
    expect(t.written).toEqual(["one", "two"]);
  });

  it("flush writes what waits now, and cancels the timer", async () => {
    const t = rig();
    t.saver.save("one");
    t.advance(10);
    t.saver.save("two");
    await t.saver.flush();
    expect(t.written).toEqual(["one", "two"]);
    expect(t.timer()).toBeNull();
    await t.saver.flush();
    expect(t.written).toEqual(["one", "two"]);
  });

  it("finish drops what waits, lets a write in flight end, removes the file and takes nothing more", async () => {
    const t = rig();
    t.hold();
    t.saver.save("one");
    t.advance(10);
    t.saver.save("two");
    const finished = t.saver.finish();
    await t.settle();
    expect(t.removed()).toBe(0);
    t.release();
    await finished;
    expect(t.written).toEqual(["one"]);
    expect(t.removed()).toBe(1);
    t.saver.save("late");
    await t.saver.flush();
    expect(t.written).toEqual(["one"]);
  });

  it("reports a failed write once per failure and keeps going with the next", async () => {
    const t = rig();
    t.fail();
    t.saver.save("one");
    await t.settle();
    expect(t.errors).toHaveLength(1);
    t.advance(1000);
    t.saver.save("two");
    await t.settle();
    expect(t.written).toEqual(["two"]);
  });

  it("takes the interval it is given", async () => {
    const t = rig(250);
    t.saver.save("one");
    await t.settle();
    t.advance(100);
    t.saver.save("two");
    expect(t.timer()?.ms).toBe(150);
  });
});
