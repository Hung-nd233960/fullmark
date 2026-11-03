/**
 * What the printed paper needs (TECHNICAL_DESIGN.md, section 8, "Printable paper"): text is HTML rendered at build, in
 * the order the plan drew. It holds no key, no explanation, no sample answer and no rubric: `answers: none` is an exam
 * paper, and nothing of the answer is ever put in here.
 */
type Base = { number: number; pointsLabel: string | null; promptHtml: string };

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
  /** the answer sheet: the numbers of its questions in paper order, and the sentence under its heading */
  sheet: { numbers: number[]; note: string } | null;
};
