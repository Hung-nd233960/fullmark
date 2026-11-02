import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type BuildOptions, runBuild } from "../../src/cli/build";
import { base } from "../helpers/build";
import { capture, quiz, tempTree } from "../helpers/cli";

/** `build --build-file` (COMMANDS.md, "Build file"): the entries' files go through the same code as `build FILE...`. */
const root = resolve(import.meta.dirname, "..", "..");
const AT = "2026-10-24T09:00:00+07:00";
const bad = quiz("- [x] only one");

let trees: { done(): void }[] = [];
afterEach(() => {
  for (const t of trees) t.done();
  trees = [];
});
const tree = (files: Record<string, string>) => {
  const t = tempTree(files);
  trees.push(t);
  return t.dir;
};
const read = (...p: string[]) => readFileSync(join(...p), "utf8");
/** The options of a run that takes its settings from the build file. */
const fromFile = (extra: Partial<BuildOptions> = {}): BuildOptions => ({
  ...base,
  builtAt: null,
  buildFile: "build.toml",
  ...extra,
});

describe("build --build-file: a course of two entries", () => {
  const course = {
    "build.toml": `out = "site"
built-at = "${AT}"

[[build]]
files = ["signals/*.md", "systems/intro.md"]

[[build]]
files = ["exam/final.md"]
out = "exams"
ui-lang = "vi"
`,
    "signals/a.md": quiz(),
    "signals/b.md": quiz(),
    "systems/intro.md": quiz(),
    "exam/final.md": quiz(),
  };

  it("builds every file into its entry's folder, in order, with the entry's options and one summary", async () => {
    const dir = tree(course);
    const c = capture(dir);
    expect(await runBuild([], fromFile(), c.io)).toBe(0);
    expect(c.out).toEqual([
      "signals/a.md: wrote site/a.html",
      "signals/b.md: wrote site/b.html",
      "systems/intro.md: wrote site/intro.html",
      "exam/final.md: wrote exams/final.html",
      "4 done, 0 failed",
    ]);
    expect(readdirSync(join(dir, "site")).sort()).toEqual(["a.html", "b.html", "intro.html"]);
    expect(read(dir, "site/a.html")).toContain('<html lang="en"');
    expect(read(dir, "exams/final.html")).toContain('<html lang="vi"');
    // the top level's `built-at` pins the time: the page says so
    expect(read(dir, "site/a.html")).toContain(AT);
  });

  it("without `out` a page goes beside its source", async () => {
    const dir = tree({ "build.toml": '[[build]]\nfiles = ["x/a.md"]\n', "x/a.md": quiz() });
    const c = capture(dir);
    expect(await runBuild([], fromFile(), c.io)).toBe(0);
    expect(existsSync(join(dir, "x/a.html"))).toBe(true);
    // one file in a build file is still a summary-less single build
    expect(c.out).toEqual(["x/a.md: wrote x/a.html"]);
  });

  it("`-o DIR` beats every entry's `out`: one folder for all", async () => {
    const dir = tree(course);
    const c = capture(dir);
    expect(await runBuild([], fromFile({ output: "elsewhere" }), c.io)).toBe(0);
    expect(readdirSync(join(dir, "elsewhere")).sort()).toEqual(["a.html", "b.html", "final.html", "intro.html"]);
    expect(existsSync(join(dir, "site"))).toBe(false);
    expect(existsSync(join(dir, "exams"))).toBe(false);
    expect(c.out.at(-1)).toBe("4 done, 0 failed");
  });

  it("`out` is a folder even for one file", async () => {
    const dir = tree({ "build.toml": 'out = "site"\n[[build]]\nfiles = ["x/a.md"]\n', "x/a.md": quiz() });
    const c = capture(dir);
    expect(await runBuild([], fromFile(), c.io)).toBe(0);
    expect(c.out).toEqual(["x/a.md: wrote site/a.html"]);
  });

  it("paths are relative to the build file's folder, not the working directory", async () => {
    const dir = tree({
      "course/build.toml": 'out = "site"\nconfig = "my.toml"\n[[build]]\nfiles = ["q/*.md"]\n',
      "course/my.toml": '[check]\nprofile = "default"\n',
      "course/q/a.md": quiz(),
    });
    const c = capture(dir);
    expect(await runBuild([], fromFile({ buildFile: "course/build.toml" }), c.io)).toBe(0);
    expect(c.out).toEqual(["course/q/a.md: wrote course/site/a.html"]);
    expect(existsSync(join(dir, "course/site/a.html"))).toBe(true);
  });

  it("a command-line flag beats the entry and the top level", async () => {
    const dir = tree({
      "build.toml":
        'ui-lang = "vi"\nstrict = false\n[[build]]\nfiles = ["a.md"]\nui-lang = "vi"\nbuilt-at = "2026-01-01T00:00:00Z"\n',
      "a.md": quiz(),
    });
    const c = capture(dir);
    expect(await runBuild([], fromFile({ uiLang: "en", builtAt: AT }), c.io)).toBe(0);
    const page = read(dir, "a.html");
    expect(page).toContain('<html lang="en"');
    expect(page).toContain(AT);
    expect(page).not.toContain("2026-01-01T00:00:00Z");
  });

  it("`strict` in the file applies to its entry only; --strict applies to all", async () => {
    const dir = tree({
      "build.toml":
        'built-at = "2026-01-01T00:00:00Z"\n[[build]]\nfiles = ["a.md"]\nstrict = true\nfonts = "none"\n[[build]]\nfiles = ["b.md"]\nfonts = "none"\n',
      "a.md": quiz("- [x] a\n- [ ] b", "title: T\nlook: locked\nfont: serif"),
      "b.md": quiz("- [x] a\n- [ ] b", "title: T\nlook: locked\nfont: serif"),
    });
    const c = capture(dir);
    // a locked font that `--fonts none` does not embed is a warning; `strict` makes it an error for entry one only
    expect(await runBuild([], fromFile(), c.io)).toBe(1);
    expect(existsSync(join(dir, "a.html"))).toBe(false);
    expect(existsSync(join(dir, "b.html"))).toBe(true);
    expect(c.out.at(-1)).toBe("1 done, 1 failed");
    const d = capture(dir);
    rmSync(join(dir, "b.html"));
    expect(await runBuild([], fromFile({ strict: true }), d.io)).toBe(1);
    expect(existsSync(join(dir, "b.html"))).toBe(false);
  });

  it("every file is attempted: a quiz with errors fails in its place and the exit is the worst", async () => {
    const dir = tree({
      "build.toml": '[[build]]\nfiles = ["a.md", "b.md", "c.md", "missing.md"]\n',
      "a.md": quiz(),
      "b.md": bad,
      "c.md": quiz(),
    });
    const c = capture(dir);
    expect(await runBuild([], fromFile(), c.io)).toBe(2);
    expect(existsSync(join(dir, "a.html")) && existsSync(join(dir, "c.html"))).toBe(true);
    expect(existsSync(join(dir, "b.html"))).toBe(false);
    expect(c.err).toEqual(["missing.md: no such file"]);
    expect(c.out.at(-1)).toBe("2 done, 2 failed");
  });
});

describe("build --build-file: refusals before anything is built", () => {
  const refused = async (files: Record<string, string>, extra: Partial<BuildOptions> = {}, patterns: string[] = []) => {
    const dir = tree(files);
    const c = capture(dir);
    const code = await runBuild(patterns, fromFile(extra), c.io);
    const html = readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith(".html"));
    return { code, c, html };
  };

  it("an error in the file names BUILD:line, exits 2 and builds nothing", async () => {
    const r = await refused({ "build.toml": '[[build]]\nfiles = ["a.md"]\nui-lang = "xx"\n', "a.md": quiz() });
    expect(r.code).toBe(2);
    expect(r.c.err[0]).toBe("build.toml: the build file has errors");
    expect(r.c.err.join("\n")).toContain("build.toml:3: ui-lang xx is not one of en, vi");
    expect(r.html).toEqual([]);
  });

  it("a build file that is missing, or has no [[build]], exits 2", async () => {
    expect((await refused({ "a.md": quiz() })).c.err.join("\n")).toContain(
      "build.toml: cannot read the build file: no such file",
    );
    const r = await refused({ "build.toml": 'out = "x"\n' });
    expect(r.code).toBe(2);
    expect(r.c.err.join("\n")).toContain("build.toml:1: the build file has no [[build]] entry");
  });

  it("the keys that wait for the printed paper say so", async () => {
    const r = await refused({ "build.toml": '[[build]]\nfiles = ["a.md"]\nprint = true\n', "a.md": quiz() });
    expect(r.code).toBe(2);
    expect(r.c.err.join("\n")).toContain("build.toml:3: `print` is not available yet");
    expect(r.html).toEqual([]);
  });

  it("two pages for one path: the same file in two entries, or one name from two folders", async () => {
    const same = await refused({
      "build.toml": 'out = "site"\n[[build]]\nfiles = ["a.md"]\n[[build]]\nfiles = ["a.md"]\n',
      "a.md": quiz(),
    });
    expect(same.code).toBe(2);
    expect(same.c.err).toEqual([
      "the entries at build.toml:2 and build.toml:4 would both write site/a.html (from a.md and a.md)",
    ]);
    expect(same.html).toEqual([]);
    const names = await refused({
      "build.toml": 'out = "site"\n[[build]]\nfiles = ["x/s.md", "y/s.md"]\n',
      "x/s.md": quiz(),
      "y/s.md": quiz(),
    });
    expect(names.c.err).toEqual(["the entry at build.toml:2 would write site/s.html twice (from x/s.md and y/s.md)"]);
    expect(names.html).toEqual([]);
    // different folders for the two entries are fine
    const apart = await refused({
      "build.toml": '[[build]]\nfiles = ["x/s.md"]\nout = "p"\n[[build]]\nfiles = ["y/s.md"]\nout = "q"\n',
      "x/s.md": quiz(),
      "y/s.md": quiz(),
    });
    expect(apart.code).toBe(0);
  });

  it("`out`, or `-o`, that is a page name or an existing file is refused", async () => {
    const files = { "a.md": quiz(), taken: "mine" };
    expect((await refused({ ...files, "build.toml": 'out = "p.html"\n[[build]]\nfiles = ["a.md"]\n' })).c.err).toEqual([
      "build.toml:1: out p.html looks like a page, and a build file needs a folder",
    ]);
    expect((await refused({ ...files, "build.toml": '[[build]]\nfiles = ["a.md"]\nout = "taken"\n' })).c.err).toEqual([
      "build.toml:3: out taken is a file, and a build file needs a folder",
    ]);
    const o = await refused({ ...files, "build.toml": '[[build]]\nfiles = ["a.md"]\n' }, { output: "OUT.HTM" });
    expect(o.c.err).toEqual(["-o OUT.HTM looks like a page, and a build file needs a folder"]);
    expect(o.html).toEqual([]);
  });
});

describe("build --build-file with FILEs", () => {
  const files = {
    "build.toml": '[[build]]\nfiles = ["a.md", "b.md"]\nout = "site"\n[[build]]\nfiles = ["c.md"]\nui-lang = "vi"\n',
    "a.md": quiz(),
    "b.md": quiz(),
    "c.md": quiz(),
  };

  it("builds only the entries' files that match them, with their entry's options", async () => {
    const dir = tree(files);
    const c = capture(dir);
    expect(await runBuild(["c.md", "b.md"], fromFile(), c.io)).toBe(0);
    expect(c.out).toEqual(["b.md: wrote site/b.html", "c.md: wrote c.html", "2 done, 0 failed"]);
    expect(existsSync(join(dir, "site/a.html"))).toBe(false);
    expect(read(dir, "c.html")).toContain('<html lang="vi"');
  });

  it("a glob works as a filter", async () => {
    const dir = tree(files);
    const c = capture(dir);
    expect(await runBuild(["[ab].md"], fromFile(), c.io)).toBe(0);
    expect(c.out.at(-1)).toBe("2 done, 0 failed");
  });

  it("a FILE that is in no entry exits 2 naming it, and nothing is built", async () => {
    const dir = tree({ ...files, "d.md": quiz() });
    const c = capture(dir);
    expect(await runBuild(["a.md", "d.md"], fromFile(), c.io)).toBe(2);
    expect(c.err).toEqual(["d.md is in no entry of build.toml"]);
    expect(existsSync(join(dir, "site"))).toBe(false);
    const m = capture(dir);
    expect(await runBuild(["nope.md"], fromFile(), m.io)).toBe(2);
    expect(m.err).toEqual(["nope.md: no such file"]);
  });
});

describe("build --build-file --json", () => {
  const parse = (lines: string[]) => lines.map((l) => JSON.parse(l) as Record<string, unknown>);

  it("one line per file with `file`, then the done line", async () => {
    const dir = tree({
      "build.toml": '[[build]]\nfiles = ["a.md", "b.md"]\nout = "site"\n',
      "a.md": quiz(),
      "b.md": bad,
    });
    const c = capture(dir);
    expect(await runBuild([], fromFile({ json: true }), c.io)).toBe(1);
    const lines = parse(c.out);
    expect(lines.map((l) => [l.status, l.file])).toEqual([
      ["built", "a.md"],
      ["failed", "b.md"],
      ["done", undefined],
    ]);
    expect(lines[0]?.output).toBe("site/a.html");
    expect(lines[2]).toEqual({ status: "done", ok: 1, failed: 1 });
  });

  it("an error in the build file is one JSON error line with the errors and their lines", async () => {
    const dir = tree({ "build.toml": '[[build]]\nfiles = ["a.md"]\nstrict = 1\n', "a.md": quiz() });
    const c = capture(dir);
    expect(await runBuild([], fromFile({ json: true }), c.io)).toBe(2);
    const [line] = parse(c.out);
    expect(line?.status).toBe("error");
    expect(line?.file).toBe("build.toml");
    expect(((line?.errors ?? []) as { line: number }[])[0]?.line).toBe(3);
    expect(c.out).toHaveLength(1);
  });

  it("a single file is a single object, as build FILE gives", async () => {
    const dir = tree({ "build.toml": '[[build]]\nfiles = ["a.md"]\n', "a.md": quiz() });
    const c = capture(dir);
    expect(await runBuild([], fromFile({ json: true }), c.io)).toBe(0);
    expect(parse(c.out)).toHaveLength(1);
    expect(parse(c.out)[0]?.file).toBeUndefined();
  });
});

describe("a build file rebuilds a course byte-identically, and each page equals the command line's", () => {
  it("every example: two runs are identical, and each page equals `build FILE` with the same flags", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fullmark-buildfile-"));
    trees.push({ done: () => rmSync(dir, { recursive: true, force: true }) });
    const names = readdirSync(join(root, "examples"));
    for (const n of names) cpSync(join(root, "examples", n), join(dir, n), { recursive: true });
    mkdirSync(join(dir, ".git"));
    // the last example is built with other flags: no fonts, a Vietnamese interface
    const last = names[names.length - 1] ?? "";
    const rest = names.slice(0, -1);
    writeFileSync(
      join(dir, "build.toml"),
      `built-at = "${AT}"

[[build]]
files = [${rest.map((n) => `"${n}/quiz.md"`).join(", ")}]

[[build]]
files = ["${last}/quiz.md"]
fonts = "none"
ui-lang = "vi"
`,
    );
    const pages = () => new Map(names.map((n) => [n, read(dir, n, "quiz.html")]));
    expect(await runBuild([], fromFile(), capture(dir).io)).toBe(0);
    const first = pages();
    for (const n of names) rmSync(join(dir, n, "quiz.html"));
    expect(await runBuild([], fromFile(), capture(dir).io)).toBe(0);
    const second = pages();
    for (const n of names) {
      expect(second.get(n) === first.get(n), `${n}: a second run`).toBe(true);
      const flags = n === last ? { fonts: "none", uiLang: "vi" } : {};
      const alone = capture(dir);
      expect(
        await runBuild([`${n}/quiz.md`], { ...base, builtAt: AT, ...flags, output: `alone/${n}.html` }, alone.io),
      ).toBe(0);
      expect(read(dir, "alone", `${n}.html`) === first.get(n), `${n}: equal to the command line`).toBe(true);
    }
    // the last entry's flags did something: its page differs from a build without them
    expect(first.get(last)).toContain('<html lang="vi"');
  });
});
