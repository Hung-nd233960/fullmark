import type { Judged } from "./reasons";
import { REVIEW_FORMAT, REVIEW_VERSION, type Review, type ReviewEntry } from "./schema";

/** The quiz as `merge` needs it: its identity and, per question id, the hash and the block as hashed. */
export type ReviewTarget = {
  id: string;
  hash: string;
  /** ISO, local offset: the time of Finish, given by the caller so that the same inputs give the same file */
  reviewedAt: string;
  questions: ReadonlyMap<string, { hash: string; source: string }>;
};

/**
 * The review after a run: every question judged replaces its entry, every other entry stays (also those of
 * questions no longer in the quiz, as history); `quizHash` and `reviewedAt` are the run's. A pure function.
 */
export function merge(old: Review | null, judged: Readonly<Record<string, Judged>>, quiz: ReviewTarget): Review {
  const questions: Review["questions"] = { ...(old?.questions ?? {}) };
  for (const [id, j] of Object.entries(judged)) {
    const q = quiz.questions.get(id);
    if (!q) throw new Error(`cannot judge ${id}: the quiz has no such question`);
    const entry: ReviewEntry = { verdict: j.verdict, reasons: [...j.reasons], note: j.note, hash: q.hash };
    if (j.verdict !== "keep") entry.source = q.source;
    else if (j.assumed) entry.assumed = true;
    questions[id] = entry;
  }
  return {
    format: REVIEW_FORMAT,
    version: REVIEW_VERSION,
    quizId: quiz.id,
    quizHash: quiz.hash,
    reviewedAt: quiz.reviewedAt,
    questions,
  };
}

const sorted = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sorted);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) out[key] = sorted((value as Record<string, unknown>)[key]);
  return out;
};

/** The file's text: keys sorted at every level, two-space indent, a final newline. */
export const serialiseReview = (review: Review): string => `${JSON.stringify(sorted(review), null, 2)}\n`;
