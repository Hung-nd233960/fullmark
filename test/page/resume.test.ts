import { describe, expect, it } from "vitest";
import { pageQuizOf } from "../../src/build/page";
import { quizHash } from "../../src/core/hash";
import type { Quiz } from "../../src/core/ir";
import { parse } from "../../src/core/parse";
import { createStore, localIso, type QuizState } from "../../src/page/store";

const mcq = (id: string) => `## Question ${id}? {type=single id=${id}}\n\n- [x] right ${id}\n- [ ] wrong ${id}\n`;

const text = (front = "") =>
  [
    "---",
    "title: Resume",
    "id: resume",
    front,
    "---",
    "",
    "# Part A {id=a}",
    "",
    mcq("a1"),
    mcq("a2"),
    "# Part B {id=b}",
    "",
    mcq("b1"),
  ].join("\n");

function pageOf(source: string) {
  const result = parse(source, "q.md");
  expect(result.issues).toEqual([]);
  return pageQuizOf({ quiz: result.quiz as Quiz, hash: quizHash(source, []), assets: [] });
}

/** A `Storage` in memory, which a second store can share, as a second visit to the page does. */
class Memory {
  items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key(i: number) {
    return [...this.items.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.items.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.items.set(k, v);
  }
  removeItem(k: string) {
    this.items.delete(k);
  }
}

const T0 = Date.UTC(2026, 9, 29, 3, 0, 0);
const open = (source: string, memory: Memory, clock: { at: number }) => {
  const page = pageOf(source);
  const store = createStore(
    { version: 1, quizzes: [page] },
    { storage: () => memory as unknown as Storage, now: () => clock.at },
  );
  store.restore();
  return { page, store, state: () => store.quizzes.get("resume") as QuizState };
};
const attemptKeyOf = (memory: Memory) => [...memory.items.keys()].find((k) => k.endsWith(":attempt")) ?? "";

function goodAttempt(hash: string) {
  return {
    quizHash: hash,
    phase: "answering",
    plan: { source: "full", questions: ["a1", "a2", "b1"], seed: "abc12345" },
    state: {
      answers: {},
      startedAt: localIso(new Date(T0)),
      submittedAt: null,
      timeUsed: 12,
      sectionTime: {},
      flagged: [],
      timedOut: false,
    },
  };
}

describe("autosave and resume", () => {
  it("saves the attempt under the namespaced key after Start and after every action", () => {
    const memory = new Memory();
    const { page, store } = open(text(), memory, { at: T0 });
    expect([...memory.items.keys()]).toEqual([]);
    store.start("resume", { seed: "abc12345" });
    const key = `fullmark:v1:resume:${page.hash}:attempt`;
    expect(JSON.parse(memory.getItem(key) as string).attempt.phase).toBe("answering");
    store.dispatch("resume", { type: "answer", question: "a1", answer: { choice: 1 } });
    const saved = JSON.parse(memory.getItem(key) as string);
    expect(saved.attempt.state.answers.a1).toEqual({ choice: 1 });
    expect(saved.startMs).toBe(T0);
    expect(saved.attempt.plan.seed).toBe("abc12345");
  });

  it("emits progress for every save, for the server module of step 3", () => {
    const { store } = open(text(), new Memory(), { at: T0 });
    const phases: string[] = [];
    store.events.on("progress", (e) => phases.push(e.attempt.phase));
    store.start("resume");
    store.dispatch("resume", { type: "answer", question: "a1", answer: { choice: 0 } });
    expect(phases).toEqual(["answering", "answering"]);
  });

  it("offers Continue with how far it got, and keeps the start screen until Continue", () => {
    const memory = new Memory();
    const clock = { at: T0 };
    const first = open(text(), memory, clock);
    first.store.start("resume", { seed: "abc12345" });
    first.store.dispatch("resume", { type: "answer", question: "a1", answer: { choice: 1 } });
    const plan = first.state().attempt.value.plan;
    // closed for 20 minutes; the quiz is untimed, so the time used is what was saved
    clock.at = T0 + 20 * 60_000;
    const second = open(text(), memory, clock);
    const resume = second.state().resume.value;
    expect(resume?.answered).toBe(1);
    expect(resume?.total).toBe(3);
    expect(second.state().attempt.value.phase).toBe("start");
    second.store.continueAttempt("resume");
    expect(second.state().resume.value).toBeNull();
    expect(second.state().attempt.value.phase).toBe("answering");
    expect(second.state().attempt.value.plan).toEqual(plan);
    expect(second.state().attempt.value.state.answers).toEqual({ a1: { choice: 1 } });
  });

  it("Start over discards the saved attempt and shows the part picker again", () => {
    const memory = new Memory();
    const clock = { at: T0 };
    open(text(), memory, clock).store.start("resume");
    const second = open(text(), memory, clock);
    expect(second.state().resume.value).not.toBeNull();
    second.store.startOver("resume");
    expect(second.state().resume.value).toBeNull();
    expect(attemptKeyOf(memory)).toBe("");
    expect(open(text(), memory, clock).state().resume.value).toBeNull();
  });

  it("keeps a submitted attempt, reopens on its results, and New attempt clears it", () => {
    const memory = new Memory();
    const clock = { at: T0 };
    const first = open(text(), memory, clock);
    first.store.start("resume");
    first.store.dispatch("resume", { type: "answer", question: "a1", answer: { choice: 0 } });
    first.store.submit("resume");
    const total = first.state().graded.value?.total;
    const second = open(text(), memory, clock);
    expect(second.state().attempt.value.phase).toBe("submitted");
    expect(second.state().graded.value?.total).toEqual(total);
    expect(second.state().resume.value).toBeNull();
    second.store.newAttempt("resume");
    expect(second.state().attempt.value.phase).toBe("start");
    expect(second.state().graded.value).toBeNull();
    expect(attemptKeyOf(memory)).toBe("");
  });

  it("removes what other versions of this quiz saved, and leaves other quizzes alone", () => {
    const memory = new Memory();
    memory.setItem("fullmark:v1:resume:oldhash:attempt", "{}");
    memory.setItem("fullmark:v1:resume:oldhash:look", "dark");
    memory.setItem("fullmark:v1:other:abc:attempt", "{}");
    open(text(), memory, { at: T0 });
    expect([...memory.items.keys()]).toEqual(["fullmark:v1:other:abc:attempt"]);
  });

  it("drops a saved attempt that does not parse or belongs to another version, and opens fresh", () => {
    const probe = open(text(), new Memory(), { at: T0 });
    const key = `fullmark:v1:resume:${probe.page.hash}:attempt`;
    const cases: Record<string, string> = {
      garbage: "{not json",
      "wrong shape": JSON.stringify({ v: 1, startMs: 1, attempt: { phase: "answering" } }),
      "another hash": JSON.stringify({
        v: 1,
        startMs: T0,
        attempt: { ...goodAttempt(probe.page.hash), quizHash: "f".repeat(64) },
      }),
      "an unknown question": JSON.stringify({
        v: 1,
        startMs: T0,
        attempt: { ...goodAttempt(probe.page.hash), plan: { source: "full", questions: ["nope"] } },
      }),
    };
    for (const [name, value] of Object.entries(cases)) {
      const memory = new Memory();
      memory.setItem(key, value);
      const { state } = open(text(), memory, { at: T0 });
      expect(state().resume.value, name).toBeNull();
      expect(state().attempt.value.phase, name).toBe("start");
      expect(memory.getItem(key), name).toBeNull();
    }
  });

  it("accepts a well-formed saved attempt", () => {
    const memory = new Memory();
    const probe = open(text(), memory, { at: T0 });
    memory.setItem(
      `fullmark:v1:resume:${probe.page.hash}:attempt`,
      JSON.stringify({ v: 1, startMs: T0, attempt: goodAttempt(probe.page.hash) }),
    );
    expect(open(text(), memory, { at: T0 }).state().resume.value?.total).toBe(3);
  });
});

describe("the timer", () => {
  const timed = text("time_limit: 90s");

  it("counts the wall clock, so closing the page does not pause it", () => {
    const memory = new Memory();
    const clock = { at: T0 };
    const first = open(timed, memory, clock);
    first.store.start("resume");
    clock.at = T0 + 30_000;
    first.store.tick(clock.at);
    expect(first.state().elapsed.value).toBe(30);
    // the page is closed for 40 seconds
    clock.at = T0 + 70_000;
    const second = open(timed, memory, clock);
    expect(second.state().resume.value?.used).toBe(70);
    second.store.continueAttempt("resume");
    expect(second.state().elapsed.value).toBe(70);
  });

  it("submits at the deadline with timedOut and timeUsed the limit, as of the deadline", () => {
    const { store, state } = open(timed, new Memory(), { at: T0 });
    store.start("resume");
    store.dispatch("resume", { type: "answer", question: "a1", answer: { choice: 0 } });
    store.tick(T0 + 89_000);
    expect(state().attempt.value.phase).toBe("answering");
    store.tick(T0 + 92_000);
    const { phase, state: s } = state().attempt.value;
    expect(phase).toBe("submitted");
    expect(s.timedOut).toBe(true);
    expect(s.timeUsed).toBe(90);
    expect(s.submittedAt).toBe(localIso(new Date(T0 + 90_000)));
    expect(state().graded.value).not.toBeNull();
  });

  it("submits on open when the deadline passed while the page was closed", () => {
    const memory = new Memory();
    const clock = { at: T0 };
    const first = open(timed, memory, clock);
    first.store.start("resume");
    first.store.dispatch("resume", { type: "answer", question: "a1", answer: { choice: 0 } });
    clock.at = T0 + 600_000;
    const second = open(timed, memory, clock);
    expect(second.state().attempt.value.phase).toBe("submitted");
    expect(second.state().attempt.value.state.timedOut).toBe(true);
    expect(second.state().attempt.value.state.timeUsed).toBe(90);
    expect(second.state().attempt.value.state.answers.a1).toEqual({ choice: 0 });
    expect(second.state().graded.value?.total.earned).toBe(1);
    // and it is saved as submitted
    expect(JSON.parse(memory.getItem(attemptKeyOf(memory)) as string).attempt.phase).toBe("submitted");
  });

  it("says 5 minutes left and 1 minute left once each, and never at every second", () => {
    const { store, state } = open(text("time_limit: 6m"), new Memory(), { at: T0 });
    store.start("resume");
    const said: string[] = [state().said.value];
    for (let s = 1; s <= 359; s++) {
      store.tick(T0 + s * 1000);
      if (state().said.value !== said.at(-1)) said.push(state().said.value);
    }
    expect(said).toEqual(["", "5 minutes left", "1 minute left"]);
  });

  it("does not announce what the clock has already passed when the attempt is continued", () => {
    const memory = new Memory();
    const clock = { at: T0 };
    const first = open(text("time_limit: 6m"), memory, clock);
    first.store.start("resume");
    clock.at = T0 + 330_000;
    const second = open(text("time_limit: 6m"), memory, clock);
    second.store.continueAttempt("resume");
    expect(second.state().said.value).toBe("");
    second.store.tick(T0 + 331_000);
    expect(second.state().said.value).toBe("");
  });

  it("untimed: counts the seconds of the clock, and saves every 5 of them", () => {
    const memory = new Memory();
    const { store, state } = open(text(), memory, { at: T0 });
    store.start("resume");
    store.tick(T0 + 4000);
    expect(JSON.parse(memory.getItem(attemptKeyOf(memory)) as string).attempt.state.timeUsed).toBe(0);
    store.tick(T0 + 6000);
    expect(JSON.parse(memory.getItem(attemptKeyOf(memory)) as string).attempt.state.timeUsed).toBe(6);
    expect(state().elapsed.value).toBe(6);
  });

  it("counts seconds to the section of the question last answered or focused, the first at the start", () => {
    const { store, state } = open(text(), new Memory(), { at: T0 });
    store.start("resume");
    store.tick(T0 + 10_000);
    store.focus("resume", "b1");
    store.tick(T0 + 25_000);
    store.dispatch("resume", { type: "answer", question: "a1", answer: { choice: 0 } });
    store.tick(T0 + 30_000);
    store.submit("resume");
    expect(state().attempt.value.state.sectionTime).toEqual({ a: 15, b: 15 });
    expect(state().attempt.value.state.timeUsed).toBe(30);
  });

  it("calls the section of an untitled quiz the empty string", () => {
    const flat = ["---", "title: Flat", "id: resume", "---", "", mcq("x1")].join("\n");
    const { store, state } = open(flat, new Memory(), { at: T0 });
    store.start("resume");
    store.tick(T0 + 7000);
    store.submit("resume");
    expect(state().attempt.value.state.sectionTime).toEqual({ "": 7 });
  });
});

describe("storage that is blocked", () => {
  const blockedOn = (find: () => Storage | null | undefined) => {
    const page = pageOf(text());
    const store = createStore({ version: 1, quizzes: [page] }, { storage: find, now: () => T0 });
    store.restore();
    return { store, state: () => store.quizzes.get("resume") as QuizState };
  };

  it("says so when access throws, and the page still answers, submits and exports", () => {
    const { store, state } = blockedOn(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(state().blocked.value).toBe(true);
    store.start("resume");
    store.dispatch("resume", { type: "answer", question: "a1", answer: { choice: 0 } });
    store.submit("resume");
    expect(state().attempt.value.phase).toBe("submitted");
    expect(state().graded.value?.total.earned).toBe(1);
  });

  it("says so when there is no storage, and when a write throws", () => {
    expect(blockedOn(() => undefined).state().blocked.value).toBe(true);
    const full = new Memory();
    full.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
    expect(blockedOn(() => full as unknown as Storage).state().blocked.value).toBe(true);
  });

  it("is quiet when storage works", () => {
    expect(blockedOn(() => new Memory() as unknown as Storage).state().blocked.value).toBe(false);
  });
});
