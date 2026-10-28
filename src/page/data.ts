import type { Plan } from "../core/attempt";
import type { Quiz } from "../core/ir";
import { decodeKey } from "../core/keyblob";

/**
 * What the page needs of a quiz (TECHNICAL_DESIGN.md, section 7, "Seams for later features": a page holds a list of
 * quizzes). Text is HTML, rendered at build. Every answer key and explanation is in `key`, obfuscated.
 */
export type PageChoice = { html: string; input: { prompt: string | null } | null };

export type PageQuestion = {
  id: string;
  type: "single";
  points: number;
  graded: boolean;
  promptHtml: string;
  hintHtml: string | null;
  choices: PageChoice[];
};

export type PageSection = { id: string; title: string | null; introHtml: string; questions: PageQuestion[] };

export type PageQuiz = {
  /** the quiz's id (front matter `id`, else the file name): it scopes element ids and storage */
  id: string;
  hash: string;
  title: string;
  description: string | null;
  /** the interface language of the page chrome */
  uiLang: "en" | "vi";
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
