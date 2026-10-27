import type { CustomCheck, Where } from "../config/types";
import type { Question, Quiz, Section } from "../ir";
import type { Finding } from "./types";

type Located = { q: Question; section: Section };

function matches(w: Where, { q, section }: Located): boolean {
  if (w.type !== undefined && q.type !== w.type) return false;
  if (w.tag !== undefined && !q.tags.includes(w.tag)) return false;
  if (w.graded !== undefined && q.graded !== w.graded) return false;
  if (w.section !== undefined) {
    const wanted = w.section.toLowerCase();
    if (section.id.toLowerCase() !== wanted && (section.title ?? "").toLowerCase() !== wanted) return false;
  }
  return true;
}

function has(q: Question, field: string): boolean {
  switch (field) {
    case "tags":
      return q.tags.length > 0;
    case "explanation":
      return q.explanation !== null;
    case "id":
      return q.id !== "";
    case "points":
      return q.pointsGiven;
    default:
      return q.source !== null;
  }
}

const num = (n: number): string => String(Math.round(n * 1e6) / 1e6);

/**
 * Runs one custom check over a quiz (TECHNICAL_DESIGN.md, section 5). `count` reports once, on line 1; `require`
 * and `forbid` report on the heading of each question at fault. The author's `message` is shown as written, with the
 * numbers it needs after it. Points are counted for graded questions only: an ungraded question carries none.
 */
export function runCustom(quiz: Quiz, check: CustomCheck): Finding[] {
  const all: Located[] = quiz.sections.flatMap((section) => section.questions.map((q) => ({ q, section })));
  const hits = all.filter((l) => matches(check.where, l));
  if (check.kind === "count") {
    const n =
      check.measure === "points" ? hits.filter((l) => l.q.graded).reduce((sum, l) => sum + l.q.points, 0) : hits.length;
    const tooFew = check.min !== null && n < check.min - 1e-9;
    const tooMany = check.max !== null && n > check.max + 1e-9;
    if (!tooFew && !tooMany) return [];
    const range =
      check.min !== null && check.max !== null
        ? check.min === check.max
          ? `exactly ${num(check.min)}`
          : `${num(check.min)} to ${num(check.max)}`
        : check.min !== null
          ? `at least ${num(check.min)}`
          : `at most ${num(check.max ?? 0)}`;
    const unit = check.measure === "points" ? "points" : "questions";
    const found = `found ${num(n)} ${unit}, wanted ${range}`;
    return [
      {
        line: 1,
        message: check.message ? `${check.message} (${found})` : `${found}`,
        fix: tooFew ? `add ${unit} that match, or change the check` : `remove ${unit} that match, or change the check`,
      },
    ];
  }
  if (check.kind === "require") {
    return hits
      .filter((l) => !has(l.q, check.field))
      .map((l) => ({
        line: l.q.line,
        message: check.message ?? `this question has no ${check.field}`,
        fix: `add ${check.field} to the question`,
      }));
  }
  return hits.map((l) => ({
    line: l.q.line,
    message: check.message ?? "this question matches a pattern the profile forbids",
    fix: "change or remove the question",
  }));
}
