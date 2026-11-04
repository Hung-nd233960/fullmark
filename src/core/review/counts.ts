import type { Quiz } from "../ir";
import type { Review } from "./schema";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `28 Oct`, from the date part of an ISO time as it was written (no change of zone). */
export function shortDate(iso: string): string {
  const m = /^\d{4}-(\d\d)-(\d\d)/.exec(iso);
  const month = m ? MONTHS[Number(m[1]) - 1] : undefined;
  return m && month ? `${Number(m[2])} ${month}` : iso;
}

/** What `inspect --review` says (COMMANDS.md, `quiz inspect`), counted over the quiz's current questions. */
export type ReviewCounts = {
  reviewedAt: string;
  /** judged keep, the assumed ones included */
  keep: number;
  /** of those, kept without being looked at (Keep the rest, the Finish dialog) */
  assumed: number;
  fix: number;
  /** of those, questions that changed since the verdict (waiting for `review --since`) */
  fixChanged: number;
  drop: number;
  /** questions of the quiz with no verdict (a question without an id cannot have one) */
  unjudged: number;
};

/** Entries for questions no longer in the quiz are left out. */
export function reviewCounts(quiz: Quiz, review: Review): ReviewCounts {
  const out: ReviewCounts = {
    reviewedAt: review.reviewedAt,
    keep: 0,
    assumed: 0,
    fix: 0,
    fixChanged: 0,
    drop: 0,
    unjudged: 0,
  };
  for (const s of quiz.sections) {
    for (const q of s.questions) {
      const entry = q.id === "" ? undefined : review.questions[q.id];
      if (!entry) out.unjudged++;
      else if (entry.verdict === "keep") {
        out.keep++;
        if (entry.assumed) out.assumed++;
      } else if (entry.verdict === "drop") out.drop++;
      else {
        out.fix++;
        if (entry.hash !== q.hash) out.fixChanged++;
      }
    }
  }
  return out;
}

/** The summary row `inspect --review` prints after Positions: `keep 26 (14 not looked at) · fix 3 (2 changed since) · …`. */
export function reviewRow(c: ReviewCounts): string {
  const parts = [
    `keep ${c.keep}${c.assumed > 0 ? ` (${c.assumed} not looked at)` : ""}`,
    `fix ${c.fix}${c.fixChanged > 0 ? ` (${c.fixChanged} changed since)` : ""}`,
    `drop ${c.drop}`,
    `not judged ${c.unjudged}`,
    shortDate(c.reviewedAt),
  ];
  return `${"Review".padEnd(10)}${parts.join(" · ")}`;
}
