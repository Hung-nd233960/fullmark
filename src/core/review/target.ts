import type { Quiz } from "../ir";
import type { ReviewTarget } from "./merge";

/**
 * The quiz as `merge` takes it. `blocks` is what `parse` collects with its `blocks` option; a question without an
 * id cannot be followed by a review, so it is left out (`quiz review` refuses such a quiz first).
 */
export function reviewTarget(
  quiz: Quiz,
  quizHash: string,
  blocks: ReadonlyMap<string, string>,
  reviewedAt: string,
): ReviewTarget {
  const questions = new Map<string, { hash: string; source: string }>();
  for (const s of quiz.sections) {
    for (const q of s.questions) {
      if (q.id !== "") questions.set(q.id, { hash: q.hash, source: blocks.get(q.hash) ?? "" });
    }
  }
  return { id: quiz.frontMatter.id, hash: quizHash, reviewedAt, questions };
}
