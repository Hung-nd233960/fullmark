import {
  FIX_REASONS,
  type Judged,
  judgedProblems,
  type ReasonId,
  RUBRIC_REASONS,
  RUBRIC_TYPES,
  type Verdict,
} from "../core/review/reasons";

/**
 * The review form's state and the rules between its parts, with no DOM, so that a unit test can drive them
 * (COMMANDS.md, `quiz review`, "The form"). One entry per question; `verdict: null` is not judged.
 */
export type Entry = { verdict: Verdict | null; reasons: ReasonId[]; note: string; assumed: boolean };
export type Entries = Record<string, Entry>;

/** A question as the form needs it: its id and type (the rubric reasons are for essays and code). */
export type Item = { id: string; type: string };

export const blank = (): Entry => ({ verdict: null, reasons: [], note: "", assumed: false });

/** Picking the verdict that is chosen clears it; picking another clears the reasons and keeps the note. */
export function pickVerdict(entry: Entry, verdict: Verdict): Entry {
  if (entry.verdict === verdict) return { ...blank(), note: entry.note };
  return { verdict, reasons: [], note: entry.note, assumed: false };
}

export function toggleReason(entry: Entry, reason: ReasonId): Entry {
  const on = entry.reasons.includes(reason);
  return { ...entry, reasons: on ? entry.reasons.filter((r) => r !== reason) : [...entry.reasons, reason] };
}

/** The reasons offered after a verdict, in the board's order: the rubric ones only on essays and code. */
export function reasonsFor(verdict: "fix" | "drop", type: string): readonly ReasonId[] {
  if (verdict === "drop") return ["duplicate", "off-scope", "too-easy", "other"];
  const rubric = RUBRIC_TYPES.includes(type);
  return rubric ? [FIX_REASONS[0], FIX_REASONS[1], ...RUBRIC_REASONS, "other"] : FIX_REASONS;
}

/** What goes into the submit for a judged question; null when it is not judged. */
export function judgedOf(entry: Entry): Judged | null {
  if (entry.verdict === null) return null;
  return {
    verdict: entry.verdict,
    reasons: entry.verdict === "keep" ? [] : entry.reasons,
    note: entry.note,
    ...(entry.verdict === "keep" && entry.assumed ? { assumed: true as const } : {}),
  };
}

/** The entry that an earlier verdict of the file stands for (G53). */
export const entryOf = (judged: Judged): Entry => ({
  verdict: judged.verdict,
  reasons: [...judged.reasons],
  note: judged.note,
  assumed: judged.assumed === true,
});

export type Counts = { total: number; judged: number; keep: number; fix: number; drop: number; assumed: number };

export function countsOf(items: readonly Item[], entries: Entries): Counts {
  const c: Counts = { total: items.length, judged: 0, keep: 0, fix: 0, drop: 0, assumed: 0 };
  for (const { id } of items) {
    const e = entries[id];
    if (!e || e.verdict === null) continue;
    c.judged++;
    c[e.verdict]++;
    if (e.verdict === "keep" && e.assumed) c.assumed++;
  }
  return c;
}

/** Questions judged fix or drop that are not complete: no reason, or Other with no note. Finish holds back on them. */
export function incompleteIds(items: readonly Item[], entries: Entries): string[] {
  return items
    .filter(({ id, type }) => {
      const e = entries[id];
      const j = e ? judgedOf(e) : null;
      return j !== null && judgedProblems(j, type).length > 0;
    })
    .map(({ id }) => id);
}

/** The ids not judged, in order. */
export const notJudged = (items: readonly Item[], entries: Entries): string[] =>
  items.filter(({ id }) => (entries[id]?.verdict ?? null) === null).map(({ id }) => id);

/** The next question not judged after `from` (wrapping round), or null when every question is judged. */
export function nextNotJudged(items: readonly Item[], entries: Entries, from: string | null): string | null {
  const open = new Set(notJudged(items, entries));
  if (open.size === 0) return null;
  const at = from === null ? -1 : items.findIndex((q) => q.id === from);
  for (let step = 1; step <= items.length; step++) {
    const item = items[(at + step + items.length) % items.length] as Item;
    if (open.has(item.id)) return item.id;
  }
  return null;
}

/** Keep the rest: every question not judged becomes a keep, marked as not looked at. */
export function keepTheRest(items: readonly Item[], entries: Entries): Entries {
  const next: Entries = { ...entries };
  for (const id of notJudged(items, entries)) next[id] = { verdict: "keep", reasons: [], note: "", assumed: true };
  return next;
}

/** The body of the submit: one entry for every question. Null while a question is not judged. */
export function judgedMap(items: readonly Item[], entries: Entries): Record<string, Judged> | null {
  const out: Record<string, Judged> = {};
  for (const { id } of items) {
    const j = entries[id] ? judgedOf(entries[id] as Entry) : null;
    if (j === null) return null;
    out[id] = j;
  }
  return out;
}
