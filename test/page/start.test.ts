import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { pageQuizOf } from "../../src/build/page";
import { quizHash } from "../../src/core/hash";
import type { Quiz } from "../../src/core/ir";
import { parse } from "../../src/core/parse";
import { planFor } from "../../src/core/plan";
import { App } from "../../src/page/App";
import { shownEntries } from "../../src/page/questions/shared";
import { drawSeed } from "../../src/page/seed";
import { createStore } from "../../src/page/store";

function build(text: string) {
  const result = parse(text, "q.md");
  expect(result.issues).toEqual([]);
  return { quiz: result.quiz as Quiz, hash: quizHash(text, []), assets: [] };
}

const mcq = (id: string, n = 3) =>
  `## Question ${id}? {type=single id=${id}}\n\n${Array.from({ length: n }, (_, i) => `- [${i === 0 ? "x" : " "}] choice ${id}${i}`).join("\n")}\n`;

const BANK = [
  "---",
  "title: Banks",
  "id: banks",
  "---",
  "",
  "# Part A {id=a pick=2 time=10m}",
  "",
  ...["a1", "a2", "a3", "a4"].map((id) => mcq(id)),
  "# Part B {id=b}",
  "",
  ...["b1", "b2"].map((id) => mcq(id)),
].join("\n");

const PLAIN = ["---", "title: Plain", "id: plain", "---", "", ...["p1", "p2", "p3"].map((id) => mcq(id))].join("\n");

const stores = (text: string, options: Parameters<typeof createStore>[1] = {}) => {
  const page = pageQuizOf(build(text));
  const store = createStore({ version: 1, quizzes: [page] }, options);
  return {
    page,
    store,
    state: () => store.quizzes.values().next().value as NonNullable<ReturnType<typeof store.quizzes.get>>,
  };
};

describe("drawSeed", () => {
  it("is 8 characters from a-z0-9, from random bytes", () => {
    expect(drawSeed(() => Uint8Array.from({ length: 16 }, (_, i) => i))).toBe("abcdefgh");
    expect(drawSeed()).toMatch(/^[a-z0-9]{8}$/);
  });

  it("skips the bytes that would favour some characters", () => {
    const bytes = [255, 254, 253, 252, ...Array.from({ length: 12 }, () => 35)];
    expect(drawSeed(() => Uint8Array.from(bytes))).toBe("99999999");
  });

  it("differs from one draw to the next", () => {
    const seeds = new Set(Array.from({ length: 20 }, () => drawSeed()));
    expect(seeds.size).toBe(20);
  });
});

describe("the plan the page makes at Start", () => {
  it("draws a new seed at every Start, and records it in the plan", () => {
    const seeds = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const { store, state } = stores(PLAIN);
      store.start("plain");
      const seed = state().attempt.value.plan.seed;
      expect(seed).toMatch(/^[a-z0-9]{8}$/);
      seeds.add(seed as string);
    }
    expect(seeds.size).toBe(8);
  });

  it("is the same plan for the same seed, and is the plan core makes", () => {
    const a = stores(BANK);
    const b = stores(BANK);
    a.store.start("banks", { seed: "seed0001" });
    b.store.start("banks", { seed: "seed0001" });
    expect(a.state().attempt.value.plan).toEqual(b.state().attempt.value.plan);
    const built = build(BANK);
    expect(a.state().attempt.value.plan).toEqual(
      planFor(built.quiz, { source: "bank", seed: "seed0001", quizHash: built.hash }),
    );
  });

  it("is a bank draw for the whole quiz when a section has pick, else a full plan", () => {
    const bank = stores(BANK);
    bank.store.start("banks", { seed: "seed0001" });
    const plan = bank.state().attempt.value.plan;
    expect(plan.source).toBe("bank");
    // Part A draws 2 of its 4, Part B keeps both
    expect(plan.questions.filter((q) => q.startsWith("a"))).toHaveLength(2);
    expect(plan.questions.filter((q) => q.startsWith("b"))).toEqual(["b1", "b2"]);
    const plain = stores(PLAIN);
    plain.store.start("plain");
    expect(plain.state().attempt.value.plan.source).toBe("full");
    expect(plain.state().attempt.value.plan.questions).toEqual(["p1", "p2", "p3"]);
  });

  it("draws different questions for different seeds", () => {
    const drawn = new Set<string>();
    for (const seed of ["s1", "s2", "s3", "s4", "s5", "s6"]) {
      const { store, state } = stores(BANK);
      store.start("banks", { seed });
      drawn.add(state().attempt.value.plan.questions.join());
    }
    expect(drawn.size).toBeGreaterThan(1);
  });

  it("gives one part its own plan: source section, only its questions, and it grades only them", () => {
    const { store, state } = stores(BANK);
    store.start("banks", { part: "b", seed: "seed0002" });
    const plan = state().attempt.value.plan;
    expect(plan.source).toBe("section");
    expect(plan.section).toBe("b");
    expect(plan.questions).toEqual(["b1", "b2"]);
    store.dispatch("banks", { type: "answer", question: "b1", answer: { choice: 0 } });
    store.submit("banks");
    expect(state().graded.value?.total.points).toBe(2);
    expect(state().graded.value?.questions.map((q) => q.id)).toEqual(["b1", "b2"]);
  });

  it("draws a bank section's count when it is the one part", () => {
    const { store, state } = stores(BANK);
    store.start("banks", { part: "a", seed: "seed0003" });
    expect(state().attempt.value.plan.questions).toHaveLength(2);
  });

  it("shuffles the questions and the choices when the quiz asks, in the plan's order", () => {
    const text = PLAIN.replace("id: plain\n", "id: plain\nshuffle_questions: true\nshuffle_choices: true\n");
    const { store, state, page } = stores(text);
    store.start("plain", { seed: "shuf0001" });
    const plan = state().attempt.value.plan;
    expect(plan.questions).toHaveLength(3);
    const order = plan.optionOrder?.[plan.questions[0] as string] as number[];
    expect([...order].sort()).toEqual([0, 1, 2]);
    const html = renderToString(h(App, { store }));
    const start = html.indexOf(`data-qid="${plan.questions[0]}"`);
    const first = html.slice(start, html.indexOf("</article>", start));
    const shown = [...first.matchAll(/choice p\d(\d)/g)].map((m) => Number(m[1]));
    expect(shown).toEqual(order);
    expect(page.sections[0]?.questions.map((q) => q.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("is not redrawn: the plan is the Attempt's, and a second Start changes nothing", () => {
    const { store, state } = stores(BANK);
    store.start("banks", { seed: "seed0004" });
    const first = state().attempt.value.plan;
    store.start("banks", { seed: "other001" });
    expect(state().attempt.value.plan).toBe(first);
  });

  it("shows the questions in the plan's order, grouped by section, and only the chosen part", () => {
    const { store } = stores(BANK);
    store.start("banks", { part: "b", seed: "seed0002" });
    const html = renderToString(h(App, { store }));
    expect([...html.matchAll(/data-qid="(\w+)"/g)].map((m) => m[1])).toEqual(["b1", "b2"]);
    expect(html).toContain("Part B");
    expect(html).not.toContain("Part A");
  });
});

describe("shownEntries", () => {
  const c = (started: boolean, order?: number[], dataOrder?: number[]) =>
    ({ started, order, dataOrder }) as unknown as Parameters<typeof shownEntries>[0];

  it("maps the plan's source indices to the data entries through the key's data order", () => {
    // the data holds [c, a, b]: source indices 2, 0, 1; the plan shows source 0, 1, 2
    const shown = shownEntries(c(true, [0, 1, 2], [2, 0, 1]), "q", ["c", "a", "b"]);
    expect(shown.map((e) => `${e.source}${e.entry}`)).toEqual(["0a", "1b", "2c"]);
  });

  it("shows the data as it is before Start", () => {
    expect(shownEntries(c(false), "q", ["c", "a"]).map((e) => e.entry)).toEqual(["c", "a"]);
  });

  it("throws, and never shows the source order, when a started attempt has no order", () => {
    expect(() => shownEntries(c(true, undefined, [0, 1]), "q", ["a", "b"])).toThrow(
      "question q: the plan has no order",
    );
    expect(() => shownEntries(c(true, [0, 1], undefined), "q", ["a", "b"])).toThrow("the plan has no order");
    expect(() => shownEntries(c(true, [0], [0, 1]), "q", ["a", "b"])).toThrow("the plan has no order");
  });
});
