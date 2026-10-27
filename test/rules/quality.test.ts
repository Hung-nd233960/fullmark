import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Quiz } from "../../src/core/ir";
import { parse } from "../../src/core/parse";
import { QUALITY_RULES } from "../../src/core/rules/quality";
import { defaultOptions } from "../../src/core/rules/registry";

const dir = resolve(import.meta.dirname, "..", "fixtures", "quality");
const noBrief = { brief: null, contentFiles: null };

function load(name: string): Quiz {
  const result = parse(readFileSync(join(dir, name), "utf8"), name);
  expect(
    result.issues.filter((i) => i.level === "error"),
    name,
  ).toEqual([]);
  return result.quiz as Quiz;
}

describe("quality rules", () => {
  for (const rule of QUALITY_RULES) {
    it(`${rule.id}: found in its fixture, absent from the clean one`, () => {
      const options = defaultOptions(rule);
      const bad = rule.run(load(`${rule.id}.md`), noBrief, options);
      expect(bad.length, rule.id).toBeGreaterThan(0);
      for (const f of bad) {
        expect(f.line).toBeGreaterThanOrEqual(1);
        expect(f.message.length).toBeGreaterThan(5);
      }
      expect(rule.run(load(`${rule.id}.ok.md`), noBrief, options)).toEqual([]);
    });

    it(`${rule.id}: its example triggers it`, () => {
      const quiz = parse(rule.example, "example.md").quiz as Quiz;
      expect(quiz, rule.id).not.toBeNull();
      expect(rule.run(quiz, noBrief, defaultOptions(rule)).length, rule.id).toBeGreaterThan(0);
    });
  }

  it("reports each finding on the line of the offending item", () => {
    const find = (id: string) => QUALITY_RULES.find((r) => r.id === id);
    const run = (id: string, file: string) => {
      const rule = find(id);
      if (!rule) throw new Error(id);
      return rule.run(load(file), noBrief, defaultOptions(rule)).map((f) => f.line);
    };
    expect(run("choice.duplicate", "choice.duplicate.md")).toEqual([8]);
    expect(run("choice.all-none-above", "choice.all-none-above.md")).toEqual([9]);
    expect(run("explanation.short", "explanation.short.md")).toEqual([10]);
    expect(run("question.points-ignored", "question.points-ignored.md")).toEqual([5]);
    expect(run("answers.position-skew", "answers.position-skew.md")).toEqual([1]);
  });

  it("answers.position-skew skips a quiz that shuffles its choices, and honours its options", () => {
    const rule = QUALITY_RULES.find((r) => r.id === "answers.position-skew");
    if (!rule) throw new Error("missing");
    const skewed = load("answers.position-skew.md");
    const opts = (o: object) => rule.options.parse(o) as Record<string, unknown>;
    expect(rule.run(skewed, noBrief, opts({ "max-share": 0.9 }))).toEqual([]);
    expect(rule.run(skewed, noBrief, opts({ "min-questions": 9 }))).toEqual([]);
    const shuffled = { ...skewed, frontMatter: { ...skewed.frontMatter, shuffleChoices: true } };
    expect(rule.run(shuffled, noBrief, opts({}))).toEqual([]);
  });

  it("explanation.short counts words of any script, and honours min-words", () => {
    const rule = QUALITY_RULES.find((r) => r.id === "explanation.short");
    if (!rule) throw new Error("missing");
    const q = load("explanation.short.ok.md");
    expect(rule.run(q, noBrief, rule.options.parse({ "min-words": 20 }) as Record<string, unknown>)).toHaveLength(1);
    const vi = parse(
      "---\ntitle: T\nlang: vi\n---\n\n## Chọn một. {type=single id=q}\n\n- [x] a\n- [ ] b\n\n::: explanation\nĐáp án là a vì thứ tự chữ cái.\n:::\n",
      "vi.md",
    ).quiz as Quiz;
    expect(rule.run(vi, noBrief, rule.options.parse({ "min-words": 8 }) as Record<string, unknown>)).toEqual([]);
  });
});
