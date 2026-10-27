import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadQuiz } from "../../src/cli/load";
import { QuizSchema } from "../../src/core/ir";

const root = resolve(import.meta.dirname, "..", "..");
const invalidDir = join(root, "test", "fixtures", "invalid");
const validDir = join(root, "test", "fixtures", "valid");

type Expected = Record<string, { rule: string; line: number }>;
const expected: Expected = JSON.parse(readFileSync(join(invalidDir, "expected.json"), "utf8"));

/** The rules judged by later slices: the grading slice for `rubric.*`, the rule registry for `ignore.invalid`. */
const pending = (rule: string) => rule.startsWith("rubric.") || rule === "ignore.invalid";

function validFiles(): string[] {
  const out: string[] = [];
  for (const dir of ["examples", "templates"]) {
    for (const name of readdirSync(join(root, dir))) {
      const file = join(root, dir, name, "quiz.md");
      if (existsSync(file)) out.push(file);
    }
  }
  for (const f of readdirSync(validDir)) if (f.endsWith(".md")) out.push(join(validDir, f));
  return out;
}

describe("valid quizzes parse with no issue", () => {
  for (const file of validFiles()) {
    const label = file.slice(root.length + 1).replaceAll("\\", "/");
    it(label, () => {
      const loaded = loadQuiz(file);
      expect(loaded.issues.map((i) => `${i.rule}@${i.line}: ${i.message}`)).toEqual([]);
      expect(loaded.quiz).not.toBeNull();
      expect(() => QuizSchema.parse(loaded.quiz)).not.toThrow();
      expect(loaded.hash).toMatch(/^[0-9a-f]{64}$/);
    });
  }
});

describe("invalid fixtures give exactly their rule and line", () => {
  for (const [name, want] of Object.entries(expected)) {
    const file = join(invalidDir, `${name}.md`);
    if (pending(want.rule)) {
      it.todo(`${name}: ${want.rule} at line ${want.line} (judged in a later slice)`);
      it(`${name}: no other issue is raised meanwhile`, () => {
        expect(loadQuiz(file).issues).toEqual([]);
      });
      continue;
    }
    it(`${name}: ${want.rule} at line ${want.line}`, () => {
      const issues = loadQuiz(file).issues.map((i) => ({ rule: i.rule, line: i.line, level: i.level }));
      expect(issues).toEqual([{ rule: want.rule, line: want.line, level: "error" }]);
    });
  }
});
