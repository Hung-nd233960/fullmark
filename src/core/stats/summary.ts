import type { Report, ReportOpen, ReportQuestion } from "../report";

/**
 * Progress across several attempts at one quiz (COMMANDS.md, `quiz stats`). Pure: reports in, the summary out.
 * Each attempt counts only the questions it had, scored against the version it was taken on; pending grades are not
 * yet scored. Questions match across versions by id, and by question hash when they have none.
 */

export type StatsPlan = { source: string; section: string | null };

export type StatsAttempt = {
  file: string;
  submitted: string | null;
  /** the quiz hash of the version the attempt was taken on */
  version: string;
  plan: StatsPlan;
  /** null for a survey, which has no score */
  earned: number | null;
  points: number | null;
  percent: number | null;
  pending: number;
};

export type StatsTag = { tag: string | null; earned: number; points: number; percent: number | null; attempts: number };

export type StatsQuestion = {
  /** null for a question that has no id: it is then followed by its hash */
  id: string | null;
  hash: string;
  title: string;
  seen: number;
  missed: number;
  earned: number;
  points: number;
  /** the question's text changed between the versions the attempts were taken on */
  changed: boolean;
};

export type StatsCriterion = {
  question: string;
  criterion: string;
  /** additive criteria: marks earned and available, summed over the attempts; null for a banded one */
  earned: number | null;
  max: number | null;
  percent: number | null;
  /** banded criteria: the average band; null for an additive one */
  band: number | null;
  attempts: number;
};

export type StatsAnswers = {
  question: string | null;
  hash: string;
  title: string;
  answers: { file: string; submitted: string | null; answer: string | null }[];
};

export type StatsSummary = {
  status: "done";
  quiz: { id: string; title: string };
  attempts: StatsAttempt[];
  tags: StatsTag[];
  weakest: string[];
  questions: StatsQuestion[];
  criteria: StatsCriterion[];
  /** a survey's answers per question over time; empty for a quiz */
  answers: StatsAnswers[];
};

/** What the current source calls a question: its title and tags, by question id. */
export type StatsNames = {
  title: string;
  questions: ReadonlyMap<string, { title: string; tags: readonly string[] }>;
};

export type StatsInput = { file: string; report: Report };

const round2 = (n: number): number => Math.round(n * 100) / 100;
const percentOf = (earned: number, points: number): number | null =>
  points > 0 ? Math.round((earned / points) * 10000) / 100 : null;
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The first line of a prompt with text on it. */
export function titleOf(prompt: string): string {
  return (
    prompt
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l !== "") ?? ""
  );
}

/** A question the attempt scored: points on it and not waiting for a grader. An unanswered one scored 0. */
const scored = (q: ReportQuestion): boolean => q.points > 0 && q.status !== "pending" && q.status !== "ungraded";

const keyOf = (q: ReportQuestion): string => (q.id !== "" ? q.id : `hash:${q.hash}`);

function planOf(report: Report): StatsPlan {
  const source = report.attempt.source;
  if (source !== "section") return { source, section: null };
  const sections = new Set(report.questions.map((q) => q.section));
  const only = sections.size === 1 ? ([...sections][0] ?? "") : "";
  return { source, section: only === "" ? null : only };
}

/** Attempts in date order (not submitted last), then by file name. */
export function ordered(inputs: readonly StatsInput[]): StatsInput[] {
  return [...inputs].sort((a, b) => {
    const x = a.report.attempt.submitted;
    const y = b.report.attempt.submitted;
    if (x !== y) return x === null ? 1 : y === null ? -1 : compare(x, y);
    return compare(a.file, b.file);
  });
}

type Acc = { earned: number; points: number; attempts: number };

export function summarise(inputs: readonly StatsInput[], names: StatsNames | null = null): StatsSummary {
  const list = ordered(inputs);
  const newest = list.at(-1)?.report;
  const attempts: StatsAttempt[] = list.map(({ file, report }) => ({
    file,
    submitted: report.attempt.submitted,
    version: report.quiz.hash,
    plan: planOf(report),
    earned: report.score?.earned ?? null,
    points: report.score?.points ?? null,
    percent: report.score?.percent ?? null,
    pending: report.score?.pending ?? 0,
  }));

  const tagTotals = new Map<string | null, Acc>();
  const questionTotals = new Map<
    string,
    { id: string | null; hash: string; hashes: Set<string>; title: string; seen: number; missed: number } & Acc
  >();
  const answers = new Map<string, StatsAnswers>();
  const criteria = new Map<
    string,
    { question: string; criterion: string; earned: number; max: number; band: number; banded: boolean; n: number }
  >();
  let survey = false;

  for (const { file, report } of list) {
    if (report.quiz.kind === "survey") survey = true;
    const perTag = new Map<string | null, Acc>();
    for (const q of report.questions) {
      const known = names?.questions.get(q.id);
      const title = known?.title ?? titleOf(q.prompt);
      if (report.quiz.kind === "survey") {
        const key = keyOf(q);
        const entry = answers.get(key) ?? { question: q.id === "" ? null : q.id, hash: q.hash, title, answers: [] };
        entry.hash = q.hash;
        entry.title = title;
        entry.answers.push({ file, submitted: report.attempt.submitted, answer: q.answer });
        answers.set(key, entry);
        continue;
      }
      if (!scored(q)) continue;
      const earned = q.earned ?? 0;
      const tags = known ? known.tags : q.tags;
      for (const tag of tags.length > 0 ? tags : [null]) {
        const t = perTag.get(tag) ?? { earned: 0, points: 0, attempts: 1 };
        t.earned += earned;
        t.points += q.points;
        perTag.set(tag, t);
      }
      const key = keyOf(q);
      const total = questionTotals.get(key) ?? {
        id: q.id === "" ? null : q.id,
        hash: q.hash,
        hashes: new Set<string>(),
        title,
        seen: 0,
        missed: 0,
        earned: 0,
        points: 0,
        attempts: 0,
      };
      total.hash = q.hash;
      total.hashes.add(q.hash);
      total.title = title;
      total.seen++;
      if (q.status === "incorrect" || q.status === "partial") total.missed++;
      total.earned += earned;
      total.points += q.points;
      questionTotals.set(key, total);
    }
    for (const [tag, t] of perTag) {
      const sum = tagTotals.get(tag) ?? { earned: 0, points: 0, attempts: 0 };
      sum.earned += t.earned;
      sum.points += t.points;
      sum.attempts++;
      tagTotals.set(tag, sum);
    }
    for (const o of report.open) addCriteria(criteria, o);
  }

  const tags: StatsTag[] = [...tagTotals]
    .map(([tag, t]) => ({
      tag,
      earned: round2(t.earned),
      points: round2(t.points),
      percent: percentOf(t.earned, t.points),
      attempts: t.attempts,
    }))
    .sort((a, b) => {
      if ((a.tag === null) !== (b.tag === null)) return a.tag === null ? 1 : -1;
      const pa = a.percent ?? 101;
      const pb = b.percent ?? 101;
      return pa !== pb ? pa - pb : compare(a.tag ?? "", b.tag ?? "");
    });
  const weakest = tags
    .filter((t) => t.tag !== null && t.attempts >= 2 && t.percent !== null)
    .slice(0, 3)
    .map((t) => t.tag as string);

  const questions: StatsQuestion[] = [...questionTotals.values()]
    .map((q) => ({
      id: q.id,
      hash: q.hash,
      title: q.title,
      seen: q.seen,
      missed: q.missed,
      earned: round2(q.earned),
      points: round2(q.points),
      changed: q.hashes.size > 1,
    }))
    .sort((a, b) => b.missed - a.missed || compare(a.id ?? `~${a.hash}`, b.id ?? `~${b.hash}`));

  const crit: StatsCriterion[] = [...criteria.values()]
    .sort((a, b) => compare(a.question, b.question))
    .map((c) => ({
      question: c.question,
      criterion: c.criterion,
      earned: c.banded ? null : round2(c.earned),
      max: c.banded ? null : round2(c.max),
      percent: c.banded ? null : percentOf(c.earned, c.max),
      band: c.banded ? round2(c.band / c.n) : null,
      attempts: c.n,
    }));

  return {
    status: "done",
    quiz: { id: newest?.quiz.id ?? "", title: names?.title ?? newest?.quiz.title ?? "" },
    attempts,
    tags: survey ? [] : tags,
    weakest: survey ? [] : weakest,
    questions: survey ? [] : questions,
    criteria: survey ? [] : crit,
    answers: survey ? [...answers.values()] : [],
  };
}

/** A graded essay or code answer's criteria: additive ones by marks, banded ones by band. Holistic ones are skipped. */
function addCriteria(
  into: Map<
    string,
    { question: string; criterion: string; earned: number; max: number; band: number; banded: boolean; n: number }
  >,
  o: ReportOpen,
): void {
  if (!o.grade) return;
  for (const c of o.grade.criteria) {
    const banded = c.band !== null;
    if (!banded && (c.earned === null || c.max === null)) continue;
    const key = `${o.id}\u0000${c.id}`;
    const e = into.get(key) ?? {
      question: o.id,
      criterion: c.id,
      earned: 0,
      max: 0,
      band: 0,
      banded,
      n: 0,
    };
    e.n++;
    if (banded) e.band += c.band ?? 0;
    else {
      e.earned += c.earned ?? 0;
      e.max += c.max ?? 0;
    }
    into.set(key, e);
  }
}
