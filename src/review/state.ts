import { type Signal, signal } from "@preact/signals";
import type { Judged, ReasonId, Verdict } from "../core/review/reasons";
import type { PageQuiz } from "../page/data";
import type { ReviewData, SinceData } from "./data";
import {
  blank,
  type Counts,
  countsOf,
  type Entries,
  entryOf,
  type Item,
  incompleteIds,
  judgedMap,
  keepTheRest,
  nextNotJudged,
  notJudged,
  pickVerdict,
  toggleReason,
} from "./logic";

/** What the form holds while it is open. Nothing here is stored: the file `quiz review` writes is the only record. */
export type FormState = {
  page: PageQuiz;
  /** every question of the quiz in source order, a bank's whole pool included */
  items: readonly Item[];
  /** the questions the form asks: every one, or with `--since` those new or changed since the review (a subset of `items`) */
  scope: readonly Item[];
  /** with `--since`, the ids asked; null otherwise */
  asked: ReadonlySet<string> | null;
  /** with `--since`, what it asked and the earlier verdicts of the changed questions; null otherwise */
  since: SinceData | null;
  /** a question's number as its card shows it (the quiz's numbering, also with `--since`) */
  number(id: string): number;
  entries: Signal<Entries>;
  /** the question the keys act on: the last one focused or scrolled to */
  current: Signal<string>;
  sidebar: Signal<boolean>;
  /** the parts the learner opened or closed in the plain sidebar, by section id */
  mapOpen: Signal<Record<string, boolean>>;
  dialog: Signal<"none" | "rest" | "finish">;
  /** Finish was pressed with questions that are not complete: those are listed, and nothing is written */
  held: Signal<string[]>;
  /** the counts of what was written; null until the server has taken the review */
  saved: Signal<Counts | null>;
  /** why the server did not take it, in its own words */
  problem: Signal<string | null>;
  sending: Signal<boolean>;
  counts(): Counts;
  pick(id: string, verdict: Verdict): void;
  reason(id: string, reason: ReasonId): void;
  note(id: string, text: string): void;
  /** `N`: the next question not judged; null when there is none */
  next(): string | null;
  /** Finish: writes at once, asks first, or holds back */
  finish(): void;
  /** Keep the rest: asks first, or (nothing left to keep) writes at once */
  keepRest(): void;
  /** the dialogs' Mark them Keep and finish */
  confirm(): void;
  send(): Promise<void>;
};

export type Deps = {
  /** posts the body to `./submit`; the default is `fetch` */
  post?: (body: string) => Promise<{ ok: boolean; text(): Promise<string> }>;
};

const defaultPost = (body: string) =>
  fetch("./submit", { method: "POST", headers: { "Content-Type": "application/json" }, body });

export function createFormState(data: ReviewData, deps: Deps = {}): FormState {
  const page = data.page.quizzes[0];
  const items: Item[] = [];
  const types = new Map<string, string>();
  for (const s of page.sections) for (const q of s.questions) items.push({ id: q.id, type: q.type });
  for (const i of items) types.set(i.id, i.type);
  const asked = data.since ? new Set(data.since.asked) : null;
  const scope = asked ? items.filter((q) => asked.has(q.id)) : items;
  const numbers = new Map(items.map((q, i) => [q.id, i + 1]));
  const start: Entries = {};
  for (const { id } of items) {
    const earlier: Judged | undefined = data.earlier[id];
    start[id] = earlier ? entryOf(earlier) : blank();
  }
  const entries = signal<Entries>(start);
  const current = signal(scope[0]?.id ?? "");
  const post = deps.post ?? defaultPost;
  const change = (id: string, to: (e: Entries[string]) => Entries[string]): void => {
    entries.value = { ...entries.value, [id]: to(entries.value[id] ?? blank()) };
    // a held Finish lists what is still incomplete: it follows the edits
    if (state.held.value.length > 0) state.held.value = incompleteIds(items, entries.value);
  };
  const state: FormState = {
    page,
    items,
    scope,
    asked,
    since: data.since ?? null,
    number: (id) => numbers.get(id) ?? 0,
    entries,
    current,
    sidebar: signal(true),
    mapOpen: signal({}),
    dialog: signal("none"),
    held: signal([]),
    saved: signal(null),
    problem: signal(null),
    sending: signal(false),
    // the counts the bar shows cover what is asked; the saved card's cover the whole review (below)
    counts: () => countsOf(scope, entries.value),
    pick: (id, verdict) => change(id, (e) => pickVerdict(e, verdict)),
    reason: (id, reason) => change(id, (e) => toggleReason(e, reason)),
    note: (id, text) => change(id, (e) => ({ ...e, note: text })),
    next: () => {
      const id = nextNotJudged(items, entries.value, current.value);
      if (id !== null) current.value = id;
      return id;
    },
    finish() {
      if (state.sending.value || state.saved.value !== null) return;
      const incomplete = incompleteIds(items, entries.value);
      state.held.value = incomplete;
      if (incomplete.length > 0) {
        current.value = incomplete[0] as string;
        return;
      }
      if (notJudged(items, entries.value).length > 0) state.dialog.value = "finish";
      else void state.send();
    },
    keepRest() {
      if (state.sending.value || state.saved.value !== null) return;
      const incomplete = incompleteIds(items, entries.value);
      state.held.value = incomplete;
      if (incomplete.length > 0) {
        current.value = incomplete[0] as string;
        return;
      }
      if (notJudged(items, entries.value).length > 0) state.dialog.value = "rest";
      else void state.send();
    },
    confirm() {
      state.dialog.value = "none";
      entries.value = keepTheRest(items, entries.value);
      void state.send();
    },
    async send() {
      const judged = judgedMap(items, entries.value);
      if (judged === null || state.sending.value) return;
      state.sending.value = true;
      state.problem.value = null;
      try {
        const response = await post(JSON.stringify({ quizId: page.id, quizHash: page.hash, judged }));
        if (response.ok) state.saved.value = countsOf(items, entries.value);
        else state.problem.value = (await response.text()).trim() || "the server did not take the review";
      } catch {
        state.problem.value = "the server cannot be reached";
      } finally {
        state.sending.value = false;
      }
    },
  };
  return state;
}
