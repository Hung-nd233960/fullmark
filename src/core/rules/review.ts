import { z } from "zod";
import type { Question, Quiz } from "../ir";
import { shortDate } from "../review/counts";
import type { Review } from "../review/schema";
import type { Finding, QualityRule } from "./types";

const word = (path: string): string => (/\s/.test(path) ? `"${path}"` : path);

/** The command that closes the loop, with the real paths when `check` knows them (G50); `quiz rules` keeps the placeholders. */
const sinceHint = (shown: { quiz: string; review: string } | null): string =>
  `run \`quiz review ${shown ? word(shown.quiz) : "FILE"} --since ${shown ? word(shown.review) : "REVIEW"}\` and judge the change`;

export type ReviewFindings = { fix: Finding[]; drop: Finding[]; unconfirmed: Finding[] };

/**
 * What a review holds against a quiz (TECHNICAL_DESIGN.md, section 4, "`review-v2`"), each finding on the question's
 * heading line. A `keep` is never a finding, and an entry for a question no longer in the quiz is ignored. A `fix`
 * whose question has the entry's hash is unchanged (`review.fix`); a changed one waits for the learner's next
 * judgement (`review.unconfirmed`), and one judged again carries the new hash, so it is one of the first kind or a
 * `keep`. A `drop` is a finding as long as the question is in the quiz, changed or not (`review.drop`).
 */
export function reviewFindings(
  quiz: Quiz,
  review: Review,
  shown: { quiz: string; review: string } | null = null,
): ReviewFindings {
  const out: ReviewFindings = { fix: [], drop: [], unconfirmed: [] };
  const questions = new Map<string, Question>();
  for (const s of quiz.sections) for (const q of s.questions) if (q.id !== "") questions.set(q.id, q);
  const on = shortDate(review.reviewedAt);
  for (const [id, entry] of Object.entries(review.questions)) {
    const q = questions.get(id);
    if (!q || entry.verdict === "keep") continue;
    const why = entry.reasons.join(", ") + (entry.note.trim() === "" ? "" : `; "${entry.note.trim()}"`);
    const said = `${id} was marked ${entry.verdict} on ${on} (${why})`;
    if (entry.verdict === "drop") {
      out.drop.push({
        line: q.line,
        message: `${said}: the question is still in the quiz`,
        fix: "remove the question from the quiz, or judge it again with `quiz review`",
      });
    } else if (q.hash === entry.hash) {
      out.fix.push({
        line: q.line,
        message: `${said}: the question has not changed since`,
        fix: "change the question as the reasons say, or judge it again with `quiz review`",
      });
    } else {
      out.unconfirmed.push({
        line: q.line,
        message: `${said}: the question has changed since, and has not been judged again`,
        fix: sinceHint(shown),
      });
    }
  }
  return out;
}

/** `review.fix` and `review.drop` are fixed rules (`fixed.ts`); this is the quality rule, which runs only with a review. */
export const REVIEW_RULES: QualityRule[] = [
  {
    kind: "quality",
    id: "review.unconfirmed",
    level: "warning",
    summary: "a question marked fix has changed since the verdict and has not been judged again (`check --review`)",
    why: "`check --review` can prove that a flagged question changed, never that it is right now: whether the new key is the right one is the learner's call, so the loop closes only when `quiz review --since` judges the change.",
    example: "(checked by `quiz check --review review.json`: a `fix` question that has changed since the verdict)",
    fix: "run `quiz review FILE --since REVIEW` and judge the change",
    options: z.object({}).strict(),
    run: (quiz, ctx) => (ctx.review ? reviewFindings(quiz, ctx.review, ctx.shown ?? null).unconfirmed : []),
  },
];
