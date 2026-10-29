import { type Signal, signal } from "@preact/signals";
import type { Attempt, Plan } from "../core/attempt";
import { resultsOf } from "../core/attempt/serialise";
import { type Graded, type GradedQuestion, grade } from "../core/grade";
import { en, vi } from "../core/i18n";
import { planFor } from "../core/plan";
import { type KeyBlob, openKey, type PageData, type PageQuiz } from "./data";
import { createEvents, type Events } from "./events";
import { type Action, newAttempt, reduce } from "./reducer";
import { limitOf, missedIds } from "./results";
import { attemptKey, quizPrefix, readSaved, type Saver, saverOver, saveText, sidebarKey, sidebarStart } from "./saved";
import { drawSeed } from "./seed";

/** An autosaved attempt that can be continued: how far it got, for the start screen. */
export type Resume = { attempt: Attempt; startMs: number | null; answered: number; total: number; used: number };

/** One quiz on the page: its data, its Attempt and, after Submit, its score. Nothing here is global (seam 2). */
export type QuizState = {
  page: PageQuiz;
  attempt: Signal<Attempt>;
  graded: Signal<Graded | null>;
  key: Signal<KeyBlob | null>;
  /** when the attempt started, in milliseconds: the deadline of a timed quiz counts from here */
  startedAt: number | null;
  /** the part chosen on the start screen: a section's id, or null for the whole quiz */
  part: Signal<string | null>;
  /** an autosaved attempt in progress, offered as Continue on the start screen */
  resume: Signal<Resume | null>;
  /** true once the browser has refused to save: the page works, without resume, and says so */
  blocked: Signal<boolean>;
  /** seconds on the clock, for the timer line */
  elapsed: Signal<number>;
  /** what a polite live region says: "5 minutes left" */
  said: Signal<string>;
  /** `feedback: instant`: the result of each checked question, by id */
  checks: Signal<Record<string, GradedQuestion>>;
  /** the review filter under the results card; not stored */
  filter: Signal<"all" | "missed" | "flagged">;
  /** the question the learner last focused or answered; null before any (the status line then names the first) */
  current: Signal<string | null>;
  /** seconds spent in each section so far, as the clock counts them (the attempt's copy is saved every 5 seconds) */
  sectionSeconds: Signal<Record<string, number>>;
  /** the sidebar is open (the question map) */
  sidebar: Signal<boolean>;
  /** the parts the learner opened or closed in the map, by section id; a part not here is open when it holds the current question. Not stored. */
  mapOpen: Signal<Record<string, boolean>>;
  /** the part chosen in the stacked sidebar's tab list; null follows the part that holds the current question. Not stored. */
  miniPart: Signal<string | null>;
  /** the tab the sidebar opens at after Submit (a quiz with materials); not stored */
  side: Signal<"questions" | "materials">;
  /** the sheet shown in every place that shows sheets, by index; for the page's life, never in the attempt */
  sheet: Signal<number>;
  /** the start screen's Materials panel is open */
  shelf: Signal<boolean>;
};

/** The browser's screen, for Focus mode: set once the page is running, never at build */
export type Screen = {
  /** `document.fullscreenEnabled`: false at build, and where the browser has no fullscreen for pages */
  available: Signal<boolean>;
  /** the page is fullscreen right now */
  fullscreen: Signal<boolean>;
  /** the start screen's Focus mode checkbox */
  wanted: Signal<boolean>;
  /** the local time as `14:05`, for the status line in fullscreen */
  clock: Signal<string>;
};

export type StartOptions = { part?: string | null; seed?: string; now?: Date };

export type Store = {
  events: Events;
  screen: Screen;
  /** `Map<QuizId, Attempt>` (TECHNICAL_DESIGN.md, seam 2), with the rest of each quiz's state beside it */
  quizzes: Map<string, QuizState>;
  dispatch(quizId: string, action: Action): void;
  /** Start: draws a seed and the plan (the whole quiz, or the one `part`). A `Date` stands for `{ now }`. */
  start(quizId: string, options?: StartOptions | Date): void;
  submit(quizId: string, now?: Date): void;
  /** Check one answered question (`feedback: instant`): its result shows and its answer locks */
  check(quizId: string, questionId: string): void;
  /** Retry missed: a new attempt of this plan's missed questions, with a fresh seed, replacing the saved one */
  retry(quizId: string, seed?: string): void;
  /** the learner is on this question: its section gets the time that follows */
  focus(quizId: string, questionId: string): void;
  /** Opens, closes or (without `open`) toggles a quiz's sidebar, and stores the choice. */
  sidebar(quizId: string, open?: boolean): void;
  /** the quiz the sidebar keys act on: the first one that has started */
  sidebarTarget(): string | null;
  /** Focus mode: fullscreen on, off or toggled. A refused request is ignored. */
  fullscreen(on?: boolean): void;
  /** reads what was saved: a submitted attempt shows its results, one in progress is offered as Continue */
  restore(): void;
  continueAttempt(quizId: string): void;
  /** discards the autosaved attempt in progress */
  startOver(quizId: string): void;
  /** clears a submitted attempt and goes back to the start screen */
  newAttempt(quizId: string): void;
  /** moves every clock to `now` (ms); the interval of `run` calls it each second */
  tick(now?: number): void;
  /** starts the clock: a tick each second, and saving when the page is hidden or left. Returns what stops it. */
  run(): () => void;
};

/** What the store needs from its surroundings; the defaults are the browser's. */
export type Deps = {
  events?: Events;
  now?: () => number;
  /** where to save; absent: nothing is saved (the build, tests) */
  storage?: () => Storage | null | undefined;
  /** random bytes for the seed */
  bytes?: (n: number) => Uint8Array;
  /** the window width, for the sidebar's first state; the default is `window.innerWidth` */
  width?: () => number;
};

const pad = (n: number): string => String(n).padStart(2, "0");

/** The learner's local time as the page writes it into results: `2026-10-23T16:02:00` (no zone). */
export function localIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** The local time of day as `14:05`. */
const clockOf = (ms: number): string => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** `YYYYMMDD-HHMMSS` in the learner's local time, for the export's file name. */
export function localStamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** `04:10` (minutes padded), or `1:02:03` from an hour on. */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h > 0 ? `${h}:` : ""}${pad(m)}:${pad(s % 60)}`;
}

/** The clock of one attempt: what is counted, and where it goes. */
type Run = {
  startMs: number;
  /** untimed: the visible milliseconds so far, and when they were last added */
  ms: number;
  lastMs: number;
  visible: boolean;
  /** seconds counted so far */
  counted: number;
  /** the section the seconds go to */
  section: string;
  sectionTime: Record<string, number>;
  /** the "N minutes left" announcements already made */
  fired: Set<number>;
};

/** Seconds left at which a polite announcement is made (minutes: 5, then 1). */
const ANNOUNCE = [300, 60];
/** The attempt is saved every this many seconds of the clock. */
const SAVE_EVERY = 5;

export function createStore(data: PageData, deps: Deps = {}): Store {
  const events = deps.events ?? createEvents();
  const now = deps.now ?? (() => Date.now());
  const bytes = deps.bytes;
  const quizzes = new Map<string, QuizState>();
  const screen: Screen = {
    available: signal(false),
    fullscreen: signal(false),
    wanted: signal(data.focus === true),
    clock: signal(clockOf(now())),
  };
  const runs = new Map<string, Run>();
  /** the section of every question, per quiz */
  const sectionOf = new Map<string, Map<string, string>>();
  const saver: Saver | null = deps.storage
    ? saverOver(deps.storage, () => {
        for (const state of quizzes.values()) state.blocked.value = true;
      })
    : null;

  for (const page of data.quizzes) {
    const ids = page.sections.flatMap((s) => s.questions.map((q) => q.id));
    sectionOf.set(page.id, new Map(page.sections.flatMap((s) => s.questions.map((q) => [q.id, s.id] as const))));
    quizzes.set(page.id, {
      page,
      // before Start the plan is a stand-in: every question, in the data's order
      attempt: signal(newAttempt(page.hash, { source: "full", questions: ids })),
      graded: signal(null),
      key: signal(null),
      startedAt: null,
      part: signal(null),
      resume: signal(null),
      blocked: signal(false),
      elapsed: signal(0),
      said: signal(""),
      checks: signal({}),
      filter: signal("all"),
      current: signal(null),
      sectionSeconds: signal({}),
      sidebar: signal(false),
      mapOpen: signal({}),
      miniPart: signal(null),
      side: signal("questions"),
      sheet: signal(0),
      shelf: signal(false),
    });
  }
  const need = (quizId: string): QuizState => {
    const state = quizzes.get(quizId);
    if (!state) throw new Error(`no quiz "${quizId}" on this page`);
    return state;
  };
  const keyOf = (state: QuizState): KeyBlob => {
    state.key.value ??= openKey(state.page);
    return state.key.value;
  };

  const save = (state: QuizState): void => {
    const attempt = state.attempt.value;
    if (saver === null || attempt.phase === "start") return;
    saver.set(attemptKey(state.page), saveText(state.startedAt, attempt));
  };

  const grading = (state: QuizState, attempt: Attempt): void => {
    // the key is decoded only now: the page grades with the one grader, `core/grade`
    const key = keyOf(state);
    state.graded.value = grade(key.quiz, attempt);
  };

  /** The result of each checked question, graded alone by core's `grade` on the attempt cut down to that question. */
  const gradeChecks = (state: QuizState): void => {
    const attempt = state.attempt.value;
    const ids = attempt.state.checked;
    if (ids.length === 0) {
      state.checks.value = {};
      return;
    }
    const key = keyOf(state);
    const found: Record<string, GradedQuestion> = {};
    for (const id of ids) {
      const one = grade(key.quiz, { ...attempt, plan: { ...attempt.plan, questions: [id] } });
      const result = one.questions[0];
      if (result) found[id] = result;
    }
    state.checks.value = found;
  };

  /** Moves a clock to `at` (ms) and returns the seconds it gained. */
  const advance = (state: QuizState, run: Run, at: number): number => {
    const limit = limitOf(state.page, state.attempt.value);
    let target: number;
    if (limit !== undefined) {
      target = Math.max(0, Math.floor((at - run.startMs) / 1000));
    } else {
      if (run.visible) run.ms += Math.max(0, at - run.lastMs);
      run.lastMs = at;
      target = Math.floor(run.ms / 1000);
    }
    const gained = target - run.counted;
    if (gained > 0) {
      run.sectionTime[run.section] = (run.sectionTime[run.section] ?? 0) + gained;
      run.counted = target;
    }
    return Math.max(0, gained);
  };

  const record = (state: QuizState, run: Run): void => {
    store.dispatch(state.page.id, { type: "tick", timeUsed: run.counted, sectionTime: run.sectionTime });
  };

  /** Submits, at `at` (ms): the learner's Submit, or the deadline (`timedOut`). */
  const finish = (state: QuizState, at: number, timedOut: boolean): void => {
    const id = state.page.id;
    const run = runs.get(id);
    const limit = limitOf(state.page, state.attempt.value);
    if (run) {
      advance(state, run, at);
    }
    const used =
      timedOut && limit !== undefined ? limit : Math.min(run?.counted ?? 0, limit ?? Number.POSITIVE_INFINITY);
    // a deadline submits as of the deadline, not as of the moment the page noticed
    const when = timedOut && run && limit !== undefined ? run.startMs + limit * 1000 : at;
    runs.delete(id);
    // Submit leaves Focus mode, so results and review open in the normal layout
    store.fullscreen(false);
    store.dispatch(id, {
      type: "submit",
      at: localIso(new Date(when)),
      timeUsed: used,
      timedOut,
      ...(run ? { sectionTime: run.sectionTime } : {}),
    });
  };

  const beginRun = (state: QuizState, startMs: number, at: number): void => {
    const attempt = state.attempt.value;
    const limit = limitOf(state.page, state.attempt.value);
    const first = attempt.plan.questions[0];
    const section = (first !== undefined ? sectionOf.get(state.page.id)?.get(first) : undefined) ?? "";
    // a timed clock is the wall clock: the time since Start counts, whether or not the page was open
    const counted =
      limit !== undefined ? Math.max(0, Math.floor((at - startMs) / 1000)) : Math.floor(attempt.state.timeUsed);
    const remaining = limit === undefined ? Number.POSITIVE_INFINITY : limit - counted;
    runs.set(state.page.id, {
      startMs,
      ms: counted * 1000,
      lastMs: at,
      visible: typeof document === "undefined" || document.visibilityState !== "hidden",
      counted,
      section,
      sectionTime: { ...attempt.state.sectionTime },
      // an announcement the clock has already passed is not made late
      fired: new Set(ANNOUNCE.filter((s) => s >= remaining)),
    });
    state.startedAt = startMs;
    state.sectionSeconds.value = { ...attempt.state.sectionTime };
    state.elapsed.value = counted;
    state.said.value = "";
  };

  const tickOne = (state: QuizState, at: number): void => {
    if (state.attempt.value.phase !== "answering") return;
    const run = runs.get(state.page.id);
    if (!run) return;
    const before = run.counted;
    advance(state, run, at);
    state.elapsed.value = run.counted;
    state.sectionSeconds.value = { ...run.sectionTime };
    const limit = limitOf(state.page, state.attempt.value);
    if (limit !== undefined) {
      const remaining = limit - run.counted;
      if (remaining <= 0) {
        finish(state, at, true);
        return;
      }
      for (const s of ANNOUNCE) {
        if (remaining <= s && !run.fired.has(s)) {
          run.fired.add(s);
          state.said.value = announcement(state.page, s / 60);
        }
      }
    }
    // the attempt is saved each time the clock crosses a multiple of 5 seconds
    if (Math.floor(run.counted / SAVE_EVERY) > Math.floor(before / SAVE_EVERY)) record(state, run);
  };

  /** Back to an attempt that has not started: the saved one is removed, and the plan is a stand-in again. */
  const resetState = (state: QuizState): void => {
    saver?.remove(attemptKey(state.page));
    const ids = state.page.sections.flatMap((s) => s.questions.map((q) => q.id));
    runs.delete(state.page.id);
    state.attempt.value = newAttempt(state.page.hash, { source: "full", questions: ids });
    state.graded.value = null;
    state.key.value = null;
    state.startedAt = null;
    state.part.value = null;
    state.resume.value = null;
    state.elapsed.value = 0;
    state.said.value = "";
    state.checks.value = {};
    state.filter.value = "all";
    state.current.value = null;
    state.sectionSeconds.value = {};
    state.mapOpen.value = {};
  };

  const store: Store = {
    events,
    screen,
    quizzes,
    dispatch(quizId, action) {
      const state = need(quizId);
      const before = state.attempt.value;
      const after = reduce(before, action);
      if (after === before) return;
      state.attempt.value = after;
      if (action.type === "answer") {
        const section = sectionOf.get(quizId)?.get(action.question);
        const run = runs.get(quizId);
        if (run && section !== undefined) run.section = section;
        state.current.value = action.question;
      }
      if (action.type === "submit") grading(state, after);
      if (action.type === "check") gradeChecks(state);
      save(state);
      events.emit("progress", { quizId, attempt: after });
      if (action.type === "submit") events.emit("submit", { quizId, attempt: after });
    },
    start(quizId, options = {}) {
      const state = need(quizId);
      if (state.attempt.value.phase !== "start") return;
      state.shelf.value = false;
      const o = options instanceof Date ? { now: options } : options;
      const at = o.now?.getTime() ?? now();
      const key = keyOf(state);
      const part = o.part ?? null;
      const seed = o.seed ?? drawSeed(bytes);
      const plan: Plan =
        part === null
          ? planFor(key.quiz, {
              source: key.quiz.sections.some((s) => s.pick !== null) ? "bank" : "full",
              seed,
              quizHash: state.page.hash,
            })
          : planFor(key.quiz, { source: "section", section: part, seed, quizHash: state.page.hash });
      state.startedAt = at;
      store.dispatch(quizId, { type: "start", at: localIso(new Date(at)), plan });
      beginRun(state, at, at);
    },
    check(quizId, questionId) {
      const state = need(quizId);
      store.dispatch(quizId, { type: "check", question: questionId });
      const result = state.checks.value[questionId];
      if (result === undefined) return;
      const t = (state.page.uiLang === "vi" ? vi : en).page;
      const number = state.attempt.value.plan.questions.indexOf(questionId) + 1;
      state.said.value = t.checkedSaid(number, t.status[result.status]);
    },
    retry(quizId, seed) {
      const state = need(quizId);
      const before = state.attempt.value;
      const graded = state.graded.value;
      if (before.phase !== "submitted" || graded === null) return;
      const missed = missedIds(graded);
      if (missed.length === 0) return;
      const at = now();
      const plan = planFor(keyOf(state).quiz, {
        source: "retry",
        questions: missed,
        seed: seed ?? drawSeed(bytes),
        quizHash: state.page.hash,
      });
      // the one saved attempt is replaced: the retry is saved from its first answer on, like any attempt
      resetState(state);
      keyOf(state);
      state.startedAt = at;
      store.dispatch(quizId, { type: "start", at: localIso(new Date(at)), plan });
      beginRun(state, at, at);
    },
    submit(quizId, at) {
      const state = need(quizId);
      if (state.attempt.value.phase !== "answering") return;
      finish(state, at?.getTime() ?? now(), false);
    },
    focus(quizId, questionId) {
      const found = quizzes.get(quizId);
      if (found && found.attempt.value.phase === "answering") found.current.value = questionId;
      const section = sectionOf.get(quizId)?.get(questionId);
      const run = runs.get(quizId);
      if (run && section !== undefined) run.section = section;
    },
    sidebar(quizId, open) {
      const state = need(quizId);
      const want = open ?? !state.sidebar.value;
      state.sidebar.value = want;
      saver?.set(sidebarKey(state.page), want ? "open" : "closed");
    },
    sidebarTarget() {
      for (const state of quizzes.values()) if (state.attempt.value.phase !== "start") return state.page.id;
      return null;
    },
    restore() {
      const width = deps.width?.() ?? (typeof window === "undefined" ? 0 : window.innerWidth);
      for (const state of quizzes.values()) {
        state.sidebar.value = sidebarStart(saver?.get(sidebarKey(state.page)) ?? null, width);
      }
      if (saver === null) return;
      // the probe: a browser that refuses to save says so now, not at the first answer
      saver.set("fullmark:v1:probe", "1");
      saver.remove("fullmark:v1:probe");
      const at = now();
      for (const state of quizzes.values()) {
        const page = state.page;
        const mine = attemptKey(page);
        const side = sidebarKey(page);
        for (const key of saver.keys(quizPrefix(page.id))) if (key !== mine && key !== side) saver.remove(key);
        const text = saver.get(mine);
        const saved = readSaved(text, page);
        if (saved === null) {
          if (text !== null) saver.remove(mine);
          continue;
        }
        const { attempt, startMs } = saved;
        const limit = limitOf(page, attempt);
        if (attempt.phase === "submitted") {
          state.attempt.value = attempt;
          state.startedAt = startMs;
          grading(state, attempt);
          continue;
        }
        const started = startMs ?? at;
        if (limit !== undefined && at >= started + limit * 1000) {
          // the deadline passed while the page was closed: the attempt is submitted now, as of the deadline
          state.attempt.value = attempt;
          state.startedAt = started;
          beginRun(state, started, at);
          finish(state, at, true);
          continue;
        }
        const plan = attempt.plan.questions;
        const answered = plan.filter((id) => attempt.state.answers[id] != null).length;
        const used =
          limit !== undefined ? Math.min(limit, Math.floor((at - started) / 1000)) : Math.floor(attempt.state.timeUsed);
        state.resume.value = { attempt, startMs: started, answered, total: plan.length, used };
      }
    },
    continueAttempt(quizId) {
      const state = need(quizId);
      const resume = state.resume.value;
      if (resume === null || state.attempt.value.phase !== "start") return;
      const at = now();
      state.resume.value = null;
      state.attempt.value = resume.attempt;
      keyOf(state);
      gradeChecks(state);
      beginRun(state, resume.startMs ?? at, at);
      store.tick(at);
    },
    startOver(quizId) {
      const state = need(quizId);
      saver?.remove(attemptKey(state.page));
      state.resume.value = null;
    },
    newAttempt(quizId) {
      resetState(need(quizId));
    },
    fullscreen(on) {
      if (typeof document === "undefined" || !document.fullscreenEnabled) return;
      const full = document.fullscreenElement !== null;
      const want = on ?? !full;
      if (want === full) return;
      // a refused request (no user gesture, a policy) is ignored: the page stays as it is
      if (want) document.documentElement.requestFullscreen().catch(() => undefined);
      else document.exitFullscreen().catch(() => undefined);
    },
    tick(at = now()) {
      screen.clock.value = clockOf(at);
      for (const state of quizzes.values()) tickOne(state, at);
    },
    run() {
      if (typeof document !== "undefined") {
        screen.available.value = document.fullscreenEnabled === true;
        screen.fullscreen.value = document.fullscreenElement !== null;
      }
      const onFullscreen = (): void => {
        screen.fullscreen.value = document.fullscreenElement !== null;
        // entering Focus mode closes the sidebars; nothing is stored, so leaving finds them closed
        if (screen.fullscreen.value) for (const state of quizzes.values()) state.sidebar.value = false;
      };
      document.addEventListener("fullscreenchange", onFullscreen);
      const timer = setInterval(() => store.tick(), 1000);
      const onVisibility = (): void => {
        const at = now();
        const hidden = document.visibilityState === "hidden";
        for (const [id, run] of runs) {
          const state = need(id);
          advance(state, run, at);
          run.visible = !hidden;
          run.lastMs = at;
          if (hidden) record(state, run);
        }
      };
      const onLeave = (): void => {
        const at = now();
        for (const [id, run] of runs) {
          advance(need(id), run, at);
          record(need(id), run);
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("pagehide", onLeave);
      return () => {
        clearInterval(timer);
        document.removeEventListener("fullscreenchange", onFullscreen);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pagehide", onLeave);
      };
    },
  };
  return store;
}

const announcement = (page: PageQuiz, minutes: number): string =>
  (page.uiLang === "vi" ? vi : en).page.timeLeftSaid(minutes);

/** The export: `<quiz id>-results-<stamp>.json` and its text (`results-v2`). */
export function exportFor(state: QuizState, now: Date): { name: string; text: string } {
  return {
    name: `${state.page.id}-results-${localStamp(now)}.json`,
    text: `${JSON.stringify(resultsOf(state.attempt.value), null, 2)}\n`,
  };
}

/** Hands a text file to the browser's download. Works from `file://` and needs no server. */
export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
