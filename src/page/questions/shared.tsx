import type { Answer } from "../../core/attempt";
import type { GradedQuestion } from "../../core/grade";
import { en, type Messages, vi } from "../../core/i18n";
import type { Question } from "../../core/ir";
import type { PageQuiz } from "../data";

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
  /** from `grade`, after Submit */
  result: GradedQuestion | undefined;
  /** the question as the grader has it (with its key), after Submit */
  keyed: Question | undefined;
  set(answer: Answer | null): void;
};

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

export function ResultLine({ t, result, quizId }: { t: PageMessages; result: GradedQuestion; quizId: string }) {
  const points = result.points > 0 ? ` · ${t.scoreLine(String(result.earned ?? 0), String(result.points))}` : "";
  return (
    <p
      class="fm-result"
      data-status={result.status}
      data-qid={result.id}
      data-quiz={quizId}
      data-earned={result.earned ?? 0}
      data-points={result.points}
    >
      <strong>{t.status[result.status]}</strong>
      {points}
    </p>
  );
}

/** "Your answer" and "Correct answer" badges, as words so that colour is never the only sign. */
export function Badges({ t, picked, right }: { t: PageMessages; picked: boolean; right: boolean }) {
  return (
    <>
      {picked ? <span class="fm-badge fm-badge-picked">{t.yourAnswer}</span> : null}
      {right ? <span class="fm-badge fm-badge-right">{t.correctAnswer}</span> : null}
    </>
  );
}

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
): string {
  const parts = key.values.map((v, i) => {
    const base = (key.raw[i] ?? String(v)).trim().replace(/^-/, "−");
    if (key.relTolerance !== null) return key.relTolerance > 0 ? `${base} ± ${pct(key.relTolerance)}%` : base;
    return key.tolerance > 0 ? `${base} ± ${key.tolerance}` : base;
  });
  const unit = key.unit ? ` ${key.unit}` : "";
  return `${parts.join(` ${t.or} `)}${unit}`;
}

const pct = (fraction: number): string => String(Math.round(fraction * 1e6) / 1e4);

/** The `Your answer` / `Correct answer` pair under a text-like question after Submit. */
export function Shown({ t, given, correct }: { t: PageMessages; given: string; correct: string | null }) {
  return (
    <dl class="fm-shown">
      <dt>{t.yourAnswer}</dt>
      <dd>{given.trim() === "" ? t.noAnswer : given}</dd>
      {correct !== null ? (
        <>
          <dt>{t.correctAnswer}</dt>
          <dd>{correct}</dd>
        </>
      ) : null}
    </dl>
  );
}
