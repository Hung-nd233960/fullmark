import type { FunctionComponent } from "preact";
import { useState } from "preact/hooks";
import type { Answer } from "../../core/attempt";
import type { PageQuestion } from "../data";
import { Icon } from "../icons";
import type { Action } from "../reducer";
import { num } from "../results";
import type { QuizState } from "../store";
import { Blanks, BlanksPrompt } from "./Blanks";
import { ChoiceList } from "./ChoiceList";
import { Fields } from "./Fields";
import { Matching } from "./Matching";
import { Numeric } from "./Numeric";
import { Code, Essay } from "./Open";
import { Ordering } from "./Ordering";
import { Scale } from "./Scale";
import { Short } from "./Short";
import { type Ctx, Html, messagesFor, ResultLine } from "./shared";
import { TrueFalse } from "./TrueFalse";

type Body<T extends PageQuestion["type"]> = FunctionComponent<{ q: Extract<PageQuestion, { type: T }>; c: Ctx }>;

/** One component per type, chosen by this table. */
const BODIES: { [T in PageQuestion["type"]]: Body<T> } = {
  single: ({ q, c }) => <ChoiceList q={q} c={c} multi={false} />,
  multi: ({ q, c }) => <ChoiceList q={q} c={c} multi />,
  truefalse: TrueFalse,
  numeric: Numeric,
  short: Short,
  blanks: Blanks,
  fields: Fields,
  scale: Scale,
  ordering: Ordering,
  matching: Matching,
  essay: Essay,
  code: Code,
};

export type Api = {
  dispatch(action: Action): void;
  /** Start, with the part chosen on the start screen */
  start(): void;
  submit(): void;
  /** flag the question for review, or take the flag off */
  flag(questionId: string): void;
  /** `feedback: instant`: check the question */
  check(questionId: string): void;
  /** the learner is on this question (the time that follows is counted to its section) */
  focus(questionId: string): void;
};

/** The card every question shares: number, points, prompt, hint, the type's body, result line, explanation. */
export function QuestionCard({
  state,
  api,
  question,
  number,
  hidden = false,
}: {
  state: QuizState;
  api: Api;
  question: PageQuestion;
  number: number;
  /** the review filter hides the card; the DOM order never changes */
  hidden?: boolean;
}) {
  const quiz = state.page;
  const t = messagesFor(quiz);
  const [hintOpen, setHintOpen] = useState(false);
  const attempt = state.attempt.value;
  const submitted = attempt.phase === "submitted";
  const checked = attempt.state.checked.includes(question.id);
  // the key is read for results only: it is decoded at Start (to plan the attempt) but nothing of it shows before
  // Submit, except for a question the learner has checked (`feedback: instant`)
  const revealed = submitted || checked;
  const key = revealed ? state.key.value : null;
  const result = submitted
    ? state.graded.value?.questions.find((q) => q.id === question.id)
    : state.checks.value[question.id];
  const flagged = attempt.state.flagged.includes(question.id);
  const answered = attempt.state.answers[question.id] != null;
  // essays, code and questions that carry no score are graded after Submit
  const checkable =
    quiz.feedback === "instant" &&
    attempt.phase === "answering" &&
    !checked &&
    question.graded &&
    question.type !== "essay" &&
    question.type !== "code";
  const name = `${quiz.id}/${question.id}`;
  const c: Ctx = {
    t,
    quiz,
    name,
    answer: attempt.state.answers[question.id] ?? null,
    submitted: revealed,
    started: attempt.phase !== "start",
    order: attempt.plan.optionOrder?.[question.id],
    dataOrder: state.key.value?.dataOrder[question.id],
    result,
    keyed: key?.quiz.sections.flatMap((s) => s.questions).find((q) => q.id === question.id),
    sample: key?.samples[question.id],
    set: (answer: Answer | null) => api.dispatch({ type: "answer", question: question.id, answer }),
  };
  const Content = BODIES[question.type] as Body<PageQuestion["type"]>;
  return (
    <article
      class="fm-question"
      id={name}
      hidden={hidden}
      data-type={question.type}
      data-qid={question.id}
      data-status={revealed ? result?.status : undefined}
      data-flagged={flagged ? "true" : undefined}
      data-checked={checked ? "true" : undefined}
      onFocusIn={() => api.focus(question.id)}
    >
      <header class="fm-question-head">
        <span class="fm-question-meta">
          <span class="fm-question-number">{t.questionLabel(number)}</span>
          {question.graded ? (
            <span class="fm-question-points">{t.pointsLabel(num(question.points, quiz.uiLang))}</span>
          ) : null}
          {question.type === "single" || question.type === "multi" ? (
            <span class="fm-kind">{question.type === "multi" ? t.chooseAll : t.chooseOne}</span>
          ) : null}
          {question.tags.map((tag) => (
            <span key={tag} class="fm-tag">{`#${tag}`}</span>
          ))}
          {attempt.phase !== "answering" && flagged ? (
            <span class="fm-flag-mark" data-flag-mark>
              {t.flaggedMark}
            </span>
          ) : null}
        </span>
        <span class="fm-question-end">
          {attempt.phase === "answering" ? (
            <button
              type="button"
              class="fm-flag"
              data-action="flag"
              aria-pressed={flagged}
              aria-label={flagged ? `${t.flagForReview}: ${t.flaggedMark}` : t.flagForReview}
              onClick={() => api.flag(question.id)}
            >
              <Icon name="flag" />
              {flagged ? t.flaggedMark : t.flag}
            </button>
          ) : null}
          {revealed && result ? <ResultLine t={t} result={result} quizId={quiz.id} lang={quiz.uiLang} /> : null}
        </span>
      </header>
      {/* a blanks prompt holds the boxes, so it has its own component, in the same slot */}
      {question.type === "blanks" ? (
        <BlanksPrompt q={question} c={c} />
      ) : (
        <Html html={question.promptHtml} class="fm-prompt" id={`${name}/prompt`} />
      )}
      {question.hintHtml !== null ? (
        <div class="fm-hint" data-open={hintOpen ? "true" : undefined}>
          <button
            type="button"
            class="fm-button fm-hint-toggle"
            data-action="hint"
            aria-expanded={hintOpen}
            aria-controls={`${name}/hint`}
            onClick={() => setHintOpen(!hintOpen)}
          >
            {hintOpen ? t.hideHint : t.hint}
          </button>
          {hintOpen ? (
            <div class="fm-hint-box" id={`${name}/hint`}>
              <span class="fm-hint-label">{t.hint}</span>
              <Html html={question.hintHtml} class="fm-hint-text" />
            </div>
          ) : null}
        </div>
      ) : null}
      <Content q={question} c={c} />
      {checkable ? (
        <button
          type="button"
          class="fm-button fm-check"
          data-action="check"
          disabled={!answered}
          onClick={() => api.check(question.id)}
        >
          {t.check}
        </button>
      ) : null}
      {revealed && key?.explanations[question.id] ? (
        <div class="fm-explanation">
          <strong class="fm-explanation-label">{t.explanation}</strong>
          <Html html={key.explanations[question.id] ?? ""} class="fm-explanation-text" />
        </div>
      ) : null}
    </article>
  );
}
