import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { keyAnswerOf, partialOf } from "../../src/build/paper-answers";
import type { Answer } from "../../src/core/attempt/answers";
import { emptyState } from "../../src/core/attempt/schema";
import { grade } from "../../src/core/grade";
import { paperEn, paperVi } from "../../src/core/i18n/paper";
import type { Question } from "../../src/core/ir";
import { planFor } from "../../src/core/plan";
import { quizOf } from "../helpers/grading";

/** The key (STEP2.md, slice 2k2): every answer it prints is the one `quiz grade` marks right, for two seeds. */
const root = resolve(import.meta.dirname, "..", "..");
const body = readFileSync(join(root, "test/fixtures/paper/key-types.md"), "utf8");

const quiz = quizOf(body.replace(/^---[\s\S]*?---\n/, ""), "partial: true\nshuffle_choices: true\nlang: en");

const letterIndex = (l: string, base: number): number => l.charCodeAt(0) - base;

/** The attempt that gives the key's answers, read back from `keyAnswerOf` through the plan's order. */
function attemptFromKey(q: Question, seed: string): Answer | null {
  const plan = planFor(quiz, { source: "bank", seed, quizHash: "0".repeat(64) });
  const order = plan.optionOrder?.[q.id];
  const k = keyAnswerOf(q, {
    order,
    partial: partialOf(quiz, q),
    t: paperEn,
    points: (n) => `${n} points`,
    label: (s) => s,
  });
  const source = (l: string, base: number): number => (order ?? [])[letterIndex(l, base)] ?? letterIndex(l, base);
  switch (q.type) {
    case "single":
      return { choice: source(k.parts[0] as string, 65) };
    case "multi":
      return { choices: k.parts.map((l) => source(l, 65)) };
    case "truefalse":
      return { value: k.parts[0] === "T" };
    case "numeric":
      return { raw: k.parts[0] as string };
    case "short":
      return { text: k.parts[0] as string };
    case "blanks":
      return { blanks: k.parts };
    case "fields":
      return { fields: k.parts };
    case "ordering":
      return { order: k.parts.map((l) => source(l, 65)) };
    case "matching":
      return { pairs: k.parts.map((l) => source(l, 97)) };
    default:
      return null;
  }
}

describe("the key is what the grader marks right", () => {
  for (const seed of ["101", "102"]) {
    it(`seed ${seed}: every auto-marked type scores full marks on the key's answers`, () => {
      const plan = planFor(quiz, { source: "bank", seed, quizHash: "0".repeat(64) });
      const questions = quiz.sections.flatMap((s) => s.questions);
      const answers: Record<string, Answer | null> = {};
      for (const q of questions) answers[q.id] = attemptFromKey(q, seed);
      const result = grade(quiz, {
        quizHash: "0".repeat(64),
        plan,
        state: { ...emptyState(), answers, startedAt: "2026-10-23T16:02:00", submittedAt: "2026-10-23T16:30:00" },
        phase: "submitted",
      });
      const types = new Set(questions.map((q) => q.type));
      for (const type of [
        "single",
        "multi",
        "truefalse",
        "numeric",
        "short",
        "blanks",
        "fields",
        "ordering",
        "matching",
      ]) {
        expect(types.has(type as Question["type"]), type).toBe(true);
      }
      for (const g of result.questions) {
        if (g.points > 0 && g.earned !== null)
          expect({ id: g.id, earned: g.earned }).toEqual({ id: g.id, earned: g.points });
      }
      expect(result.questions.filter((g) => g.status === "correct").length).toBeGreaterThanOrEqual(9);
    });
  }

  it("the letters really follow the shuffle: two seeds name different letters for some question", () => {
    const letters = (seed: string) =>
      quiz.sections
        .flatMap((s) => s.questions)
        .map((q) => {
          const plan = planFor(quiz, { source: "bank", seed, quizHash: "0".repeat(64) });
          return keyAnswerOf(q, {
            order: plan.optionOrder?.[q.id],
            partial: true,
            t: paperEn,
            points: String,
            label: (s) => s,
          }).lines.join("|");
        });
    expect(letters("101")).not.toEqual(letters("102"));
  });
});

describe("what a key prints per type", () => {
  const byId = new Map(quiz.sections.flatMap((s) => s.questions).map((q) => [q.id, q]));
  const say = (id: string, t: typeof paperEn | typeof paperVi = paperEn, partial = true) =>
    keyAnswerOf(byId.get(id) as Question, {
      order: undefined,
      partial,
      lang: t === paperVi ? "vi" : "en",
      t: t as typeof paperEn,
      points: (n) => `${n} points`,
      label: (s) => s,
    });

  it("writes a number in the paper's format: a comma in vi, a point in en", () => {
    expect(say("k-num").lines).toEqual(["0.4 (± 0.001) s"]);
    expect(say("k-num", paperVi).lines).toEqual(["0,4 (± 0,001) s"]);
    expect(say("k-rel", paperVi).lines).toEqual(["100 (± 5%)"]);
    expect(say("k-blanks", paperVi).lines[0]).toContain("(2) 2 (± 0,5)");
    expect(say("k-fields", paperVi).lines[0]).toContain("12 (± 0,5) dB");
    // the parts a test reads back stay as written
    expect(say("k-num", paperVi).parts).toEqual(["0.4"]);
  });

  it("writes the answers as the quiz states them", () => {
    expect(say("k-single").lines).toEqual(["B"]);
    expect(say("k-multi").lines).toEqual(["A, C"]);
    expect(say("k-tf").lines).toEqual(["F"]);
    expect(say("k-tf", paperVi).lines).toEqual(["S"]);
    expect(say("k-short").lines).toEqual(["aliasing; folding; /alias(ing)?/"]);
    expect(say("k-num").lines).toEqual(["0.4 (± 0.001) s"]);
    expect(say("k-rel").lines).toEqual(["100 (± 5%)"]);
    expect(say("k-blanks").lines).toEqual(["(1) causal / casual; (2) 2 (± 0.5)"]);
    expect(say("k-fields").lines).toEqual(["Gain: 12 (± 0.5) dB (1 points)", "Name: x (1 points)"]);
    expect(say("k-match").lines).toEqual(["1 → a, 2 → b, 3 → c"]);
    expect(say("k-order").lines).toEqual(["A, B, C"]);
    expect(say("k-scale").lines).toEqual(["Not marked"]);
    expect(say("k-essay").lines).toEqual(["See the rubric"]);
    expect(say("k-code").lines).toEqual(["See the rubric"]);
  });

  it("notes partial credit for multi, blanks, fields, matching and ordering, and for no other type", () => {
    expect(say("k-multi").note).toContain("equal share of the 2 points");
    expect(say("k-blanks").note).toBe("partial: each blank earns an equal share of the 2 points");
    expect(say("k-fields").note).toBe("partial: each field earns its own points");
    expect(say("k-match").note).toBe("partial: each pair earns an equal share of the 3 points");
    expect(say("k-order").note).toBe("partial: each item in its place earns an equal share of the 3 points");
    for (const id of ["k-single", "k-tf", "k-short", "k-num", "k-rel", "k-scale", "k-essay", "k-code"]) {
      expect(say(id).note, id).toBeNull();
    }
    // `partial: false` leaves multi, matching and ordering all-or-nothing; blanks and fields always share
    expect(say("k-multi", paperEn, false).note).toBeNull();
    expect(say("k-match", paperEn, false).note).toBeNull();
    expect(say("k-order", paperEn, false).note).toBeNull();
    expect(say("k-blanks", paperEn, false).note).not.toBeNull();
  });
});
