import type { Plan } from "../attempt/schema";
import type { Question, Quiz } from "../ir";
import { random, shuffled } from "./random";

export { random, shuffled } from "./random";

/** What to build a plan from. `missed` and `retry` plans come from the library and the page, not from here. */
export type PlanRequest = (
  | { source: "full"; seed?: string }
  | { source: "bank"; seed?: string }
  | { source: "section"; section: string; seed?: string }
  /** the questions to retry, in the order the page showed them; the page decides which are missed, not core */
  | { source: "retry"; questions: readonly string[]; seed?: string }
) & {
  /** the quiz hash: without a `seed`, its first 4 characters (the short version) are the seed (section 4, Seeds) */
  quizHash: string;
};

const SEED = /^[A-Za-z0-9]{1,8}$/;

/** A request that cannot be met, such as an unknown section. The message lists what is valid. */
export class PlanError extends Error {}

/** The sections a learner can pick by name: those with a title. */
export function sectionIds(quiz: Quiz): string[] {
  return quiz.sections.filter((s) => s.title !== null && s.id !== "").map((s) => s.id);
}

const wantsShuffle = (quiz: Quiz, q: Question): boolean =>
  (q.type === "single" || q.type === "multi") && (q.shuffle ?? quiz.frontMatter.shuffleChoices);

/**
 * The display order of `count` items as source indices, shuffled and never the source order itself ("the page shows
 * it shuffled, never in the right order", QUIZ_SYNTAX.md, ordering). A source-order draw is rotated by one place.
 */
function shuffledNotSource(count: number, next: () => number): number[] {
  const order = shuffled(
    Array.from({ length: count }, (_, i) => i),
    next,
  );
  return count > 1 && order.every((v, i) => v === i) ? [...order.slice(1), order[0] as number] : order;
}

/**
 * `type_order`'s shuffle (section 4, Seeds): the questions are shuffled only inside each run, a stretch of consecutive
 * questions in the same group of the order. Runs keep their places, so a quiz in its order stays in it; a quiz out of
 * its order is shuffled, not rearranged. A type outside the order is a run of its own and does not move.
 */
function shuffledInRuns(
  questions: readonly Question[],
  groups: readonly (readonly string[])[],
  next: () => number,
): Question[] {
  const groupOf = (q: Question): number => groups.findIndex((g) => g.includes(q.type));
  const out: Question[] = [];
  for (let i = 0; i < questions.length; ) {
    const g = groupOf(questions[i] as Question);
    let end = i + 1;
    while (g >= 0 && end < questions.length && groupOf(questions[end] as Question) === g) end++;
    const run = questions.slice(i, end);
    out.push(...(run.length > 1 ? shuffled(run, next) : run));
    i = end;
  }
  return out;
}

/**
 * The sections of a retry: the quiz's own, cut down to the named questions, which stay in the order given (shuffled
 * afterwards when the quiz shuffles its questions, by the seed). A question the quiz does not have is an error.
 */
function retrySections(quiz: Quiz, ids: readonly string[]): Quiz["sections"] {
  const byId = new Map(quiz.sections.flatMap((s) => s.questions.map((q) => [q.id, q] as const)));
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length > 0) throw new PlanError(`unknown questions to retry: ${unknown.join(", ")}`);
  const questions = ids.map((id) => byId.get(id) as Question);
  const first = quiz.sections[0];
  if (first === undefined) throw new PlanError("the quiz has no questions");
  // one section holds them all, in the given order: shuffling inside it is the same as shuffling the whole list
  return [{ ...first, id: "", title: null, pick: null, questions }];
}

/**
 * Which questions an attempt gets, and in which order (TECHNICAL_DESIGN.md, section 4).
 *
 * - `full`: every question, banks included whole.
 * - `bank`: every section with `pick` draws that many of its questions (kept in source order).
 * - `section`: one section by its id, its bank drawn when it has `pick` and a seed is given.
 *
 * With a seed, `shuffle_questions` shuffles the questions inside each section and `shuffle_choices` (or `shuffle=`
 * on a question) records the order of a question's choices in `optionOrder`, and the display order of every
 * `ordering` item and every `matching` right-hand item (distractors included) goes there too, whatever those two
 * settings say. Answers keep source indices, so grading never reads `optionOrder`. Without a seed, the seed is the quiz's short
 * version (`quizHash`), so a build is still deterministic. Every random choice comes from the seed, so a plan is reproducible.
 */
export function planFor(quiz: Quiz, request: PlanRequest): Plan {
  if (request.seed !== undefined && !SEED.test(request.seed)) {
    throw new PlanError(`seed "${request.seed}" must be 1 to 8 letters or digits`);
  }
  const seed = request.seed ?? request.quizHash.slice(0, 4);
  let sections = quiz.sections;
  if (request.source === "retry") sections = retrySections(quiz, request.questions);
  if (request.source === "section") {
    const found = sections.find((s) => s.id === request.section && s.title !== null);
    if (!found) {
      const valid = sectionIds(quiz);
      throw new PlanError(
        `unknown section "${request.section}"; the sections are: ${valid.length > 0 ? valid.join(", ") : "(none: the quiz has no titled section)"}`,
      );
    }
    sections = [found];
  }
  // a retry draws nothing: its questions are the ones the page named
  const draw = request.source === "bank" || (request.source === "section" && request.seed !== undefined);

  const questions: Question[] = [];
  for (const section of sections) {
    let chosen = section.questions;
    if (draw && section.pick !== null && seed !== undefined) {
      const next = random(`${seed}\u0000bank\u0000${section.id}`);
      const keep = new Set(shuffled([...chosen.keys()], next).slice(0, section.pick));
      chosen = chosen.filter((_, i) => keep.has(i));
    }
    if (quiz.frontMatter.shuffleQuestions && seed !== undefined) {
      const next = random(`${seed}\u0000questions\u0000${section.id}`);
      const groups = quiz.frontMatter.typeOrder === "none" ? undefined : quiz.frontMatter.typeOrderGroups;
      chosen = groups === undefined ? shuffled(chosen, next) : shuffledInRuns(chosen, groups, next);
    }
    questions.push(...chosen);
  }

  const optionOrder: Record<string, number[]> = {};
  if (seed !== undefined) {
    for (const q of questions) {
      const next = random(`${seed}\u0000options\u0000${q.id}`);
      if (q.type === "ordering") optionOrder[q.id] = shuffledNotSource(q.items.length, next);
      else if (q.type === "matching")
        optionOrder[q.id] = shuffledNotSource(q.pairs.length + q.distractors.length, next);
      else if (wantsShuffle(quiz, q) && "choices" in q) optionOrder[q.id] = shuffled([...q.choices.keys()], next);
    }
  }
  return {
    source: request.source,
    ...(request.source === "section" ? { section: request.section } : {}),
    questions: questions.map((q) => q.id),
    ...(Object.keys(optionOrder).length > 0 ? { optionOrder } : {}),
    ...(seed !== undefined ? { seed } : {}),
  };
}
