import { describe, expect, it } from "vitest";
import { parseBuildFile } from "../../src/core/config/build-file";

const read = (text: string) => parseBuildFile(text, "build.toml");
const errs = (text: string) => read(text).errors.map((e) => `${e.line}: ${e.message}`);

describe("reading a build file", () => {
  it("reads every key of an entry", () => {
    const r = read(`[[build]]
files = ["a/*.md", "b.md"]
out = "site"
profile = "strict"
config = "fullmark.toml"
strict = true
fonts = "none"
ui-lang = "vi"
built-at = "2026-10-24T09:00:00+07:00"
print = true
seed = 7
answer-sheet = true
`);
    expect(r.errors).toEqual([]);
    expect(r.entries).toEqual([
      {
        line: 1,
        files: ["a/*.md", "b.md"],
        out: "site",
        outLine: 3,
        profile: "strict",
        config: "fullmark.toml",
        strict: true,
        fonts: "none",
        uiLang: "vi",
        builtAt: "2026-10-24T09:00:00+07:00",
        print: true,
        seed: "7",
        seedLine: 11,
        answerSheet: true,
        answerSheetLine: 12,
      },
    ]);
  });

  it("reads `seed` as text or as a whole number's decimal digits, and refuses the rest", () => {
    const seed = (value: string) => read(`[[build]]\nfiles = ["a.md"]\nprint = true\nseed = ${value}\n`);
    expect(seed("101").entries[0]?.seed).toBe("101");
    expect(seed("0").entries[0]?.seed).toBe("0");
    expect(seed('"007"').entries[0]?.seed).toBe("007");
    expect(seed('"Mid1"').entries[0]?.seed).toBe("Mid1");
    expect(seed("-1").errors.map((e) => e.message)).toEqual(["`seed` must be text or a whole number, not number -1"]);
    expect(seed("1.5").errors.map((e) => e.message)).toEqual(["`seed` must be text or a whole number, not number 1.5"]);
    expect(seed("true").errors.map((e) => e.message)).toEqual([
      "`seed` must be text or a whole number, not boolean true",
    ]);
    expect(seed('"too-long-seed"').errors.map((e) => e.message)).toEqual([
      'seed "too-long-seed" must be 1 to 8 letters or digits',
    ]);
    expect(seed("123456789").errors.map((e) => e.message)).toEqual([
      'seed "123456789" must be 1 to 8 letters or digits',
    ]);
    expect(read('[[build]]\nfiles = ["a.md"]\nprint = "yes"\n').errors.map((e) => e.message)).toEqual([
      '`print` must be true or false, not string "yes"',
    ]);
  });

  it("a top-level seed is each entry's default, and an entry's own wins", () => {
    const r = read('seed = 1\nprint = true\n[[build]]\nfiles = ["a.md"]\n[[build]]\nfiles = ["b.md"]\nseed = 2\n');
    expect(r.entries.map((e) => [e.seed, e.seedLine])).toEqual([
      ["1", 1],
      ["2", 7],
    ]);
  });

  it("an entry with only files has no other setting", () => {
    const e = read('[[build]]\nfiles = ["a.md"]\n').entries[0];
    expect([e?.out, e?.profile, e?.config, e?.strict, e?.fonts, e?.uiLang, e?.builtAt]).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("the top level gives defaults and each entry overrides them, key by key", () => {
    const r = read(`out = "site"
strict = true
ui-lang = "vi"
built-at = "2026-10-24T09:00:00Z"

[[build]]
files = ["a.md"]

[[build]]
files = ["b.md"]
out = "other"
strict = false
ui-lang = "en"
`);
    expect(r.errors).toEqual([]);
    const [a, b] = r.entries;
    expect([a?.out, a?.outLine, a?.strict, a?.uiLang, a?.builtAt]).toEqual([
      "site",
      1,
      true,
      "vi",
      "2026-10-24T09:00:00Z",
    ]);
    expect([b?.out, b?.outLine, b?.strict, b?.uiLang, b?.builtAt, b?.line]).toEqual([
      "other",
      11,
      false,
      "en",
      "2026-10-24T09:00:00Z",
      9,
    ]);
  });

  it("a default that is wrong is reported once, not once per entry", () => {
    expect(errs('fonts = "big"\n[[build]]\nfiles = ["a"]\n[[build]]\nfiles = ["b"]\n')).toEqual([
      "1: fonts big is not one of quiz, all, none",
    ]);
  });

  it("keys about one run are refused with their line", () => {
    for (const key of ["attempt", "grades", "watch", "serve", "open", "port"]) {
      expect(errs(`[[build]]\nfiles = ["a.md"]\n${key} = true\n`)).toEqual([
        `3: \`${key}\` is about one run, not about what to build`,
      ]);
    }
    expect(errs('open = true\n[[build]]\nfiles = ["a.md"]\n')[0]).toBe(
      "1: `open` is about one run, not about what to build",
    );
  });

  it("the keys that wait for the key and the materials page say so, with their line", () => {
    for (const key of ["answers", "materials"]) {
      expect(errs(`[[build]]\nfiles = ["a.md"]\n${key} = "x"\n`)).toEqual([
        `3: \`${key}\` is not available yet: it arrives in a later release`,
      ]);
    }
    expect(errs('answers = "key"\n[[build]]\nfiles = ["a.md"]\n')).toEqual([
      "1: `answers` is not available yet: it arrives in a later release",
    ]);
  });

  it("an unknown key is refused with a suggestion when one is close", () => {
    const r = read('[[build]]\nfiles = ["a.md"]\nbuilt_at = "x"\nzzz = 1\n');
    expect(r.errors.map((e) => [e.line, e.message, e.fix])).toEqual([
      [3, "unknown key `built_at`", "did you mean `built-at`?"],
      [
        4,
        "unknown key `zzz`",
        "the keys are: out, profile, config, strict, fonts, ui-lang, built-at, print, seed, answer-sheet, files",
      ],
    ]);
    expect(errs('lang = "vi"\n[[build]]\nfiles = ["a.md"]\n')).toEqual(["1: unknown key `lang`"]);
  });

  it("wrong types and values give the flag's own message, with the line", () => {
    expect(errs('[[build]]\nfiles = ["a.md"]\nstrict = "yes"\n')).toEqual([
      '3: `strict` must be true or false, not string "yes"',
    ]);
    expect(errs('[[build]]\nfiles = ["a.md"]\nui-lang = "xx"\n')).toEqual(["3: ui-lang xx is not one of en, vi"]);
    expect(errs('[[build]]\nfiles = ["a.md"]\nfonts = "huge"\n')).toEqual([
      "3: fonts huge is not one of quiz, all, none",
    ]);
    expect(errs('[[build]]\nfiles = ["a.md"]\nbuilt-at = "yesterday"\n')).toEqual([
      "3: built-at yesterday is not an ISO date and time, such as 2026-10-24T09:00:00+07:00",
    ]);
    expect(errs('[[build]]\nfiles = ["a.md"]\nout = 3\n')).toEqual([
      "3: `out` must be a folder, in quotes, not number 3",
    ]);
    expect(errs('[[build]]\nfiles = ["a.md"]\nprofile = false\n')[0]).toContain(
      "`profile` must be the name of a profile",
    );
    expect(errs('[[build]]\nfiles = ["a.md"]\nconfig = 1\n')[0]).toContain("`config` must be a path");
    // a TOML date written without quotes is not the text the flag takes
    const unquoted = read('[[build]]\nfiles = ["a.md"]\nbuilt-at = 2026-10-24T09:00:00+07:00\n').errors;
    expect(unquoted.map((e) => [e.line, e.message, e.fix])).toEqual([
      [3, "`built-at` must be in quotes", 'built-at = "2026-10-24T09:00:00+07:00"'],
    ]);
  });

  it("files: required, a non-empty list of strings, and not at the top level", () => {
    expect(errs("[[build]]\n")).toEqual(["1: this [[build]] entry has no `files`"]);
    expect(errs('[[build]]\nfiles = "a.md"\n')).toEqual([
      '2: `files` must be a list of paths or globs in quotes, not string "a.md"',
    ]);
    expect(errs("[[build]]\nfiles = [1]\n")[0]).toContain("must be a list of paths or globs");
    expect(errs("[[build]]\nfiles = []\n")).toEqual(["2: `files` is empty: list the quiz files to build"]);
    expect(errs('files = ["a.md"]\n[[build]]\nfiles = ["a.md"]\n')).toEqual([
      "1: `files` belongs in a [[build]] entry, not at the top level",
    ]);
    expect(errs('[[build]]\nfiles = ["a.md"]\n[[build]]\nout = "x"\n')).toEqual([
      "3: this [[build]] entry has no `files`",
    ]);
  });

  it("no [[build]] entry, or [build] as a table, is refused", () => {
    expect(errs('out = "site"\n')).toEqual(["1: the build file has no [[build]] entry"]);
    expect(errs("")).toEqual(["1: the build file has no [[build]] entry"]);
    expect(errs('[build]\nfiles = ["a.md"]\n')[0]).toContain("`build` must be a list of tables");
  });

  it("text that is not TOML is refused with its line, and nothing is returned", () => {
    const r = read('[[build]]\nfiles = ["a.md"\n');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.message).toContain("not valid TOML");
    expect(r.errors[0]?.file).toBe("build.toml");
    expect(r.entries).toEqual([]);
  });

  it("every error names the file, and any error returns no entries", () => {
    const r = read('[[build]]\nfiles = ["a.md"]\nstrict = 1\n');
    expect(r.errors.map((e) => e.file)).toEqual(["build.toml"]);
    expect(r.entries).toEqual([]);
  });
});
