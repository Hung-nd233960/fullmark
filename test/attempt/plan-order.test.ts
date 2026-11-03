import { describe, expect, it } from "vitest";
import type { Question, Quiz } from "../../src/core/ir";
import { parse } from "../../src/core/parse";
import { planFor } from "../../src/core/plan";
import before from "../data/plans-before-2k3.json";
import { plansOfCorpus } from "../helpers/plans-corpus";

const HASH = "0".repeat(64);

const MAKE: Record<string, (id: string) => string> = {
  single: (id) => `## S ${id}? {type=single id=${id}}\n\n- [x] a\n- [ ] b\n`,
  multi: (id) => `## M ${id}? {type=multi id=${id}}\n\n- [x] a\n- [x] b\n- [ ] c\n`,
  truefalse: (id) => `## T ${id}. {type=truefalse id=${id}}\n\n\`\`\`answer\nvalue: true\n\`\`\`\n`,
  short: (id) => `## H ${id}? {type=short id=${id}}\n\n\`\`\`answer\naccept: [x]\n\`\`\`\n`,
  scale: (id) => `## C ${id}? {type=scale id=${id}}\n\n\`\`\`answer\nmin: 1\nmax: 3\n\`\`\`\n`,
};

/** A quiz from sections of type lists: `[["single","single","truefalse"], ...]`; ids are the type and a counter. */
function build(sections: string[][], front: string): Quiz {
  let n = 0;
  const body = sections
    .map(
      (types, i) =>
        `# Part ${i + 1} {id=p${i + 1}}\n\n${types.map((t) => (MAKE[t] as (id: string) => string)(`${t}${n++}`)).join("\n")}`,
    )
    .join("\n");
  const r = parse(`---\ntitle: T\nshuffle_questions: true\n${front}\n---\n\n${body}\n`, "q.md");
  expect(r.issues).toEqual([]);
  return r.quiz as Quiz;
}

const typeOf = (quiz: Quiz) => new Map(quiz.sections.flatMap((s) => s.questions).map((q: Question) => [q.id, q.type]));
/** the default order's group of a type */
const group = (type: string | undefined) => (type === "multi" ? "single" : type);
const SEEDS = Array.from({ length: 50 }, (_, i) => `s${i}`);

describe("a quiz without type_order keeps today's plans", () => {
  it("gives, for every quiz of the repository with shuffle_questions on, two seeds and every source, the plans recorded before 2k3", () => {
    const now = plansOfCorpus();
    expect(Object.keys(now).length).toBeGreaterThan(80);
    expect(now).toEqual(before);
  });

  it("treats `type_order: none` as the key being absent", () => {
    const types = [["single", "truefalse", "single", "short", "truefalse", "multi"]];
    const a = build(types, "");
    const b = build(types, "type_order: none");
    for (const seed of SEEDS) {
      const plan = (qz: Quiz) =>
        planFor(qz, { source: "full", seed, quizHash: HASH }).questions.map((id) => id.replace(/\d+$/, ""));
      expect(plan(b)).toEqual(plan(a));
    }
  });
});

describe("a quiz with type_order shuffles inside its runs", () => {
  const SECTION = ["single", "single", "multi", "single", "truefalse", "truefalse", "short", "short", "short"];
  for (const mode of ["by-section", "by-quiz"]) {
    it(`${mode}: every question stays in its run for 50 seeds, on a full plan and on a bank`, () => {
      const qz = build([SECTION, ["truefalse", "short", "short"]], `type_order: ${mode}`);
      const t = typeOf(qz);
      const sourceTypes = qz.sections.flatMap((s) => s.questions.map((q) => q.type));
      const seen = new Set<string>();
      for (const seed of SEEDS) {
        for (const source of ["full", "bank"] as const) {
          const plan = planFor(qz, { source, seed, quizHash: HASH });
          expect(plan.questions.map((id) => group(t.get(id)))).toEqual(sourceTypes.map(group));
          seen.add(plan.questions.join());
        }
      }
      expect(seen.size).toBeGreaterThan(10);
    });
  }

  it("keeps a question inside its section", () => {
    const qz = build(
      [
        ["single", "single", "single"],
        ["single", "single"],
      ],
      "type_order: by-quiz",
    );
    const first = new Set(qz.sections[0]?.questions.map((q) => q.id));
    for (const seed of SEEDS) {
      const ids = planFor(qz, { source: "full", seed, quizHash: HASH }).questions;
      expect(ids.slice(0, 3).every((id) => first.has(id))).toBe(true);
    }
  });

  it("keeps a type outside the order where it stands, and shuffles each side of it", () => {
    const qz = build(
      [["single", "single", "single", "scale", "single", "single", "scale", "scale"]],
      "type_order:\n  by: by-section\n  order: [single]",
    );
    const ids = qz.sections[0]?.questions.map((q) => q.id) ?? [];
    for (const seed of SEEDS) {
      const out = planFor(qz, { source: "full", seed, quizHash: HASH }).questions;
      expect(out[3]).toBe(ids[3]);
      expect(out.slice(6)).toEqual(ids.slice(6));
      expect([...out.slice(0, 3)].sort()).toEqual(ids.slice(0, 3).sort());
      expect([...out.slice(4, 6)].sort()).toEqual(ids.slice(4, 6).sort());
    }
  });

  it("does not rearrange a quiz that is out of its order", () => {
    const qz = build([["truefalse", "truefalse", "single", "single", "truefalse"]], "type_order: by-section");
    const t = typeOf(qz);
    for (const seed of SEEDS) {
      const out = planFor(qz, { source: "full", seed, quizHash: HASH }).questions.map((id) => t.get(id));
      expect(out).toEqual(["truefalse", "truefalse", "single", "single", "truefalse"]);
    }
  });

  it("draws a bank with pick first, then shuffles the runs of what was drawn", () => {
    const text = `---\ntitle: T\nshuffle_questions: true\ntype_order: by-section\n---\n\n# Bank {id=b pick=4}\n\n${["single", "single", "single", "single", "single", "single"].map((t, i) => (MAKE[t] as (id: string) => string)(`b${i}`)).join("\n")}`;
    const qz = parse(text, "q.md").quiz as Quiz;
    const a = planFor(qz, { source: "bank", seed: "k", quizHash: HASH }).questions;
    expect(a).toHaveLength(4);
    expect(planFor(qz, { source: "bank", seed: "k", quizHash: HASH }).questions).toEqual(a);
  });

  it("is the same function for a retry, whose questions keep their groups", () => {
    const qz = build([["single", "single", "truefalse", "short", "short"]], "type_order: by-quiz");
    const t = typeOf(qz);
    const ids = qz.sections[0]?.questions.map((q) => q.id) ?? [];
    for (const seed of SEEDS) {
      const out = planFor(qz, { source: "retry", questions: ids, seed, quizHash: HASH }).questions;
      expect(out.map((id) => t.get(id))).toEqual(["single", "single", "truefalse", "short", "short"]);
    }
  });
});
