import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";
import type { PageQuestion, PageSection } from "./data";
import { type Api, QuestionCard } from "./questions/Card";
import { Html, messagesFor, type PageMessages } from "./questions/shared";
import { ResultsCard } from "./ResultsCard";
import { missedIds } from "./results";
import { statusFor } from "./status";
import { download, exportFor, type QuizState, type Store } from "./store";

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

/** The start screen's Focus mode checkbox: pressing Start then enters fullscreen (a page cannot, without a click). */
function FocusBox({ t, store }: { t: PageMessages; store: Store }) {
  const { available, wanted } = store.screen;
  if (!available.value) return null;
  return (
    <label class="fm-focus-box">
      <input
        type="checkbox"
        data-focus-box
        checked={wanted.value}
        onChange={(event) => {
          wanted.value = (event.currentTarget as HTMLInputElement).checked;
        }}
      />{" "}
      {t.focusMode}
    </label>
  );
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

const CLOCK = /\d+:\d\d(?::\d\d)?/;
const FIRST_NUMBER = /\d+/;

/** A segment's text with its value in bold (the part's time in the warning colour), as the design has it. */
function Emphasis({ kind, text }: { kind: string; text: string }) {
  const found = (kind === "question" ? FIRST_NUMBER : CLOCK).exec(text);
  if (found === null || kind === "submitted" || kind === "taken" || kind === "flags") return <>{text}</>;
  const at = found.index;
  return (
    <span>
      {text.slice(0, at)}
      <b class={kind === "part" ? "fm-status-warn" : undefined}>{found[0]}</b>
      {text.slice(at + found[0].length)}
    </span>
  );
}

/** The status line: plain segments divided by thin rules, every value labelled. The timer is one of them, never hidden. */
function StatusLine({ t, state, store }: { t: PageMessages; state: QuizState; store: Store }) {
  const screen = store.screen;
  const segments = statusFor({
    page: state.page,
    attempt: state.attempt.value,
    elapsed: state.elapsed.value,
    sectionSeconds: state.sectionSeconds.value,
    current: state.current.value,
    fullscreenClock: screen.fullscreen.value ? screen.clock.value : null,
  });
  return (
    <ul class="fm-status" aria-label={t.statusLabel}>
      {segments.map((segment) => (
        <li
          key={segment.kind}
          class="fm-status-seg"
          data-seg={segment.kind}
          data-timer={segment.kind === "time" ? "" : undefined}
        >
          {segment.kind === "progress" ? (
            <>
              <span>{segment.text}</span>
              <progress
                class="fm-progress"
                max={segment.max}
                value={segment.value}
                aria-label={segment.text}
                data-progress
              />
              <b>{segment.percent}%</b>
            </>
          ) : (
            <Emphasis kind={segment.kind} text={segment.text} />
          )}
        </li>
      ))}
    </ul>
  );
}

/** Focus mode's button: fullscreen through the browser, labelled and pressed as the page really is. */
function FocusButton({ t, store }: { t: PageMessages; store: Store }) {
  const { available, fullscreen } = store.screen;
  if (!available.value) return null;
  return (
    <button
      type="button"
      class="fm-button"
      data-action="focus-mode"
      aria-pressed={fullscreen.value}
      onClick={() => store.fullscreen()}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      </svg>
      {fullscreen.value ? t.focusModeOn : t.focusMode}
    </button>
  );
}

/**
 * The docked block: the top bar (title, Focus mode, Submit), the status line under it and, after Submit, the review
 * filter. The live region for "5 minutes left" sits here too (the visible text is not live).
 */
function Dock({
  t,
  state,
  store,
  api,
  children,
}: {
  t: PageMessages;
  state: QuizState;
  store: Store;
  api: Api;
  children?: ComponentChildren;
}) {
  const answering = state.attempt.value.phase === "answering";
  return (
    <div class="fm-dock" data-dock>
      <div class="fm-topbar">
        <h1 class="fm-title">{state.page.title}</h1>
        <div class="fm-topbar-actions">
          <FocusButton t={t} store={store} />
          {answering ? (
            <button type="button" class="fm-button fm-primary" data-action="submit" onClick={() => api.submit()}>
              {t.submit}
            </button>
          ) : null}
        </div>
      </div>
      <StatusLine t={t} state={state} store={store} />
      <p class="fm-sr" role="status" aria-live="polite">
        {state.said.value}
      </p>
      {children}
    </div>
  );
}

/** All · Missed · Flagged, under the results card. The choice is not stored. */
function Filter({ t, state, missed, flagged }: { t: PageMessages; state: QuizState; missed: number; flagged: number }) {
  const all = state.attempt.value.plan.questions.length;
  const chosen = state.filter.value;
  const options = [
    { id: "all", label: t.filterAll, count: all, title: undefined },
    { id: "missed", label: t.filterMissed, count: missed, title: t.missedHint },
    { id: "flagged", label: t.filterFlagged, count: flagged, title: undefined },
  ] as const;
  return (
    <fieldset class="fm-filter">
      <legend class="fm-sr">{t.filterLabel}</legend>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          class="fm-filter-button"
          data-filter={o.id}
          aria-pressed={chosen === o.id}
          title={o.title}
          onClick={() => {
            state.filter.value = o.id;
          }}
        >
          {o.label} <span class="fm-filter-count">{o.count}</span>
        </button>
      ))}
    </fieldset>
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
  const missed = graded ? new Set(missedIds(graded)) : new Set<string>();
  const flaggedIds = new Set(attempt.state.flagged.filter((id) => attempt.plan.questions.includes(id)));
  const filter = attempt.phase === "submitted" ? state.filter.value : "all";
  const shown = (id: string): boolean =>
    filter === "all" || (filter === "missed" ? missed.has(id) : flaggedIds.has(id));

  return (
    <section class="fm-quiz" id={page.id} data-phase={attempt.phase} data-quiz={page.id}>
      {started ? (
        <Dock t={t} state={state} store={store} api={api}>
          {attempt.phase === "submitted" ? (
            <Filter t={t} state={state} missed={missed.size} flagged={flaggedIds.size} />
          ) : null}
        </Dock>
      ) : null}
      {!started || page.descriptionHtml !== null ? (
        <header class="fm-header">
          {!started ? <h1>{page.title}</h1> : null}
          {page.descriptionHtml !== null ? <Html html={page.descriptionHtml} class="fm-description" /> : null}
        </header>
      ) : null}
      {attempt.phase === "start" ? (
        <div class="fm-start">
          <p class="fm-start-facts">
            {t.questionsCount(count)}
            {page.timeLimit !== undefined ? ` · ${t.timeLimitLine(minutes(t, page.timeLimit))}` : ""}
          </p>
          <Notice t={t} state={state} />
          <FocusBox t={t} store={store} />
          {state.resume.value !== null ? (
            <Resume t={t} state={state} store={store} />
          ) : (
            <Picker t={t} state={state} api={api} />
          )}
        </div>
      ) : null}
      {attempt.phase === "answering" ? <Notice t={t} state={state} /> : null}
      {attempt.phase === "submitted" ? (
        <>
          {attempt.state.timedOut ? (
            <p class="fm-notice" role="status" data-notice="timed-out">
              {t.timedOutNote}
            </p>
          ) : null}
          {graded ? (
            <ResultsCard
              page={page}
              state={state}
              graded={graded}
              onDownload={() => {
                const file = exportFor(state, new Date());
                download(file.name, file.text);
              }}
              onNew={() => store.newAttempt(page.id)}
              onRetry={() => store.retry(page.id)}
            />
          ) : null}
        </>
      ) : null}
      <div class="fm-questions" hidden={!started}>
        {groupsOf(state).map(({ section, questions }) => (
          <section
            class="fm-section"
            key={section.id}
            hidden={!questions.some((q) => shown(q.id))}
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
              return (
                <QuestionCard
                  key={question.id}
                  state={state}
                  api={api}
                  question={question}
                  number={number}
                  hidden={!shown(question.id)}
                />
              );
            })}
          </section>
        ))}
      </div>
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
          start: () => {
            // inside the click: a browser allows fullscreen only after a gesture
            if (store.screen.wanted.value && store.screen.available.value) store.fullscreen(true);
            store.start(id, { part: state.part.value });
          },
          submit: () => store.submit(id),
          flag: (questionId) => store.dispatch(id, { type: "flag", question: questionId }),
          check: (questionId) => store.check(id, questionId),
          focus: (questionId) => store.focus(id, questionId),
        };
        return <QuizView key={id} state={state} api={api} store={store} />;
      })}
    </main>
  );
}
