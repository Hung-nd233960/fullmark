import { type Api, QuestionCard } from "./questions/Card";
import { Html, messagesFor } from "./questions/shared";
import { download, exportFor, type QuizState, type Store } from "./store";

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
              return <QuestionCard key={question.id} state={state} api={api} question={question} number={number} />;
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
