import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/core/config/parse";

const errorsOf = (text: string, kind: "project" | "user" = "project") =>
  parseConfig(text, "fullmark.toml", kind).errors.map((e) => `${e.file}:${e.line}: ${e.message}`);

describe("parseConfig reads a valid fullmark.toml", () => {
  const text = `[check]
profile = "practice"
fail-on = "warning"

[profiles.practice]
extends = "default"
allow-ignore = false
rules."explanation.short" = { level = "error", min-words = 6 }
rules."answers.position-skew" = "off"

[[profiles.practice.checks]]
id = "custom.two-essays"
kind = "count"
where = { type = "essay" }
max = 2
level = "warning"
message = "At most two essays."

[[profiles.practice.checks]]
id = "custom.sources"
kind = "require"
where = { tag = "past" }
field = "source"

[[profiles.practice.checks]]
id = "custom.no-code"
kind = "forbid"
where = { type = "code", graded = true, section = "intro" }
`;

  it("gives the check table, the profile and its checks", () => {
    const { data, errors } = parseConfig(text, "fullmark.toml", "project");
    expect(errors).toEqual([]);
    expect(data?.check).toMatchObject({ profile: "practice", profileLine: 2, failOn: "warning", failOnLine: 3 });
    const practice = data?.profiles.get("practice");
    expect(practice).toMatchObject({ extends: "default", allowIgnore: false, layer: "project" });
    expect(practice?.rules.get("explanation.short")).toMatchObject({ level: "error", options: { "min-words": 6 } });
    expect(practice?.rules.get("answers.position-skew")?.level).toBe("off");
    expect(practice?.checks.map((c) => [c.id, c.kind, c.level])).toEqual([
      ["custom.two-essays", "count", "warning"],
      ["custom.sources", "require", "error"],
      ["custom.no-code", "forbid", "error"],
    ]);
    expect(practice?.checks[2]?.where).toEqual({ type: "code", graded: true, section: "intro" });
  });

  it("reads only [profiles] from the user's config, and leaves the rest alone", () => {
    const user = `[library]\npath = "D:/quizzes"\n\n[check]\nprofile = "x"\n\n[profiles.mine]\nrules."question.untagged" = "warning"\n`;
    const { data, errors } = parseConfig(user, "config.toml", "user");
    expect(errors).toEqual([]);
    expect(data?.profiles.get("mine")?.layer).toBe("user");
    expect(data?.check.profile).toBeNull();
  });
});

describe("every config error names file:line", () => {
  it("TOML that does not parse, on the line smol-toml reports", () => {
    expect(errorsOf('[check]\nprofile = "a"\nfail-on = \n')).toEqual([
      expect.stringMatching(/^fullmark\.toml:3: not valid TOML/),
    ]);
  });

  it("an unknown top-level key, with a suggestion", () => {
    const e = parseConfig('[chek]\nprofile = "x"\n', "fullmark.toml", "project").errors; // spellchecker:disable-line
    expect(e).toEqual([
      { file: "fullmark.toml", line: 1, message: "unknown key `chek`", fix: "did you mean `check`?" }, // spellchecker:disable-line
    ]);
  });

  it("a bad [check] value", () => {
    expect(errorsOf('[check]\nprofile = "a"\nfail-on = "never"\n')).toEqual([
      'fullmark.toml:3: `fail-on` must be "error" or "warning"',
    ]);
  });

  it("an unknown rule, a fixed rule, a bad level", () => {
    const text = `[profiles.p]
rules."choice.duplicat" = "off" # spellchecker:disable-line
rules."choice.count" = "off"
rules."choice.duplicate" = "loud"
`;
    expect(errorsOf(text)).toEqual([
      "fullmark.toml:2: unknown rule `choice.duplicat`", // spellchecker:disable-line
      "fullmark.toml:3: `choice.count` is a fixed rule: no profile can change it",
      'fullmark.toml:4: the level must be one of "error", "warning", "info", "off", not string "loud"',
    ]);
  });

  it("an unknown option and a bad option value, on the option's own line", () => {
    const text = `[profiles.p]
rules."explanation.short" = {
  level = "error",
  min-word = 6,
}
rules."choice.correct-longest" = { ratio = "big" }
rules."choice.duplicate" = { level = "info", extra = 1 }
`;
    expect(errorsOf(text)).toEqual([
      "fullmark.toml:4: `explanation.short` has no option `min-word`",
      expect.stringMatching(/^fullmark\.toml:6: option `ratio` of `choice\.correct-longest`/),
      "fullmark.toml:7: `choice.duplicate` has no option `extra`",
    ]);
  });

  it("a malformed custom check, on the key at fault", () => {
    const text = `[[profiles.p.checks]]
id = "two-essays"
kind = "count"
max = 2

[[profiles.p.checks]]
id = "custom.a"
kind = "count"

[[profiles.p.checks]]
id = "custom.b"
kind = "require"
field = "colour"

[[profiles.p.checks]]
id = "custom.c"
kind = "forbid"
where = { type = "poem", mood = "sad" }
level = "fatal"

[[profiles.p.checks]]
id = "custom.d"
kind = "count"
min = 5
max = 2
bogus = 1
`;
    expect(errorsOf(text)).toEqual([
      expect.stringMatching(/^fullmark\.toml:2: a custom check's id must start with `custom\.`/),
      "fullmark.toml:8: a `count` check needs `min`, `max` or both",
      expect.stringMatching(/^fullmark\.toml:13: `field` must be one of/),
      expect.stringMatching(/^fullmark\.toml:19: the level must be/),
      "fullmark.toml:18: unknown key `mood` in `where`",
      expect.stringMatching(/^fullmark\.toml:18: `type` must be one of/),
      "fullmark.toml:26: unknown key `bogus` in a `count` check",
      "fullmark.toml:24: `min` (5) is above `max` (2)",
    ]);
  });

  it("two checks with one id", () => {
    const text = `[[profiles.p.checks]]\nid = "custom.a"\nkind = "forbid"\n\n[[profiles.p.checks]]\nid = "custom.a"\nkind = "forbid"\n`;
    expect(errorsOf(text)).toEqual(["fullmark.toml:6: the check id `custom.a` is used twice in this profile"]);
  });

  it("a profile that is not a table, a bad profile name, a bad extends", () => {
    expect(errorsOf('[profiles]\np = 3\n"bad name" = {}\n')).toEqual([
      "fullmark.toml:2: profile `p` must be a table, not number 3",
      expect.stringMatching(/^fullmark\.toml:3: "bad name" is not a valid profile name/),
    ]);
    expect(errorsOf("[profiles.p]\nextends = 4\n")).toEqual([
      "fullmark.toml:2: `extends` must be the name of a profile, in quotes",
    ]);
  });
});
