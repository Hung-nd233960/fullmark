import type { Verdict } from "../core/review/reasons";
import type { PageQuiz } from "../page/data";
import type { Entries } from "./logic";

export const GLYPH: Record<Verdict, string> = { keep: "✓", fix: "✎", drop: "✕" };
export const VERDICTS: readonly Verdict[] = ["keep", "fix", "drop"];

/** The part a question belongs to, in source order; a quiz of one untitled section has one part with no heading. */
export type Part = { id: string; title: string | null; number: number; ids: string[] };
export function partsOf(page: PageQuiz): Part[] {
  return page.sections.map((s, i) => ({ id: s.id, title: s.title, number: i + 1, ids: s.questions.map((q) => q.id) }));
}

/**
 * What a part's ring and its heading count (COMMANDS.md, `quiz review`, "The sidebar"): the questions of the part that
 * the form asks (all of them, or with `--since` those asked again), how many are judged, and how many of those are
 * Fix and Drop. A part none of whose questions is asked has a total of 0 (G67).
 */
export type PartStats = { total: number; judged: number; fix: number; drop: number };

export function partStats(ids: readonly string[], entries: Entries, asked: ReadonlySet<string> | null): PartStats {
  const stats: PartStats = { total: 0, judged: 0, fix: 0, drop: 0 };
  for (const id of ids) {
    if (asked !== null && !asked.has(id)) continue;
    stats.total++;
    const verdict = entries[id]?.verdict ?? null;
    if (verdict === null) continue;
    stats.judged++;
    if (verdict === "fix") stats.fix++;
    else if (verdict === "drop") stats.drop++;
  }
  return stats;
}

/** The part the stacked map shows: the one chosen, else the one holding the current question, else the first. */
export function chosenPart(parts: readonly Part[], chosen: string | null, current: string): Part | undefined {
  return parts.find((p) => p.id === chosen) ?? parts.find((p) => p.ids.includes(current)) ?? parts[0];
}
