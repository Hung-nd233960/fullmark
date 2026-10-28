import { readAnswer } from "../core/attempt/answers";
import type { GradedQuestion } from "../core/grade";
import { en, type Messages, vi } from "../core/i18n";
import type { PageQuestion, PageQuiz } from "./data";
import type { Action } from "./reducer";
import { download, exportFor, type QuizState, type Store } from "./store";

type PageMessages = Messages["page"];

/** A quiz's own handle on the store: its components never see another quiz's attempt. */
type Api = { dispatch(action: Action): void; start(): void; submit(): void };

const messagesFor = (quiz: PageQuiz): PageMessages => (quiz.uiLang === "vi" ? vi.page : en.page);

/** Element ids carry the quiz id (seam 3), so two quizzes in one document never collide: `signals/q12`. */
const questionId = (quizId: string, id: string): string => `${quizId}/${id}`;

function Html({ html, tag = "div", class: className }: { html: string; tag?: "div" | "span"; class?: string }) {
  const Tag = tag;
  return <Tag class={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function ResultLine({ t, result, quizId }: { t: PageMessages; result: GradedQuestion; quizId: string }) {
  const points = result.points > 0 ? ` · ${t.scoreLine(String(result.earned ?? 0), String(result.points))}` : "";
  return (
    <p class="fm-result" data-status={result.status} data-qid={result.id} data-quiz={quizId}>
      <strong>{t.status[result.status]}</strong>
      {points}
    </p>
  );
}

function SingleQuestion({
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
  const t = messagesFor(state.page);
  const quizId = state.page.id;
  const attempt = state.attempt.value;
  const submitted = attempt.phase === "submitted";
  const answer = readAnswer("single", attempt.state.answers[question.id]);
  const picked = answer?.choice ?? null;
  const key = state.key.value;
  const keyed = key?.quiz.sections.flatMap((s) => s.questions).find((q) => q.id === question.id);
  const result = state.graded.value?.questions.find((q) => q.id === question.id);
  const name = questionId(quizId, question.id);

  const set = (choice: number, text?: string) =>
    api.dispatch({
      type: "answer",
      question: question.id,
      answer: { choice, ...(text !== undefined ? { inputs: { [String(choice)]: text } } : {}) },
    });

  return (
    <article class="fm-question" id={name} data-type="single" data-qid={question.id}>
      <header class="fm-question-head">
        <span class="fm-question-number">{t.questionLabel(number)}</span>
        {question.graded ? <span class="fm-question-points">{t.pointsLabel(String(question.points))}</span> : null}
      </header>
      <Html html={question.promptHtml} class="fm-prompt" />
      {question.hintHtml !== null ? (
        <details class="fm-hint">
          <summary>{t.hint}</summary>
          <Html html={question.hintHtml} />
        </details>
      ) : null}
      <ul class="fm-choices">
        {question.choices.map((choice, i) => {
          const isRight = submitted && keyed?.type === "single" && keyed.choices[i]?.correct === true;
          const isPicked = picked === i;
          return (
            <li key={i} class="fm-choice" data-picked={isPicked} data-correct={isRight}>
              <label for={`${name}/c${i}`}>
                <input
                  type="radio"
                  id={`${name}/c${i}`}
                  name={name}
                  value={i}
                  checked={isPicked}
                  disabled={submitted}
                  onChange={() => set(i)}
                />
                <Html html={choice.html} tag="span" class="fm-choice-text" />
              </label>
              {choice.input !== null && isPicked ? (
                <input
                  type="text"
                  class="fm-choice-input"
                  aria-label={choice.input.prompt ?? t.inputPlaceholder}
                  placeholder={choice.input.prompt ?? t.inputPlaceholder}
                  value={answer?.inputs?.[String(i)] ?? ""}
                  disabled={submitted}
                  onInput={(e) => set(i, (e.currentTarget as HTMLInputElement).value)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {submitted && result ? <ResultLine t={t} result={result} quizId={quizId} /> : null}
      {submitted && key?.explanations[question.id] ? (
        <div class="fm-explanation">
          <strong>{t.explanation}</strong>
          <Html html={key.explanations[question.id] ?? ""} />
        </div>
      ) : null}
    </article>
  );
}

function QuizView({ state, api }: { state: QuizState; api: Api }) {
  const { page } = state;
  const t = messagesFor(page);
  const attempt = state.attempt.value;
  const graded = state.graded.value;
  const started = attempt.phase !== "start";
  let number = 0;
  const count = page.sections.reduce((n, s) => n + s.questions.length, 0);

  return (
    <section class="fm-quiz" id={page.id} data-phase={attempt.phase} data-quiz={page.id}>
      <header class="fm-header">
        <h1>{page.title}</h1>
        {page.description !== null ? <p class="fm-description">{page.description}</p> : null}
      </header>
      {attempt.phase === "start" ? (
        <div class="fm-start">
          <p>{t.questionsCount(count)}</p>
          <button type="button" class="fm-button fm-primary" data-action="start" onClick={() => api.start()}>
            {t.start}
          </button>
        </div>
      ) : null}
      <div class="fm-questions" hidden={!started}>
        {page.sections.map((section) => (
          <section
            class="fm-section"
            key={section.id}
            id={section.title !== null ? `${page.id}/${section.id}` : undefined}
          >
            {section.title !== null ? <h2>{section.title}</h2> : null}
            {section.introHtml !== "" ? <Html html={section.introHtml} class="fm-intro" /> : null}
            {section.questions.map((question) => {
              number += 1;
              return <SingleQuestion key={question.id} state={state} api={api} question={question} number={number} />;
            })}
          </section>
        ))}
      </div>
      {attempt.phase === "answering" ? (
        <div class="fm-actions">
          <button type="button" class="fm-button fm-primary" data-action="submit" onClick={() => api.submit()}>
            {t.submit}
          </button>
        </div>
      ) : null}
      {attempt.phase === "submitted" ? (
        <div class="fm-actions">
          {graded ? (
            <p class="fm-total" data-earned={graded.total.earned} data-points={graded.total.points}>
              <strong>{t.yourScore}:</strong> {t.scoreLine(String(graded.total.earned), String(graded.total.points))}
            </p>
          ) : null}
          <button
            type="button"
            class="fm-button"
            data-action="export"
            title={t.exportHint}
            onClick={() => {
              const file = exportFor(state, new Date());
              download(file.name, file.text);
            }}
          >
            {t.export}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function App({ store }: { store: Store }) {
  return (
    <main class="fm-page">
      {[...store.quizzes.values()].map((state) => {
        const id = state.page.id;
        const api: Api = {
          dispatch: (action) => store.dispatch(id, action),
          start: () => store.start(id),
          submit: () => store.submit(id),
        };
        return <QuizView key={id} state={state} api={api} />;
      })}
    </main>
  );
}
