import { describe, expect, it } from "vitest";
import { TomlIndex } from "../../src/core/config/toml-index";

const doc = `# a comment
[check]
profile = "practice"   # trailing comment
fail-on = "error"

[profiles.practice]
extends = "default"
rules."explanation.short" = { level = "error", min-words = 6 }
rules."answers.position-skew" = "off"
notes = """
[not.a.table]
still text
"""

[profiles.signals-exam]
extends = "exam"
rules."brief.count" = { tolerance = 0.05 }

[[profiles.signals-exam.checks]]
id = "custom.two-essays"
kind = "count"
where = { type = "essay" }
max = 2

[[profiles.signals-exam.checks]]
id = "custom.total-100"
list = [
  [1, 2],
  { a = 1 },
]
[tables.'quoted.key'.x]
y = 1
`;

describe("TomlIndex", () => {
  const index = new TomlIndex(doc);

  it("finds tables and keys by line", () => {
    expect(index.lineOf(["check"])).toBe(2);
    expect(index.lineOf(["check", "profile"])).toBe(3);
    expect(index.lineOf(["check", "fail-on"])).toBe(4);
    expect(index.lineOf(["profiles", "practice"])).toBe(6);
    expect(index.lineOf(["profiles", "practice", "extends"])).toBe(7);
  });

  it("finds dotted keys with quoted parts, and the keys of an inline table on the line of the table", () => {
    expect(index.lineOf(["profiles", "practice", "rules", "explanation.short"])).toBe(8);
    expect(index.lineOf(["profiles", "practice", "rules", "explanation.short", "min-words"])).toBe(8);
    expect(index.lineOf(["profiles", "practice", "rules", "answers.position-skew"])).toBe(9);
  });

  it("does not read a header inside a multi-line string", () => {
    expect(index.has(["not", "a", "table"])).toBe(false);
    expect(index.lineOf(["profiles", "practice", "notes"])).toBe(10);
  });

  it("numbers the tables of an array of tables", () => {
    expect(index.lineOf(["profiles", "signals-exam", "checks", "0"])).toBe(19);
    expect(index.lineOf(["profiles", "signals-exam", "checks", "0", "kind"])).toBe(21);
    expect(index.lineOf(["profiles", "signals-exam", "checks", "0", "where", "type"])).toBe(22);
    expect(index.lineOf(["profiles", "signals-exam", "checks", "1", "id"])).toBe(26);
  });

  it("reads nested arrays and inline tables across lines, then goes on", () => {
    expect(index.lineOf(["profiles", "signals-exam", "checks", "1", "list"])).toBe(27);
    expect(index.lineOf(["tables", "quoted.key", "x", "y"])).toBe(32);
  });

  it("falls back to the longest known prefix, and to line 1", () => {
    expect(index.lineOf(["profiles", "practice", "rules", "choice.duplicate"])).toBe(8);
    expect(index.lineOf(["nowhere"])).toBe(1);
  });
});
