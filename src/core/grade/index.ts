import { type Answer, type AnswerOf, readAnswer } from "../attempt/answers";
import type { Attempt } from "../attempt/schema";
import type { Question, Quiz } from "../ir";
import { type NumberTarget, numberMatches, textMatches } from "./match";
import { countWords, normalise } from "./normalise";
import type { Graded, GradedQuestion, ManualScores, QuestionStatus, Tally } from "./types";

export { countWords, normalise } from "./normalise";
export type { Graded, GradedQuestion, ManualScores, QuestionStatus, Tally } from "./types";

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Two decimals, halves up: 1/3 of a point is 0.33. The small bias keeps 0.125 from falling to 0.12. */
const round2 = (x: number): number => Math.round(x * 100 + 1e-7) / 100;

/** `points` shared out as `k` parts of `n`. */
const share = (points: number, k: number, n: number): number => (n === 0 ? 0 : round2((points * k) / n));

type Scored = { earned: number; results: (boolean | null)[] | null };

const blank = (s: string | undefined | null): boolean => normalise(s ?? "") === "";

/** Whether the learner gave anything, for the types a computer can read. Fields: see `fieldsAnswered`. */
function answered(q: Question, a: Answer | null): boolean {
  switch (q.type) {
    case "single": {
      const r = readAnswer("single", a);
      return r !== null && r.choice !== null && r.choice !== undefined;
    }
    case "multi":
      return (readAnswer("multi", a)?.choices ?? []).length > 0;
    case "truefalse": {
      const v = readAnswer("truefalse", a)?.value;
      return v !== null && v !== undefined;
    }
    case "numeric":
      return !blank(readAnswer("numeric", a)?.raw);
    case "short":
      return !blank(readAnswer("short", a)?.text);
    case "blanks":
      return (readAnswer("blanks", a)?.blanks ?? []).some((b) => !blank(b));
    case "fields":
      return fieldsAnswered(q, readAnswer("fields", a));
    case "ordering":
      return (readAnswer("ordering", a)?.order ?? []).length === q.items.length;
    case "matching":
      return (readAnswer("matching", a)?.pairs ?? []).some((p) => p !== null && p !== undefined);
    case "essay":
      return !blank(readAnswer("essay", a)?.text);
    case "code":
      return !blank(readAnswer("code", a)?.code);
    case "scale": {
      const v = readAnswer("scale", a)?.value;
      return v !== null && v !== undefined;
    }
  }
}

/** A graded `fields` question counts only its graded fields; an ungraded one counts every field. */
function fieldsAnswered(q: Extract<Question, { type: "fields" }>, a: AnswerOf<"fields"> | null): boolean {
  const texts = a?.fields ?? [];
  return q.fields.some((f, i) => (q.graded ? f.key !== null : true) && !blank(texts[i]));
}

/** Scores a question that a computer can score; the answer is known to be given (`answered`). */
function score(q: Question, a: Answer | null, partial: boolean, decimalComma: boolean): Scored | null {
  const caseSensitive = q.case === "sensitive";
  const all = (hits: (boolean | null)[]): Scored => {
    const scored = hits.filter((h) => h !== null);
    const k = scored.filter(Boolean).length;
    const n = scored.length;
    return { earned: partial ? share(q.points, k, n) : k === n ? q.points : 0, results: hits };
  };
  switch (q.type) {
    case "single": {
      const choice = readAnswer("single", a)?.choice;
      const hit = choice !== null && choice !== undefined && q.choices[choice]?.correct === true;
      return { earned: hit ? q.points : 0, results: null };
    }
    case "multi": {
      const picked = new Set(readAnswer("multi", a)?.choices ?? []);
      const right = q.choices.flatMap((c, i) => (c.correct ? [i] : []));
      const hits = right.filter((i) => picked.has(i)).length;
      const wrong = picked.size - hits;
      const exact = hits === right.length && wrong === 0;
      return {
        earned: partial ? share(q.points, Math.max(0, hits - wrong), right.length) : exact ? q.points : 0,
        results: null,
      };
    }
    case "truefalse":
      return { earned: readAnswer("truefalse", a)?.value === q.value ? q.points : 0, results: null };
    case "numeric":
      return {
        earned: numberMatches(readAnswer("numeric", a)?.raw ?? "", q.key, decimalComma) ? q.points : 0,
        results: null,
      };
    case "short":
      return {
        earned: textMatches(readAnswer("short", a)?.text ?? "", q.key, caseSensitive) ? q.points : 0,
        results: null,
      };
    case "blanks": {
      const given = readAnswer("blanks", a)?.blanks ?? [];
      // Blanks always share the points equally; `partial` does not apply to them (QUIZ_SYNTAX.md, blanks).
      const hits = q.blanks.map((b, i) => {
        const text = given[i] ?? "";
        return b.kind === "text"
          ? textMatches(text, { accept: b.answers, patterns: [] }, caseSensitive)
          : numberMatches(
              text,
              { values: [b.value], raw: [b.raw], tolerance: b.tolerance, relTolerance: null },
              decimalComma,
            );
      });
      const k = hits.filter(Boolean).length;
      return { earned: share(q.points, k, hits.length), results: hits };
    }
    case "fields": {
      const given = readAnswer("fields", a)?.fields ?? [];
      const hits = q.fields.map((f, i) => {
        if (f.key === null) return null;
        const text = given[i] ?? "";
        if (f.key.kind === "text") return textMatches(text, f.key, caseSensitive);
        return numberMatches(text, f.key satisfies NumberTarget, decimalComma);
      });
      const graded = q.fields.flatMap((f, i) => (f.key === null ? [] : [{ f, hit: hits[i] === true }]));
      // Points are absolute (QUIZ_SYNTAX.md, fields): every graded field has them, or the points split equally.
      const absolute = graded.every(({ f }) => f.points !== null);
      const earned = absolute
        ? round2(graded.reduce((sum, { f, hit }) => sum + (hit ? (f.points ?? 0) : 0), 0))
        : share(q.points, graded.filter(({ hit }) => hit).length, graded.length);
      return { earned, results: hits };
    }
    case "ordering": {
      const order = readAnswer("ordering", a)?.order ?? [];
      const full = order.length === q.items.length;
      return { ...all(q.items.map((_, i) => full && order[i] === i)) };
    }
    case "matching": {
      const pairs = readAnswer("matching", a)?.pairs ?? [];
      return { ...all(q.pairs.map((_, i) => pairs[i] === i)) };
    }
    case "essay":
    case "code":
    case "scale":
      return null;
  }
}

function statusOf(earned: number, points: number): QuestionStatus {
  return earned >= points ? "correct" : earned <= 0 ? "incorrect" : "partial";
}

function gradeOne(q: Question, sectionId: string, a: Answer | null, quiz: Quiz, manual: ManualScores): GradedQuestion {
  const base = { id: q.id, section: sectionId, type: q.type, tags: q.tags };
  const words = q.type === "essay" ? countWords(readAnswer("essay", a)?.text ?? "") : null;
  const given = answered(q, a);
  const partial = q.partial ?? quiz.frontMatter.partial;

  if (!q.graded) {
    return { ...base, points: 0, earned: null, status: given ? "ungraded" : "unanswered", results: null, words };
  }
  if (q.type === "essay" || q.type === "code") {
    if (!given) return { ...base, points: q.points, earned: null, status: "unanswered", results: null, words };
    const marked = manual[q.id];
    if (marked === undefined)
      return { ...base, points: q.points, earned: null, status: "pending", results: null, words };
    const earned = Math.min(q.points, Math.max(0, marked));
    return { ...base, points: q.points, earned, status: statusOf(earned, q.points), results: null, words };
  }
  const scored = score(q, a, partial, quiz.frontMatter.lang === "vi");
  if (scored === null)
    return { ...base, points: 0, earned: null, status: given ? "ungraded" : "unanswered", results: null, words };
  if (!given) {
    return {
      ...base,
      points: q.points,
      earned: 0,
      status: "unanswered",
      results: scored.results === null ? null : scored.results.map((r) => (r === null ? null : false)),
      words,
    };
  }
  return {
    ...base,
    points: q.points,
    earned: scored.earned,
    status: statusOf(scored.earned, q.points),
    results: scored.results,
    words,
  };
}

function tally(list: readonly GradedQuestion[]): Tally {
  let earned = 0;
  let points = 0;
  let pending = 0;
  for (const g of list) {
    if (g.points <= 0) continue;
    if (g.status === "pending") pending += g.points;
    else {
      points += g.points;
      earned += g.earned ?? 0;
    }
  }
  return {
    questions: list.length,
    answered: list.filter((g) => g.status !== "unanswered").length,
    earned: round2(earned),
    points: round2(points),
    pending: round2(pending),
  };
}

/**
 * Grades an attempt against the quiz it was taken on: the one grader, which the page runs too (TECHNICAL_DESIGN.md,
 * section 7). Pure: the same quiz and attempt give the same result on every machine. Only the questions in the
 * plan count, in the plan's order. The quiz's `lang` (never `ui_lang`) decides whether `2,5` is a number.
 *
 * Essays and code are `pending` until a grader's marks are given in `manual` (by question id, out of the
 * question's points; `quiz grade --grades` computes them). An ungraded question, a survey's and `scale`'s too, is
 * `ungraded` when answered and never scored.
 */
export function grade(quiz: Quiz, attempt: Attempt, manual: ManualScores = {}): Graded {
  const found = new Map<string, { q: Question; section: string }>();
  for (const s of quiz.sections) for (const q of s.questions) found.set(q.id, { q, section: s.id });

  const questions: GradedQuestion[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const id of attempt.plan.questions) {
    if (seen.has(id)) continue;
    seen.add(id);
    const hit = found.get(id);
    if (!hit) {
      unknown.push(id);
      continue;
    }
    questions.push(gradeOne(hit.q, hit.section, attempt.state.answers[id] ?? null, quiz, manual));
  }

  const total = tally(questions);
  const sections = quiz.sections.flatMap((s) => {
    const own = questions.filter((g) => g.section === s.id && s.questions.some((q) => q.id === g.id));
    return own.length === 0 ? [] : [{ id: s.id, title: s.title, ...tally(own) }];
  });
  const names = [...new Set(questions.flatMap((g) => g.tags))].sort(compare);
  const tags = names.map((tag) => ({ tag, ...tally(questions.filter((g) => g.tags.includes(tag))) }));

  const mark = quiz.frontMatter.passMark;
  const passed = mark === null || total.points <= 0 ? null : total.earned * 100 >= mark * total.points - 1e-9;
  return {
    questions,
    unknown,
    total,
    sections,
    tags,
    survey: quiz.frontMatter.kind === "survey",
    pass: { mark, passed },
  };
}
