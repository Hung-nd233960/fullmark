import type { Attempt } from "../core/attempt";
import type { Graded, GradedQuestion } from "../core/grade";
import type { PageQuiz } from "./data";

/** The time limit this attempt runs under: a retry has none (TECHNICAL_DESIGN.md, section 8, "Retry missed"). */
export const limitOf = (page: Pick<PageQuiz, "timeLimit">, attempt: Pick<Attempt, "plan">): number | undefined =>
  attempt.plan.source === "retry" ? undefined : page.timeLimit;

/** A question that counts towards the score: a graded one, or one waiting for a grader. */
const scored = (q: GradedQuestion): boolean => q.points > 0;

/**
 * The questions to retry: wrong, partly right or unanswered, in the plan's display order. An essay or code answer
 * waiting for a grader is not missed, and a question that carries no points never is.
 */
export function missedIds(graded: Graded): string[] {
  return graded.questions
    .filter((q) => scored(q) && (q.status === "incorrect" || q.status === "partial" || q.status === "unanswered"))
    .map((q) => q.id);
}

export type Counts = { correct: number; partial: number; incorrect: number; unanswered: number; pending: number };

/** How many of the scored questions are in each of the five states. */
export function countsOf(questions: readonly GradedQuestion[]): Counts {
  const counts: Counts = { correct: 0, partial: 0, incorrect: 0, unanswered: 0, pending: 0 };
  for (const q of questions) {
    if (!scored(q)) continue;
    if (q.status === "correct" || q.status === "partial" || q.status === "incorrect") counts[q.status] += 1;
    else if (q.status === "unanswered" || q.status === "pending") counts[q.status] += 1;
  }
  return counts;
}

/** A number as it is, at full precision (a tolerance), with the language's decimal mark. */
export const decimal = (n: number, lang: "en" | "vi" = "en"): string =>
  lang === "vi" ? String(n).replace(".", ",") : String(n);

/**
 * A number as the interface prints it: at most two decimals, no trailing zeros, and a decimal comma when `lang` is `vi`
 * (TECHNICAL_DESIGN.md, section 9, "Vietnamese pitfalls", item 2). Never `toLocaleString`: it depends on the browser.
 */
export const num = (n: number, lang: "en" | "vi" = "en"): string => {
  const text = String(Math.round(n * 100) / 100);
  return lang === "vi" ? text.replace(".", ",") : text;
};

/** Whole percent of `earned` in `points`, or null when nothing was scored. */
export const percentOf = (earned: number, points: number): number | null =>
  points > 0 ? Math.round((earned / points) * 100) : null;
