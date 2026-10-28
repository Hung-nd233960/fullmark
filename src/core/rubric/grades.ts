import { z } from "zod";
import type { Attempt } from "../attempt";
import { canonicalHash } from "../canonical";
import { type Graded, grade, type ManualScores } from "../grade";
import type { Question, Quiz } from "../ir";
import { bandPoints, isMultiple, overallBand, sumMarks } from "./arith";
import { type ResolvedRubric, resolveRubric, rubricHash } from "./model";

export const GRADES_FORMAT = "fullmark-grades";
export const GRADES_VERSION = 2;

export const VERDICTS = ["met", "partly", "missed"] as const;
export type Verdict = (typeof VERDICTS)[number];

export type Grader = { kind: "ai" | "human"; name: string; model?: string; at?: string };

/** The file as a reader takes it: the envelope is fixed, a question's entry is judged by `applyGrades`. */
export const GradesFileSchema = z.looseObject({
  format: z.literal(GRADES_FORMAT),
  version: z.literal(GRADES_VERSION),
  results_hash: z.string().nullable().optional(),
  grader: z.unknown().optional(),
  grades: z.record(z.string(), z.unknown()),
});
export type GradesFile = z.infer<typeof GradesFileSchema>;

export type ReadGrades = { ok: true; file: GradesFile } | { ok: false; message: string };

/** Reads the text of a grades file. A 0.x file (`grades-v1`) is refused with a plain message. */
export function parseGrades(text: string): ReadGrades {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ""));
  } catch (error) {
    return { ok: false, message: `not a grades file: it is not valid JSON (${(error as Error).message})` };
  }
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, message: "not a grades file: it is not a JSON object" };
  }
  const head = json as { format?: unknown; version?: unknown };
  if (head.format !== GRADES_FORMAT) {
    return { ok: false, message: `not a grades file: its format is not "${GRADES_FORMAT}"` };
  }
  if (head.version === 1) {
    return {
      ok: false,
      message: `this is a 0.x grades file (version 1): fullmark 1.0 reads only version ${GRADES_VERSION}; grade the attempt again from the template that \`quiz grade --json\` writes`,
    };
  }
  if (head.version !== GRADES_VERSION) {
    return {
      ok: false,
      message: `unsupported grades version ${String(head.version)}: this fullmark reads version ${GRADES_VERSION}`,
    };
  }
  const parsed = GradesFileSchema.safeParse(json);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".") || "(file)"}: ${i.message}`);
    return { ok: false, message: `the grades file is malformed:\n  ${problems.join("\n  ")}` };
  }
  return { ok: true, file: parsed.data };
}

/** The `results_hash`: SHA-256 over the canonical JSON of the results file as parsed, every key included. */
export const resultsHash = (results: unknown): string => canonicalHash(results);

// -- the template -------------------------------------------------------------------------------------------------

type Gradable = { question: Extract<Question, { type: "essay" | "code" }>; rubric: ResolvedRubric; points: number };

/** The questions a grader is asked about: answered essay and code questions of the plan, in the plan's order. */
export function gradable(quiz: Quiz, graded: Graded): Gradable[] {
  const byId = new Map<string, Question>();
  for (const s of quiz.sections) for (const q of s.questions) byId.set(q.id, q);
  const out: Gradable[] = [];
  for (const g of graded.questions) {
    const q = byId.get(g.id);
    if (g.status === "pending" && q && (q.type === "essay" || q.type === "code")) {
      out.push({ question: q, rubric: resolveRubric(q.rubric), points: q.points });
    }
  }
  return out;
}

const templateEntry = ({ rubric, points }: Gradable): Record<string, unknown> => {
  const head = { mode: rubric.mode, rubric_hash: rubricHash(rubric), points };
  const tail = { justification: null, improvement: null };
  if (rubric.mode === "additive") {
    return {
      ...head,
      step: rubric.step,
      criteria: Object.fromEntries(
        rubric.criteria.map((c) => [c.id, { text: c.text, max: c.max, score: null, note: null }]),
      ),
      ...tail,
    };
  }
  if (rubric.mode === "banded") {
    return {
      ...head,
      scale: rubric.scale,
      round: rubric.round,
      criteria: Object.fromEntries(
        rubric.criteria.map((c) => [c.id, { text: c.text, weight: c.weight, band: null, note: null }]),
      ),
      ...tail,
    };
  }
  return {
    ...head,
    ...(rubric.step === null ? {} : { step: rubric.step }),
    score: null,
    bullets: Object.fromEntries(rubric.criteria.map((c) => [c.id, { text: c.text, verdict: null }])),
    ...tail,
  };
};

/** The grades template: every rubric's structure filled in, every cell the grader owns `null`. */
export function gradesTemplate(quiz: Quiz, graded: Graded, resultsJson: unknown): Record<string, unknown> {
  return {
    format: GRADES_FORMAT,
    version: GRADES_VERSION,
    results_hash: resultsHash(resultsJson),
    grader: null,
    grades: Object.fromEntries(gradable(quiz, graded).map((g) => [g.question.id, templateEntry(g)])),
  };
}

// -- validation and arithmetic --------------------------------------------------------------------------------

export type CriterionResult = {
  id: string;
  text: string;
  /** additive: the score; banded: null; holistic: null */
  earned: number | null;
  max: number | null;
  weight: number | null;
  band: number | null;
  note: string | null;
  verdict: Verdict | null;
};

export type GradeDetail = {
  id: string;
  mode: ResolvedRubric["mode"];
  points: number;
  earned: number;
  /** the overall band of a banded rubric */
  band: number | null;
  graded_by: Grader;
  /** false when the entry was written against a rubric that has changed since */
  rubric_current: boolean;
  criteria: CriterionResult[];
  justification: string | null;
  improvement: string | null;
};

export type AppliedGrades = {
  /** every problem; when there is one, the grades are not usable and nothing should be written */
  problems: string[];
  warnings: string[];
  details: GradeDetail[];
  /** the marks to give `grade()` */
  manual: ManualScores;
};

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function readGrader(v: unknown, where: string, problems: string[]): Grader | null {
  if (!isObject(v)) {
    problems.push(`${where}: the grader is missing (give kind "ai" or "human", and a name)`);
    return null;
  }
  const kind = v.kind;
  const name = text(v.name);
  let ok = true;
  if (kind !== "ai" && kind !== "human") {
    problems.push(`${where}: grader.kind must be "ai" or "human"`);
    ok = false;
  }
  if (name === null) {
    problems.push(`${where}: grader.name is empty`);
    ok = false;
  }
  const model = text(v.model);
  if (kind === "ai" && model === null) {
    problems.push(`${where}: an AI grader needs grader.model`);
    ok = false;
  }
  if (!ok) return null;
  return {
    kind: kind as "ai" | "human",
    name: name as string,
    ...(model === null ? {} : { model }),
    ...(text(v.at) === null ? {} : { at: text(v.at) as string }),
  };
}

/**
 * Checks a grades file against the quiz and the attempt, lists every problem (TECHNICAL_DESIGN.md, section 6), and
 * does the arithmetic: the sum of an additive rubric, the overall band and points of a banded one. A question whose
 * cells are all `null` stays pending. Nothing here reads the clock or the disk.
 */
export function applyGrades(quiz: Quiz, attempt: Attempt, resultsJson: unknown, file: GradesFile): AppliedGrades {
  const problems: string[] = [];
  const warnings: string[] = [];
  const details: GradeDetail[] = [];
  const manual: Record<string, number> = {};
  const graded = grade(quiz, attempt);
  const asked = new Map(gradable(quiz, graded).map((g) => [g.question.id, g]));

  const fileGrader =
    file.grader === undefined || file.grader === null ? null : readGrader(file.grader, "grader", problems);
  if (file.grader === undefined || file.grader === null)
    problems.push("grader is missing (give kind, name and, for an AI, model)");

  const expectedResults = resultsHash(resultsJson);
  if (typeof file.results_hash !== "string" || file.results_hash === "") {
    problems.push("results_hash is missing: take the grades template that `quiz grade --json` writes");
  } else if (file.results_hash !== expectedResults) {
    warnings.push("results_hash differs from this attempt: these grades were made for another results file");
  }

  for (const [id, entry] of Object.entries(file.grades)) {
    const where = `grades.${id}`;
    const g = asked.get(id);
    if (!g) {
      problems.push(`${where}: no answered essay or code question with this id is waiting for a grade`);
      continue;
    }
    if (!isObject(entry)) {
      problems.push(`${where}: must be an object`);
      continue;
    }
    const before = problems.length;
    const detail = gradeEntry(id, entry, g, where, problems, warnings);
    if (detail && problems.length === before) {
      const own = entry.grader === undefined ? fileGrader : readGrader(entry.grader, `${where}.grader`, problems);
      if (own && problems.length === before) {
        details.push({ ...detail, graded_by: own });
        manual[id] = detail.earned;
      }
    }
  }
  return { problems, warnings, details, manual };
}

type Computed = Omit<GradeDetail, "graded_by"> & { graded_by?: never };

/** One question's entry. Returns null when it is entirely empty (pending) or when problems were found. */
function gradeEntry(
  id: string,
  entry: Record<string, unknown>,
  g: Gradable,
  where: string,
  problems: string[],
  warnings: string[],
): Computed | null {
  const { rubric, points } = g;
  const start = problems.length;
  const fail = (message: string) => problems.push(`${where}: ${message}`);

  if (entry.mode !== rubric.mode) fail(`mode is ${JSON.stringify(entry.mode)}, but the rubric is ${rubric.mode}`);
  if (num(entry.points) !== points) fail(`points changed from ${points}: the template's values cannot be edited`);
  const current = rubricHash(rubric);
  if (typeof entry.rubric_hash !== "string" || entry.rubric_hash === "") fail("rubric_hash is missing");
  const rubricCurrent = entry.rubric_hash === current;
  if (typeof entry.rubric_hash === "string" && entry.rubric_hash !== "" && !rubricCurrent) {
    warnings.push(`${where}: graded against an older rubric (rubric_hash differs)`);
  }
  if (problems.length > start) return null;

  const justification = text(entry.justification);
  const improvement = text(entry.improvement);
  const cells = isObject(entry.criteria) ? entry.criteria : isObject(entry.bullets) ? entry.bullets : null;
  const kind = rubric.mode === "holistic" ? "bullets" : "criteria";
  if (cells === null) {
    fail(`\`${kind}\` is missing`);
    return null;
  }
  const known = new Set(rubric.criteria.map((c) => c.id));
  for (const key of Object.keys(cells))
    if (!known.has(key)) fail(`${kind}.${key}: no such ${kind === "bullets" ? "bullet" : "criterion"} in the rubric`);
  for (const key of known) if (!(key in cells)) fail(`${kind}.${key}: missing (the template has it)`);
  if (problems.length > start) return null;
  const cell = (key: string): Record<string, unknown> => {
    const c = cells[key];
    if (isObject(c)) return c;
    fail(`${kind}.${key}: must be an object`);
    return {};
  };

  if (rubric.mode === "additive") {
    const marks = rubric.criteria.map((c) => {
      const cc = cell(c.id);
      if (num(cc.max) !== c.max) fail(`criteria.${c.id}: max changed from ${c.max}`);
      return { c, cc, score: cc.score === null || cc.score === undefined ? null : num(cc.score), raw: cc.score };
    });
    if (marks.every((m) => m.raw === null || m.raw === undefined)) return null;
    for (const { c, cc, score, raw } of marks) {
      if (raw === null || raw === undefined)
        fail(`criteria.${c.id}: score is empty while others are filled in (half-filled question)`);
      else if (score === null) fail(`criteria.${c.id}: score must be a number`);
      else if (score < 0 || score > c.max) fail(`criteria.${c.id}: score ${score} is outside 0 to ${c.max}`);
      else if (!isMultiple(score, rubric.step))
        fail(`criteria.${c.id}: score ${score} is not a multiple of the step ${rubric.step}`);
      else if (score < c.max && text(cc.note) === null)
        fail(`criteria.${c.id}: a note is needed when marks are lost (${score} of ${c.max})`);
    }
    if (problems.length > start) return null;
    const earned = sumMarks(marks.map((m) => m.score ?? 0));
    return {
      id,
      mode: "additive",
      points,
      earned,
      band: null,
      rubric_current: rubricCurrent,
      justification,
      improvement,
      criteria: marks.map(({ c, cc, score }) => ({
        id: c.id,
        text: c.text,
        earned: score,
        max: c.max,
        weight: null,
        band: null,
        note: text(cc.note),
        verdict: null,
      })),
    };
  }

  if (rubric.mode === "banded") {
    const { scale } = rubric;
    const same =
      isObject(entry.scale) &&
      entry.scale.min === scale.min &&
      entry.scale.max === scale.max &&
      entry.scale.step === scale.step;
    if (!same) fail("scale changed: the template's scale cannot be edited");
    if (entry.round !== rubric.round) fail(`round changed from ${rubric.round}`);
    const bands = rubric.criteria.map((c) => {
      const cc = cell(c.id);
      if (num(cc.weight) !== c.weight) fail(`criteria.${c.id}: weight changed from ${c.weight}`);
      return { c, cc, band: cc.band === null || cc.band === undefined ? null : num(cc.band), raw: cc.band };
    });
    if (problems.length > start) return null;
    if (bands.every((b) => b.raw === null || b.raw === undefined)) return null;
    for (const { c, cc, band, raw } of bands) {
      if (raw === null || raw === undefined)
        fail(`criteria.${c.id}: band is empty while others are filled in (half-filled question)`);
      else if (band === null) fail(`criteria.${c.id}: band must be a number`);
      else if (band < scale.min || band > scale.max)
        fail(`criteria.${c.id}: band ${band} is outside the scale ${scale.min} to ${scale.max}`);
      else if (!isMultiple(band, scale.step, scale.min))
        fail(`criteria.${c.id}: band ${band} is not on the scale's step ${scale.step}`);
      else if (band < scale.max && text(cc.note) === null)
        fail(`criteria.${c.id}: a note is needed when the band is below ${scale.max}`);
    }
    if (problems.length > start) return null;
    const overall = overallBand(
      bands.map((b) => b.band ?? 0),
      rubric.criteria.map((c) => c.weight),
      scale,
      rubric.round,
    );
    return {
      id,
      mode: "banded",
      points,
      earned: bandPoints(points, overall, scale.max),
      band: overall,
      rubric_current: rubricCurrent,
      justification,
      improvement,
      criteria: bands.map(({ c, cc, band }) => ({
        id: c.id,
        text: c.text,
        earned: null,
        max: null,
        weight: c.weight,
        band,
        note: text(cc.note),
        verdict: null,
      })),
    };
  }

  // holistic
  const verdicts = rubric.criteria.map((c) => {
    const raw = cell(c.id).verdict;
    const ok = raw === null || raw === undefined || (VERDICTS as readonly unknown[]).includes(raw);
    if (!ok) fail(`bullets.${c.id}: verdict must be one of ${VERDICTS.join(", ")}`);
    return { c, verdict: ok && typeof raw === "string" ? (raw as Verdict) : null };
  });
  const raw = entry.score;
  if ((raw === null || raw === undefined) && verdicts.every((v) => v.verdict === null)) return null;
  const score = raw === null || raw === undefined ? null : num(raw);
  if (raw === null || raw === undefined) fail("score is empty while other cells are filled in (half-filled question)");
  else if (score === null) fail("score must be a number");
  else if (score < 0 || score > points) fail(`score ${score} is outside 0 to ${points}`);
  else if (rubric.step !== null && !isMultiple(score, rubric.step))
    fail(`score ${score} is not a multiple of the step ${rubric.step}`);
  if (justification === null) fail("a holistic grade needs a justification");
  if (problems.length > start) return null;
  return {
    id,
    mode: "holistic",
    points,
    earned: score ?? 0,
    band: null,
    rubric_current: rubricCurrent,
    justification,
    improvement,
    criteria: verdicts.map(({ c, verdict }) => ({
      id: c.id,
      text: c.text,
      earned: null,
      max: null,
      weight: null,
      band: null,
      note: null,
      verdict,
    })),
  };
}
