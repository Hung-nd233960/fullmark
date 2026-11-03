/**
 * What the printed paper needs (TECHNICAL_DESIGN.md, section 8, "Printable paper"): text is HTML rendered at build, in
 * the order the plan drew. With `answers: none` it holds no key, no explanation, no sample answer and no rubric (an
 * exam paper): a question's `key` is set only for `key` and `inline`, and nothing of the answer is ever put in here
 * otherwise.
 */
type Base = { number: number; pointsLabel: string | null; promptHtml: string; key?: KeyEntry };

/** A rubric as the key prints it (TECHNICAL_DESIGN.md, section 6): a preset by its name and criteria, not its descriptors. */
export type RubricView = {
  /** the heading's number and points are the question's; a preset's name goes here */
  preset: string | null;
  mode: "holistic" | "additive" | "banded";
  /** the criteria: HTML, with the points (additive) or the weight (banded) as the paper writes them */
  rows: { html: string; value: string | null }[];
  /** the scale line of a banded rubric, or "Score 0 to 4 points" of a holistic one; null for an additive one */
  line: string | null;
};

/** What the key says about one question. */
export type KeyEntry = {
  /** the answer cell's lines, plain text */
  lines: string[];
  note: string | null;
  /** the points as a number ("2"), or null when the question is not marked */
  points: string | null;
  /** the letter or T/F for the answer sheet's grid; null: not on the sheet */
  sheet: string | null;
  explanationHtml: string | null;
  rubric: RubricView | null;
  sampleHtml: string | null;
};

export type PaperQuestion = Base &
  (
    | { type: "single" | "multi"; options: { html: string; line: boolean }[]; twoColumns: boolean }
    | { type: "truefalse" }
    | { type: "short" }
    | { type: "blanks" }
    | { type: "numeric"; unit: string }
    | { type: "fields"; fields: string[] }
    | { type: "scale"; points: { value: number; labelHtml: string | null }[] }
    | { type: "ordering"; items: string[] }
    | { type: "matching"; lefts: string[]; rights: string[] }
    | { type: "essay" | "code"; lines: number; starterHtml: string | null }
  );

export type PaperPart = {
  /** the part's title as the quiz writes it; null for the one untitled section of a quiz without `#` */
  title: string | null;
  pointsLabel: string;
  /** the points as a number, for the marker's table */
  max: string;
  introHtml: string;
  questions: PaperQuestion[];
};

export type PaperData = {
  lang: "en" | "vi";
  title: string;
  /** the quiz's short version: the first 4 hex characters of its hash */
  version: string;
  /** `--seed`, exactly as given */
  code: string | null;
  /** the time allowed in words, when the quiz has a `time_limit` */
  time: string | null;
  /** the total in words ("37 points"), null when the quiz has no points */
  total: string | null;
  totalMax: string;
  parts: PaperPart[];
  /** `none` is an exam paper; `key` adds the key page after the paper; `inline` is a study sheet */
  answers: "none" | "key" | "inline";
  /** the materials page, when the paper carries it: each sheet's heading and its content as HTML */
  materials: { name: string; html: string }[] | null;
  /** the answer sheet: the numbers of its questions in paper order, and the sentence under its heading */
  sheet: { numbers: number[]; note: string } | null;
};
