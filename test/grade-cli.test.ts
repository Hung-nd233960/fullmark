// biome-ignore-all lint/suspicious/noExplicitAny: tests edit JSON files freely
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type GradeOptions, runGrade } from "../src/cli/grade";
import { loadQuiz } from "../src/cli/load";
import { resultsOf } from "../src/core/attempt";
import { capture, tempTree } from "./helpers/cli";
import { attemptFor } from "./helpers/grading";

const QUIZ = [
  "---",
  "title: Mixed",
  "---",
  "",
  "## Pick the prime. {type=single id=prime}",
  "",
  "- [ ] 4",
  "- [x] 7",
  "",
  "::: explanation",
  "Seven has no divisors but one and itself.",
  ":::",
  "",
  "## Discuss. {type=essay id=essay points=3}",
  "",
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
  "```",
  "",
].join("\n");

const OPTS: GradeOptions = { quiz: "quiz.md", output: null, grades: null, json: false, web: false, name: null };

/** A results file for the quiz in `dir`, with the hash the quiz has there. */
function results(
  dir: string,
  answers: Record<string, any> = { prime: { choice: 0 }, essay: { text: "one two three" } },
) {
  const hash = loadQuiz(join(dir, "quiz.md")).hash as string;
  const attempt = { ...attemptFor(answers), quizHash: hash };
  return `${JSON.stringify(resultsOf(attempt), null, 2)}\n`;
}

const setup = (extra: Record<string, string> = {}) => {
  const t = tempTree({ "quiz.md": QUIZ, ...extra });
  writeFileSync(join(t.dir, "a.json"), results(t.dir));
  return t;
};

describe("quiz grade", () => {
  it("writes a Markdown report beside the results", async () => {
    const t = setup();
    const c = capture(t.dir);
    expect(await runGrade(["a.json"], OPTS, c.io)).toBe(0);
    const md = readFileSync(join(t.dir, "a-report.md"), "utf8");
    expect(md).toContain("# Report: Mixed");
    expect(md).toContain("### prime - wrong");
    expect(md).toContain("Define it");
    expect(existsSync(join(t.dir, "a-grades.json"))).toBe(false);
    expect(c.out.join("\n")).toContain("a-report.md");
    t.done();
  });

  it("--json writes the report, a grades template, and prints one object", async () => {
    const t = setup();
    const c = capture(t.dir);
    expect(await runGrade(["a.json"], { ...OPTS, json: true }, c.io)).toBe(0);
    const report = JSON.parse(readFileSync(join(t.dir, "a-report.json"), "utf8"));
    expect(report).toMatchObject({ format: "fullmark-report", wrong: ["prime"] });
    const template = JSON.parse(readFileSync(join(t.dir, "a-grades.json"), "utf8"));
    expect(template).toMatchObject({ format: "fullmark-grades", version: 2, grader: null });
    expect(Object.keys(template.grades)).toEqual(["essay"]);
    expect(c.out).toHaveLength(1);
    expect(JSON.parse(c.out[0] ?? "")).toMatchObject({ status: "written", file: "a.json", pending: 3 });
    t.done();
  });

  it("folds a filled-in grades file into the report", async () => {
    const t = setup();
    await runGrade(["a.json"], { ...OPTS, json: true }, capture(t.dir).io);
    const grades = JSON.parse(readFileSync(join(t.dir, "a-grades.json"), "utf8"));
    grades.grader = { kind: "human", name: "Hung" };
    grades.grades.essay.criteria.a.score = 1;
    grades.grades.essay.criteria.b.score = 2;
    writeFileSync(join(t.dir, "filled.json"), JSON.stringify(grades));
    const c = capture(t.dir);
    expect(await runGrade(["a.json"], { ...OPTS, grades: "filled.json", output: "final.md" }, c.io)).toBe(0);
    const md = readFileSync(join(t.dir, "final.md"), "utf8");
    expect(md).toContain("**3 of 4 points");
    expect(md).toContain("Graded by Hung (human)");
    // a filled-in file is never overwritten by a template
    expect(JSON.parse(readFileSync(join(t.dir, "filled.json"), "utf8")).grader.name).toBe("Hung");
    t.done();
  });

  it("a partly graded file leaves the rest pending", async () => {
    const t = setup();
    await runGrade(["a.json"], { ...OPTS, json: true }, capture(t.dir).io);
    const grades = JSON.parse(readFileSync(join(t.dir, "a-grades.json"), "utf8"));
    grades.grader = { kind: "human", name: "Hung" };
    writeFileSync(join(t.dir, "filled.json"), JSON.stringify(grades));
    const c = capture(t.dir);
    expect(await runGrade(["a.json"], { ...OPTS, grades: "filled.json" }, c.io)).toBe(0);
    expect(readFileSync(join(t.dir, "a-report.md"), "utf8")).toContain("waiting for a grader");
    t.done();
  });

  it("invalid grades exit 1, list every problem and write nothing", async () => {
    const t = setup();
    await runGrade(["a.json"], { ...OPTS, json: true }, capture(t.dir).io);
    const grades = JSON.parse(readFileSync(join(t.dir, "a-grades.json"), "utf8"));
    grades.grades.essay.criteria.a.score = 5;
    grades.grades.essay.criteria.b.score = 1;
    writeFileSync(join(t.dir, "bad.json"), JSON.stringify(grades));
    const before = readFileSync(join(t.dir, "a-report.json"), "utf8");
    const c = capture(t.dir);
    expect(await runGrade(["a.json"], { ...OPTS, grades: "bad.json", output: "never.md" }, c.io)).toBe(1);
    const text = c.err.join("\n");
    expect(text).toContain("grader is missing");
    expect(text).toContain("outside 0 to 1");
    expect(text).toContain("a note is needed");
    expect(existsSync(join(t.dir, "never.md"))).toBe(false);
    expect(readFileSync(join(t.dir, "a-report.json"), "utf8")).toBe(before);
    t.done();
  });

  it("a grades-v1 file is refused with exit 1", async () => {
    const t = setup({ "old.json": JSON.stringify({ format: "fullmark-grades", version: 1, grades: {} }) });
    const c = capture(t.dir);
    expect(await runGrade(["a.json"], { ...OPTS, grades: "old.json" }, c.io)).toBe(1);
    expect(c.err.join("\n")).toContain("0.x grades file");
    t.done();
  });

  it("a hash mismatch exits 1 and names both hashes, writing nothing", async () => {
    const t = setup();
    writeFileSync(join(t.dir, "quiz.md"), QUIZ.replace("Seven", "Seventeen"));
    const c = capture(t.dir);
    expect(await runGrade(["a.json"], OPTS, c.io)).toBe(1);
    expect(c.err.join("\n")).toMatch(
      /hash mismatch: the attempt was taken on quiz [0-9a-f]{64}, but quiz\.md is [0-9a-f]{64}/,
    );
    expect(existsSync(join(t.dir, "a-report.md"))).toBe(false);
    t.done();
  });

  it("a 0.x results file and answers of the wrong shape exit 1", async () => {
    const t = setup({ "old.json": JSON.stringify({ format: "fullmark-results", version: 1 }) });
    const hash = loadQuiz(join(t.dir, "quiz.md")).hash as string;
    const bad = { ...JSON.parse(results(t.dir)), quizHash: hash };
    bad.state.answers.prime = { choice: "first" };
    writeFileSync(join(t.dir, "bad.json"), JSON.stringify(bad));
    const c = capture(t.dir);
    expect(await runGrade(["old.json"], OPTS, c.io)).toBe(1);
    expect(c.err.join("\n")).toContain("0.x results file");
    const d = capture(t.dir);
    expect(await runGrade(["bad.json"], OPTS, d.io)).toBe(1);
    expect(d.err.join("\n")).toContain("prime");
    t.done();
  });

  it("--web and --name exit 2: not available yet", async () => {
    const t = setup();
    const c = capture(t.dir);
    expect(await runGrade(["a.json"], { ...OPTS, web: true }, c.io)).toBe(2);
    expect(c.err.join("\n")).toContain("not available yet");
    expect(await runGrade(["a.json"], { ...OPTS, name: "Hung" }, capture(t.dir).io)).toBe(2);
    t.done();
  });

  it("several results files: -o is a folder, the exit is the worst, and a summary follows", async () => {
    const t = setup();
    writeFileSync(join(t.dir, "b.json"), results(t.dir, { prime: { choice: 1 } }));
    writeFileSync(join(t.dir, "c.json"), "not json");
    const c = capture(t.dir);
    expect(await runGrade(["a.json", "b.json", "c.json"], { ...OPTS, json: true, output: "out" }, c.io)).toBe(1);
    expect(existsSync(join(t.dir, "out", "a-report.json"))).toBe(true);
    expect(existsSync(join(t.dir, "out", "b-grades.json"))).toBe(true);
    const lines = c.out.map((l) => JSON.parse(l));
    expect(lines.map((l) => l.status)).toEqual(["written", "written", "problems", "done"]);
    expect(lines.at(-1)).toEqual({ status: "done", ok: 2, failed: 1 });
    t.done();
  });

  it("--grades with several files exits 2", async () => {
    const t = setup();
    writeFileSync(join(t.dir, "b.json"), results(t.dir));
    const c = capture(t.dir);
    expect(await runGrade(["a.json", "b.json"], { ...OPTS, grades: "x.json" }, c.io)).toBe(2);
    t.done();
  });

  it("a quiz that does not check exits 1; a missing --quiz or file exits 2", async () => {
    const t = setup({ "broken.md": "---\ntitle: T\n---\n\n## Q {type=single id=q}\n\n- [ ] a\n- [ ] b\n" });
    expect(await runGrade(["a.json"], { ...OPTS, quiz: "broken.md" }, capture(t.dir).io)).toBe(1);
    expect(await runGrade(["a.json"], { ...OPTS, quiz: null }, capture(t.dir).io)).toBe(2);
    expect(await runGrade(["a.json"], { ...OPTS, quiz: "nope.md" }, capture(t.dir).io)).toBe(2);
    expect(await runGrade(["nope.json"], OPTS, capture(t.dir).io)).toBe(2);
    t.done();
  });

  it("a survey has no score", async () => {
    const survey = "---\ntitle: S\nkind: survey\n---\n\n## Like it? {type=single id=a}\n\n- [ ] yes\n- [ ] no\n";
    const t = tempTree({ "quiz.md": survey });
    const hash = loadQuiz(join(t.dir, "quiz.md")).hash as string;
    writeFileSync(
      join(t.dir, "s.json"),
      JSON.stringify(resultsOf({ ...attemptFor({ a: { choice: 0 } }), quizHash: hash })),
    );
    expect(await runGrade(["s.json"], OPTS, capture(t.dir).io)).toBe(0);
    const md = readFileSync(join(t.dir, "s-report.md"), "utf8");
    expect(md).toContain("# Answers: S");
    expect(md).not.toContain("## Score");
    t.done();
  });

  it("reports in Vietnamese when the quiz's ui_lang is vi", async () => {
    const t = tempTree({ "quiz.md": QUIZ.replace("title: Mixed", "title: Mixed\nlang: vi") });
    writeFileSync(join(t.dir, "a.json"), results(t.dir));
    expect(await runGrade(["a.json"], OPTS, capture(t.dir).io)).toBe(0);
    expect(readFileSync(join(t.dir, "a-report.md"), "utf8")).toContain("# Báo cáo: Mixed");
    t.done();
  });

  it("running twice gives byte-identical files", async () => {
    const t = setup();
    await runGrade(["a.json"], { ...OPTS, json: true }, capture(t.dir).io);
    const first = ["a-report.json", "a-grades.json"].map((f) => readFileSync(join(t.dir, f), "utf8"));
    await runGrade(["a.json"], { ...OPTS, json: true }, capture(t.dir).io);
    expect(["a-report.json", "a-grades.json"].map((f) => readFileSync(join(t.dir, f), "utf8"))).toEqual(first);
    await runGrade(["a.json"], OPTS, capture(t.dir).io);
    const md = readFileSync(join(t.dir, "a-report.md"), "utf8");
    await runGrade(["a.json"], OPTS, capture(t.dir).io);
    expect(readFileSync(join(t.dir, "a-report.md"), "utf8")).toBe(md);
    t.done();
  });
});
