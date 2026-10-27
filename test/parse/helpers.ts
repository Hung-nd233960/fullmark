import type { Question, Quiz } from "../../src/core/ir";
import { parse } from "../../src/core/parse";

/** A quiz file: front matter with a title, then the body. */
export function quizText(body: string, front = "title: T"): string {
  return `---\n${front}\n---\n\n${body}\n`;
}

/** Parses a body (given front matter `title: T`) and returns the result. */
export function parseBody(body: string, front = "title: T") {
  return parse(quizText(body, front), "test.md");
}

/** The rule ids and lines of the issues, as "rule@line". */
export function found(body: string, front = "title: T"): string[] {
  return parseBody(body, front).issues.map((i) => `${i.rule}@${i.line}`);
}

/** The one question of a valid body. */
export function oneQuestion(body: string, front = "title: T"): Question {
  const result = parseBody(body, front);
  expectNoIssues(result.issues.map((i) => `${i.rule}@${i.line}: ${i.message}`));
  const q = (result.quiz as Quiz).sections[0]?.questions[0];
  if (!q) throw new Error("no question");
  return q;
}

function expectNoIssues(issues: string[]): void {
  if (issues.length > 0) throw new Error(`unexpected issues: ${issues.join("; ")}`);
}
