/**
 * The words of `review-v2` that carry no code of the schema: the verdicts and the reasons each takes. The review form
 * (`src/review/`, a browser bundle) imports this file, so it holds no zod; `schema.ts` builds its schema from it.
 */
export const VERDICTS = ["keep", "fix", "drop"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** The reasons for a `fix` that fit every question, then those for essays and code. */
export const FIX_REASONS = ["key-wrong", "unclear", "other"] as const;
export const RUBRIC_REASONS = ["rubric-loose", "points-misallocated", "criterion-unclear"] as const;
export const DROP_REASONS = ["duplicate", "off-scope", "too-easy", "other"] as const;

export const REASONS = [...FIX_REASONS, ...RUBRIC_REASONS, "duplicate", "off-scope", "too-easy"] as const;
export type ReasonId = (typeof REASONS)[number];

/** The reasons a verdict takes; none for `keep`. */
export const REASONS_OF: Record<Verdict, readonly ReasonId[]> = {
  keep: [],
  fix: [...FIX_REASONS, ...RUBRIC_REASONS],
  drop: DROP_REASONS,
};

/** The question types the rubric reasons are for. */
export const RUBRIC_TYPES: readonly string[] = ["essay", "code"];

/** What the form decided about one question: the entry without the hash and the source, which the quiz gives. */
export type Judged = { verdict: Verdict; reasons: readonly ReasonId[]; note: string; assumed?: true };

/**
 * Why a verdict is not complete (the form holds Finish back, the server answers 400): a fix or a drop with no reason,
 * a reason that does not go with the verdict or the question's type, `other` with no note. Empty: it is fine.
 */
export function judgedProblems(judged: Judged, type: string): string[] {
  const out: string[] = [];
  const allowed = REASONS_OF[judged.verdict];
  if (judged.verdict === "keep" && judged.reasons.length > 0) out.push("a keep has no reasons");
  if (judged.verdict !== "keep" && judged.reasons.length === 0)
    out.push(`a ${judged.verdict} needs at least one reason`);
  for (const r of judged.reasons) {
    if (!allowed.includes(r)) out.push(`the reason "${r}" does not go with ${judged.verdict}`);
    else if ((RUBRIC_REASONS as readonly string[]).includes(r) && !RUBRIC_TYPES.includes(type)) {
      out.push(`the reason "${r}" is for essays and code, and this is a ${type} question`);
    }
  }
  if (judged.reasons.includes("other") && judged.note.trim() === "") out.push('the reason "other" needs a note');
  if (judged.assumed !== undefined && judged.verdict !== "keep") out.push("only a keep can be assumed");
  return out;
}
