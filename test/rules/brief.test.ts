import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Quiz } from "../../src/core/ir";
import { parse } from "../../src/core/parse";
import { BRIEF_RULES } from "../../src/core/rules/brief";
import { readBrief } from "../../src/core/rules/brief-read";
import { defaultOptions } from "../../src/core/rules/registry";

const base = resolve(import.meta.dirname, "..", "fixtures", "brief");

function run(rule: string, name: string, options: Record<string, unknown> = {}) {
  const dir = join(base, name);
  const quiz = parse(readFileSync(join(dir, "quiz.md"), "utf8"), "quiz.md").quiz as Quiz;
  expect(quiz, name).not.toBeNull();
  const read = readBrief(readFileSync(join(dir, "brief.yaml"), "utf8"), "brief.yaml");
  expect(read.issues, name).toEqual([]);
  const content = join(dir, "content");
  const contentFiles = existsSync(content) ? readdirSync(content) : [];
  const r = BRIEF_RULES.find((b) => b.id === rule);
  if (!r) throw new Error(rule);
  return r.run(quiz, { brief: read.brief, contentFiles }, { ...defaultOptions(r), ...options });
}

describe("brief rules", () => {
  for (const [rule, dir] of [
    ["brief.count", "count"],
    ["brief.mix", "mix"],
    ["brief.content-kinds", "content-kinds"],
    ["brief.past-exams", "past-exams"],
    ["brief.generated-by", "generated-by"],
  ] as const) {
    it(`${rule}: found in its fixture, absent from the clean one`, () => {
      expect(run(rule, dir).length).toBeGreaterThan(0);
      expect(run(rule, `${dir}-ok`)).toEqual([]);
    });
  }

  it("brief.count gives the range and honours the tolerance", () => {
    const [finding] = run("brief.count", "count");
    expect(finding?.message).toBe("the brief asks for 10 questions (within 20%: 8 to 12), but the quiz has 3");
    expect(run("brief.count", "count", { tolerance: 0.8 })).toEqual([]);
  });

  it("every brief rule does nothing without a brief", () => {
    const quiz = parse(readFileSync(join(base, "count", "quiz.md"), "utf8"), "quiz.md").quiz as Quiz;
    for (const r of BRIEF_RULES)
      expect(r.run(quiz, { brief: null, contentFiles: [] }, defaultOptions(r)), r.id).toEqual([]);
  });

  it("brief.content-kinds is silent when the material is said to be elsewhere, and when content/ is unread", () => {
    const quiz = parse(readFileSync(join(base, "past-exams", "quiz.md"), "utf8"), "quiz.md").quiz as Quiz;
    const brief = readBrief(readFileSync(join(base, "past-exams", "brief.yaml"), "utf8"), "brief.yaml").brief;
    const rule = BRIEF_RULES.find((r) => r.id === "brief.content-kinds");
    expect(rule?.run(quiz, { brief, contentFiles: [] }, {})).toEqual([]);
    const textbook = readBrief("content:\n  kinds: [textbook]\n", "brief.yaml").brief;
    expect(rule?.run(quiz, { brief: textbook, contentFiles: null }, {})).toEqual([]);
    expect(rule?.run(quiz, { brief: textbook, contentFiles: [] }, {})).toHaveLength(1);
  });
});

describe("reading brief.yaml", () => {
  it("fills the defaults of an empty brief", () => {
    const { brief, issues } = readBrief("", "brief.yaml");
    expect(issues).toEqual([]);
    expect(brief).toMatchObject({ purpose: "self-study", count: 20, minutes: 0, mix: ["recall", "understanding"] });
  });

  it("reports a bad value as brief.invalid on the line of its key", () => {
    const { brief, issues } = readBrief(readFileSync(join(base, "invalid", "brief.yaml"), "utf8"), "brief.yaml");
    expect(brief).toBeNull();
    expect(issues.map((i) => [i.rule, i.file, i.line])).toEqual([["brief.invalid", "brief.yaml", 2]]);
    expect(issues[0]?.message).toContain("count");
  });

  it("reports unknown keys with a suggestion, nested ones too", () => {
    const { issues } = readBrief(readFileSync(join(base, "invalid-key", "brief.yaml"), "utf8"), "brief.yaml");
    expect(issues.map((i) => i.line).sort()).toEqual([4, 5]);
    expect(issues.find((i) => i.line === 5)?.fix).toBe("did you mean `scope`?");
    expect(issues.find((i) => i.line === 4)?.fix).toBe("did you mean `kinds_other`?");
  });

  it("reports YAML that does not parse", () => {
    const { issues } = readBrief("count: [1,\n", "brief.yaml");
    expect(issues[0]?.rule).toBe("brief.invalid");
    expect(issues[0]?.message).toContain("not valid YAML");
  });
});
