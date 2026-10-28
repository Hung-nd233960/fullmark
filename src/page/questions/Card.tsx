import type { FunctionComponent } from "preact";
import type { Answer } from "../../core/attempt";
import type { PageQuestion } from "../data";
import type { Action } from "../reducer";
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
  /** the learner is on this question (the time that follows is counted to its section) */
  focus(questionId: string): void;
};

/** The card every question shares: number, points, prompt, hint, the type's body, result line, explanation. */
export function QuestionCard({
  state,
  api,
  question,
  number,
}: {
  state: QuizState;
  api: Api;
  question: PageQuestion;
  number: number;
}) {
  const quiz = state.page;
  const t = messagesFor(quiz);
  const attempt = state.attempt.value;
  const submitted = attempt.phase === "submitted";
  // the key is read for results only: it is decoded at Start (to plan the attempt) but nothing of it shows before Submit
  const key = submitted ? state.key.value : null;
  const result = state.graded.value?.questions.find((q) => q.id === question.id);
  const name = `${quiz.id}/${question.id}`;
  const c: Ctx = {
    t,
    quiz,
    name,
    answer: attempt.state.answers[question.id] ?? null,
    submitted,
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
      data-type={question.type}
      data-qid={question.id}
      onFocusIn={() => api.focus(question.id)}
    >
      <header class="fm-question-head">
        <span class="fm-question-number">{t.questionLabel(number)}</span>
        {question.graded ? <span class="fm-question-points">{t.pointsLabel(String(question.points))}</span> : null}
      </header>
      {/* a blanks prompt holds the boxes, so it has its own component, in the same slot */}
      {question.type === "blanks" ? (
        <BlanksPrompt q={question} c={c} />
      ) : (
        <Html html={question.promptHtml} class="fm-prompt" id={`${name}/prompt`} />
      )}
      {question.hintHtml !== null ? (
        <details class="fm-hint">
          <summary>{t.hint}</summary>
          <Html html={question.hintHtml} />
        </details>
      ) : null}
      <Content q={question} c={c} />
      {submitted && result ? <ResultLine t={t} result={result} quizId={quiz.id} /> : null}
      {submitted && key?.explanations[question.id] ? (
        <div class="fm-explanation">
          <strong>{t.explanation}</strong>
          <Html html={key.explanations[question.id] ?? ""} />
        </div>
      ) : null}
    </article>
  );
}
