import { z } from "zod";
import { REASONS, REASONS_OF, VERDICTS } from "./reasons";

/** `review-v2` (TECHNICAL_DESIGN.md, section 4): the learner's verdict on each question, written by `quiz review`. */
export const REVIEW_FORMAT = "fullmark-review";
export const REVIEW_VERSION = 2;

const iso = z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?$/, "an ISO date and time");
const sha = z.string().regex(/^[0-9a-f]{64}$/, "a SHA-256 in lower-case hex");

/** One question's verdict. The rules between its fields are checked here, so a reader lists every one broken. */
export const ReviewEntrySchema = z
  .object({
    verdict: z.enum(VERDICTS),
    /** empty for `keep`; at least one for `fix` and `drop` */
    reasons: z.array(z.enum(REASONS)),
    /** required (not empty) with `other`, else may be empty */
    note: z.string(),
    /** the question hash when judged (foundation 1) */
    hash: sha,
    /** `fix` and `drop` only, and required there: the question's block as judged, for the diff in `review --since` */
    source: z.string().optional(),
    /** kept by Keep the rest or the Finish dialog, not judged one by one */
    assumed: z.literal(true).optional(),
  })
  .superRefine((entry, ctx) => {
    const problem = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    const allowed = REASONS_OF[entry.verdict];
    if (entry.verdict === "keep" && entry.reasons.length > 0) problem("reasons", "a keep has no reasons");
    if (entry.verdict !== "keep" && entry.reasons.length === 0) {
      problem("reasons", `a ${entry.verdict} needs at least one reason`);
    }
    for (const r of entry.reasons) {
      if (!allowed.includes(r)) problem("reasons", `the reason "${r}" does not go with ${entry.verdict}`);
    }
    if (entry.reasons.includes("other") && entry.note.trim() === "") {
      problem("note", 'the reason "other" needs a note');
    }
    if (entry.assumed !== undefined && entry.verdict !== "keep") problem("assumed", "only a keep can be assumed");
    if (entry.source !== undefined && entry.verdict === "keep") problem("source", "a keep has no source");
    if (entry.source === undefined && entry.verdict !== "keep") {
      problem("source", `a ${entry.verdict} needs its source: the question's block as judged`);
    }
  });
export type ReviewEntry = z.infer<typeof ReviewEntrySchema>;

export const ReviewSchema = z.object({
  format: z.literal(REVIEW_FORMAT),
  version: z.literal(REVIEW_VERSION),
  quizId: z.string(),
  /** the version last reviewed; another version than the quiz's current one is expected and fine */
  quizHash: sha,
  /** ISO, local offset, of the last Finish */
  reviewedAt: iso,
  /** by question id, so a verdict follows a question when it moves */
  questions: z.record(z.string(), ReviewEntrySchema),
});
export type Review = z.infer<typeof ReviewSchema>;
