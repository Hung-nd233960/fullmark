import type { Judged } from "../core/review/reasons";
import type { PageData, PageQuiz } from "../page/data";

/**
 * What `quiz review --since` asks (COMMANDS.md, "With `--since`"): the questions new or changed since the review, and
 * for each changed one the earlier verdict with the block judged and the block as it is now, both as hashed, so the
 * form draws the line diff itself.
 */
export type SinceData = {
  /** the `reviewedAt` of the review being merged into, as written */
  reviewedAt: string;
  /** the ids asked, in source order */
  asked: string[];
  /** by id, for the changed questions only (a new question has none) */
  changed: Record<string, { earlier: Judged; before: string | null; after: string }>;
};

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
  /** present only with `--since` */
  since?: SinceData;
  /** the review file as the user names it (`review.json`) */
  out: string;
  /** the command that checks it, as the user can paste it */
  check: string;
};
