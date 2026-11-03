import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { pageQuizOf } from "../../src/build/page";
import { quizHash } from "../../src/core/hash";
import type { Quiz } from "../../src/core/ir";
import { parse } from "../../src/core/parse";
import { App } from "../../src/page/App";
import type { PageData } from "../../src/page/data";
import { messagesFor } from "../../src/page/questions/shared";
import { SubmitDialog } from "../../src/page/SubmitDialog";
import { createStore, type Deps, localIso, type QuizState } from "../../src/page/store";

/**
 * The page when `quiz serve` serves it (TECHNICAL_DESIGN.md, foundation 9): `served`, `section` and `autosave` in its
 * data, and the `sent` and `send-failed` events the server module emits on the attach point.
 */
const mcq = (id: string) => `## Question ${id}? {type=single id=${id}}\n\n- [x] right ${id}\n- [ ] wrong ${id}\n`;
const source = [
  "---",
  "title: Served",
  "id: served",
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
const parsed = parse(source, "q.md");
const quiz = parsed.quiz as Quiz;
const hash = quizHash(source, []);
const page = () => pageOf();
function pageOf() {
  return pageQuizOf({ quiz, hash, assets: [] });
}

const open = (extra: Partial<PageData> = {}, deps: Deps = {}) => {
  const store = createStore({ version: 1, quizzes: [page()], ...extra }, deps);
  return { store, state: () => store.quizzes.get("served") as QuizState };
};

describe("a served page", () => {
  it("says so in the store, and a built page does not", () => {
    expect(open({ served: true }).store.served).toBe(true);
    expect(open().store.served).toBe(false);
  });

  it("adds a line to the Submit dialog, in the page's language, and a built page's dialog has none", () => {
    const render = (extra: Partial<PageData>) => {
      const { store, state } = open(extra);
      store.start("served", { seed: "abc12345" });
      return renderToString(
        h(SubmitDialog, { t: messagesFor(state().page), state: state(), store, onClose() {}, onSubmit() {} }),
      );
    };
    expect(render({ served: true })).toContain("Your answers will be sent to fullmark.");
    expect(render({})).not.toContain("sent to fullmark");
  });

  it("shows Sent in place of Download results once the module says so, and keeps the button when it could not", () => {
    const { store, state } = open({ served: true });
    store.start("served", { seed: "abc12345" });
    store.submit("served");
    const shown = () => renderToString(h(App, { store }));
    expect(state().delivery.value).toBe("waiting");
    expect(shown()).toContain("Download results");
    expect(shown()).not.toContain("data-sent");
    store.events.emit("sent", { quizId: "served" });
    expect(state().delivery.value).toBe("sent");
    expect(shown()).toContain("data-sent");
    expect(shown()).not.toContain("Download results");
    // the live region is there before and after, and Sent is not a button
    expect(shown()).toContain('aria-live="polite"');
    expect(shown()).not.toMatch(/<button[^>]*>[^<]*(<[^>]*>)*Sent/);
  });

  it("keeps Download results and says it could not save when the server did not take the submit", () => {
    const { store, state } = open({ served: true });
    store.start("served", { seed: "abc12345" });
    store.submit("served");
    store.events.emit("send-failed", { quizId: "served" });
    expect(state().delivery.value).toBe("failed");
    const html = renderToString(h(App, { store }));
    expect(html).toContain("Download results");
    expect(html).toContain("Could not save the results. Use Download results to keep them.");
    expect(html).toContain('role="alert"');
  });

  it("ignores the two events before Submit, and another quiz's", () => {
    const { store, state } = open({ served: true });
    store.events.emit("sent", {});
    expect(state().delivery.value).toBe("waiting");
    store.start("served", { seed: "abc12345" });
    store.submit("served");
    store.events.emit("sent", { quizId: "other" });
    expect(state().delivery.value).toBe("waiting");
  });

  it("starts waiting again for a new attempt", () => {
    const { store, state } = open({ served: true });
    store.start("served", { seed: "abc12345" });
    store.submit("served");
    store.events.emit("sent", {});
    store.newAttempt("served");
    expect(state().delivery.value).toBe("waiting");
  });
});

describe("--section", () => {
  it("offers that part alone: no picker, and Start plans it as a section", () => {
    const only = { ...page(), sections: page().sections.filter((s) => s.id === "b") };
    const store = createStore({ version: 1, quizzes: [only], served: true, section: "b" });
    const html = renderToString(h(App, { store }));
    expect(html).not.toContain("fm-parts");
    expect(html).toContain('data-action="start"');
    store.start("served");
    const plan = store.quizzes.get("served")?.attempt.value.plan;
    expect(plan).toMatchObject({ source: "section", section: "b", questions: ["b1"] });
  });

  it("a built page with parts still has its picker", () => {
    const html = renderToString(h(App, { store: open().store }));
    expect(html).toContain("fm-parts");
  });
});

describe("--focus", () => {
  it("ticks the Focus mode box", () => {
    expect(open({ focus: true }).store.screen.wanted.value).toBe(true);
    expect(open().store.screen.wanted.value).toBe(false);
  });
});

describe("--autosave", () => {
  const T0 = Date.UTC(2026, 10, 3, 3, 0, 0);
  const savedAttempt = (extra: Record<string, unknown> = {}) => ({
    v: 1 as const,
    startMs: null,
    attempt: {
      quizHash: hash,
      phase: "answering" as const,
      plan: { source: "full" as const, questions: ["a1", "a2", "b1"], seed: "abc12345" },
      state: {
        answers: { a1: { choice: 1 } },
        startedAt: localIso(new Date(T0)),
        submittedAt: null,
        timeUsed: 30,
        sectionTime: {},
        flagged: [],
        checked: [],
        timedOut: false,
      },
      ...extra,
    },
  });

  it("offers the file's attempt as Continue, and Continue picks it up with its answers", () => {
    const { store, state } = open({ served: true, autosave: true, saved: savedAttempt() }, { now: () => T0 + 60_000 });
    store.restore();
    expect(state().resume.value).toMatchObject({ answered: 1, total: 3 });
    expect(state().attempt.value.phase).toBe("start");
    store.continueAttempt("served");
    expect(state().attempt.value.state.answers.a1).toEqual({ choice: 1 });
    // the clock counts from the start time the file's zoneless stamp gives
    expect(state().startedAt).toBe(new Date(localIso(new Date(T0))).getTime());
  });

  it("uses no browser storage: nothing is read, nothing is written", () => {
    const touched: string[] = [];
    const storage = new Proxy({} as Storage, {
      get: (_t, name) => {
        touched.push(String(name));
        return () => null;
      },
    });
    const { store } = open({ served: true, autosave: true }, { storage: () => storage });
    store.restore();
    store.start("served", { seed: "abc12345" });
    store.dispatch("served", { type: "answer", question: "a1", answer: { choice: 0 } });
    expect(touched).toEqual([]);
  });

  it("emits progress for each save, which is what the module posts", () => {
    const { store } = open({ served: true, autosave: true });
    const phases: string[] = [];
    store.events.on("progress", (e) => phases.push(e.attempt.phase));
    store.start("served", { seed: "abc12345" });
    store.dispatch("served", { type: "answer", question: "a1", answer: { choice: 0 } });
    expect(phases).toEqual(["answering", "answering"]);
  });

  it("starts fresh when the file's attempt does not fit the page", () => {
    const bad = savedAttempt({ quizHash: "f".repeat(64) });
    const { store, state } = open({ served: true, autosave: true, saved: bad });
    store.restore();
    expect(state().resume.value).toBeNull();
  });

  it("states that the attempt is kept in a file, not in the browser", () => {
    const html = renderToString(h(App, { store: open({ served: true, autosave: true }).store }));
    expect(html).toContain("In a file on this computer");
    expect(renderToString(h(App, { store: open().store }))).toContain("In this browser");
  });
});
