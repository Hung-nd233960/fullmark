import type { Question } from "./ir";

/**
 * Where the correct choices of a `single` or `multi` question sit, as 0-based positions in source order; empty for
 * any other type and for a question with no correct choice. One definition for `answers.position-skew` and for
 * `quiz inspect`, so the two always count the same way.
 */
export function correctPositions(q: Question): number[] {
  if (q.type !== "single" && q.type !== "multi") return [];
  const out: number[] = [];
  q.choices.forEach((c, i) => {
    if (c.correct) out.push(i);
  });
  return out;
}
