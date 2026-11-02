import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { pageQuizOf } from "../../src/build/page";
import type { Attempt, resultsOf } from "../../src/core/attempt";
import { quizHash } from "../../src/core/hash";
import type { Quiz } from "../../src/core/ir";
import { parse } from "../../src/core/parse";
import { App } from "../../src/page/App";
import type { PageData } from "../../src/page/data";
import { createStore, exportFor, type QuizState, type Store } from "../../src/page/store";

const SOURCE = [
  "---",
  "title: Replay",
  "id: rp",
  "pass_mark: 60",
  "---",
  "",
  "## Pick the prime. {type=single id=prime}",
  "",
  "- [ ] 4",
  "- [x] 7",
  "- [ ] 9",
  "",
  "::: explanation",
  "Seven has no divisors but one and itself.",
  ":::",
  "",
  "## Capital of France? {type=short id=capital}",
  "",
  "```answer",
  'accept: ["Paris"]',
  "```",
  "",
  "## Order these. {type=ordering id=order}",
  "",
  "1. one",
  "2. two",
  "3. three",
  "",
].join("\n");

const quiz = (): { quiz: Quiz; hash: string } => {
  const parsed = parse(SOURCE, "q.md");
  expect(parsed.issues.filter((i) => i.level === "error")).toEqual([]);
  return { quiz: parsed.quiz as Quiz, hash: quizHash(SOURCE, []) };
};

/** A `Storage` in memory. */
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

const dataOf = (replay?: { results: string; name: string; grades: { at: string | null } | null }): PageData => {
  const q = quiz();
  const page = pageQuizOf({ ...q, assets: [] });
  return { version: 1, quizzes: [{ ...page, ...(replay ? { replay } : {}) }] };
};
const stateOf = (store: Store): QuizState => store.quizzes.get("rp") as QuizState;
const html = (store: Store): string => renderToString(h(App, { store }));

/** What a learner's page shows after Submit: a live attempt answered and submitted, and the file it exports. */
function live(memory = new Memory()) {
  const store = createStore(dataOf(), {
    storage: () => memory as unknown as Storage,
    now: () => Date.UTC(2026, 9, 20, 3, 0, 0),
  });
  store.restore();
  store.start("rp", { seed: "seed1234" });
  const state = stateOf(store);
  const order = state.attempt.value.plan.questions;
  const wrong = { choice: 0 };
  store.dispatch("rp", { type: "answer", question: "prime", answer: wrong });
  store.dispatch("rp", { type: "answer", question: "capital", answer: { text: "paris" } });
  store.dispatch("rp", { type: "flag", question: "prime" });
  expect(order).toContain("order");
  store.submit("rp", new Date(Date.UTC(2026, 9, 20, 3, 5, 0)));
  return { store, state, memory, file: exportFor(state, new Date(Date.UTC(2026, 9, 20, 3, 5, 1))) };
}

const replayOf = (text: string, grades: { at: string | null } | null = null) => {
  const store = createStore(dataOf({ results: text, name: "rp-results.json", grades }), {
    storage: () => memoryFor.value as unknown as Storage,
  });
  return store;
};
const memoryFor = { value: new Memory() };

describe("a replay page", () => {
  it("opens submitted with the learner's answers, the score and the review the live page showed", () => {
    const l = live();
    memoryFor.value = new Memory();
    const store = replayOf(l.file.text);
    store.restore();
    const state = stateOf(store);
    expect(state.attempt.value.phase).toBe("submitted");
    expect(state.attempt.value.state.answers).toEqual(l.state.attempt.value.state.answers);
    expect(state.graded.value).toEqual(l.state.graded.value);
    expect(state.attempt.value.plan).toEqual(l.state.attempt.value.plan);
    const cards = (page: string) => page.slice(page.indexOf('class="fm-questions"'));
    expect(cards(html(store))).toBe(cards(html(l.store)));
    expect(html(store)).toContain("data-results");
    expect(html(store)).not.toContain('data-action="start"');
    expect(html(store)).not.toContain('data-action="submit"');
    expect(html(store)).not.toContain('data-action="new-attempt"');
    expect(html(store)).toContain('data-action="export"');
  });

  it("the score, points and filter counts are the live page's", () => {
    const l = live();
    memoryFor.value = new Memory();
    const store = replayOf(l.file.text);
    const pick = (page: string) => [
      /data-earned="[^"]*" data-points="[^"]*" data-pending="[^"]*"/.exec(page)?.[0],
      /data-cell="points"[^]*?<\/dd>/.exec(page)?.[0],
      [...page.matchAll(/data-filter="(\w+)"[^]*?fm-filter-count">(\d+)</g)].map((m) => `${m[1]}${m[2]}`),
    ];
    expect(pick(html(store))).toEqual(pick(html(l.store)));
  });

  it("the status line says it is a replay, and the banner names the attempt, the version and the grades", () => {
    const l = live();
    memoryFor.value = new Memory();
    const page = html(replayOf(l.file.text));
    expect(page).toContain("Replay of the attempt submitted 20 Oct, ");
    const banner = /<div class="fm-replay-banner"[^]*?<\/div>/.exec(page)?.[0] ?? "";
    expect(banner.replaceAll(/<[^>]+>/g, "")).toBe(
      `ReplayAttempt of 20 Oct 2026 · version ${quiz().hash.slice(0, 4)} · grades pending`,
    );
    const graded = html(replayOf(l.file.text, { at: "2026-10-21T09:00:00+07:00" }));
    expect(graded).toContain("grades from the report of 21 Oct");
    expect(graded).not.toContain("grades pending");
  });

  it("says the same in Vietnamese", () => {
    const l = live();
    memoryFor.value = new Memory();
    const data = dataOf({ results: l.file.text, name: "x.json", grades: null });
    const store = createStore({
      version: 1,
      quizzes: [{ ...(data.quizzes[0] as PageData["quizzes"][0]), uiLang: "vi" }],
    });
    const text = html(store).replaceAll(/<[^>]+>/g, "");
    expect(text).toContain("Xem lại lần làm bài đã nộp 20 ");
    expect(text).toContain("Lần làm bài ngày 20 ");
    expect(text).toContain("chưa có điểm chấm");
  });

  it("is never autosaved, and leaves the built page's saved attempt alone", () => {
    const l = live();
    const before = [...l.memory.items.entries()];
    expect(before.some(([k]) => k.endsWith(":attempt"))).toBe(true);
    memoryFor.value = l.memory;
    const store = replayOf(l.file.text);
    store.restore();
    store.dispatch("rp", { type: "answer", question: "prime", answer: { choice: 1 } });
    store.dispatch("rp", { type: "flag", question: "capital" });
    store.tick(Date.UTC(2026, 9, 25));
    store.sidebar("rp", true);
    const after = [...l.memory.items.entries()].filter(([k]) => !k.endsWith(":sidebar"));
    expect(after).toEqual(before.filter(([k]) => !k.endsWith(":sidebar")));
  });

  it("Download results gives back the results file byte for byte, also when it is not what the page writes", () => {
    const l = live();
    const odd = `﻿${JSON.stringify(JSON.parse(l.file.text))}\r\n`;
    memoryFor.value = new Memory();
    const store = replayOf(odd);
    expect(exportFor(stateOf(store), new Date())).toEqual({ name: "rp-results.json", text: odd });
  });

  it("Retry missed starts a fresh attempt saved under :replay:, never over the built page's", () => {
    const l = live();
    const builtKey = [...l.memory.items.keys()].find((k) => k.endsWith(":attempt")) as string;
    const builtValue = l.memory.items.get(builtKey);
    memoryFor.value = l.memory;
    const store = replayOf(l.file.text);
    store.restore();
    store.retry("rp", "retry123");
    const state = stateOf(store);
    expect(state.attempt.value.phase).toBe("answering");
    expect(state.attempt.value.plan.source).toBe("retry");
    expect(state.replay.value).toBeNull();
    store.dispatch("rp", {
      type: "answer",
      question: state.attempt.value.plan.questions[0] as string,
      answer: { choice: 1 },
    });
    const keys = [...l.memory.items.keys()].filter((k) => k.includes(":replay:"));
    expect(keys).toEqual([builtKey.replace(":attempt", ":replay:attempt")]);
    expect(l.memory.items.get(builtKey)).toBe(builtValue);
    // after Submit the new attempt is what Download gives
    store.submit("rp", new Date(Date.UTC(2026, 9, 21, 3, 0, 0)));
    const out = exportFor(state, new Date(Date.UTC(2026, 9, 21, 3, 0, 1)));
    expect(out.name).toMatch(/^rp-results-\d{8}-\d{6}\.json$/);
    const file = JSON.parse(out.text) as ReturnType<typeof resultsOf>;
    expect(file.plan.source).toBe("retry");
    expect(file.phase).toBe("submitted");
  });

  it("the built page does not clean away a replay page's key, nor does a replay touch the built page's", () => {
    const l = live();
    memoryFor.value = l.memory;
    const store = replayOf(l.file.text);
    store.restore();
    store.retry("rp", "retry123");
    store.dispatch("rp", {
      type: "answer",
      question: stateOf(store).attempt.value.plan.questions[0] as string,
      answer: { choice: 1 },
    });
    const before = [...l.memory.items.keys()].sort();
    const built = createStore(dataOf(), { storage: () => l.memory as unknown as Storage });
    built.restore();
    expect([...l.memory.items.keys()].sort()).toEqual(before);
  });

  it("a replay never starts the clock", () => {
    const l = live();
    memoryFor.value = new Memory();
    const store = replayOf(l.file.text);
    store.restore();
    store.tick(Date.UTC(2026, 9, 25));
    const state = stateOf(store);
    expect(state.attempt.value.state.timeUsed).toBe(l.state.attempt.value.state.timeUsed);
    expect(state.attempt.value as Attempt).toMatchObject({ phase: "submitted" });
  });
});
