import type { Answer } from "../../core/attempt";
import type { GradedQuestion } from "../../core/grade";
import { en, type Messages, vi } from "../../core/i18n";
import type { Question } from "../../core/ir";
import type { PageGradeDetail, PageQuiz } from "../data";
import { Icon } from "../icons";
import { decimal, num } from "../results";

export type PageMessages = Messages["page"];

export const messagesFor = (quiz: PageQuiz): PageMessages => (quiz.uiLang === "vi" ? vi.page : en.page);

/** What a question's body gets: the stored answer, how to change it, and (after Submit) the grader's word. */
export type Ctx = {
  t: PageMessages;
  quiz: PageQuiz;
  /** the element id of the card; ids inside it are built from it */
  name: string;
  answer: Answer | null;
  submitted: boolean;
  /** false on the start screen's hidden copy of the questions: no plan has been drawn yet */
  started: boolean;
  /** `plan.optionOrder` for this question: source indices in the order the page shows them */
  order: readonly number[] | undefined;
  /** the source index of each entry of the question's data (an `ordering` or `matching` question's items) */
  dataOrder: readonly number[] | undefined;
  /** from `grade`, after Submit */
  result: GradedQuestion | undefined;
  /** the question as the grader has it (with its key), after Submit */
  keyed: Question | undefined;
  /** the `sample_answer` of an essay or code question, as HTML, after Submit */
  sample: string | undefined;
  /** what a grader gave this essay or code answer (a replay with a grades file) */
  grade: PageGradeDetail | undefined;
  set(answer: Answer | null): void;
};

/**
 * The entries of an `ordering` or `matching` question, each with its source index, in the order the page shows them. The
 * data holds them scrambled and never in the right order; the plan (`order`) names what to show, and `dataOrder` (from
 * the key blob) says which data entry has which source index. Before Start no plan exists, so the entries come as the
 * data has them, which nobody can answer. A started attempt without either order is a bug, not a fallback.
 */
export function shownEntries<T>(c: Ctx, id: string, entries: readonly T[]): { source: number; entry: T }[] {
  if (!c.started) return entries.map((entry, i) => ({ source: i, entry }));
  const { order, dataOrder } = c;
  if (!order || order.length !== entries.length || !dataOrder || dataOrder.length !== entries.length) {
    throw new Error(`question ${id}: the plan has no order`);
  }
  return order.map((source) => ({ source, entry: entries[dataOrder.indexOf(source)] as T }));
}

export function Html({
  html,
  tag = "div",
  class: className,
  id,
}: {
  html: string;
  tag?: "div" | "span";
  class?: string;
  id?: string;
}) {
  const Tag = tag;
  return <Tag id={id} class={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** The icon of each state, so that the word and the points are never the only sign besides colour. */
const ICONS: Record<GradedQuestion["status"], string> = {
  correct: "✓",
  partial: "◐",
  incorrect: "✕",
  unanswered: "–",
  pending: "…",
  ungraded: "•",
};

export function ResultLine({
  t,
  result,
  quizId,
  lang,
}: {
  t: PageMessages;
  result: GradedQuestion;
  quizId: string;
  lang: "en" | "vi";
}) {
  const points = result.points > 0 ? ` · ${t.scoreLine(num(result.earned ?? 0, lang), num(result.points, lang))}` : "";
  return (
    <span
      class="fm-result"
      data-status={result.status}
      data-qid={result.id}
      data-quiz={quizId}
      data-earned={result.earned ?? 0}
      data-points={result.points}
    >
      <span class="fm-icon" aria-hidden="true">
        {ICONS[result.status]}
      </span>{" "}
      <strong>{t.status[result.status]}</strong>
      {points}
    </span>
  );
}

/**
 * What a choice row says on its right after Submit, with the state's icon (the board's "Correct answer" and "Your
 * answer", bold, no pills). A correct pick shows only "Correct answer"; its accessible name still says it was the
 * learner's.
 */
export function Badges({ t, picked, right }: { t: PageMessages; picked: boolean; right: boolean }) {
  if (right) {
    return (
      <>
        {picked ? <span class="fm-sr">{`${t.yourAnswer}, `}</span> : null}
        <span class="fm-badge fm-badge-right">
          <Icon name="check" size={18} />
          {t.correctAnswer}
        </span>
      </>
    );
  }
  return picked ? (
    <span class="fm-badge fm-badge-picked">
      <Icon name="cross" size={18} />
      {t.yourAnswer}
    </span>
  ) : null;
}

/** The letter badge of a choice row: A, B, ... in the order shown. Its row says the rest, so it is hidden from readers. */
export const letterOf = (position: number): string =>
  position < 26 ? String.fromCharCode(65 + position) : String(position + 1);

/** A decimal comma in a box that wants a number, in a quiz written in English (the rule follows `lang`). */
export const wantsPoint = (quiz: PageQuiz, text: string): boolean => quiz.lang === "en" && text.includes(",");

export function CommaWarning({ t, prefix }: { t: PageMessages; prefix?: string }) {
  return (
    <p class="fm-warn" role="status">
      {prefix ? `${prefix}: ` : ""}
      {t.commaWarning}
    </p>
  );
}

/** A number as the key shows it: `−2 ± 0.01`, `3 ± 1%`, `1/3`, several joined with "or", then the unit. */
export function acceptedNumber(
  t: PageMessages,
  key: {
    raw: readonly string[];
    values: readonly number[];
    tolerance: number;
    relTolerance: number | null;
    unit?: string;
  },
  lang: "en" | "vi",
): string {
  const parts = key.values.map((v, i) => {
    const shown = (key.raw[i] ?? String(v)).trim().replace(/^-/, "−");
    // the key's own text (`2.5`) follows the interface language like every other number
    const base = lang === "vi" && /^[−+]?\d+\.\d+$/.test(shown) ? shown.replace(".", ",") : shown;
    if (key.relTolerance !== null) return key.relTolerance > 0 ? `${base} ± ${pct(key.relTolerance, lang)}%` : base;
    return key.tolerance > 0 ? `${base} ± ${decimal(key.tolerance, lang)}` : base;
  });
  const unit = key.unit ? ` ${key.unit}` : "";
  return `${parts.join(` ${t.or} `)}${unit}`;
}

const pct = (fraction: number, lang: "en" | "vi"): string => {
  const text = String(Math.round(fraction * 1e6) / 1e4);
  return lang === "vi" ? text.replace(".", ",") : text;
};

/** The learner's answer beside the accepted one, in two boxes, under a text-like question after Submit. */
export function Shown({
  t,
  given,
  correct,
  status,
}: {
  t: PageMessages;
  given: string;
  correct: string | null;
  /** the grader's word, which colours the learner's box */
  status?: GradedQuestion["status"];
}) {
  const empty = given.trim() === "";
  return (
    <dl class="fm-shown">
      <div class="fm-shown-box" data-empty={empty} data-status={empty ? undefined : status}>
        <dt>{t.yourAnswer}</dt>
        <dd>{empty ? t.noAnswer : given}</dd>
      </div>
      {correct !== null ? (
        <div class="fm-shown-box fm-shown-accepted">
          <dt>{t.acceptedAnswers}</dt>
          <dd>{correct}</dd>
        </div>
      ) : null}
    </dl>
  );
}
