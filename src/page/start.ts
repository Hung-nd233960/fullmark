import type { PageQuiz, PageSection } from "./data";

/**
 * The points a section is worth in one attempt: the sum of its questions, or for a bank (`pick`) the number drawn times
 * the average of the bank (a bank's questions may carry different points, and the draw is made at Start).
 */
export function sectionPoints(section: PageSection): number {
  const all = section.questions.reduce((n, q) => n + q.points, 0);
  if (section.pick === undefined || section.questions.length === 0) return all;
  return (all / section.questions.length) * section.pick;
}

/** True for a bank (`pick`) whose questions carry different points: what it is worth is not known before Start. */
export const mixedPoints = (section: PageSection): boolean =>
  section.pick !== undefined && section.questions.some((q) => q.points !== section.questions[0]?.points);

/** The number of questions in one attempt of a section: the draw for a bank, else all of them. */
export const sectionCount = (section: PageSection): number => section.pick ?? section.questions.length;

export const quizCount = (page: PageQuiz): number => page.sections.reduce((n, s) => n + sectionCount(s), 0);

/**
 * The points of the whole quiz, rounded to two decimals; absent when a bank draws from questions with different points,
 * since the total is then not known before Start.
 */
export function quizPoints(page: PageQuiz): number | undefined {
  if (page.sections.some(mixedPoints)) return undefined;
  return Math.round(page.sections.reduce((n, s) => n + sectionPoints(s), 0) * 100) / 100;
}

/** The seconds the whole quiz suggests: its time limit, else the sum of the sections' suggested times; absent if none. */
export function wholeTime(page: PageQuiz): number | undefined {
  if (page.timeLimit !== undefined) return page.timeLimit;
  const sum = page.sections.reduce((n, s) => n + (s.time ?? 0), 0);
  return sum > 0 ? sum : undefined;
}
