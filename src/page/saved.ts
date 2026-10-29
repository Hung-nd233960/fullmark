import type { Attempt, Plan } from "../core/attempt";
import type { PageQuiz } from "./data";

/**
 * What the page keeps in `localStorage` (TECHNICAL_DESIGN.md, foundation 2): every read and write is wrapped, because
 * Firefox isolates `file://` storage and Safari may refuse it. A failure marks the store as blocked and never throws.
 */
export type Saver = {
  /** false once a read or a write has failed, or when there is no storage at all */
  ok(): boolean;
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  /** every key that starts with `prefix` */
  keys(prefix: string): string[];
};

/** A `Saver` over a `Storage` that may be missing or may throw. `onFail` runs once, at the first failure. */
export function saverOver(find: () => Storage | null | undefined, onFail: () => void): Saver {
  let ok = true;
  const fail = (): void => {
    if (ok) {
      ok = false;
      onFail();
    }
  };
  const storage = (): Storage | null => {
    try {
      return find() ?? null;
    } catch {
      return null;
    }
  };
  return {
    ok: () => ok,
    get(key) {
      try {
        const s = storage();
        if (!s) {
          fail();
          return null;
        }
        return s.getItem(key);
      } catch {
        fail();
        return null;
      }
    },
    set(key, value) {
      try {
        const s = storage();
        if (!s) return fail();
        s.setItem(key, value);
      } catch {
        fail();
      }
    },
    remove(key) {
      try {
        storage()?.removeItem(key);
      } catch {
        fail();
      }
    },
    keys(prefix) {
      try {
        const s = storage();
        if (!s) return [];
        const found: string[] = [];
        for (let i = 0; i < s.length; i++) {
          const key = s.key(i);
          if (key?.startsWith(prefix)) found.push(key);
        }
        return found;
      } catch {
        fail();
        return [];
      }
    },
  };
}

/** `fullmark:v1:<quiz id>:` and `fullmark:v1:<quiz id>:<quiz hash>:attempt` (foundation 2). */
export const quizPrefix = (quizId: string): string => `fullmark:v1:${quizId}:`;
export const attemptKey = (quiz: Pick<PageQuiz, "id" | "hash">): string => `${quizPrefix(quiz.id)}${quiz.hash}:attempt`;

/** What the page saves: the Attempt and the absolute start time, in milliseconds, which `startedAt` (zoneless) cannot give. */
export type Saved = { v: 1; startMs: number | null; attempt: Attempt };

export const saveText = (startMs: number | null, attempt: Attempt): string =>
  JSON.stringify({ v: 1, startMs, attempt } satisfies Saved);

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isStrings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");
const isIndices = (x: unknown): x is number[] =>
  Array.isArray(x) && x.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0);

/** How many entries a question's `optionOrder` must have, when it must have one. */
function orderLength(q: PageQuiz["sections"][number]["questions"][number]): number | null {
  if (q.type === "ordering") return q.items.length;
  if (q.type === "matching") return q.rights.length;
  return null;
}

/**
 * The saved attempt, if it is one this page can continue: the text parses, it was taken on this version of the quiz, it
 * is in `answering` or `submitted`, and its plan names only questions the page has, with the orders the page needs. Any
 * doubt gives null and the start screen opens fresh, silently.
 */
export function readSaved(text: string | null, quiz: PageQuiz): Saved | null {
  if (text === null) return null;
  try {
    const raw: unknown = JSON.parse(text);
    if (!isObject(raw) || raw.v !== 1) return null;
    const { startMs, attempt: a } = raw;
    if (startMs !== null && typeof startMs !== "number") return null;
    if (!isObject(a) || a.quizHash !== quiz.hash) return null;
    if (a.phase !== "answering" && a.phase !== "submitted") return null;
    const { plan, state } = a;
    if (!isObject(plan) || !isObject(state)) return null;
    if (!["full", "bank", "section", "retry"].includes(plan.source as string)) return null;
    if (plan.section !== undefined && typeof plan.section !== "string") return null;
    if (plan.seed !== undefined && typeof plan.seed !== "string") return null;
    if (!isStrings(plan.questions) || plan.questions.length === 0) return null;
    const known = new Map(quiz.sections.flatMap((s) => s.questions).map((q) => [q.id, q]));
    const order = plan.optionOrder;
    if (order !== undefined && (!isObject(order) || !Object.values(order).every(isIndices))) return null;
    for (const id of plan.questions) {
      const q = known.get(id);
      if (!q) return null;
      const need = orderLength(q);
      const got = (order as Record<string, number[]> | undefined)?.[id];
      if (need !== null && got?.length !== need) return null;
    }
    if (!isObject(state.answers) || !Object.values(state.answers).every((v) => v === null || isObject(v))) return null;
    if (state.startedAt !== null && typeof state.startedAt !== "string") return null;
    if (state.submittedAt !== null && typeof state.submittedAt !== "string") return null;
    if (typeof state.timeUsed !== "number" || state.timeUsed < 0) return null;
    if (!isObject(state.sectionTime) || !Object.values(state.sectionTime).every((n) => typeof n === "number")) {
      return null;
    }
    if (!isStrings(state.flagged) || !isStrings(state.checked) || typeof state.timedOut !== "boolean") return null;
    if (a.phase === "submitted" && state.submittedAt === null) return null;
    return {
      v: 1,
      startMs: startMs ?? null,
      attempt: {
        quizHash: a.quizHash,
        phase: a.phase,
        plan: plan as unknown as Plan,
        state: state as unknown as Attempt["state"],
      },
    };
  } catch {
    return null;
  }
}
