import { z } from "zod";

/**
 * The quiz IR (TECHNICAL_DESIGN.md, section 4): what `parse` builds from a quiz file. Every node carries `line`,
 * its 1-based line in the file as written. Prompts, choices, explanations and passages are Markdown source
 * strings; turning them into HTML is the build's job. The schemas here are the single definition: the types are
 * inferred from them. Later slices add Plan, Attempt, results and grades to this file.
 */
const line = z.number().int().positive();

// -- front matter -----------------------------------------------------------------------------------------------

export const THEMES = ["auto", "light", "dark", "oled", "white", "paper"] as const;
export const FONTS = ["system", "sans", "serif", "readable"] as const;

export const FrontMatterSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  /** the quiz's slug: the `id` key, else the file name slugged */
  id: z.string(),
  kind: z.enum(["quiz", "survey"]),
  /** the language the quiz is written in */
  lang: z.enum(["en", "vi"]),
  /** the interface language; `lang` when not given */
  uiLang: z.enum(["en", "vi"]),
  /** the check profile named in the file; `default`, or `survey` for a survey */
  profile: z.string(),
  /** seconds; null when untimed */
  timeLimit: z.number().positive().nullable(),
  onTimeout: z.enum(["submit", "warn"]),
  feedback: z.enum(["end", "instant"]),
  /** percent of auto-graded points; null when there is none */
  passMark: z.number().min(0).max(100).nullable(),
  shuffleQuestions: z.boolean(),
  shuffleChoices: z.boolean(),
  partial: z.boolean(),
  theme: z.enum(THEMES),
  font: z.enum(FONTS),
  look: z.enum(["free", "locked"]),
  tags: z.array(z.string()),
  generatedBy: z.string().nullable(),
});
export type FrontMatter = z.infer<typeof FrontMatterSchema>;

// -- rubrics ----------------------------------------------------------------------------------------------------

/** One criterion of a rubric, or one bullet of a holistic one. */
export const RubricCriterionSchema = z.object({
  line,
  /** explicit `id`, else the text slugged */
  id: z.string(),
  explicitId: z.boolean(),
  /** the text without the `(0.5 pts)` shorthand */
  text: z.string(),
  /** from the shorthand or `points:`; null when the criterion has none */
  points: z.number().nullable(),
  /** banded rubrics only */
  weight: z.number().nullable(),
});
export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;

/**
 * A rubric as written (TECHNICAL_DESIGN.md, section 6). The structure is parsed; whether it is consistent (the
 * `rubric.*` rules) is checked in the grading slice. `mode` is null when none was declared.
 */
export const RubricSchema = z.object({
  line,
  mode: z.enum(["holistic", "additive", "banded"]).nullable(),
  preset: z.enum(["ielts-writing-task1", "ielts-writing-task2"]).nullable(),
  step: z.number().nullable(),
  scale: z.object({ min: z.number(), max: z.number(), step: z.number() }).nullable(),
  round: z.enum(["nearest-step", "down", "ielts"]).nullable(),
  criteria: z.array(RubricCriterionSchema),
});
export type Rubric = z.infer<typeof RubricSchema>;

// -- questions --------------------------------------------------------------------------------------------------

/** A piece of Markdown source with the line it starts on. */
export const TextSchema = z.object({ line, text: z.string() });
export type Text = z.infer<typeof TextSchema>;

export const ChoiceSchema = z.object({
  line,
  /** Markdown, without the marker and the `{input}` block */
  text: z.string(),
  /** `[x]`; always false when the question is ungraded */
  correct: z.boolean(),
  /** `{input}` or `{input="…"}`: ask for a few words when picked */
  input: z.object({ prompt: z.string().nullable() }).nullable(),
});
export type Choice = z.infer<typeof ChoiceSchema>;

const NumberKey = z.object({
  /** the accepted values; `value: x` is `values: [x]` */
  values: z.array(z.number()),
  /** the values as written, since a fraction matches within rounding */
  raw: z.array(z.string()),
  tolerance: z.number(),
  relTolerance: z.number().nullable(),
  unit: z.string(),
});
export type NumberKey = z.infer<typeof NumberKey>;

const TextKey = z.object({ accept: z.array(z.string()), patterns: z.array(z.string()) });
export type TextKey = z.infer<typeof TextKey>;

export const BlankSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), line, answers: z.array(z.string()) }),
  z.object({ kind: z.literal("numeric"), line, value: z.number(), raw: z.string(), tolerance: z.number() }),
]);
export type Blank = z.infer<typeof BlankSchema>;

export const FieldSchema = z.object({
  line,
  /** Markdown */
  label: z.string(),
  /** null: an ungraded field */
  key: z
    .discriminatedUnion("kind", [
      NumberKey.extend({ kind: z.literal("numeric") }),
      TextKey.extend({ kind: z.literal("text") }),
    ])
    .nullable(),
  /** absolute points, null when none were written */
  points: z.number().nullable(),
});
export type Field = z.infer<typeof FieldSchema>;

const QuestionBase = z.object({
  line,
  /** the question's identity across versions */
  id: z.string(),
  points: z.number().positive(),
  tags: z.array(z.string()),
  source: z.string().nullable(),
  /** false when `graded=false`, in a survey, and for `scale` */
  graded: z.boolean(),
  shuffle: z.boolean().nullable(),
  partial: z.boolean().nullable(),
  case: z.enum(["sensitive", "insensitive"]),
  /** `check-ignore` and `because`, kept as written; `ignore.invalid` is judged by the rule registry */
  ignore: z.object({ line, rules: z.array(z.string()), because: z.string().nullable() }).nullable(),
  /** Markdown: the heading text, then the body up to the answer */
  prompt: z.string(),
  hint: TextSchema.nullable(),
  explanation: TextSchema.nullable(),
  /** SHA-256 of the normalised block with the `id` pair removed (TECHNICAL_DESIGN.md, foundation 1) */
  hash: z.string(),
});

const Open = {
  rubric: RubricSchema.nullable(),
  sampleAnswer: z.string().nullable(),
  /** shown on the page before submit; default true */
  showRubric: z.boolean(),
};

export const QuestionSchema = z.discriminatedUnion("type", [
  QuestionBase.extend({ type: z.literal("single"), choices: z.array(ChoiceSchema) }),
  QuestionBase.extend({ type: z.literal("multi"), choices: z.array(ChoiceSchema) }),
  QuestionBase.extend({ type: z.literal("truefalse"), value: z.boolean() }),
  QuestionBase.extend({ type: z.literal("numeric"), key: NumberKey }),
  QuestionBase.extend({ type: z.literal("short"), key: TextKey }),
  QuestionBase.extend({ type: z.literal("blanks"), blanks: z.array(BlankSchema) }),
  QuestionBase.extend({ type: z.literal("fields"), fields: z.array(FieldSchema) }),
  QuestionBase.extend({ type: z.literal("ordering"), items: z.array(TextSchema) }),
  QuestionBase.extend({
    type: z.literal("matching"),
    pairs: z.array(z.object({ line, left: z.string(), right: z.string() })),
    /** right-hand items with no left side */
    distractors: z.array(TextSchema),
  }),
  QuestionBase.extend({
    type: z.literal("essay"),
    minWords: z.number().int().nullable(),
    /** null: no maximum (`0` in the source) */
    maxWords: z.number().int().nullable(),
    ...Open,
  }),
  QuestionBase.extend({
    type: z.literal("code"),
    language: z.string(),
    starter: z.string().nullable(),
    ...Open,
  }),
  QuestionBase.extend({
    type: z.literal("scale"),
    min: z.number().int(),
    max: z.number().int(),
    labels: z.array(z.object({ line, value: z.number().int(), text: z.string() })),
  }),
]);
export type Question = z.infer<typeof QuestionSchema>;
export type QuestionType = Question["type"];

export const QUESTION_TYPES = [
  "single",
  "multi",
  "truefalse",
  "numeric",
  "short",
  "blanks",
  "fields",
  "ordering",
  "matching",
  "essay",
  "code",
  "scale",
] as const satisfies readonly QuestionType[];

// -- sections and the quiz --------------------------------------------------------------------------------------

export const SectionSchema = z.object({
  line,
  /** null for the one section of a quiz with no `#` heading */
  title: z.string().nullable(),
  /** `id=` or the title slugged; empty for an untitled section */
  id: z.string(),
  /** a suggested time in seconds */
  time: z.number().positive().nullable(),
  /** a bank: each attempt draws this many questions */
  pick: z.number().int().positive().nullable(),
  /** Markdown between the heading and the first question, without its passages */
  intro: z.string(),
  passages: z.array(TextSchema),
  questions: z.array(QuestionSchema),
});
export type Section = z.infer<typeof SectionSchema>;

export const QuizSchema = z.object({
  file: z.string(),
  frontMatter: FrontMatterSchema,
  sections: z.array(SectionSchema),
});
export type Quiz = z.infer<typeof QuizSchema>;

/** A file a quiz refers to, as written, with the line of the reference. Resolved by the CLI, never by core. */
export type AssetRef = { path: string; line: number };
