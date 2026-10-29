import type { Attempt } from "../core/attempt";
import type { Graded } from "../core/grade";
import type { PageQuiz } from "./data";
import { type ResultState, resultState } from "./results";

/** The question the status line and the map call current: the one last focused or answered, else the plan's first. */
export function currentOf(plan: readonly string[], current: string | null): string | null {
  return current !== null && plan.includes(current) ? current : (plan[0] ?? null);
}

/** One question of the map while answering. `number` is its place in the plan, as on its card. */
export type Cell = { id: string; number: number; answered: boolean; flagged: boolean; current: boolean };

/** A part of the plan: a run of questions of one section, in the plan's order. */
export type Part<C> = {
  /** the section's id */
  id: string;
  title: string | null;
  /** 1-based, among the plan's parts */
  number: number;
  cells: C[];
};

/** The plan's questions cut into parts: a run of one section is one part. A question the page does not know is dropped. */
function partsOf<C>(page: PageQuiz, plan: readonly string[], cell: (id: string, number: number) => C): Part<C>[] {
  const owner = new Map<string, { id: string; title: string | null }>();
  for (const s of page.sections) for (const q of s.questions) owner.set(q.id, { id: s.id, title: s.title });
  const parts: Part<C>[] = [];
  plan.forEach((id, i) => {
    const section = owner.get(id);
    if (section === undefined) return;
    const last = parts.at(-1);
    const c = cell(id, i + 1);
    if (last && last.id === section.id) last.cells.push(c);
    else parts.push({ ...section, number: parts.length + 1, cells: [c] });
  });
  return parts;
}

/** The map while answering, from the attempt alone: answered is what the status line counts. */
export function answeringMap(page: PageQuiz, attempt: Attempt, current: string | null): Part<Cell>[] {
  const here = currentOf(attempt.plan.questions, current);
  const flagged = new Set(attempt.state.flagged);
  return partsOf(page, attempt.plan.questions, (id, number) => ({
    id,
    number,
    answered: attempt.state.answers[id] != null,
    flagged: flagged.has(id),
    current: id === here,
  }));
}

/** One question of the map after Submit: its state is `resultState`, the results card's. */
export type ResultCell = { id: string; number: number; state: ResultState; flagged: boolean };

/** The map after Submit; a question `grade` does not return is unanswered. */
export function resultsMap(page: PageQuiz, attempt: Attempt, graded: Graded): Part<ResultCell>[] {
  const byId = new Map(graded.questions.map((q) => [q.id, q]));
  const flagged = new Set(attempt.state.flagged);
  return partsOf(page, attempt.plan.questions, (id, number) => {
    const q = byId.get(id);
    return { id, number, state: q === undefined ? "unanswered" : resultState(q), flagged: flagged.has(id) };
  });
}

/** Whether a part shows its grid: the learner's choice if there is one, else when it holds the current question. */
export function partOpen(part: Part<Cell>, chosen: Record<string, boolean>): boolean {
  return chosen[part.id] ?? part.cells.some((c) => c.current);
}
