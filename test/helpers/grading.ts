import { expect } from "vitest";
import type { Answer } from "../../src/core/attempt/answers";
import { type Attempt, emptyState } from "../../src/core/attempt/schema";
import type { Quiz } from "../../src/core/ir";
import { parse } from "../../src/core/parse";

/** A quiz of the given body (one or more `##` blocks), which must have no error. */
export function quizOf(body: string, front = ""): Quiz {
  const text = `---\ntitle: T\n${front === "" ? "" : `${front}\n`}---\n\n${body}\n`;
  const parsed = parse(text, "case.md");
  expect(parsed.issues.filter((i) => i.level === "error").map((i) => `${i.rule}@${i.line}: ${i.message}`)).toEqual([]);
  return parsed.quiz as Quiz;
}

/** A submitted attempt over the given question ids, with these answers. */
export function attemptFor(answers: Record<string, Answer | null>, ids = Object.keys(answers)): Attempt {
  return {
    quizHash: "0".repeat(64),
    plan: { source: "full", questions: ids },
    state: { ...emptyState(), answers, startedAt: "2026-10-23T16:02:00", submittedAt: "2026-10-23T16:30:00" },
    phase: "submitted",
  };
}
