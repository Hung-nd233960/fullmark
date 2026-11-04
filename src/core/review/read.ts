import type { Quiz } from "../ir";
import { RUBRIC_REASONS, RUBRIC_TYPES } from "./reasons";
import { REVIEW_FORMAT, REVIEW_VERSION, type Review, ReviewSchema } from "./schema";

export type ReadReview = { ok: true; review: Review } | { ok: false; problems: string[] };

const OLD = "a fullmark 0.x review: 1.0 does not read it; judge the quiz again with `quiz review`";

/**
 * Reads the text of a review file: the review, or every problem found. A 0.x file (`"version": 1` and no `format`)
 * is refused with a pointer to `quiz review`.
 */
export function readReview(text: string): ReadReview {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ""));
  } catch (error) {
    return { ok: false, problems: [`not a review file: it is not valid JSON (${(error as Error).message})`] };
  }
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, problems: ["not a review file: it is not a JSON object"] };
  }
  const head = json as { format?: unknown; version?: unknown };
  if (head.format === undefined && head.version === 1) return { ok: false, problems: [OLD] };
  if (head.format !== REVIEW_FORMAT) {
    return { ok: false, problems: [`not a review file: its format is not "${REVIEW_FORMAT}"`] };
  }
  if (head.version !== REVIEW_VERSION) {
    return {
      ok: false,
      problems: [`unsupported review version ${String(head.version)}: this fullmark reads version ${REVIEW_VERSION}`],
    };
  }
  const parsed = ReviewSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join(".") || "(file)"}: ${i.message}`) };
  }
  return { ok: true, review: parsed.data };
}

/**
 * What only the quiz can say: a rubric reason (essays and code) on a question that is in the quiz and is neither.
 * A question no longer in the quiz is not judged.
 */
export function reviewProblems(review: Review, quiz: Quiz): string[] {
  const types = new Map<string, string>();
  for (const s of quiz.sections) for (const q of s.questions) if (q.id !== "") types.set(q.id, q.type);
  const out: string[] = [];
  for (const [id, entry] of Object.entries(review.questions)) {
    const type = types.get(id);
    if (type === undefined || RUBRIC_TYPES.includes(type)) continue;
    for (const r of entry.reasons) {
      if ((RUBRIC_REASONS as readonly string[]).includes(r)) {
        out.push(`questions.${id}.reasons: the reason "${r}" is for essays and code, and ${id} is a ${type} question`);
      }
    }
  }
  return out;
}
