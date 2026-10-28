import { z } from "zod";
import type { QuestionType } from "../ir";

/**
 * The answer shapes of `results-v2` (TECHNICAL_DESIGN.md, section 4, "`results-v2`"): one per question type, all kept from 0.x's
 * `response` objects except where noted. Every index refers to the **source order** of the quiz (the order in the
 * Markdown), never to the shuffled order a page showed (`optionOrder`), so grading never depends on the shuffle.
 * An unanswered question is `null` in `state.answers` (or has no entry); a key left out of an answer, or `null`,
 * means the learner gave nothing there. Unknown keys are ignored.
 */
const index = z.number().int().min(0);
/** Follow-up text typed after picking a choice (`{input}`): the choice's index as a string, to the text. */
const inputs = z.record(z.string(), z.string());

export const ANSWER_SHAPES = {
  /** the index of the picked choice */
  single: z.object({ choice: index.nullish(), inputs: inputs.optional() }),
  /** the indices of the picked choices, in any order */
  multi: z.object({ choices: z.array(index).optional(), inputs: inputs.optional() }),
  truefalse: z.object({ value: z.boolean().nullish() }),
  /** the text as typed: the grader reads it (fractions, `1e-3`, a decimal comma in a `vi` quiz) */
  numeric: z.object({ raw: z.string().optional() }),
  short: z.object({ text: z.string().optional() }),
  /** one text per blank, in order of appearance */
  blanks: z.object({ blanks: z.array(z.string()).optional() }),
  /** one text per field (the ungraded ones too), in order */
  fields: z.object({ fields: z.array(z.string()).optional() }),
  /** `order[i]` is the source index of the item the learner put at position `i`; the right order is 0, 1, 2... */
  ordering: z.object({ order: z.array(index).optional() }),
  /**
   * `pairs[i]` is the index of the right-hand item chosen for the left item `i`: the pairs' right-hand items in
   * source order, then the distractors; null for a left item left empty
   */
  matching: z.object({ pairs: z.array(index.nullable()).optional() }),
  /** the text as typed. 0.x also stored `word_count`; the grader counts the words itself */
  essay: z.object({ text: z.string().optional() }),
  /** the code as typed; `language` is what the page showed (the grader uses the question's own) */
  code: z.object({ code: z.string().optional(), language: z.string().optional() }),
  /** the picked value of the scale */
  scale: z.object({ value: z.number().int().nullish() }),
} as const satisfies Record<QuestionType, z.ZodType>;

export type AnswerOf<T extends QuestionType> = z.infer<(typeof ANSWER_SHAPES)[T]>;

/** An answer as the file holds it: any object. Which keys it needs depends on the question, so it is checked there. */
export const AnswerSchema = z.looseObject({});
export type Answer = z.infer<typeof AnswerSchema>;

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
