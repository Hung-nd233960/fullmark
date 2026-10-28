import type { Plan } from "../core/attempt";
import type { Quiz } from "../core/ir";
import { decodeKey } from "../core/keyblob";

/**
 * What the page needs of a quiz (TECHNICAL_DESIGN.md, section 7, "Seams for later features": a page holds a list of
 * quizzes). Text is HTML, rendered at build. Every answer key and explanation is in `key`, obfuscated.
 */
export type PageChoice = { html: string; input: { prompt: string | null } | null };

/** What every question carries to the page. The key (accepted values, tolerances, `[x]`) is never in here. */
type PageBase = {
  id: string;
  points: number;
  graded: boolean;
  promptHtml: string;
  hintHtml: string | null;
};

/** A union on `type`: each type holds only what the learner may see before Submit. */
export type PageQuestion = PageBase &
  (
    | { type: "single"; choices: PageChoice[] }
    | { type: "multi"; choices: PageChoice[] }
    | { type: "truefalse" }
    | { type: "numeric"; unit: string }
    | { type: "short" }
    /** `promptHtml` holds the blanks as inputs; `blankCount` is how many there are */
    | { type: "blanks"; blankCount: number }
    /** `graded`: the field is scored; `numeric`: the box warns about a decimal comma (the answer stays in the key) */
    | { type: "fields"; fields: { labelHtml: string; graded: boolean; numeric: boolean }[] }
    | { type: "scale"; min: number; max: number; labels: { value: number; html: string }[] }
  );

export type PageSection = { id: string; title: string | null; introHtml: string; questions: PageQuestion[] };

export type PageQuiz = {
  /** the quiz's id (front matter `id`, else the file name): it scopes element ids and storage */
  id: string;
  hash: string;
  title: string;
  description: string | null;
  /** the interface language of the page chrome */
  uiLang: "en" | "vi";
  /** the language the quiz is written in: a numeric box warns about a decimal comma only for `en` */
  lang: "en" | "vi";
  sections: PageSection[];
  plan: Plan;
  /** the answer key blob (`core/keyblob`) */
  key: string;
};

export type PageData = { version: 1; quizzes: PageQuiz[] };

/** What the blob holds: the quiz IR without its presentation text, and each explanation as HTML. */
export type KeyBlob = { quiz: Quiz; explanations: Record<string, string> };

/** The quiz the grader runs on: the blob, decoded. Same IR the CLI grades, so the same score. */
export function openKey(page: PageQuiz): KeyBlob {
  return decodeKey(page.key, page.hash) as KeyBlob;
}
