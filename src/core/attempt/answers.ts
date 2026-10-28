import * as z from "zod/mini";
import type { QuestionType } from "../ir";
import type { Answer } from "./schema";

export type { Answer } from "./schema";

/**
 * The answer shapes of `results-v2` (TECHNICAL_DESIGN.md, section 4, "`results-v2`"): one per question type, all kept from 0.x's
 * `response` objects except where noted. Every index refers to the **source order** of the quiz (the order in the
 * Markdown), never to the shuffled order a page showed (`optionOrder`), so grading never depends on the shuffle.
 * An unanswered question is `null` in `state.answers` (or has no entry); a key left out of an answer, or `null`,
 * means the learner gave nothing there. Unknown keys are ignored.
 */
const index = z.int().check(z.gte(0));
/** Follow-up text typed after picking a choice (`{input}`): the choice's index as a string, to the text. */
const inputs = z.record(z.string(), z.string());

export const ANSWER_SHAPES = {
  /** the index of the picked choice */
  single: z.object({ choice: z.nullish(index), inputs: z.optional(inputs) }),
  /** the indices of the picked choices, in any order */
  multi: z.object({ choices: z.optional(z.array(index)), inputs: z.optional(inputs) }),
  truefalse: z.object({ value: z.nullish(z.boolean()) }),
  /** the text as typed: the grader reads it (fractions, `1e-3`, a decimal comma in a `vi` quiz) */
  numeric: z.object({ raw: z.optional(z.string()) }),
  short: z.object({ text: z.optional(z.string()) }),
  /** one text per blank, in order of appearance */
  blanks: z.object({ blanks: z.optional(z.array(z.string())) }),
  /** one text per field (the ungraded ones too), in order */
  fields: z.object({ fields: z.optional(z.array(z.string())) }),
  /** `order[i]` is the source index of the item the learner put at position `i`; the right order is 0, 1, 2... */
  ordering: z.object({ order: z.optional(z.array(index)) }),
  /**
   * `pairs[i]` is the index of the right-hand item chosen for the left item `i`: the pairs' right-hand items in
   * source order, then the distractors; null for a left item left empty
   */
  matching: z.object({ pairs: z.optional(z.array(z.nullable(index))) }),
  /** the text as typed. 0.x also stored `word_count`; the grader counts the words itself */
  essay: z.object({ text: z.optional(z.string()) }),
  /** the code as typed; `language` is what the page showed (the grader uses the question's own) */
  code: z.object({ code: z.optional(z.string()), language: z.optional(z.string()) }),
  /** the picked value of the scale */
  scale: z.object({ value: z.nullish(z.int()) }),
} as const satisfies Record<QuestionType, z.ZodMiniType>;

export type AnswerOf<T extends QuestionType> = z.infer<(typeof ANSWER_SHAPES)[T]>;

/** The answer for a question of this type, or null when there is none or it does not fit the shape. */
export function readAnswer<T extends QuestionType>(type: T, answer: Answer | null | undefined): AnswerOf<T> | null {
  if (answer === null || answer === undefined) return null;
  const parsed = ANSWER_SHAPES[type].safeParse(answer);
  return parsed.success ? (parsed.data as AnswerOf<T>) : null;
}

/** Why an answer does not fit its question's type, or null when it does (or is empty). */
export function answerProblem(type: QuestionType, answer: Answer | null | undefined): string | null {
  if (answer === null || answer === undefined) return null;
  const parsed = ANSWER_SHAPES[type].safeParse(answer);
  if (parsed.success) return null;
  const first = parsed.error.issues[0];
  const where = first && first.path.length > 0 ? `\`${first.path.join(".")}\`` : "the answer";
  return `${where} does not fit a ${type} question: ${first?.message ?? "wrong shape"}`;
}
