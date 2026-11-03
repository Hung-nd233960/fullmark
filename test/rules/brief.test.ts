import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Quiz } from "../../src/core/ir";
import { parse } from "../../src/core/parse";
import { BRIEF_RULES } from "../../src/core/rules/brief";
import { readBrief } from "../../src/core/rules/brief-read";
import { defaultOptions } from "../../src/core/rules/registry";
import { briefYaml } from "../helpers/brief";

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
    ["brief.mode", "mode"],
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

  it("brief.mode: one finding per mismatch, on the line of the key (line 1 when it is missing)", () => {
    const timed = run("brief.mode", "mode");
    expect(timed.map((f) => f.line)).toEqual([1, 1]);
    expect(timed.map((f) => f.message)).toEqual([
      "the brief's mode is timed-exam, which expects a `time_limit`",
      "the brief's mode is timed-exam, which expects `look: locked`",
    ]);
    const quizOf = (front: string) =>
      parse(`---\n${front}\n---\n\n## Q? {type=single id=q}\n\n- [x] a\n- [ ] b\n`, "q.md").quiz as Quiz;
    const brief = (mode: string) => readBrief(briefYaml({ mode: mode as never }), "brief.yaml").brief;
    const rule = BRIEF_RULES.find((r) => r.id === "brief.mode");
    if (!rule) throw new Error("brief.mode");
    const lines = (front: string, mode: string) =>
      rule.run(quizOf(front), { brief: brief(mode), contentFiles: null }, {}).map((f) => f.line);
    // the key is written but wrong: the finding is on its line
    expect(lines("title: T\nfeedback: end", "each-question")).toEqual([3]);
    expect(lines("title: T\nfeedback: instant", "each-question")).toEqual([]);
    expect(lines("title: T\ntime_limit: 30m\nlook: free", "timed-exam")).toEqual([4]);
    expect(lines("title: T\nlook: locked", "timed-exam")).toEqual([1]);
    // at-the-end holds no expectation
    expect(lines("title: T", "at-the-end")).toEqual([]);
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
    const textbook = readBrief(
      briefYaml({ content: { kinds: ["textbook"], kinds_other: "", elsewhere: "" } }),
      "brief.yaml",
    ).brief;
    expect(rule?.run(quiz, { brief: textbook, contentFiles: null }, {})).toEqual([]);
    expect(rule?.run(quiz, { brief: textbook, contentFiles: [] }, {})).toHaveLength(1);
  });
});

describe("reading brief.yaml", () => {
  it("reads a complete brief, and fills nothing in", () => {
    const { brief, issues } = readBrief(briefYaml({ count: 12 }), "brief.yaml");
    expect(issues).toEqual([]);
    expect(brief).toMatchObject({ purpose: "self-study", count: 12, minutes: 0, profile: "default" });
  });

  it("an empty brief.yaml is brief.invalid, with no defaults", () => {
    for (const text of ["", "# nothing but a comment\n"]) {
      const { brief, issues } = readBrief(text, "brief.yaml");
      expect(brief).toBeNull();
      expect(issues.map((i) => [i.rule, i.line])).toEqual([["brief.invalid", 1]]);
      expect(issues[0]?.message).toContain("empty");
    }
  });

  it("a missing key is brief.invalid like an unknown one, at the line of its mapping", () => {
    for (const key of ["scope", "count", "decided_by", "profile", "focus_tags", "commitment"] as const) {
      const { brief, issues } = readBrief(briefYaml({ [key]: undefined }), "brief.yaml");
      expect(brief, key).toBeNull();
      expect(
        issues.map((i) => [i.rule, i.line, i.message.includes(`\`${key}\``)]),
        key,
      ).toEqual([["brief.invalid", 1, true]]);
    }
    const nested = readBrief(briefYaml({ content: { kinds: [], elsewhere: "" } as never }), "brief.yaml");
    expect(nested.issues.map((i) => [i.line, i.message.includes("`content.kinds_other`")])).toEqual([[4, true]]);
    // a comment before the first key does not move the line of the mapping's first key
    const shifted = readBrief(`# written by quiz brief\n${briefYaml({ scope: undefined })}`, "brief.yaml");
    expect(shifted.issues.map((i) => i.line)).toEqual([2]);
  });

  it("a null profile is a bad value: the profile is a string", () => {
    const { brief, issues } = readBrief(briefYaml({ profile: null as never }), "brief.yaml");
    expect(brief).toBeNull();
    expect(issues.map((i) => [i.rule, i.line])).toEqual([["brief.invalid", 17]]);
  });

  it("commitment is a whole percent from 0 to 100", () => {
    for (const bad of [-1, 101, 2.5, "80"]) {
      const { brief, issues } = readBrief(briefYaml({ commitment: bad as never }), "brief.yaml");
      expect(brief, String(bad)).toBeNull();
      expect(issues[0]?.message, String(bad)).toContain("commitment");
    }
    expect(readBrief(briefYaml({ commitment: 80 }), "brief.yaml").brief?.commitment).toBe(80);
  });

  it("reports a bad value as brief.invalid on the line of its key", () => {
    const { brief, issues } = readBrief(readFileSync(join(base, "invalid", "brief.yaml"), "utf8"), "brief.yaml");
    expect(brief).toBeNull();
    expect(issues.map((i) => [i.rule, i.file, i.line])).toEqual([["brief.invalid", "brief.yaml", 7]]);
    expect(issues[0]?.message).toContain("count");
  });

  it("reports unknown keys with a suggestion, nested ones too", () => {
    const { issues } = readBrief(readFileSync(join(base, "invalid-key", "brief.yaml"), "utf8"), "brief.yaml");
    expect(issues.map((i) => i.line).sort()).toEqual([2, 6]);
    expect(issues.find((i) => i.line === 2)?.fix).toBe("did you mean `scope`?");
    expect(issues.find((i) => i.line === 6)?.fix).toBe("did you mean `kinds_other`?");
  });

  it("reports YAML that does not parse", () => {
    const { issues } = readBrief("count: [1,\n", "brief.yaml");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.rule).toBe("brief.invalid");
    expect(issues[0]?.message).toContain("not valid YAML");
  });
});
