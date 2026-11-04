import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readReview, reviewProblems } from "../core/review/read";
import type { Review } from "../core/review/schema";
import type { LoadedQuiz } from "./load";
import { readFailure } from "./paths";

export type ReviewLoad = { review: Review } | { message: string; problems: string[] };

/**
 * The review file `check --review` and `inspect --review` take, read for this quiz: the review, or why it cannot be
 * used (COMMANDS.md, `quiz check`): unreadable, invalid (every problem listed), or the review of another quiz. A
 * review of another version of this quiz is the normal case and is fine.
 */
export function loadReview(path: string, loaded: LoadedQuiz, cwd: string): ReviewLoad {
  let text: string;
  try {
    text = readFileSync(resolve(cwd, path), "utf8");
  } catch (error) {
    return { message: `cannot read the review ${path}: ${readFailure(error)}`, problems: [] };
  }
  const read = readReview(text);
  if (!read.ok) return { message: `${path} is not a usable review`, problems: read.problems };
  const id = loaded.frontMatter.id;
  if (read.review.quizId !== id) {
    return { message: `${path} is the review of the quiz "${read.review.quizId}", not of "${id}"`, problems: [] };
  }
  const problems = loaded.quiz ? reviewProblems(read.review, loaded.quiz) : [];
  if (problems.length > 0) return { message: `${path} is not a usable review`, problems };
  return { review: read.review };
}
