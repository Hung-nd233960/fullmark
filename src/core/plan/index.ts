import type { Plan } from "../attempt/schema";
import type { Question, Quiz } from "../ir";
import { random, shuffled } from "./random";

export { random, shuffled } from "./random";

/** What to build a plan from. `missed` and `retry` plans come from the library and the page, not from here. */
export type PlanRequest =
  | { source: "full"; seed?: string }
  | { source: "bank"; seed: string }
  | { source: "section"; section: string; seed?: string };

/** A request that cannot be met, such as an unknown section. The message lists what is valid. */
export class PlanError extends Error {}

/** The sections a learner can pick by name: those with a title. */
export function sectionIds(quiz: Quiz): string[] {
  return quiz.sections.filter((s) => s.title !== null && s.id !== "").map((s) => s.id);
}

const wantsShuffle = (quiz: Quiz, q: Question): boolean =>
  (q.type === "single" || q.type === "multi") && (q.shuffle ?? quiz.frontMatter.shuffleChoices);

/**
 * Which questions an attempt gets, and in which order (TECHNICAL_DESIGN.md, section 4).
 *
 * - `full`: every question, banks included whole.
 * - `bank`: every section with `pick` draws that many of its questions (kept in source order).
 * - `section`: one section by its id, its bank drawn when it has `pick` and a seed is given.
 *
 * With a seed, `shuffle_questions` shuffles the questions inside each section and `shuffle_choices` (or `shuffle=`
 * on a question) records the order of a question's choices in `optionOrder`. Without a seed nothing is shuffled:
 * the plan is the quiz as written. Every random choice comes from the seed, so a plan is reproducible.
 */
export function planFor(quiz: Quiz, request: PlanRequest): Plan {
  const seed = request.seed;
  let sections = quiz.sections;
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
  const draw = request.source === "bank" || (request.source === "section" && seed !== undefined);

  const questions: Question[] = [];
  for (const section of sections) {
    let chosen = section.questions;
    if (draw && section.pick !== null && seed !== undefined) {
      const next = random(`${seed}\u0000bank\u0000${section.id}`);
      const keep = new Set(shuffled([...chosen.keys()], next).slice(0, section.pick));
      chosen = chosen.filter((_, i) => keep.has(i));
    }
    if (quiz.frontMatter.shuffleQuestions && seed !== undefined) {
      chosen = shuffled(chosen, random(`${seed}\u0000questions\u0000${section.id}`));
    }
    questions.push(...chosen);
  }

  const optionOrder: Record<string, number[]> = {};
  if (seed !== undefined) {
    for (const q of questions) {
      if (!wantsShuffle(quiz, q) || !("choices" in q)) continue;
      optionOrder[q.id] = shuffled([...q.choices.keys()], random(`${seed}\u0000options\u0000${q.id}`));
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
