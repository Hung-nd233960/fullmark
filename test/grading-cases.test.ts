import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Answer } from "../src/core/attempt/answers";
import { grade } from "../src/core/grade";
import { attemptFor, quizOf } from "./helpers/grading";

/**
 * The 160 grading cases of 0.x, rewritten to 1.0 shapes (STEP1.md, slice 1d): the question is one `##` block of 1.0
 * Markdown, the answer a `results-v2` answer, and each runs through `parse` and then `grade`. Nothing is compared
 * with 0.x's output: the expected earned points, status and per-item results are 0.x's, kept unless a case says
 * `changed` and why.
 */
type GradingCase = {
  name: string;
  type: string;
  /** extra front matter, such as `lang: vi` */
  front?: string;
  question: string;
  answer: Answer | null;
  expected_earned: number | null;
  expected_status: string;
  expected_results?: (boolean | null)[];
  changed?: string;
};

const file = resolve(import.meta.dirname, "data", "grading_cases.json");
const cases = JSON.parse(readFileSync(file, "utf8")) as GradingCase[];

describe("the grading cases of 0.x, in 1.0 shapes", () => {
  it("has all 160, each with a unique name", () => {
    expect(cases).toHaveLength(160);
    expect(new Set(cases.map((c) => c.name)).size).toBe(160);
  });

  for (const c of cases) {
    it(`${c.type}: ${c.name}`, () => {
      const quiz = quizOf(c.question, c.front);
      const [g] = grade(quiz, attemptFor({ q: c.answer })).questions;
      expect(g, "the question was graded").toBeDefined();
      expect({ earned: g?.earned, status: g?.status }).toEqual({
        earned: c.expected_earned,
        status: c.expected_status,
      });
      if (c.expected_results) expect(g?.results).toEqual(c.expected_results);
    });
  }

  it("says why each case whose expectation changed did", () => {
    const changed = cases.filter((c) => c.changed !== undefined);
    expect(changed.map((c) => c.name)).toEqual(["fields all ungraded"]);
    for (const c of changed) expect(c.changed?.length).toBeGreaterThan(20);
  });
});
