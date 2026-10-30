import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { AppearanceButton, AppearanceMenu, TextSize } from "./Appearance";
import type { PageQuestion, PageQuiz, PageSection } from "./data";
import { Icon, type IconName } from "./icons";
import { LicencesButton } from "./Licences";
import { MaterialsButton, MaterialsPanel } from "./Materials";
import { currentOf, sideForm } from "./map";
import { type Api, QuestionCard } from "./questions/Card";
import { Html, messagesFor, type PageMessages } from "./questions/shared";
import { ResultsCard } from "./ResultsCard";
import { limitOf, missedIds, num } from "./results";
import { Sidebar, SidebarButton } from "./Sidebar";
import { mixedPoints, quizCount, quizPoints, sectionPoints, wholeTime } from "./start";
import { compactParts, stampParts, statusFor } from "./status";
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

/** The start screen's Focus mode checkbox: pressing Start then enters fullscreen (a page cannot, without a click). */
function FocusBox({ t, store }: { t: PageMessages; store: Store }) {
  const { available, wanted } = store.screen;
  if (!available.value) return null;
  return (
    <label class="fm-focus-box" data-checked={wanted.value}>
      <input
        type="checkbox"
        data-focus-box
        checked={wanted.value}
        onChange={(event) => {
          wanted.value = (event.currentTarget as HTMLInputElement).checked;
        }}
      />
      <span class="fm-choice-body">
        <strong>{t.focusMode}</strong>
        <span class="fm-detail">{t.focusModeDetail}</span>
      </span>
    </label>
  );
}

/** The facts tiles: questions and points always, the time limit and the pass mark when the quiz has them. */
function Facts({ t, page }: { t: PageMessages; page: PageQuiz }) {
  const tiles: { id: string; label: string; value: string; icon: IconName }[] = [
    {
      id: "questions",
      label: t.factQuestions,
      value: num(quizCount(page), page.uiLang),
      icon: "list",
    },
  ];
  const points = quizPoints(page);
  if (points !== undefined) {
    tiles.push({
      id: "points",
      label: t.pointsCell,
      value: num(points, page.uiLang),
      icon: "star",
    });
  }
  if (page.timeLimit !== undefined) {
    tiles.push({
      id: "time",
      label: t.factTimeLimit,
      value: t.duration(page.timeLimit),
      icon: "timer",
    });
  }
  if (page.passMark !== undefined) {
    tiles.push({
      id: "pass",
      label: t.factPassMark,
      value: `${num(page.passMark, page.uiLang)}%`,
      icon: "flag",
    });
  }
  return (
    <ul class="fm-start-facts">
      {tiles.map((tile) => (
        <li key={tile.id} class="fm-tile" data-fact={tile.id}>
          <span class="fm-label">
            <Icon name={tile.icon} size={15} />
            {tile.label}
          </span>
          <span class="fm-tile-value">{tile.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** The rules cells: feedback, what happens at the deadline (timed quizzes), and whether the attempt is saved. */
function Rules({ t, state }: { t: PageMessages; state: QuizState }) {
  const page = state.page;
  const blocked = state.blocked.value;
  const cells: {
    id: string;
    icon: IconName;
    title: string;
    body: ComponentChildren;
  }[] = [
    page.feedback === "instant"
      ? {
          id: "feedback",
          icon: "speech",
          title: t.ruleFeedbackInstant,
          body: t.ruleFeedbackInstantBody,
        }
      : {
          id: "feedback",
          icon: "speech",
          title: t.ruleFeedbackEnd,
          body: t.ruleFeedbackEndBody,
        },
  ];
  if (page.timeLimit !== undefined) {
    cells.push({
      id: "timeout",
      icon: "timer",
      title: t.ruleTimeout,
      body: t.ruleTimeoutBody,
    });
  }
  cells.push(
    blocked
      ? {
          id: "saved",
          icon: "save",
          title: t.ruleNotSaved,
          body: (
            <span role="status" data-notice="storage">
              {t.storageBlocked}
            </span>
          ),
        }
      : {
          id: "saved",
          icon: "save",
          title: t.ruleSaved,
          body: t.ruleSavedBody,
        },
  );
  return (
    <section class="fm-rules" aria-labelledby={`${page.id}/rules-title`}>
      <h2 id={`${page.id}/rules-title`}>{t.rulesHeading}</h2>
      <div class="fm-rules-box">
        {cells.map((cell) => (
          <div key={cell.id} class="fm-rule" data-rule={cell.id}>
            <strong>
              <Icon name={cell.icon} size={18} />
              {cell.title}
            </strong>
            <span>{cell.body}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The part picker (the whole quiz pinned first, then the titled sections in a list of 5 visible rows). */
function Picker({ t, state }: { t: PageMessages; state: QuizState }) {
  const page = state.page;
  const parts = page.sections.filter((s) => s.title !== null);
  const chosen = state.part.value;
  const pick = (id: string | null) => {
    state.part.value = id;
  };
  if (parts.length === 0) return null;
  const time = wholeTime(page);
  const wholePoints = quizPoints(page);
  const many = parts.length > 5;
  return (
    <fieldset class="fm-parts">
      <legend>{t.choosePart}</legend>
      <label class="fm-part fm-part-whole" data-checked={chosen === null}>
        <input type="radio" name={`${page.id}/part`} value="" checked={chosen === null} onChange={() => pick(null)} />
        <span class="fm-part-text">
          <span class="fm-part-name">
            <strong>{t.wholeQuiz}</strong> <span class="fm-recommend">{t.recommended}</span>
          </span>
          <span class="fm-part-meta">
            {[
              t.partsCount(parts.length),
              t.partQuestions(null, quizCount(page)),
              ...(wholePoints === undefined ? [] : [t.pointsLabel(num(wholePoints, page.uiLang))]),
            ].join(" · ")}
          </span>
        </span>
        {time !== undefined ? <span class="fm-part-time">{t.duration(time)}</span> : null}
      </label>
      <div class="fm-part-head">
        <span>{t.orOnePart}</span>
        {many ? <span>{t.partsScroll(parts.length)}</span> : null}
      </div>
      <div class={many ? "fm-part-scroll fm-part-scroll-many" : "fm-part-scroll"}>
        <div class="fm-part-list">
          {parts.map((s, i) => (
            <label class="fm-part" key={s.id} data-checked={chosen === s.id}>
              <input
                type="radio"
                name={`${page.id}/part`}
                value={s.id}
                checked={chosen === s.id}
                onChange={() => pick(s.id)}
              />
              <span class="fm-part-text">
                <strong>{t.partTitle(i + 1, s.title ?? "")}</strong>
                <span class="fm-part-meta">
                  {[
                    t.partQuestions(s.pick ?? null, s.questions.length),
                    ...(mixedPoints(s) ? [] : [t.pointsLabel(num(sectionPoints(s), page.uiLang))]),
                  ].join(" · ")}
                </span>
              </span>
              {s.time !== undefined ? <span class="fm-part-time">{t.suggestedTime(minutes(t, s.time))}</span> : null}
            </label>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

/** "Started 26 Oct · 13 of 32 answered · 21:18 left on the clock", or "... · 18:00 used" when untimed. */
function resumeLine(t: PageMessages, page: PageQuiz, resume: NonNullable<QuizState["resume"]["value"]>): string {
  const stamp = stampParts(resume.attempt.state.startedAt ?? "");
  const limit = limitOf(page, resume.attempt);
  return [
    ...(stamp === null ? [] : [t.startedOn(stamp.day, t.monthsShort[stamp.month - 1] ?? "")]),
    t.answeredOf(resume.answered, resume.total),
    limit === undefined ? t.clockUsed(clockText(resume.used)) : t.clockLeft(clockText(limit - resume.used)),
  ].join(" · ");
}

/** The banner of an attempt that can be continued: how far it got, Start over (which asks first) and Continue. */
function Resume({ t, state, store }: { t: PageMessages; state: QuizState; store: Store }) {
  const resume = state.resume.value;
  const dialog = useRef<HTMLDialogElement>(null);
  if (resume === null) return null;
  const id = state.page.id;
  return (
    <div class="fm-resume-banner">
      <div class="fm-resume-text">
        <strong>{t.unfinishedAttempt}</strong>
        <span class="fm-resume-line" data-resume>
          {resumeLine(t, state.page, resume)}
        </span>
      </div>
      <div class="fm-resume">
        <button type="button" class="fm-button" data-action="start-over" onClick={() => dialog.current?.showModal()}>
          {t.startOver}
        </button>
        <button
          type="button"
          class="fm-button fm-primary"
          data-action="continue"
          onClick={() => store.continueAttempt(id)}
        >
          {t.continue}
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
    </div>
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
  const phone = store.screen.phone.value;
  const label = fullscreen.value ? t.focusModeOn : t.focusMode;
  return (
    <button
      type="button"
      class={phone ? "fm-button fm-icon-button" : "fm-button"}
      data-action="focus-mode"
      aria-pressed={fullscreen.value}
      aria-label={phone ? label : undefined}
      title={phone ? label : undefined}
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
      {phone ? null : label}
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
  const dock = useRef<HTMLDivElement>(null);
  // the sidebar and the cards' scroll margin sit below the docked block, whatever height it wraps to
  useEffect(() => {
    const el = dock.current;
    const quiz = el?.parentElement;
    if (!el || !quiz) return;
    const measure = (): void => quiz.style.setProperty("--dock-h", `${el.offsetHeight}px`);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const phone = store.screen.phone.value;
  const screen = store.screen;
  const line = phone
    ? compactParts({
        page: state.page,
        attempt: state.attempt.value,
        elapsed: state.elapsed.value,
        sectionSeconds: state.sectionSeconds.value,
        current: state.current.value,
        fullscreenClock: screen.fullscreen.value ? screen.clock.value : null,
      })
    : [];
  return (
    <div class="fm-dock" data-dock data-phone={phone ? "true" : undefined} ref={dock}>
      <div class="fm-topbar">
        {phone ? (
          <>
            <h1 class="fm-sr">{state.page.title}</h1>
            <span class="fm-phone-line" data-compact>
              {line.map((part, i) => (
                <span key={part.kind}>
                  {i > 0 ? " · " : null}
                  <Emphasis kind={part.kind === "progress" ? "question" : part.kind} text={part.text} />
                </span>
              ))}
            </span>
          </>
        ) : (
          <h1 class="fm-title">{state.page.title}</h1>
        )}
        <div class="fm-topbar-actions">
          <SidebarButton t={t} state={state} store={store} />
          <FocusButton t={t} store={store} />
          {phone ? null : <TextSize t={t} store={store} />}
          {store.look.locked && !phone ? null : <AppearanceButton t={t} store={store} />}
          {answering ? (
            <button type="button" class="fm-button fm-primary" data-action="submit" onClick={() => api.submit()}>
              {t.submit}
            </button>
          ) : null}
        </div>
      </div>
      {phone ? null : <StatusLine t={t} state={state} store={store} />}
      <p class="fm-sr" role="status" aria-live="polite">
        {state.said.value}
      </p>
      {children}
      {store.look.locked && !phone ? null : <AppearanceMenu t={t} store={store} />}
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
      <div class="fm-filter-group">
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
      </div>
    </fieldset>
  );
}

function QuizView({ state, api, store, last }: { state: QuizState; api: Api; store: Store; last: boolean }) {
  const { page } = state;
  const t = messagesFor(page);
  const attempt = state.attempt.value;
  const graded = state.graded.value;
  const started = attempt.phase !== "start";
  const phone = store.screen.phone.value;
  const form = sideForm(page, attempt.phase, phone);
  const wide =
    !phone &&
    started &&
    state.sidebar.value &&
    (form === "stacked" || (form === "tabs" && state.side.value === "materials"));
  // on a phone an open sidebar (or the start screen's Materials panel) takes the screen: what is under it is not there
  const covered = phone && (started ? state.sidebar.value : state.shelf.value);
  const materials = page.materials !== undefined && page.materials.length > 0;
  let number = 0;
  const missed = graded ? new Set(missedIds(graded)) : new Set<string>();
  const flaggedIds = new Set(attempt.state.flagged.filter((id) => attempt.plan.questions.includes(id)));
  const filter = attempt.phase === "submitted" ? state.filter.value : "all";
  // the card the status line and the map call current; none after Submit and none in Focus mode
  const currentId =
    attempt.phase === "answering" && !store.screen.fullscreen.value
      ? currentOf(attempt.plan.questions, state.current.value)
      : null;
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
      <div
        class="fm-body"
        data-side={started && state.sidebar.value ? "open" : "closed"}
        data-wide={wide ? "true" : undefined}
      >
        <div
          class="fm-main"
          data-covered={covered ? "true" : undefined}
          inert={covered}
          aria-hidden={covered ? "true" : undefined}
        >
          {attempt.phase === "start" ? <Resume t={t} state={state} store={store} /> : null}
          {!started ? (
            <header class="fm-header">
              <h1>{page.title}</h1>
              {page.descriptionHtml !== null ? <Html html={page.descriptionHtml} class="fm-description" /> : null}
            </header>
          ) : null}
          {attempt.phase === "start" ? (
            <>
              <Facts t={t} page={page} />
              {state.resume.value === null ? <Picker t={t} state={state} /> : null}
              <Rules t={t} state={state} />
              <FocusBox t={t} store={store} />
              {state.resume.value === null ? (
                <div class="fm-start">
                  <button
                    type="button"
                    class="fm-button fm-primary fm-start-button"
                    data-action="start"
                    onClick={() => api.start()}
                  >
                    {t.start}
                  </button>
                  {materials ? <MaterialsButton t={t} state={state} /> : null}
                  <span class="fm-clock-note">{materials ? t.clockStartsMaterials : t.clockStarts}</span>
                </div>
              ) : null}
            </>
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
                      current={question.id === currentId}
                      hidden={!shown(question.id)}
                    />
                  );
                })}
              </section>
            ))}
          </div>
          {/* the page's foot, after the last question; Focus mode shows nothing but the quiz: no button, no tab stop */}
          {last && !store.screen.fullscreen.value ? <LicencesButton t={t} /> : null}
        </div>
        {started && state.sidebar.value ? <Sidebar t={t} state={state} store={store} /> : null}
        {attempt.phase === "start" && materials && state.shelf.value ? <MaterialsPanel t={t} state={state} /> : null}
      </div>
    </section>
  );
}

export function App({ store }: { store: Store }) {
  return (
    <main class="fm-page">
      {[...store.quizzes.values()].map((state, index, all) => {
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
        return <QuizView key={id} state={state} api={api} store={store} last={index === all.length - 1} />;
      })}
    </main>
  );
}
