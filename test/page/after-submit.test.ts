import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { pageQuizOf } from "../../src/build/page";
import { grade } from "../../src/core/grade";
import { planFor } from "../../src/core/plan";
import { ResultsCard } from "../../src/page/ResultsCard";
import { limitOf, missedIds } from "../../src/page/results";
import { createStore } from "../../src/page/store";
import { build, setup } from "../helpers/page";

const SCORED = [
  "---",
  "title: Scored",
  "id: scored",
  "pass_mark: 60",
  "time_limit: 30m",
  "---",
  "",
  "# Part A {id=a}",
  "",
  ...["a1", "a2", "a3"].map((id) => `## Q ${id}? {type=single id=${id} points=2}\n\n- [x] right\n- [ ] wrong\n`),
  "# Part B {id=b}",
  "",
  "## Q b1? {type=multi id=b1 points=3 partial=true}\n\n- [x] one\n- [x] two\n- [ ] three\n",
  "## Explain. {type=essay id=e1 points=4}\n\n```answer\nmin_words: 1\nrubric:\n  mode: additive\n  criteria:\n    - Names it (4 pts)\n```\n",
].join("\n");

const answer = (s: ReturnType<typeof setup>, question: string, a: Record<string, unknown>) =>
  s.store.dispatch(s.id, { type: "answer", question, answer: a });

function takeScored() {
  const s = setup(SCORED);
  s.store.start(s.id, { seed: "seed0001" });
  answer(s, "a1", { choice: 0 }); // right
  answer(s, "a2", { choice: 1 }); // wrong
  // a3 left
  answer(s, "b1", { choices: [0] }); // partly right
  answer(s, "e1", { text: "an answer" }); // waits for a grader
  s.store.dispatch(s.id, { type: "flag", question: "a2" });
  s.store.dispatch(s.id, { type: "flag", question: "b1" });
  s.store.submit(s.id);
  return s;
}

const gradedOf = (s: ReturnType<typeof setup>) => {
  const graded = s.state().graded.value;
  if (graded === null) throw new Error("not graded");
  return graded;
};

const memoryStorage = () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
    key: (i: number) => [...memory.keys()][i] ?? null,
    get length() {
      return memory.size;
    },
  } as unknown as Storage;
  return { memory, storage };
};

describe("the results card", () => {
  it("shows the numbers core's grade gives, never its own", () => {
    const s = takeScored();
    const graded = gradedOf(s);
    const html = s.html();
    expect(html).toContain(`data-earned="${graded.total.earned}"`);
    expect(html).toContain(`data-points="${graded.total.points}"`);
    for (const part of graded.sections) {
      expect(html).toContain(`data-part="${part.id}" data-earned="${part.earned}" data-points="${part.points}"`);
    }
    expect(html).toContain("Part A");
    expect(html).toContain("Part B");
  });

  it("marks the score and the part with an asterisk while an essay waits", () => {
    const html = takeScored().html();
    expect(html).toContain('data-pending-note="1"');
    expect(html).toContain("* 1 answer waits for a grader; the score covers the rest.");
    expect(html).toMatch(/<i>\d+%\*<\/i>/);
    expect(html).toMatch(/<i>[\d.]+ \/ [\d.]+ \+ 4\*<\/i>/);
    expect(html).toContain("not reached yet*");
  });

  it("has no asterisk once the essay is graded (ManualScores passed in)", () => {
    const s = takeScored();
    const state = s.state();
    const key = state.key.value;
    if (key === null) throw new Error("no key");
    const graded = grade(key.quiz, state.attempt.value, { e1: 4 });
    const html = renderToString(
      h(ResultsCard, {
        page: state.page,
        state,
        graded,
        onDownload: () => {},
        onNew: () => {},
        onRetry: () => {},
      }),
    );
    expect(html).not.toContain("*");
    expect(html).not.toContain("data-pending-note");
    expect(html).toContain(`data-earned="${graded.total.earned}"`);
    expect(html).toContain("Goal 60% · ↗ not reached yet</p>");
  });

  it("says time used against the limit with a bar", () => {
    const html = takeScored().html();
    expect(html).toMatch(/\d+:\d\d \/ 30:00/);
    expect(html).toContain("<progress");
  });

  it("shows time used alone, with no bar, when the quiz is untimed", () => {
    const s = setup(SCORED.replace("time_limit: 30m\n", ""));
    s.store.start(s.id, { seed: "seed0001" });
    s.store.submit(s.id);
    expect(s.html()).not.toContain("<progress");
  });

  it("gives every question one of the five states, as an icon, a word and points", () => {
    const html = takeScored().html();
    for (const word of ["Correct", "Wrong", "Not answered", "Partly right", "Waiting for a grader"]) {
      expect(html, word).toContain(`<strong>${word}</strong>`);
    }
    expect(html).toContain('<span class="fm-icon" aria-hidden="true">✓</span>');
  });
});

describe("missed questions", () => {
  it("are wrong, partly right or unanswered, in the plan's order; a pending essay is not missed", () => {
    expect(missedIds(gradedOf(takeScored()))).toEqual(["a2", "a3", "b1"]);
  });
});

describe("the review filter and the flag", () => {
  it("counts All, Missed and Flagged, and hides cards without moving them", () => {
    const s = takeScored();
    let html = s.html();
    expect(html).toMatch(/data-filter="all"[^>]*>All <span class="fm-filter-count">5</);
    expect(html).toMatch(/data-filter="missed"[^>]*>Missed <span class="fm-filter-count">3</);
    expect(html).toMatch(/data-filter="flagged"[^>]*>Flagged <span class="fm-filter-count">2</);
    const order = [...html.matchAll(/data-qid="(\w+)"/g)].map((m) => m[1]);
    s.state().filter.value = "flagged";
    html = s.html();
    expect([...html.matchAll(/data-qid="(\w+)"/g)].map((m) => m[1])).toEqual(order);
    const hidden = [...html.matchAll(/<article[^>]*hidden[^>]*data-qid="(\w+)"/g)].map((m) => m[1]);
    expect(hidden.sort()).toEqual(["a1", "a3", "e1"]);
  });

  it("toggles a flag while answering and not after Submit", () => {
    const s = setup(SCORED);
    s.store.start(s.id, { seed: "x1" });
    s.store.dispatch(s.id, { type: "flag", question: "a1" });
    expect(s.state().attempt.value.state.flagged).toEqual(["a1"]);
    s.store.dispatch(s.id, { type: "flag", question: "a1" });
    expect(s.state().attempt.value.state.flagged).toEqual([]);
    s.store.dispatch(s.id, { type: "flag", question: "a1" });
    s.store.submit(s.id);
    s.store.dispatch(s.id, { type: "flag", question: "a1" });
    expect(s.state().attempt.value.state.flagged).toEqual(["a1"]);
  });

  it("shows a toggle button while answering and a mark after Submit", () => {
    const s = setup(SCORED);
    s.store.start(s.id, { seed: "x1" });
    expect(s.html()).toContain('aria-pressed="false"');
    s.store.dispatch(s.id, { type: "flag", question: "a1" });
    s.store.submit(s.id);
    const html = s.html();
    expect(html).toContain("data-flag-mark");
    expect(html).not.toContain('data-action="flag"');
  });
});

describe("Retry missed", () => {
  it("plans only the missed questions, with a fresh seed, and no time limit", () => {
    const s = takeScored();
    const first = s.state().attempt.value.plan.seed;
    s.store.retry(s.id, "retry001");
    const attempt = s.state().attempt.value;
    expect(attempt.phase).toBe("answering");
    expect(attempt.plan.source).toBe("retry");
    expect(attempt.plan.questions).toEqual(["a2", "a3", "b1"]);
    expect(attempt.plan.seed).toBe("retry001");
    expect(attempt.plan.seed).not.toBe(first);
    expect(attempt.state.answers).toEqual({});
    expect(attempt.state.flagged).toEqual([]);
    expect(limitOf(s.state().page, attempt)).toBeUndefined();
    expect(s.html()).toContain("Time <b>00:00</b>");
    expect(s.html()).not.toContain("Time left");
  });

  it("is the same plan for the same seed, and a fresh seed otherwise", () => {
    const plan = (seed?: string) => {
      const s = takeScored();
      s.store.retry(s.id, seed);
      return s.state().attempt.value.plan;
    };
    expect(plan("same0001")).toEqual(plan("same0001"));
    expect(plan().seed).toMatch(/^[a-z0-9]{8}$/);
    expect(plan().seed).not.toBe(plan().seed);
  });

  it("does not stop at the original time limit, and can itself be retried", () => {
    const s = takeScored();
    s.store.retry(s.id, "retry001");
    s.store.tick(Date.now() + 5 * 3600_000);
    expect(s.state().attempt.value.phase).toBe("answering");
    answer(s, "a2", { choice: 0 });
    s.store.submit(s.id);
    const graded = gradedOf(s);
    expect(graded.questions.map((q) => q.id)).toEqual(["a2", "a3", "b1"]);
    expect(graded.total.points).toBe(2 + 2 + 3);
    s.store.retry(s.id, "retry002");
    expect(s.state().attempt.value.plan.questions).toEqual(["a3", "b1"]);
  });

  it("has no button when nothing is missed, and says so", () => {
    const s = setup(SCORED);
    s.store.start(s.id, { seed: "x1" });
    for (const id of ["a1", "a2", "a3"]) answer(s, id, { choice: 0 });
    answer(s, "b1", { choices: [0, 1] });
    answer(s, "e1", { text: "waiting for a grader is not missed" });
    s.store.submit(s.id);
    const html = s.html();
    expect(html).not.toContain('data-action="retry-missed"');
    expect(html).toContain("Nothing missed");
    s.store.retry(s.id);
    expect(s.state().attempt.value.phase).toBe("submitted");
  });

  it("replaces the one saved attempt, and resumes as an untimed retry", () => {
    const { memory, storage } = memoryStorage();
    const page = pageQuizOf(build(SCORED));
    const store = createStore({ version: 1, quizzes: [page] }, { storage: () => storage });
    store.start("scored", { seed: "x1" });
    store.submit("scored");
    store.retry("scored", "retry001");
    const saved = [...memory.entries()].filter(([k]) => k.endsWith(":attempt"));
    expect(saved).toHaveLength(1);
    expect(JSON.parse(saved[0]?.[1] ?? "").attempt.plan.source).toBe("retry");
    const again = createStore({ version: 1, quizzes: [page] }, { storage: () => storage });
    again.restore();
    expect(again.quizzes.get("scored")?.resume.value?.attempt.plan.source).toBe("retry");
  });
});

describe("planFor, retry", () => {
  const built = build(SCORED);
  it("keeps the order given and is the same plan for the same seed", () => {
    const request = { source: "retry" as const, questions: ["b1", "a3"], seed: "abc", quizHash: built.hash };
    const plan = planFor(built.quiz, request);
    expect(plan.source).toBe("retry");
    expect(plan.questions).toEqual(["b1", "a3"]);
    expect(planFor(built.quiz, request)).toEqual(plan);
  });
  it("refuses a question the quiz does not have", () => {
    expect(() =>
      planFor(built.quiz, { source: "retry", questions: ["nope"], seed: "abc", quizHash: built.hash }),
    ).toThrow(/unknown questions to retry: nope/);
  });
});

const INSTANT = SCORED.replace("pass_mark: 60", "pass_mark: 60\nfeedback: instant");

describe("instant feedback", () => {
  it("offers Check on auto-graded questions only, disabled until answered", () => {
    const s = setup(INSTANT);
    s.store.start(s.id, { seed: "x1" });
    expect(s.html().match(/data-action="check"/g)).toHaveLength(4);
    expect(s.html().match(/data-action="check" disabled/g)).toHaveLength(4);
    answer(s, "a1", { choice: 1 });
    expect(s.html().match(/data-action="check" disabled/g)).toHaveLength(3);
  });

  it("has no Check with feedback: end", () => {
    const s = setup(SCORED);
    s.store.start(s.id, { seed: "x1" });
    expect(s.html()).not.toContain('data-action="check"');
  });

  it("checks one question with core's grade, locks it, and records it", () => {
    const s = setup(INSTANT);
    s.store.start(s.id, { seed: "x1" });
    answer(s, "a1", { choice: 1 });
    s.store.check(s.id, "a1");
    expect(s.state().attempt.value.state.checked).toEqual(["a1"]);
    expect(s.state().checks.value.a1?.status).toBe("incorrect");
    expect(s.state().said.value).toBe("Question 1: Wrong");
    answer(s, "a1", { choice: 0 });
    expect(s.state().attempt.value.state.answers.a1).toEqual({ choice: 1 });
    const html = s.html();
    expect(html).toContain('data-checked="true"');
    expect(html.match(/class="fm-result"/g)).toHaveLength(1);
    expect(html).toContain('data-correct="true"');
    s.store.check(s.id, "a1");
    expect(s.state().attempt.value.state.checked).toEqual(["a1"]);
  });

  it("does not check an unanswered question", () => {
    const s = setup(INSTANT);
    s.store.start(s.id, { seed: "x1" });
    s.store.check(s.id, "a1");
    expect(s.state().attempt.value.state.checked).toEqual([]);
    expect(s.html()).not.toContain("data-correct");
  });

  it("keeps a checked question locked after a resume, and Submit grades unchecked answers too", () => {
    const { storage } = memoryStorage();
    const page = pageQuizOf(build(INSTANT));
    const first = createStore({ version: 1, quizzes: [page] }, { storage: () => storage });
    first.start("scored", { seed: "x1" });
    first.dispatch("scored", { type: "answer", question: "a1", answer: { choice: 0 } });
    first.dispatch("scored", { type: "answer", question: "a2", answer: { choice: 0 } });
    first.check("scored", "a1");
    const second = createStore({ version: 1, quizzes: [page] }, { storage: () => storage });
    second.restore();
    second.continueAttempt("scored");
    const state = second.quizzes.get("scored");
    expect(state?.attempt.value.state.checked).toEqual(["a1"]);
    expect(state?.checks.value.a1?.status).toBe("correct");
    second.submit("scored");
    const graded = state?.graded.value;
    expect(graded?.questions.find((q) => q.id === "a1")?.status).toBe("correct");
    expect(graded?.questions.find((q) => q.id === "a2")?.status).toBe("correct");
    expect(graded?.total.earned).toBe(4);
  });
});
