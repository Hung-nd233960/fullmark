import { type Signal, signal } from "@preact/signals";
import type { Attempt } from "../core/attempt";
import { resultsOf } from "../core/attempt/serialise";
import { type Graded, grade } from "../core/grade";
import { type KeyBlob, openKey, type PageData, type PageQuiz } from "./data";
import { createEvents, type Events } from "./events";
import { type Action, newAttempt, reduce } from "./reducer";

/** One quiz on the page: its data, its Attempt and, after Submit, its score. Nothing here is global (seam 2). */
export type QuizState = {
  page: PageQuiz;
  attempt: Signal<Attempt>;
  graded: Signal<Graded | null>;
  key: Signal<KeyBlob | null>;
  startedAt: number | null;
};

export type Store = {
  events: Events;
  /** `Map<QuizId, Attempt>` (TECHNICAL_DESIGN.md, seam 2), with the rest of each quiz's state beside it */
  quizzes: Map<string, QuizState>;
  dispatch(quizId: string, action: Action): void;
  start(quizId: string, now?: Date): void;
  submit(quizId: string, now?: Date): void;
};

const pad = (n: number): string => String(n).padStart(2, "0");

/** The learner's local time as the page writes it into results: `2026-10-23T16:02:00` (no zone). */
export function localIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** `YYYYMMDD-HHMMSS` in the learner's local time, for the export's file name. */
export function localStamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function createStore(data: PageData, events: Events = createEvents()): Store {
  const quizzes = new Map<string, QuizState>();
  for (const page of data.quizzes) {
    quizzes.set(page.id, {
      page,
      attempt: signal(newAttempt(page.hash, page.plan)),
      graded: signal(null),
      key: signal(null),
      startedAt: null,
    });
  }
  const need = (quizId: string): QuizState => {
    const state = quizzes.get(quizId);
    if (!state) throw new Error(`no quiz "${quizId}" on this page`);
    return state;
  };

  const store: Store = {
    events,
    quizzes,
    dispatch(quizId, action) {
      const state = need(quizId);
      const before = state.attempt.value;
      const after = reduce(before, action);
      if (after === before) return;
      state.attempt.value = after;
      events.emit("progress", { quizId, attempt: after });
      if (action.type === "submit") {
        // the key is decoded only now: the page grades with the one grader, `core/grade`
        const key = openKey(state.page);
        state.key.value = key;
        state.graded.value = grade(key.quiz, after);
        events.emit("submit", { quizId, attempt: after });
      }
    },
    start(quizId, now = new Date()) {
      need(quizId).startedAt = now.getTime();
      store.dispatch(quizId, { type: "start", at: localIso(now) });
    },
    submit(quizId, now = new Date()) {
      const state = need(quizId);
      const started = state.startedAt ?? now.getTime();
      store.dispatch(quizId, {
        type: "submit",
        at: localIso(now),
        timeUsed: Math.round((now.getTime() - started) / 1000),
      });
    },
  };
  return store;
}

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
