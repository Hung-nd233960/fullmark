import { parse } from "yaml";
import { z } from "zod";
import { PURPOSES } from "../ir";

/**
 * The brief question file (COMMANDS.md, `quiz brief`; `src/brief/questions.yaml`). One file drives the flags, the
 * `--web` form and the `--tui` form, so they ask the same questions in the same words. Pure: the text in, the questions
 * out; the CLI reads the file. Every text is given in `en` and `vi`.
 */

export const Text = z.object({ en: z.string().min(1), vi: z.string().min(1) }).strict();
export type Text = z.infer<typeof Text>;

const Value = z.union([z.string(), z.number(), z.array(z.string())]);
export type QuestionValue = z.infer<typeof Value>;

const Choice = z
  .object({
    value: z.string(),
    label: Text,
    hint: Text,
    /** the purposes for which this choice is in the default of a `multi` */
    "default-for": z.array(z.enum(PURPOSES)).optional(),
  })
  .strict();
export type Choice = z.infer<typeof Choice>;

const FollowUp = z
  .object({
    /** the brief key inside `content` the answer is written to */
    key: z.string(),
    flag: z.string(),
    /** the choice that opens the text box */
    when: z.string(),
    label: Text,
    help: Text,
  })
  .strict();

export const Question = z
  .object({
    key: z.string(),
    flag: z.string(),
    kind: z.enum(["choice", "multi", "text", "number"]),
    /** the step of `--tui` and of the web form */
    section: z.string(),
    label: Text,
    help: Text,
    choices: z.array(Choice).optional(),
    "min-words": z.number().int().min(1).optional(),
    example: Text.optional(),
    "follow-up": FollowUp.optional(),
    "human-only": z.boolean().optional(),
    /** a human-only value that may be left empty: it never makes a run need input */
    optional: z.boolean().optional(),
    default: Value.optional(),
    "default-by-purpose": z.partialRecord(z.enum(PURPOSES), z.string()).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    const problem = (message: string): void => {
      ctx.addIssue({ code: "custom", message: `${q.key}: ${message}` });
    };
    const choosing = q.kind === "choice" || q.kind === "multi";
    if (choosing && (q.choices === undefined || q.choices.length === 0)) problem("a choice question needs choices");
    if (!choosing && q.choices !== undefined) problem("only a choice or multi question has choices");
    if (choosing && q.choices && new Set(q.choices.map((c) => c.value)).size !== q.choices.length)
      problem("a choice value appears twice");
    if ((q["min-words"] === undefined) !== (q.example === undefined)) problem("min-words and example go together");
    if (q["min-words"] !== undefined && q.kind !== "text") problem("min-words is for a text question");
    if (q["follow-up"] !== undefined && !q.choices?.some((c) => c.value === q["follow-up"]?.when))
      problem("follow-up names a choice that does not exist");
    if ((q.min !== undefined || q.max !== undefined) && q.kind !== "number") problem("min and max are for a number");
    if (q["default-by-purpose"] !== undefined && q.kind !== "text")
      problem("default-by-purpose is for a text question");
    if (q.optional === true && q["human-only"] !== true) problem("optional is for a human-only question");
    if (q.choices?.some((c) => c["default-for"] !== undefined) && q.kind !== "multi")
      problem("default-for is for a multi question");
    if (q.kind === "number" && typeof q.default !== "number") problem("a number question needs a numeric default");
  });
export type Question = z.infer<typeof Question>;

export const QuestionFile = z
  .object({
    sections: z.array(z.object({ id: z.string(), title: Text }).strict()).min(1),
    questions: z.array(Question).min(1),
  })
  .strict()
  .superRefine((file, ctx) => {
    const ids = new Set(file.sections.map((s) => s.id));
    const keys = new Set<string>();
    for (const q of file.questions) {
      if (!ids.has(q.section)) ctx.addIssue({ code: "custom", message: `${q.key}: no section called ${q.section}` });
      if (keys.has(q.key)) ctx.addIssue({ code: "custom", message: `${q.key}: appears twice` });
      keys.add(q.key);
    }
  });
export type QuestionFile = z.infer<typeof QuestionFile>;

/** Reads the text of the question file. Throws an `Error` naming the first problem when it is not valid. */
export function parseQuestions(text: string): QuestionFile {
  const result = QuestionFile.safeParse(parse(text));
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(
      `the brief question file is not valid: ${first?.path.join(".") ?? ""} ${first?.message ?? ""}`.trim(),
    );
  }
  return result.data;
}

export type Lang = "en" | "vi";

export function questionOf(file: QuestionFile, key: string): Question {
  const q = file.questions.find((x) => x.key === key);
  if (!q) throw new Error(`the brief question file has no question ${key}`);
  return q;
}

/**
 * The value of a question when nothing is given: for a multi, the choices marked for the purpose; for a text with
 * `default-by-purpose`, the purpose's value; else the question's `default`. `overrides` are the machine config's
 * `[brief.purpose.<purpose>]` table, which replace the defaults of a purpose.
 */
export function defaultOf(
  q: Question,
  purpose: (typeof PURPOSES)[number],
  overrides: Readonly<Record<string, QuestionValue>> = {},
): QuestionValue {
  const own = overrides[q.key];
  if (own !== undefined) return own;
  if (q.kind === "multi" && q.choices?.some((c) => c["default-for"] !== undefined))
    return q.choices.filter((c) => c["default-for"]?.includes(purpose)).map((c) => c.value);
  const byPurpose = q["default-by-purpose"]?.[purpose];
  if (byPurpose !== undefined) return byPurpose;
  if (q.default !== undefined) return q.default;
  return q.kind === "multi" ? [] : q.kind === "number" ? 0 : "";
}

/** The words of a text answer, as a detail rule counts them. */
export const wordCount = (text: string): number => text.split(/\s+/).filter((w) => w !== "").length;

/** A number answer checked against its question: the value, or what is wrong with it (`must be ..., not "x"`). */
export function parseNumber(q: Question, given: string, whole: boolean): { value: number } | { problem: string } {
  const min = q.min ?? 0;
  const range = q.max === undefined ? `${min} or more` : `from ${min} to ${q.max}`;
  const text = given.trim();
  const n = Number(text);
  if (
    !(whole ? /^\d+$/ : /^\d+(\.\d+)?$/).test(text) ||
    !Number.isFinite(n) ||
    n < min ||
    (q.max !== undefined && n > q.max)
  )
    return { problem: `must be ${whole ? "a whole number" : "a number"}, ${range}, not "${given}"` };
  return { value: n };
}
