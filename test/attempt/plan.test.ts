import { describe, expect, it } from "vitest";
import { PlanSchema } from "../../src/core/attempt/schema";
import type { Quiz } from "../../src/core/ir";
import { parse } from "../../src/core/parse";
import { PlanError, planFor, random, sectionIds, shuffled } from "../../src/core/plan";

const q = (n: number) => `## Question ${n}? {type=single id=q${n}}\n\n- [x] a\n- [ ] b\n- [ ] c\n`;
const many = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => q(from + i)).join("\n");

function quiz(body: string, front = "title: T"): Quiz {
  const result = parse(`---\n${front}\n---\n\n${body}\n`, "q.md");
  expect(result.issues).toEqual([]);
  return result.quiz as Quiz;
}

const BANKS = quiz(`# Part A {id=a pick=2}\n\n${many(1, 5)}\n# Part B {id=b}\n\n${many(6, 7)}`);

describe("the seeded generator", () => {
  it("gives the same sequence for a seed, and another for another seed", () => {
    const take = (seed: string) => {
      const next = random(seed);
      return [next(), next(), next()];
    };
    expect(take("abc")).toEqual(take("abc"));
    expect(take("abc")).not.toEqual(take("xyz"));
    for (const x of take("abc")) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("is fixed forever: the first values for the seed `fullmark` (a golden test)", () => {
    const next = random("fullmark");
    expect([next(), next(), next()].map((x) => Math.floor(x * 1e6))).toEqual(GOLDEN);
  });

  it("shuffles into a permutation, without touching the input", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffled(input, random("s"));
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(out).toEqual(shuffled(input, random("s")));
  });
});

const GOLDEN = [481073, 601556, 736776];

describe("planFor", () => {
  it("full: every question in order, banks whole, no seed", () => {
    const plan = planFor(BANKS, { source: "full" });
    expect(plan).toEqual({ source: "full", questions: ["q1", "q2", "q3", "q4", "q5", "q6", "q7"] });
    expect(PlanSchema.safeParse(plan).success).toBe(true);
  });

  it("bank: draws `pick` questions from a bank, in source order, from the seed", () => {
    const a = planFor(BANKS, { source: "bank", seed: "s1" });
    expect(a.source).toBe("bank");
    expect(a.seed).toBe("s1");
    expect(a.questions).toHaveLength(4);
    const drawn = a.questions.slice(0, 2);
    expect(drawn.every((id) => /^q[1-5]$/.test(id))).toBe(true);
    expect(drawn).toEqual([...drawn].sort());
    expect(a.questions.slice(2)).toEqual(["q6", "q7"]);
    expect(planFor(BANKS, { source: "bank", seed: "s1" })).toEqual(a);
    const seeds = new Set(
      Array.from({ length: 12 }, (_, i) => planFor(BANKS, { source: "bank", seed: `s${i}` }).questions.join()),
    );
    expect(seeds.size).toBeGreaterThan(3);
  });

  it("section: one section by id, and its bank only when a seed is given", () => {
    expect(planFor(BANKS, { source: "section", section: "b" })).toEqual({
      source: "section",
      section: "b",
      questions: ["q6", "q7"],
    });
    expect(planFor(BANKS, { source: "section", section: "a" }).questions).toHaveLength(5);
    expect(planFor(BANKS, { source: "section", section: "a", seed: "x" }).questions).toHaveLength(2);
  });

  it("section: an unknown one is an error that lists the valid ones", () => {
    expect(() => planFor(BANKS, { source: "section", section: "c" })).toThrow(PlanError);
    expect(() => planFor(BANKS, { source: "section", section: "c" })).toThrow("the sections are: a, b");
    const untitled = quiz(q(1));
    expect(sectionIds(untitled)).toEqual([]);
    expect(() => planFor(untitled, { source: "section", section: "" })).toThrow("no titled section");
  });

  it("shuffles questions inside their section, and choices, only with a seed", () => {
    const shuffling = quiz(
      `# A {id=a}\n\n${many(1, 6)}\n# B {id=b}\n\n${many(7, 9)}`,
      "title: T\nshuffle_questions: true\nshuffle_choices: true",
    );
    const plain = planFor(shuffling, { source: "full" });
    expect(plain.questions).toEqual(["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9"]);
    expect(plain.optionOrder).toBeUndefined();
    const plan = planFor(shuffling, { source: "full", seed: "k" });
    expect(plan.questions.slice(0, 6).sort()).toEqual(["q1", "q2", "q3", "q4", "q5", "q6"]);
    expect(plan.questions.slice(6).sort()).toEqual(["q7", "q8", "q9"]);
    expect(plan.questions).not.toEqual(plain.questions);
    const order = plan.optionOrder ?? {};
    expect(Object.keys(order).sort()).toEqual(plain.questions);
    for (const perm of Object.values(order)) expect([...perm].sort()).toEqual([0, 1, 2]);
    expect(planFor(shuffling, { source: "full", seed: "k" })).toEqual(plan);
    expect(PlanSchema.safeParse(plan).success).toBe(true);
  });

  it("shuffle= on a question overrides shuffle_choices", () => {
    const one = quiz(
      "## A? {type=single id=a shuffle=true}\n\n- [x] a\n- [ ] b\n\n## B? {type=single id=b}\n\n- [x] a\n- [ ] b\n",
    );
    expect(Object.keys(planFor(one, { source: "full", seed: "s" }).optionOrder ?? {})).toEqual(["a"]);
    const off = quiz(
      "## A? {type=single id=a shuffle=false}\n\n- [x] a\n- [ ] b\n\n## B? {type=single id=b}\n\n- [x] a\n- [ ] b\n",
      "title: T\nshuffle_choices: true",
    );
    expect(Object.keys(planFor(off, { source: "full", seed: "s" }).optionOrder ?? {})).toEqual(["b"]);
  });

  it("records the display order of ordering items and matching right-hand sides, distractors included", () => {
    const mixed = quiz(
      [
        "## Sort. {type=ordering id=o}\n\n1. a\n2. b\n3. c\n4. d\n",
        "## Match. {type=matching id=m}\n\n- L1 :: R1\n- L2 :: R2\n- :: R3\n",
        q(1),
      ].join("\n"),
    );
    expect(planFor(mixed, { source: "full" }).optionOrder).toBeUndefined();
    const plan = planFor(mixed, { source: "full", seed: "k" });
    const order = plan.optionOrder ?? {};
    expect(Object.keys(order).sort()).toEqual(["m", "o"]);
    expect([...(order.o ?? [])].sort()).toEqual([0, 1, 2, 3]);
    expect([...(order.m ?? [])].sort()).toEqual([0, 1, 2]);
    expect(planFor(mixed, { source: "full", seed: "k" })).toEqual(plan);
    expect(PlanSchema.safeParse(plan).success).toBe(true);
  });

  it("never shows ordering items in the right order", () => {
    const two = quiz("## Sort. {type=ordering id=o}\n\n1. a\n2. b\n");
    for (let i = 0; i < 40; i++) {
      expect(planFor(two, { source: "full", seed: `s${i}` }).optionOrder?.o).toEqual([1, 0]);
    }
  });
});
