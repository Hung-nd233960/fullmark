import type { Quiz } from "../core/ir";
import { decodeKey } from "../core/keyblob";
import type { Choice } from "../core/themes";

/**
 * What the page needs of a quiz (TECHNICAL_DESIGN.md, section 7, "Seams for later features": a page holds a list of
 * quizzes). Text is HTML, rendered at build. Every answer key and explanation is in `key`, obfuscated.
 */
/** An item the learner moves or picks: its HTML, and its text for a label or an option */
export type PageItem = { html: string; label: string };

/** A criterion of a rubric the page shows before Submit */
export type PageCriterion = { html: string; points: number | null };

export type PageChoice = { html: string; input: { prompt: string | null } | null };

/** What every question carries to the page. The key (accepted values, tolerances, `[x]`) is never in here. */
type PageBase = {
  id: string;
  points: number;
  graded: boolean;
  promptHtml: string;
  hintHtml: string | null;
  /** the author's tags, shown as `#tag` in the card's header */
  tags: string[];
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
    /** `items` in the order the page shows them (`plan.optionOrder`), never in source order */
    | { type: "ordering"; items: PageItem[] }
    /** `lefts` in source order; `rights` in the shown order, distractors included */
    | { type: "matching"; lefts: string[]; rights: PageItem[] }
    /** `rubric`: its criteria when `show_rubric` is true, else null */
    | { type: "essay"; minWords: number | null; maxWords: number | null; rubric: PageCriterion[] | null }
    | { type: "code"; language: string; starter: string | null; rubric: PageCriterion[] | null }
  );

/** `pick`: a bank, each attempt draws this many; `time`: the suggested seconds. Both are absent when the section has none. */
export type PageSection = {
  id: string;
  title: string | null;
  introHtml: string;
  questions: PageQuestion[];
  pick?: number;
  time?: number;
};

export type PageQuiz = {
  /** the quiz's id (front matter `id`, else the file name): it scopes element ids and storage */
  id: string;
  hash: string;
  title: string;
  /** the description as HTML (maths included), null when there is none */
  descriptionHtml: string | null;
  /** `feedback: instant` (absent for the default, `end`): each auto-graded question has a Check button */
  feedback?: "instant";
  /** seconds; absent when the quiz is untimed */
  timeLimit?: number;
  /** percent of the auto-graded points; absent when the quiz has no goal (shown on the start screen) */
  passMark?: number;
  /** the interface language of the page chrome */
  uiLang: "en" | "vi";
  /** the language the quiz is written in: a numeric box warns about a decimal comma only for `en` */
  lang: "en" | "vi";
  sections: PageSection[];
  /** the answer key blob (`core/keyblob`) */
  key: string;
  /** the materials sheets in the order listed, as HTML; absent when the quiz has none */
  materials?: { name: string; html: string }[];
  /** present (true) when the quiz has maths: the page then carries KaTeX's styles and fonts */
  hasMath?: true;
};

/** `focus`: tick the start screen's Focus mode box (step 3's `--focus`; `build` never sets it) */
export type PageData = {
  version: 1;
  quizzes: PageQuiz[];
  focus?: true;
  /** the quiz's recommended `theme` (the first quiz's, on a page of several): the page opens in it (absent: `auto`) */
  theme?: Choice;
  /** `free`: the Appearance menu; `locked`: no menu, and a stored look is ignored (absent: `free`) */
  look?: "free" | "locked";
};

/**
 * What the blob holds: the quiz IR without its presentation text (the page plans an attempt from it at Start), and
 * each explanation as HTML. `samples`: each essay's and code question's `sample_answer`, as HTML. `dataOrder`: for each
 * `ordering` and `matching` question, the source index of each entry in the page data, which holds them scrambled (the
 * data never lists them in the right order).
 */
export type KeyBlob = {
  quiz: Quiz;
  explanations: Record<string, string>;
  samples: Record<string, string>;
  dataOrder: Record<string, number[]>;
};

/** The quiz the grader runs on: the blob, decoded. Same IR the CLI grades, so the same score. */
export function openKey(page: PageQuiz): KeyBlob {
  return decodeKey(page.key, page.hash) as KeyBlob;
}
