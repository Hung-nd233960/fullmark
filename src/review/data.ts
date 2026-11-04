import type { Judged } from "../core/review/reasons";
import type { PageData, PageQuiz } from "../page/data";

/**
 * What `quiz review` hands to the form (`src/build/review-form.ts` writes it into the page as JSON): the quiz as the
 * page has it (in source order, choices unshuffled, every rubric shown), the earlier verdicts that still stand (G53),
 * and the two names the saved card shows.
 */
export type ReviewData = {
  version: 1;
  /** the page's data for the look: the quiz's theme, `look`, `font` and the fonts offered */
  page: Pick<PageData, "theme" | "look" | "font" | "fonts"> & { quizzes: [PageQuiz] };
  /** by question id: the verdicts of the review file whose question has not changed since (hash equal) */
  earlier: Record<string, Judged>;
  /** the review file as the user names it (`review.json`) */
  out: string;
  /** the command that checks it, as the user can paste it */
  check: string;
};
