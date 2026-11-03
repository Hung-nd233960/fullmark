import type { Attempt } from "../attempt";
import { type Graded, type GradedQuestion, grade, type QuestionStatus, type Tally } from "../grade";
import type { Messages } from "../i18n";
import type { Question, Quiz } from "../ir";
import type { AppliedGrades, GradeDetail, Grader } from "../rubric/grades";
import { type ResolvedRubric, resolveRubric } from "../rubric/model";
import { describeAnswer, describeKey } from "./describe";

export const REPORT_FORMAT = "fullmark-report";
export const REPORT_VERSION = 2;

export type ReportScore = {
  earned: number;
  points: number;
  percent: number | null;
  pending: number;
  pass: { mark: number | null; passed: boolean | null };
};

export type ReportGroup = {
  id: string;
  title: string | null;
  earned: number;
  points: number;
  percent: number | null;
  pending: number;
  questions: number;
};

export type ReportQuestion = {
  id: string;
  /** the question hash: the version of this question, which `stats` compares across versions (foundation 1) */
  hash: string;
  section: string;
  type: Question["type"];
  tags: string[];
  points: number;
  earned: number | null;
  status: QuestionStatus;
  prompt: string;
  /** the learner's answer as text; null when there is none */
  answer: string | null;
  /** the right answer as text; null for essays, code, scales and ungraded questions */
  key: string | null;
  explanation: string | null;
  words: number | null;
};

export type ReportOpen = {
  id: string;
  type: "essay" | "code";
  points: number;
  prompt: string;
  answer: string;
  words: number | null;
  language: string | null;
  rubric: ResolvedRubric;
  sample_answer: string | null;
  /** true while no grade has been applied */
  pending: boolean;
  grade: (GradeDetail & { status: QuestionStatus }) | null;
};

export type Report = {
  format: typeof REPORT_FORMAT;
  version: typeof REPORT_VERSION;
  quiz: { title: string; id: string; hash: string; kind: "quiz" | "survey"; lang: "en" | "vi" };
  attempt: {
    phase: Attempt["phase"];
    source: string;
    questions: number;
    started: string | null;
    submitted: string | null;
    time_used: number;
    timed_out: boolean;
  };
  /** null for a survey: it has no score */
  score: ReportScore | null;
  sections: ReportGroup[];
  tags: ReportGroup[];
  questions: ReportQuestion[];
  /** the ids of scored questions that are wrong or only partly right */
  wrong: string[];
  /** the answered essays and code, laid out for a grader */
  open: ReportOpen[];
  grades: { grader: Grader | null; warnings: string[] } | null;
  unknown: string[];
};

const pct = (earned: number, points: number): number | null =>
  points > 0 ? Math.round((earned / points) * 10000) / 100 : null;

const group = (t: Tally, id: string, title: string | null): ReportGroup => ({
  id,
  title,
  earned: t.earned,
  points: t.points,
  percent: pct(t.earned, t.points),
  pending: t.pending,
  questions: t.questions,
});

export type ReportInput = {
  quiz: Quiz;
  quizHash: string;
  attempt: Attempt;
  /** the grades, already applied and free of problems; null for none */
  applied?: AppliedGrades | null;
};

/**
 * The report (`fullmark-report` version 2, TECHNICAL_DESIGN.md section 6): what `grade` writes as JSON and renders as Markdown. Pure: the same inputs give the same
 * object, and it holds no timestamp of its own, only those the attempt carries.
 */
export function buildReport(input: ReportInput, m: Messages["report"]): Report {
  const { quiz, attempt } = input;
  const applied = input.applied ?? null;
  const graded: Graded = grade(quiz, attempt, applied?.manual);
  const byId = new Map<string, Question>();
  for (const s of quiz.sections) for (const q of s.questions) byId.set(q.id, q);

  const questions: ReportQuestion[] = graded.questions.flatMap((g: GradedQuestion) => {
    const q = byId.get(g.id);
    if (!q) return [];
    return [
      {
        id: g.id,
        hash: q.hash,
        section: g.section,
        type: g.type,
        tags: g.tags,
        points: g.points,
        earned: g.earned,
        status: g.status,
        prompt: q.prompt,
        answer: describeAnswer(q, attempt.state.answers[g.id], m),
        key: q.graded && !graded.survey ? describeKey(q) : null,
        explanation: q.explanation?.text ?? null,
        words: g.words,
      },
    ];
  });

  const details = new Map((applied?.details ?? []).map((d) => [d.id, d]));
  const open: ReportOpen[] = graded.questions.flatMap((g) => {
    const q = byId.get(g.id);
    if (!q || (q.type !== "essay" && q.type !== "code") || !q.graded) return [];
    const answer = describeAnswer(q, attempt.state.answers[g.id], m);
    if (answer === null) return [];
    const detail = details.get(g.id);
    return [
      {
        id: g.id,
        type: q.type,
        points: q.points,
        prompt: q.prompt,
        answer,
        words: g.words,
        language: q.type === "code" ? q.language : null,
        rubric: resolveRubric(q.rubric),
        sample_answer: q.sampleAnswer,
        pending: !detail,
        grade: detail ? { ...detail, status: g.status } : null,
      },
    ];
  });

  return {
    format: REPORT_FORMAT,
    version: REPORT_VERSION,
    quiz: {
      title: quiz.frontMatter.title,
      id: quiz.frontMatter.id,
      hash: input.quizHash,
      kind: quiz.frontMatter.kind,
      lang: quiz.frontMatter.lang,
    },
    attempt: {
      phase: attempt.phase,
      source: attempt.plan.source,
      questions: graded.total.questions,
      started: attempt.state.startedAt,
      submitted: attempt.state.submittedAt,
      time_used: attempt.state.timeUsed,
      timed_out: attempt.state.timedOut,
    },
    score: graded.survey
      ? null
      : {
          earned: graded.total.earned,
          points: graded.total.points,
          percent: pct(graded.total.earned, graded.total.points),
          pending: graded.total.pending,
          pass: graded.pass,
        },
    sections: graded.survey ? [] : graded.sections.map((s) => group(s, s.id, s.title)),
    tags: graded.survey ? [] : graded.tags.map((t) => group(t, t.tag, null)),
    questions,
    wrong: questions.filter((q) => q.status === "incorrect" || q.status === "partial").map((q) => q.id),
    open,
    grades: applied ? { grader: applied.grader, warnings: applied.warnings } : null,
    unknown: graded.unknown,
  };
}
