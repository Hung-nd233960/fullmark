import { useRef } from "preact/hooks";
import type { PageQuestion, PageSection } from "./data";
import { type Api, QuestionCard } from "./questions/Card";
import { Html, messagesFor, type PageMessages } from "./questions/shared";
import { clockText, download, exportFor, type QuizState, type Store } from "./store";

/** The questions of the plan, in its order, with the section each belongs to; a section's run of questions is one group. */
function groupsOf(state: QuizState): { section: PageSection; questions: PageQuestion[] }[] {
  const owner = new Map<string, { section: PageSection; question: PageQuestion }>();
  for (const section of state.page.sections) {
    for (const question of section.questions) owner.set(question.id, { section, question });
  }
  const groups: { section: PageSection; questions: PageQuestion[] }[] = [];
  for (const id of state.attempt.value.plan.questions) {
    const found = owner.get(id);
    if (!found) continue;
    const last = groups.at(-1);
    if (last && last.section === found.section) last.questions.push(found.question);
    else groups.push({ section: found.section, questions: [found.question] });
  }
  return groups;
}

const minutes = (t: PageMessages, seconds: number): string => t.duration(seconds);

function Notice({ t, state }: { t: PageMessages; state: QuizState }) {
  return state.blocked.value ? (
    <p class="fm-notice" role="status" data-notice="storage">
      {t.storageBlocked}
    </p>
  ) : null;
}

/** The part picker (the whole quiz pinned first, then the titled sections in a list of 5 visible rows) and Start. */
function Picker({ t, state, api }: { t: PageMessages; state: QuizState; api: Api }) {
  const parts = state.page.sections.filter((s) => s.title !== null);
  const whole = state.page.sections.reduce((n, s) => n + (s.pick ?? s.questions.length), 0);
  const chosen = state.part.value;
  const pick = (id: string | null) => {
    state.part.value = id;
  };
  return (
    <>
      {parts.length > 0 ? (
        <fieldset class="fm-parts">
          <legend>{t.choosePart}</legend>
          <label class="fm-part fm-part-whole">
            <input
              type="radio"
              name={`${state.page.id}/part`}
              value=""
              checked={chosen === null}
              onChange={() => pick(null)}
            />
            <span class="fm-part-text">
              <strong>{t.wholeQuiz}</strong> <span class="fm-badge fm-badge-right">{t.recommended}</span>
              <span class="fm-part-meta">{t.partQuestions(null, whole)}</span>
            </span>
          </label>
          <div class="fm-part-list">
            {parts.map((s) => (
              <label class="fm-part" key={s.id}>
                <input
                  type="radio"
                  name={`${state.page.id}/part`}
                  value={s.id}
                  checked={chosen === s.id}
                  onChange={() => pick(s.id)}
                />
                <span class="fm-part-text">
                  <strong>{s.title}</strong>
                  <span class="fm-part-meta">
                    {t.partQuestions(s.pick ?? null, s.questions.length)}
                    {s.time !== undefined ? ` · ${t.suggestedTime(minutes(t, s.time))}` : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <button type="button" class="fm-button fm-primary" data-action="start" onClick={() => api.start()}>
        {t.start}
      </button>
    </>
  );
}

/** Continue (how far it got) and Start over, which asks first. */
function Resume({ t, state, store }: { t: PageMessages; state: QuizState; store: Store }) {
  const resume = state.resume.value;
  const dialog = useRef<HTMLDialogElement>(null);
  if (resume === null) return null;
  const id = state.page.id;
  return (
    <>
      <p class="fm-resume-line" data-resume>
        {t.progressSoFar(resume.answered, resume.total, minutes(t, resume.used))}
      </p>
      <div class="fm-resume">
        <button
          type="button"
          class="fm-button fm-primary"
          data-action="continue"
          onClick={() => store.continueAttempt(id)}
        >
          {t.continue}
        </button>
        <button type="button" class="fm-button" data-action="start-over" onClick={() => dialog.current?.showModal()}>
          {t.startOver}
        </button>
      </div>
      <dialog ref={dialog} class="fm-dialog" aria-labelledby={`${id}/over-title`}>
        <h2 id={`${id}/over-title`}>{t.startOverQuestion}</h2>
        <p>{t.startOverBody}</p>
        <div class="fm-dialog-actions">
          <button
            type="button"
            class="fm-button fm-primary"
            data-action="confirm-start-over"
            onClick={() => {
              dialog.current?.close();
              store.startOver(id);
            }}
          >
            {t.startOver}
          </button>
          <button type="button" class="fm-button" data-action="cancel" onClick={() => dialog.current?.close()}>
            {t.cancel}
          </button>
        </div>
      </dialog>
    </>
  );
}

/** The timer line above the questions, and the live region for "5 minutes left" (the visible text is not live). */
function Timer({ t, state }: { t: PageMessages; state: QuizState }) {
  const limit = state.page.timeLimit;
  const elapsed = state.elapsed.value;
  const text =
    limit === undefined
      ? t.timeSoFar(clockText(elapsed))
      : limit - elapsed > 0
        ? t.timeLeft(clockText(limit - elapsed))
        : t.timeUp;
  return (
    <div class="fm-timer-bar">
      <p class="fm-timer" data-timer>
        {text}
      </p>
      <p class="fm-sr" role="status" aria-live="polite">
        {state.said.value}
      </p>
    </div>
  );
}

function QuizView({ state, api, store }: { state: QuizState; api: Api; store: Store }) {
  const { page } = state;
  const t = messagesFor(page);
  const attempt = state.attempt.value;
  const graded = state.graded.value;
  const started = attempt.phase !== "start";
  const count = page.sections.reduce((n, s) => n + (s.pick ?? s.questions.length), 0);
  let number = 0;

  return (
    <section class="fm-quiz" id={page.id} data-phase={attempt.phase} data-quiz={page.id}>
      <header class="fm-header">
        <h1>{page.title}</h1>
        {page.descriptionHtml !== null ? <Html html={page.descriptionHtml} class="fm-description" /> : null}
      </header>
      {attempt.phase === "start" ? (
        <div class="fm-start">
          <p class="fm-start-facts">
            {t.questionsCount(count)}
            {page.timeLimit !== undefined ? ` · ${t.timeLimitLine(minutes(t, page.timeLimit))}` : ""}
          </p>
          <Notice t={t} state={state} />
          {state.resume.value !== null ? (
            <Resume t={t} state={state} store={store} />
          ) : (
            <Picker t={t} state={state} api={api} />
          )}
        </div>
      ) : null}
      {attempt.phase === "answering" ? (
        <>
          <Timer t={t} state={state} />
          <Notice t={t} state={state} />
        </>
      ) : null}
      <div class="fm-questions" hidden={!started}>
        {groupsOf(state).map(({ section, questions }) => (
          <section
            class="fm-section"
            key={section.id}
            id={section.title !== null ? `${page.id}/${section.id}` : undefined}
          >
            {section.title !== null ? (
              <h2>
                {section.title}
                {section.time !== undefined ? (
                  <span class="fm-section-time"> · {t.suggestedTime(minutes(t, section.time))}</span>
                ) : null}
              </h2>
            ) : null}
            {section.introHtml !== "" ? <Html html={section.introHtml} class="fm-intro" /> : null}
            {questions.map((question) => {
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
          {attempt.state.timedOut ? (
            <p class="fm-notice" role="status" data-notice="timed-out">
              {t.timedOutNote}
            </p>
          ) : null}
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
          <button type="button" class="fm-button" data-action="new-attempt" onClick={() => store.newAttempt(page.id)}>
            {t.newAttempt}
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
          start: () => store.start(id, { part: state.part.value }),
          submit: () => store.submit(id),
          focus: (questionId) => store.focus(id, questionId),
        };
        return <QuizView key={id} state={state} api={api} store={store} />;
      })}
    </main>
  );
}
