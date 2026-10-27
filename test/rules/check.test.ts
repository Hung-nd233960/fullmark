import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/core/config/parse";
import { type Layers, resolveProfile } from "../../src/core/config/resolve";
import type { Issue } from "../../src/core/issue";
import { parse } from "../../src/core/parse";
import { runChecks } from "../../src/core/rules/check";

const fixtures = resolve(import.meta.dirname, "..", "fixtures");
const qualityDir = join(fixtures, "quality");
const NONE: Layers = { user: null, project: null };

function layersOf(project: string): Layers {
  const { data, errors } = parseConfig(project, "fullmark.toml", "project");
  expect(errors).toEqual([]);
  return { user: null, project: data };
}

/** `check` on a quiz text, as the CLI would run it: parse, resolve the profile, run the checks. */
function check(text: string, profile = "default", layers: Layers = NONE) {
  const parsed = parse(text, "quiz.md");
  const resolved = resolveProfile(profile, layers).profile;
  if (!resolved) throw new Error(`profile ${profile}`);
  return runChecks({
    quiz: parsed.quiz,
    issues: parsed.issues,
    file: "quiz.md",
    profile: resolved,
    brief: null,
    briefIssues: [],
    contentFiles: null,
  });
}

const levelOf = (issues: Issue[], rule: string) => issues.find((i) => i.rule === rule)?.level ?? "off";

describe("quality rules under each built-in profile", () => {
  // rule -> [default, draft, exam, survey]
  const matrix: Record<string, [string, string, string, string]> = {
    "choice.duplicate": ["warning", "info", "error", "warning"],
    "choice.all-none-above": ["warning", "info", "error", "warning"],
    "choice.correct-longest": ["warning", "info", "error", "off"],
    "choice.in-stem": ["warning", "info", "error", "off"],
    "explanation.short": ["warning", "info", "error", "off"],
    "explanation.missing": ["off", "off", "error", "off"],
    "question.untagged": ["off", "off", "error", "off"],
    "quiz.no-time-limit": ["off", "off", "off", "off"],
    "answers.position-skew": ["warning", "info", "error", "off"],
    "code.unknown-language": ["warning", "info", "error", "warning"],
    "question.points-ignored": ["warning", "info", "error", "warning"],
  };
  const profiles = ["default", "draft", "exam", "survey"];

  for (const [rule, levels] of Object.entries(matrix)) {
    for (const [i, profile] of profiles.entries()) {
      it(`${rule} under ${profile} is ${levels[i]}, and the clean fixture is silent`, () => {
        const bad = check(readFileSync(join(qualityDir, `${rule}.md`), "utf8"), profile);
        expect(levelOf(bad.issues, rule), rule).toBe(levels[i]);
        const ok = check(readFileSync(join(qualityDir, `${rule}.ok.md`), "utf8"), profile);
        expect(ok.issues.filter((x) => x.rule === rule)).toEqual([]);
      });
    }
  }

  it("covers every quality rule that runs over a quiz", () => {
    const files = readdirSync(qualityDir)
      .filter((f) => !f.endsWith(".ok.md"))
      .map((f) => f.slice(0, -3))
      .sort();
    expect(Object.keys(matrix).sort()).toEqual(files);
  });

  it("exam's own options apply: 6 words pass the default explanation rule, not exam's 8", () => {
    const text = readFileSync(join(qualityDir, "explanation.short.ok.md"), "utf8").replace(
      " of the alphabet, so it comes first",
      "",
    );
    expect(check(text, "default").issues.filter((i) => i.rule === "explanation.short")).toEqual([]);
    expect(levelOf(check(text, "exam").issues, "explanation.short")).toBe("error");
  });

  it("fixed rules stay errors under every profile", () => {
    const text = "---\ntitle: T\n---\n\n## Q {type=single id=q}\n\n- [x] only one\n";
    for (const profile of profiles) {
      expect(
        check(text, profile).issues.map((i) => [i.rule, i.level]),
        profile,
      ).toEqual([["choice.count", "error"]]);
    }
  });
});

describe("a profile from fullmark.toml changes levels and options", () => {
  const layers = layersOf(`
[profiles.practice]
extends = "default"
rules."explanation.short" = { level = "error", min-words = 6 }
rules."choice.duplicate" = "off"
`);

  it("applies them", () => {
    const short = readFileSync(join(qualityDir, "explanation.short.md"), "utf8");
    expect(levelOf(check(short, "practice", layers).issues, "explanation.short")).toBe("error");
    const dup = readFileSync(join(qualityDir, "choice.duplicate.md"), "utf8");
    expect(check(dup, "practice", layers).issues.map((i) => i.rule)).not.toContain("choice.duplicate");
  });
});

describe("custom checks", () => {
  const layers = layersOf(`
[profiles.paper]
extends = "default"

[[profiles.paper.checks]]
id = "custom.two-essays"
kind = "count"
where = { type = "essay" }
max = 2
message = "The real exam has two essays at most."

[[profiles.paper.checks]]
id = "custom.total-5"
kind = "count"
measure = "points"
min = 5
max = 5
message = "The paper is marked out of 5."

[[profiles.paper.checks]]
id = "custom.sources"
kind = "require"
where = { tag = "past" }
field = "source"
level = "warning"

[[profiles.paper.checks]]
id = "custom.no-truefalse"
kind = "forbid"
where = { type = "truefalse" }
`);

  const q = (n: number, head: string, body = "- [x] a\n- [ ] b") => `## Q${n} {type=single id=q${n}${head}}\n\n${body}`;
  const essay = (n: number) => `## E${n} {type=essay id=e${n} points=2}`;
  const quiz = (...parts: string[]) => `---\ntitle: T\n---\n\n${parts.join("\n\n")}\n`;

  it("count: too many essays, once, on line 1", () => {
    const issues = check(quiz(essay(1), essay(2), essay(3)), "paper", layers).issues;
    expect(issues.filter((i) => i.rule === "custom.two-essays")).toEqual([
      {
        rule: "custom.two-essays",
        level: "error",
        file: "quiz.md",
        line: 1,
        message: "The real exam has two essays at most. (found 3 questions, wanted at most 2)",
        fix: "remove questions that match, or change the check",
      },
    ]);
    expect(check(quiz(essay(1), essay(2)), "paper", layers).issues.map((i) => i.rule)).not.toContain(
      "custom.two-essays",
    );
  });

  it("count by points counts graded questions only and accepts the exact total", () => {
    expect(check(quiz(q(1, " points=2"), q(2, " points=3")), "paper", layers).issues.map((i) => i.rule)).not.toContain(
      "custom.total-5",
    );
    const few = check(quiz(q(1, " points=2"), q(2, " points=1 graded=false", "- [ ] a\n- [ ] b")), "paper", layers);
    expect(few.issues.find((i) => i.rule === "custom.total-5")?.message).toBe(
      "The paper is marked out of 5. (found 2 points, wanted exactly 5)",
    );
  });

  it("require: names each question that lacks the field, at its heading", () => {
    const issues = check(quiz(q(1, " tags=past"), q(2, " tags=past source=x"), q(3, "")), "paper", layers).issues;
    expect(issues.filter((i) => i.rule === "custom.sources").map((i) => [i.line, i.level])).toEqual([[5, "warning"]]);
  });

  it("forbid: names each matching question", () => {
    const tf = `## T {type=truefalse id=t}\n\n\`\`\`answer\nvalue: true\n\`\`\``;
    const issues = check(quiz(q(1, ""), tf), "paper", layers).issues;
    expect(issues.filter((i) => i.rule === "custom.no-truefalse").map((i) => i.line)).toEqual([10]);
  });

  it("a level set in rules wins over the check's own", () => {
    const relaxed = layersOf(
      `${layersText()}\n[profiles.lax]\nextends = "paper"\nrules."custom.no-truefalse" = "off"\n`,
    );
    const tf = `## T {type=truefalse id=t}\n\n\`\`\`answer\nvalue: true\n\`\`\``;
    expect(check(quiz(tf), "lax", relaxed).issues.map((i) => i.rule)).not.toContain("custom.no-truefalse");
    expect(check(quiz(tf), "paper", relaxed).issues.map((i) => i.rule)).toContain("custom.no-truefalse");
  });

  function layersText(): string {
    return `[profiles.paper]\n\n[[profiles.paper.checks]]\nid = "custom.no-truefalse"\nkind = "forbid"\nwhere = { type = "truefalse" }\n`;
  }
});

describe("inline ignores", () => {
  const dup = (attrs: string) =>
    `---\ntitle: T\n---\n\n## Q {type=single id=q${attrs}}\n\n- [x] Paris\n- [ ] Paris\n- [ ] Rome\n`;
  const ok = ' check-ignore="choice.duplicate" because="the repeat is the point"';

  it("hides the finding and reports the ignore as info", () => {
    const { issues, ignored } = check(dup(ok));
    expect(issues.map((i) => [i.rule, i.level, i.line])).toEqual([["config.ignored", "info", 5]]);
    expect(issues[0]?.message).toBe("`choice.duplicate` is ignored here: the repeat is the point");
    expect(ignored).toEqual([{ rule: "choice.duplicate", line: 5, because: "the repeat is the point" }]);
  });

  it("without the ignore, the finding is there", () => {
    expect(check(dup("")).issues.map((i) => i.rule)).toEqual(["choice.duplicate"]);
  });

  it("several rules share one reason", () => {
    const { ignored } = check(dup(' check-ignore="choice.duplicate,question.untagged" because="x"'));
    expect(ignored.map((i) => i.rule)).toEqual(["choice.duplicate", "question.untagged"]);
  });

  it("is an error under a profile that does not allow ignores, and hides nothing", () => {
    const { issues } = check(dup(ok), "exam");
    const rules = issues.map((i) => [i.rule, i.level]);
    expect(rules).toContainEqual(["config.ignored", "error"]);
    expect(rules).toContainEqual(["choice.duplicate", "error"]);
    expect(issues.find((i) => i.rule === "config.ignored")?.message).toContain("does not allow ignores");
  });

  it("ignore.invalid: no reason", () => {
    const { issues } = check(dup(' check-ignore="choice.duplicate"'));
    expect(issues.map((i) => [i.rule, i.level, i.line])).toContainEqual(["ignore.invalid", "error", 5]);
    expect(issues.map((i) => i.rule)).toContain("choice.duplicate");
  });

  it("ignore.invalid: a fixed rule, and a name that is not a rule", () => {
    const fixed = check(dup(' check-ignore="choice.count" because="x"')).issues;
    expect(fixed.find((i) => i.rule === "ignore.invalid")?.message).toBe(
      "`choice.count` is a fixed rule, which cannot be ignored",
    );
    const typo = check(dup(' check-ignore="choice.duplicat" because="x"')).issues; // spellchecker:disable-line
    expect(typo.find((i) => i.rule === "ignore.invalid")?.fix).toBe("did you mean `choice.duplicate`?");
  });

  it("can name a custom check of the profile", () => {
    const layers = layersOf(
      '[profiles.p]\n[[profiles.p.checks]]\nid = "custom.no-single"\nkind = "forbid"\nwhere = { type = "single" }\n',
    );
    const text = dup(' check-ignore="custom.no-single" because="this one is fine"');
    expect(check(text, "p", layers).issues.map((i) => i.rule)).toEqual(["config.ignored", "choice.duplicate"]);
  });

  it("only hides a finding inside its own question", () => {
    const two = `---\ntitle: T\n---\n\n## A {type=single id=a${ok}}\n\n- [x] Paris\n- [ ] Paris\n\n## B {type=single id=b}\n\n- [x] Rome\n- [ ] Rome\n`;
    const { issues } = check(two);
    expect(issues.filter((i) => i.rule === "choice.duplicate").map((i) => i.line)).toEqual([13]);
  });
});

describe("the ignore.invalid fixtures", () => {
  for (const name of ["ignore-no-because", "ignore-fixed-rule"]) {
    it(`${name}: ignore.invalid at line 5, and nothing else`, () => {
      const text = readFileSync(join(fixtures, "invalid", `${name}.md`), "utf8");
      expect(check(text).issues.map((i) => [i.rule, i.line])).toEqual([["ignore.invalid", 5]]);
    });
  }
});
