import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/core/config/parse";
import { chooseProfile, type Layers, resolveProfile, validateLayers } from "../../src/core/config/resolve";
import type { Brief } from "../../src/core/ir";
import { BriefSchema } from "../../src/core/ir";
import { parse } from "../../src/core/parse";

function layers(project: string | null, user: string | null = null): Layers {
  const read = (text: string | null, file: string, kind: "project" | "user") => {
    if (text === null) return null;
    const { data, errors } = parseConfig(text, file, kind);
    expect(errors).toEqual([]);
    return data;
  };
  return { project: read(project, "fullmark.toml", "project"), user: read(user, "config.toml", "user") };
}

const NONE = layers(null);
const level = (name: string, rule: string, l: Layers = NONE) => resolveProfile(name, l).profile?.rules.get(rule)?.level;

describe("the built-in profiles", () => {
  it("default has each rule at its built-in level", () => {
    expect(level("default", "choice.correct-longest")).toBe("warning");
    expect(level("default", "explanation.missing")).toBe("off");
    expect(level("default", "choice.count")).toBe("error");
    expect(resolveProfile("default", NONE).profile?.allowIgnore).toBe(true);
  });

  it("draft makes every quality rule that is on an info, and leaves fixed rules alone", () => {
    expect(level("draft", "choice.correct-longest")).toBe("info");
    expect(level("draft", "brief.count")).toBe("info");
    expect(level("draft", "explanation.missing")).toBe("off");
    expect(level("draft", "choice.count")).toBe("error");
  });

  it("exam makes warnings errors, turns on two rules, tightens options and forbids ignores", () => {
    const exam = resolveProfile("exam", NONE).profile;
    expect(exam?.rules.get("choice.duplicate")?.level).toBe("error");
    expect(exam?.rules.get("explanation.missing")?.level).toBe("error");
    expect(exam?.rules.get("question.untagged")?.level).toBe("error");
    expect(exam?.rules.get("quiz.no-time-limit")?.level).toBe("off");
    expect(exam?.rules.get("explanation.short")?.options).toEqual({ "min-words": 8 });
    expect(exam?.rules.get("answers.position-skew")?.options).toEqual({ "max-share": 0.4, "min-questions": 8 });
    expect(exam?.rules.get("brief.count")?.options).toEqual({ tolerance: 0.1 });
    expect(exam?.allowIgnore).toBe(false);
    expect(exam?.chain.map((c) => c.name)).toEqual(["exam", "default"]);
  });

  it("survey switches off the rules about answer keys and explanations", () => {
    for (const rule of ["choice.correct-longest", "choice.in-stem", "explanation.short", "answers.position-skew"]) {
      expect(level("survey", rule), rule).toBe("off");
    }
    expect(level("survey", "choice.duplicate")).toBe("warning");
  });

  it("an unknown profile resolves to nothing", () => {
    expect(resolveProfile("nope", NONE)).toEqual({ profile: null, errors: [] });
  });
});

describe("extends and layers", () => {
  const project = `
[profiles.practice]
extends = "default"
rules."explanation.short" = { level = "error", min-words = 6 }
rules."answers.position-skew" = "off"

[profiles.signals-exam]
extends = "exam"
rules."brief.count" = { tolerance = 0.05 }
allow-ignore = true

[[profiles.signals-exam.checks]]
id = "custom.two-essays"
kind = "count"
where = { type = "essay" }
max = 2
`;

  it("applies a custom profile's settings over its base", () => {
    const p = resolveProfile("practice", layers(project)).profile;
    expect(p?.rules.get("explanation.short")).toMatchObject({
      level: "error",
      options: { "min-words": 6 },
      origin: "fullmark.toml:4",
      optionOrigins: { "min-words": "fullmark.toml:4" },
    });
    expect(p?.rules.get("answers.position-skew")?.level).toBe("off");
    expect(p?.rules.get("choice.duplicate")?.origin).toBe("built-in");
  });

  it("follows a chain, naming where each value came from", () => {
    const p = resolveProfile("signals-exam", layers(project)).profile;
    expect(p?.chain).toEqual([
      { name: "signals-exam", origin: "fullmark.toml:7" },
      { name: "exam", origin: "built-in" },
      { name: "default", origin: "built-in" },
    ]);
    expect(p?.rules.get("choice.duplicate")).toMatchObject({ level: "error", origin: "profile exam" });
    expect(p?.rules.get("brief.count")?.options).toEqual({ tolerance: 0.05 });
    expect(p?.rules.get("brief.count")?.level).toBe("error");
    expect(p?.rules.get("explanation.short")?.options).toEqual({ "min-words": 8 });
    expect(p?.allowIgnore).toBe(true);
    expect(p?.allowIgnoreOrigin).toBe("fullmark.toml:7");
    expect(p?.rules.get("custom.two-essays")).toMatchObject({ kind: "custom", level: "error" });
    expect(p?.checks.map((c) => c.id)).toEqual(["custom.two-essays"]);
    expect(p?.files).toEqual(["fullmark.toml"]);
  });

  it("lets a profile named like a built-in one change that built-in profile", () => {
    const p = resolveProfile("exam", layers('[profiles.exam]\nrules."question.untagged" = "warning"\n')).profile;
    expect(p?.rules.get("question.untagged")).toMatchObject({ level: "warning", origin: "fullmark.toml:2" });
    expect(p?.rules.get("choice.duplicate")?.level).toBe("error");
    expect(p?.chain.map((c) => c.name)).toEqual(["exam", "exam", "default"]);
  });

  it("takes personal profiles from the user config, and lets the project replace one of the same name", () => {
    const user =
      '[profiles.mine]\nrules."question.untagged" = "warning"\n\n[profiles.shared]\nrules."question.untagged" = "info"\n';
    const both = layers('[profiles.shared]\nrules."quiz.no-time-limit" = "warning"\n', user);
    expect(level("mine", "question.untagged", both)).toBe("warning");
    expect(level("shared", "quiz.no-time-limit", both)).toBe("warning");
    expect(level("shared", "question.untagged", both)).toBe("off");
    expect(resolveProfile("mine", both).profile?.rules.get("question.untagged")?.origin).toBe("config.toml:2");
  });

  it("lets a custom check's level be changed by a profile that extends it", () => {
    const text = `${project}
[profiles.relaxed]
extends = "signals-exam"
rules."custom.two-essays" = "warning"
`;
    expect(level("relaxed", "custom.two-essays", layers(text))).toBe("warning");
  });
});

describe("config errors found while resolving, each with file:line", () => {
  const errorsOf = (text: string, user: string | null = null) =>
    validateLayers(layers(text, user)).map((e) => `${e.file}:${e.line}: ${e.message}`);

  it("an unknown profile to extend", () => {
    expect(errorsOf('[profiles.a]\nextends = "exma"\n')).toEqual([
      "fullmark.toml:2: profile `a` extends `exma`, which does not exist",
    ]);
  });

  it("a cycle", () => {
    expect(errorsOf('[profiles.a]\nextends = "b"\n\n[profiles.b]\nextends = "a"\n')).toEqual([
      "fullmark.toml:2: profile `a` extends itself: a -> b -> a",
      "fullmark.toml:5: profile `b` extends itself: b -> a -> b",
    ]);
  });

  it("a custom level with no check behind it", () => {
    expect(errorsOf('[profiles.a]\nrules."custom.nothing" = "off"\n')).toEqual([
      "fullmark.toml:2: `custom.nothing` is not a check of profile `a`",
    ]);
  });

  it("names the user config when the mistake is there", () => {
    expect(errorsOf("", '[profiles.mine]\nextends = "nope"\n')).toEqual([
      "config.toml:2: profile `mine` extends `nope`, which does not exist",
    ]);
  });

  it("a valid file has none", () => {
    expect(errorsOf('[profiles.a]\nextends = "exam"\n')).toEqual([]);
  });
});

describe("the profile choice order", () => {
  const front = (text: string) =>
    parse(
      `---
${text}
---

## Q {type=single id=q}

- [${text.includes("survey") ? " " : "x"}] a
- [ ] b
`,
      "q.md",
    ).quiz?.frontMatter ?? null;
  const brief = (profile: string | null): Brief => BriefSchema.parse({ profile });
  const config = layers('[check]\nprofile = "practice"\n\n[profiles.practice]\n');

  it("--profile first", () => {
    expect(
      chooseProfile({
        cli: "draft",
        frontMatter: front("title: T\nprofile: exam"),
        brief: brief("exam"),
        layers: config,
      }),
    ).toMatchObject({
      name: "draft",
      from: "--profile",
    });
  });

  it("then the quiz's own profile, with its line", () => {
    expect(
      chooseProfile({
        cli: null,
        frontMatter: front("title: T\nprofile: exam"),
        brief: brief("draft"),
        layers: config,
      }),
    ).toEqual({
      name: "exam",
      from: "the quiz",
      line: 3,
    });
  });

  it("then the brief's, then [check] profile, then default", () => {
    const fm = front("title: T");
    expect(chooseProfile({ cli: null, frontMatter: fm, brief: brief("exam"), layers: config }).name).toBe("exam");
    expect(chooseProfile({ cli: null, frontMatter: fm, brief: brief(null), layers: config })).toEqual({
      name: "practice",
      from: "[check] profile",
      line: 2,
    });
    expect(chooseProfile({ cli: null, frontMatter: fm, brief: null, layers: NONE })).toEqual({
      name: "default",
      from: "the default",
      line: null,
    });
  });

  it("gives a survey the survey profile unless the quiz or the command line says otherwise", () => {
    const survey = front("title: T\nkind: survey");
    expect(chooseProfile({ cli: null, frontMatter: survey, brief: brief("exam"), layers: config }).name).toBe("survey");
    expect(chooseProfile({ cli: "default", frontMatter: survey, brief: null, layers: config }).name).toBe("default");
    expect(
      chooseProfile({
        cli: null,
        frontMatter: front("title: T\nkind: survey\nprofile: draft"),
        brief: null,
        layers: config,
      }).name,
    ).toBe("draft");
  });
});
