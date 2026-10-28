// biome-ignore-all lint/suspicious/noExplicitAny: tests edit a JSON template freely
import { describe, expect, it } from "vitest";
import { grade } from "../../src/core/grade";
import { en, vi } from "../../src/core/i18n";
import { buildReport, describeAnswer, describeKey, renderMarkdown } from "../../src/core/report";
import { applyGrades, gradesTemplate, parseGrades } from "../../src/core/rubric/grades";
import { attemptFor, quizOf } from "../helpers/grading";

const BODY = [
  "# Maths {id=maths}",
  "## Pick the prime. {type=single id=prime tags=number}",
  "- [ ] 4",
  "- [x] 7",
  "- [ ] 9",
  "::: explanation",
  "Seven has no divisors but one and itself.",
  ":::",
  "## Sum? {type=numeric id=sum tags=number points=2}",
  "```answer",
  "value: 4",
  "```",
  "## Discuss. {type=essay id=essay points=3}",
  "```answer",
  "rubric:",
  "  mode: additive",
  "  criteria:",
  "    - id: a",
  "      text: Define it",
  "      points: 1",
  "    - id: b",
  "      text: Use it",
  "      points: 2",
  "sample_answer: A model essay.",
  "```",
].join("\n");

const quiz = quizOf(BODY, "ui_lang: en");
const attempt = attemptFor({
  prime: { choice: 0 },
  sum: { raw: "4" },
  essay: { text: "one two three" },
});
const input = { quiz, quizHash: "ab".repeat(32), attempt };

describe("the report", () => {
  it("holds the score, the groups, the wrong answers and the essays for a grader", () => {
    const r = buildReport(input, en.report);
    expect(r).toMatchObject({ format: "fullmark-report", version: 1 });
    expect(r.score).toMatchObject({ earned: 2, points: 3, pending: 3 });
    expect(r.score?.percent).toBeCloseTo(66.67, 2);
    expect(r.sections.map((s) => [s.id, s.earned, s.points])).toEqual([["maths", 2, 3]]);
    expect(r.tags.map((t) => t.id)).toEqual(["number"]);
    expect(r.wrong).toEqual(["prime"]);
    const prime = r.questions.find((q) => q.id === "prime");
    expect(prime).toMatchObject({ answer: "4", key: "7", status: "incorrect" });
    expect(prime?.explanation).toContain("Seven has no divisors");
    expect(r.open).toHaveLength(1);
    expect(r.open[0]).toMatchObject({
      id: "essay",
      words: 3,
      pending: true,
      sample_answer: "A model essay.",
      rubric: {
        mode: "additive",
        criteria: [
          { id: "a", max: 1 },
          { id: "b", max: 2 },
        ],
      },
    });
    expect(r.attempt).toMatchObject({ started: "2026-10-23T16:02:00", submitted: "2026-10-23T16:30:00" });
  });

  it("is the same on every run", () => {
    expect(JSON.stringify(buildReport(input, en.report))).toBe(JSON.stringify(buildReport(input, en.report)));
    expect(renderMarkdown(buildReport(input, en.report), en.report)).toBe(
      renderMarkdown(buildReport(input, en.report), en.report),
    );
  });
});

describe("the Markdown report", () => {
  const md = renderMarkdown(buildReport(input, en.report), en.report);

  it("has a title, the score, the review list and the essay laid out", () => {
    expect(md).toContain("# Report: T");
    expect(md).toContain("**2 of 3 points (66.67%)**");
    expect(md).toContain("3 points are waiting for a grader");
    expect(md).toContain("## Questions to review");
    expect(md).toContain("### prime - wrong (0 / 1)");
    expect(md).toContain("**Correct answer:** 7");
    expect(md).toContain("## Essays and code");
    expect(md).toContain("3 words");
    expect(md).toContain("| Define it | a | 1 |");
    expect(md).toContain("waiting for a grader");
    expect(md).toContain("A model essay.");
    expect(md.endsWith("\n")).toBe(true);
  });

  it("writes in Vietnamese when asked, keeping the same facts", () => {
    const r = buildReport(input, vi.report);
    const text = renderMarkdown(r, vi.report);
    expect(text).toContain("# Báo cáo: T");
    expect(text).toContain("2 trên 3 điểm");
    expect(text).toContain("## Câu cần xem lại");
    expect(text).toContain("Đáp án đúng");
    expect(text).toContain("đang chờ chấm");
    expect(text).not.toContain("Questions to review");
  });

  it("a fence cannot be closed by the answer", () => {
    const tricky = attemptFor({ essay: { text: "a ``` b" } });
    const text = renderMarkdown(buildReport({ ...input, attempt: tricky }, en.report), en.report);
    expect(text).toContain("````\na ``` b\n````");
  });
});

describe("a survey report", () => {
  it("is titled Answers and has no score", () => {
    const survey = quizOf(
      "## Like it? {type=single id=a}\n\n- [ ] yes\n- [ ] no\n\n## Why? {type=essay id=b}",
      "kind: survey",
    );
    const a = attemptFor({ a: { choice: 1 }, b: { text: "because" } });
    const r = buildReport({ quiz: survey, quizHash: "0".repeat(64), attempt: a }, en.report);
    expect(r.score).toBeNull();
    expect(r.wrong).toEqual([]);
    const md = renderMarkdown(r, en.report);
    expect(md).toContain("# Answers: T");
    expect(md).not.toContain("## Score");
    expect(md).not.toContain("Correct answer");
    expect(md).toContain("**Your answer:** no");
  });
});

describe("describing answers and keys", () => {
  const q = (body: string) => {
    const found = quizOf(body).sections[0]?.questions[0];
    if (!found) throw new Error("no question");
    return found;
  };

  it("reads source indices back to text, for every type", () => {
    const multi = q("## M {type=multi id=m}\n\n- [x] a\n- [ ] b\n- [x] c");
    expect(describeAnswer(multi, { choices: [2, 0] }, en.report)).toBe("c; a");
    expect(describeKey(multi)).toBe("a; c");
    const ord = q("## O {type=ordering id=o}\n\n1. one\n2. two\n3. three");
    expect(describeAnswer(ord, { order: [2, 0, 1] }, en.report)).toBe("1. three 2. one 3. two");
    expect(describeKey(ord)).toBe("1. one 2. two 3. three");
    const match = q("## X {type=matching id=x}\n\n- a :: 1\n- b :: 2\n- :: extra");
    expect(describeAnswer(match, { pairs: [1, null] }, en.report)).toBe("a - 2; b - -");
    expect(describeKey(match)).toBe("a - 1; b - 2");
    const tf = q("## T {type=truefalse id=t}\n\n```answer\nvalue: false\n```");
    expect(describeAnswer(tf, { value: true }, en.report)).toBe("true");
    expect(describeAnswer(tf, null, en.report)).toBeNull();
    expect(describeKey(tf)).toBe("false");
  });

  it("an answer that does not fit its type reads as no answer", () => {
    const tf = q("## T {type=truefalse id=t}\n\n```answer\nvalue: false\n```");
    expect(describeAnswer(tf, { value: "yes" }, en.report)).toBeNull();
  });
});

describe("with real grades", () => {
  const filled = () => {
    const t = gradesTemplate(quiz, grade(quiz, attempt), {}) as Record<string, any>;
    t.grader = { kind: "human", name: "Hung" };
    const e = t.grades.essay;
    Object.assign(e.criteria.a, { score: 1 });
    Object.assign(e.criteria.b, { score: 1.5, note: "Thin on use." });
    return t;
  };
  const apply = (t: unknown) => {
    const read = parseGrades(JSON.stringify(t));
    if (!read.ok) throw new Error(read.message);
    return applyGrades(quiz, attempt, {}, read.file);
  };

  it("moves the score and shows the criteria table and the grader", () => {
    const applied = apply(filled());
    expect(applied.problems).toEqual([]);
    const r = buildReport({ ...input, applied, grader: { kind: "human", name: "Hung" } }, en.report);
    expect(r.score).toMatchObject({ earned: 4.5, points: 6, pending: 0 });
    expect(r.open[0]).toMatchObject({ pending: false, grade: { earned: 2.5, status: "partial" } });
    const md = renderMarkdown(r, en.report);
    expect(md).toContain("Graded by Hung (human)");
    expect(md).toContain("| Use it | 1.5 | 2 | Thin on use. |");
    expect(md).not.toContain("waiting for a grader\n");
  });

  it("warns, in the report, about grades made against an older rubric", () => {
    const t = filled();
    t.grades.essay.rubric_hash = "0".repeat(64);
    const applied = apply(t);
    const r = buildReport({ ...input, applied, grader: { kind: "human", name: "Hung" } }, en.report);
    const md = renderMarkdown(r, en.report);
    expect(md).toContain("## Warnings");
    expect(md).toContain("graded against an older rubric");
    expect(md).toContain("(graded against an older rubric)");
  });
});
