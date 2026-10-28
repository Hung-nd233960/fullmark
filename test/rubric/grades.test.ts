import { describe, expect, it } from "vitest";
import { grade } from "../../src/core/grade";
import { applyGrades, gradesTemplate, parseGrades, resultsHash } from "../../src/core/rubric/grades";
import { attemptFor, quizOf } from "../helpers/grading";

const BODY = [
  "## Laplace {type=essay id=laplace points=3}",
  "```answer",
  "rubric:",
  "  mode: additive",
  "  step: 0.25",
  "  criteria:",
  "    - id: defs",
  "      text: Establish the definitions",
  "      points: 0.5",
  "    - id: derive",
  "      text: Derive the transfer function",
  "      points: 1.5",
  "    - id: interp",
  "      text: Interpret the poles",
  "      points: 1",
  "```",
  "## IELTS {type=essay id=task2 points=9}",
  "```answer",
  "rubric:",
  "  preset: ielts-writing-task2",
  "```",
  "## Aliasing {type=essay id=alias points=4}",
  "```answer",
  "rubric:",
  "  - id: nyquist",
  "    text: Names the Nyquist rate",
  "  - id: example",
  "    text: Gives an example",
  "```",
  "## Plain {type=truefalse id=tf}",
  "```answer",
  "value: true",
  "```",
].join("\n");

const quiz = quizOf(BODY);
const attempt = attemptFor({
  laplace: { text: "a" },
  task2: { text: "b" },
  alias: { text: "c" },
  tf: { value: true },
});
const resultsJson = { format: "fullmark-results", version: 2, ...attempt, extra: { kept: true } };
const graded = grade(quiz, attempt);
const GRADER = { kind: "ai", name: "Claude", model: "claude-opus-5-5" };

type Json = Record<string, any>;
const template = (): Json => structuredClone(gradesTemplate(quiz, graded, resultsJson)) as Json;

/** The template with the three questions filled in as in TECHNICAL_DESIGN.md section 6. */
function filled(): Json {
  const t = template();
  t.grader = GRADER;
  const l = t.grades.laplace;
  Object.assign(l.criteria.defs, { score: 0.5, note: "ok" });
  Object.assign(l.criteria.derive, { score: 1.25, note: "Skips the zero initial-conditions assumption." });
  Object.assign(l.criteria.interp, { score: 0.5, note: "Does not link poles to stability." });
  const b = t.grades.task2;
  for (const [id, band] of [
    ["TR", 6],
    ["CC", 6.5],
    ["LR", 6.5],
    ["GRA", 6],
  ] as const) {
    Object.assign(b.criteria[id], { band, note: "n" });
  }
  const h = t.grades.alias;
  h.score = 3;
  h.justification = "Good.";
  h.bullets.nyquist.verdict = "met";
  h.bullets.example.verdict = "partly";
  return t;
}

const apply = (file: Json) => {
  const read = parseGrades(JSON.stringify(file));
  if (!read.ok) throw new Error(read.message);
  return applyGrades(quiz, attempt, resultsJson, read.file);
};

describe("the grades template", () => {
  it("holds the essays waiting for a grader, with their structure and empty cells", () => {
    const t = template();
    expect(Object.keys(t.grades)).toEqual(["laplace", "task2", "alias"]);
    expect(t).toMatchObject({ format: "fullmark-grades", version: 2, grader: null });
    expect(t.results_hash).toBe(resultsHash(resultsJson));
    expect(t.grades.laplace).toMatchObject({
      mode: "additive",
      points: 3,
      step: 0.25,
      justification: null,
      criteria: { defs: { text: "Establish the definitions", max: 0.5, score: null, note: null } },
    });
    expect(t.grades.task2).toMatchObject({
      mode: "banded",
      scale: { min: 0, max: 9, step: 0.5 },
      round: "ielts",
      criteria: { TR: { text: "Task Response", weight: 1, band: null, note: null } },
    });
    expect(t.grades.alias).toMatchObject({
      mode: "holistic",
      score: null,
      bullets: { nyquist: { text: "Names the Nyquist rate", verdict: null } },
    });
    expect(t.grades.alias.step).toBeUndefined();
  });

  it("leaves out an unanswered essay, and one that is already graded in", () => {
    const a = attemptFor({ laplace: null, task2: { text: "b" }, alias: { text: "c" } });
    const t = gradesTemplate(quiz, grade(quiz, a), {}) as Json;
    expect(Object.keys(t.grades)).toEqual(["task2", "alias"]);
  });

  it("is the same on every run", () => {
    expect(JSON.stringify(template())).toBe(JSON.stringify(template()));
  });
});

describe("a valid grades file", () => {
  it("computes the sum, the overall band, and takes a holistic score as given", () => {
    const out = apply(filled());
    expect(out.problems).toEqual([]);
    expect(out.warnings).toEqual([]);
    expect(out.manual).toEqual({ laplace: 2.25, task2: 6.5, alias: 3 });
    const by = Object.fromEntries(out.details.map((d) => [d.id, d]));
    expect(by.task2).toMatchObject({ band: 6.5, points: 9, earned: 6.5, rubric_current: true });
    expect(by.laplace?.criteria.map((c) => [c.id, c.earned, c.max])).toEqual([
      ["defs", 0.5, 0.5],
      ["derive", 1.25, 1.5],
      ["interp", 0.5, 1],
    ]);
    expect(by.alias?.criteria.map((c) => c.verdict)).toEqual(["met", "partly"]);
    expect(by.alias?.graded_by).toEqual(GRADER);
  });

  it("feeds grade(): the questions leave pending", () => {
    const out = apply(filled());
    const g = grade(quiz, attempt, out.manual);
    expect(g.total).toMatchObject({ earned: 2.25 + 6.5 + 3 + 1, pending: 0 });
  });

  it("leaves a question that is entirely null pending, so a partly graded file is allowed", () => {
    const t = filled();
    t.grades.task2 = template().grades.task2;
    const out = apply(t);
    expect(out.problems).toEqual([]);
    expect(Object.keys(out.manual)).toEqual(["laplace", "alias"]);
  });

  it("an entry's own grader wins, and a reviewed key is allowed", () => {
    const t = filled();
    t.grades.alias.grader = { kind: "human", name: "Hung" };
    t.grades.alias.reviewed = GRADER;
    expect(apply(t).details.find((d) => d.id === "alias")?.graded_by).toEqual({ kind: "human", name: "Hung" });
  });
});

describe("what makes a grades file invalid", () => {
  const problemsOf = (change: (t: Json) => void): string[] => {
    const t = filled();
    change(t);
    return apply(t).problems;
  };

  it("a missing or empty grader", () => {
    expect(problemsOf((t) => (t.grader = null))).toEqual([expect.stringContaining("grader is missing")]);
    expect(problemsOf((t) => (t.grader = { kind: "ai", name: " ", model: "m" }))).toEqual([
      expect.stringContaining("grader.name is empty"),
    ]);
    expect(problemsOf((t) => (t.grader = { kind: "robot", name: "x" }))).toEqual([
      expect.stringContaining('grader.kind must be "ai" or "human"'),
    ]);
    expect(problemsOf((t) => (t.grader = { kind: "ai", name: "x" }))).toEqual([
      expect.stringContaining("needs grader.model"),
    ]);
    expect(problemsOf((t) => (t.grader = { kind: "human", name: "Hung" }))).toEqual([]);
  });

  it("a score above its maximum, below 0, or off its step", () => {
    expect(problemsOf((t) => (t.grades.laplace.criteria.defs.score = 0.75))).toEqual([
      expect.stringContaining("outside 0 to 0.5"),
    ]);
    expect(problemsOf((t) => (t.grades.laplace.criteria.defs.score = -0.25))).toEqual([
      expect.stringContaining("outside 0 to 0.5"),
    ]);
    expect(problemsOf((t) => (t.grades.laplace.criteria.derive.score = 1.1))).toEqual([
      expect.stringContaining("not a multiple of the step 0.25"),
    ]);
  });

  it("a band outside the scale or off its step", () => {
    expect(problemsOf((t) => (t.grades.task2.criteria.TR.band = 9.5))).toEqual([
      expect.stringContaining("outside the scale"),
    ]);
    expect(problemsOf((t) => (t.grades.task2.criteria.TR.band = 6.3))).toEqual([
      expect.stringContaining("not on the scale's step"),
    ]);
  });

  it("an unknown criterion, bullet or question, and a missing one", () => {
    expect(problemsOf((t) => (t.grades.laplace.criteria.extra = { score: 1 }))).toEqual([
      expect.stringContaining("criteria.extra: no such criterion"),
    ]);
    expect(problemsOf((t) => delete t.grades.laplace.criteria.defs)).toEqual([
      expect.stringContaining("criteria.defs: missing"),
    ]);
    expect(problemsOf((t) => (t.grades.alias.bullets.extra = { verdict: "met" }))).toEqual([
      expect.stringContaining("bullets.extra: no such bullet"),
    ]);
    expect(problemsOf((t) => (t.grades.nope = {}))).toEqual([expect.stringContaining("grades.nope")]);
    expect(problemsOf((t) => (t.grades.tf = {}))).toEqual([expect.stringContaining("grades.tf")]);
  });

  it("a changed maximum, weight, scale, points or mode", () => {
    expect(problemsOf((t) => (t.grades.laplace.criteria.defs.max = 5))).toEqual([
      expect.stringContaining("max changed"),
    ]);
    expect(problemsOf((t) => (t.grades.task2.criteria.TR.weight = 3))).toEqual([
      expect.stringContaining("weight changed"),
    ]);
    expect(problemsOf((t) => (t.grades.task2.scale.max = 10))).toEqual([expect.stringContaining("scale changed")]);
    expect(problemsOf((t) => (t.grades.laplace.points = 9))).toEqual([expect.stringContaining("points changed")]);
    expect(problemsOf((t) => (t.grades.laplace.mode = "holistic"))).toEqual([expect.stringContaining("mode is")]);
  });

  it("a lost mark with no note, and a holistic grade with no justification", () => {
    expect(problemsOf((t) => (t.grades.laplace.criteria.derive.note = ""))).toEqual([
      expect.stringContaining("a note is needed"),
    ]);
    expect(problemsOf((t) => (t.grades.laplace.criteria.defs.note = null))).toEqual([]); // full marks need none
    expect(problemsOf((t) => (t.grades.alias.justification = null))).toEqual([
      expect.stringContaining("needs a justification"),
    ]);
  });

  it("a half-filled question", () => {
    expect(problemsOf((t) => (t.grades.laplace.criteria.interp.score = null))).toEqual([
      expect.stringContaining("half-filled"),
    ]);
    expect(problemsOf((t) => (t.grades.task2.criteria.GRA.band = null))).toEqual([
      expect.stringContaining("half-filled"),
    ]);
    expect(problemsOf((t) => (t.grades.alias.score = null))).toEqual([expect.stringContaining("half-filled")]);
  });

  it("a missing rubric_hash, and a bad verdict", () => {
    expect(problemsOf((t) => delete t.grades.laplace.rubric_hash)).toEqual([
      expect.stringContaining("rubric_hash is missing"),
    ]);
    expect(problemsOf((t) => (t.grades.alias.bullets.nyquist.verdict = "yes"))).toEqual([
      expect.stringContaining("verdict must be one of"),
    ]);
  });

  it("lists every problem at once", () => {
    const t = filled();
    t.grader = null;
    t.grades.laplace.criteria.defs.score = 9;
    t.grades.alias.justification = "";
    expect(apply(t).problems).toHaveLength(3);
  });

  it("a missing results_hash", () => {
    expect(problemsOf((t) => delete t.results_hash)).toEqual([expect.stringContaining("results_hash is missing")]);
  });
});

describe("warnings", () => {
  it("a rubric_hash that differs says the grades are against an older rubric", () => {
    const t = filled();
    t.grades.laplace.rubric_hash = "0".repeat(64);
    const out = apply(t);
    expect(out.problems).toEqual([]);
    expect(out.warnings).toEqual([expect.stringContaining("grades.laplace: graded against an older rubric")]);
    expect(out.details.find((d) => d.id === "laplace")?.rubric_current).toBe(false);
  });

  it("a results_hash that differs", () => {
    const t = filled();
    t.results_hash = "1".repeat(64);
    expect(apply(t).warnings).toEqual([expect.stringContaining("results_hash differs")]);
  });
});

describe("hashes over content", () => {
  it("results_hash ignores key order, white space and line endings of the file, and sees an answer", () => {
    const text = JSON.stringify(resultsJson, null, 2);
    const a = JSON.parse(text);
    const b = JSON.parse(text.replaceAll("\n", "\r\n").replaceAll("  ", "\t"));
    expect(resultsHash(a)).toBe(resultsHash(b));
    const reordered = Object.fromEntries(Object.entries(a).reverse());
    expect(resultsHash(reordered)).toBe(resultsHash(a));
    const changed = structuredClone(a);
    changed.state.answers.laplace.text = "different";
    expect(resultsHash(changed)).not.toBe(resultsHash(a));
    const extra = { ...a, extra: { kept: false } };
    expect(resultsHash(extra)).not.toBe(resultsHash(a));
  });

  it("rubric_hash changes when a criterion's wording changes, and the entry then warns", () => {
    const edited = quizOf(BODY.replace("Interpret the poles", "Interpret the zeros"));
    const read = parseGrades(JSON.stringify(filled()));
    if (!read.ok) throw new Error(read.message);
    const out = applyGrades(edited, attempt, resultsJson, read.file);
    expect(out.warnings).toEqual([expect.stringContaining("grades.laplace: graded against an older rubric")]);
  });
});

describe("reading a grades file", () => {
  it("refuses a 0.x file, other formats and bad JSON", () => {
    const v1 = parseGrades(JSON.stringify({ format: "fullmark-grades", version: 1, grades: {} }));
    expect(v1).toMatchObject({ ok: false, message: expect.stringContaining("0.x grades file") });
    expect(parseGrades("{")).toMatchObject({ ok: false });
    expect(parseGrades('{"format":"other"}')).toMatchObject({ ok: false });
    expect(parseGrades('{"format":"fullmark-grades","version":3}')).toMatchObject({ ok: false });
    expect(parseGrades('{"format":"fullmark-grades","version":2}')).toMatchObject({ ok: false });
    expect(parseGrades(`﻿${JSON.stringify(filled())}`)).toMatchObject({ ok: true });
  });
});
