import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type BuildOptions, runBuild } from "../../src/cli/build";
import { capture, quiz, tempTree } from "../helpers/cli";

export const base: BuildOptions = {
  profile: null,
  config: null,
  strict: false,
  output: null,
  builtAt: "2026-10-28T10:00:00+07:00",
  fonts: null,
  plain: true,
  later: [],
  version: "1.0.0-test",
};

const root = resolve(import.meta.dirname, "..", "..");
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

describe("build with several files", () => {
  it("expands globs, builds each file beside its source and says how many were done", async () => {
    const dir = tree({ "a/one.md": quiz(), "a/two.md": quiz(), "a/notes.txt": "x" });
    const c = capture(dir);
    expect(await runBuild(["a/*.md"], base, c.io)).toBe(0);
    expect(existsSync(join(dir, "a/one.html"))).toBe(true);
    expect(existsSync(join(dir, "a/two.html"))).toBe(true);
    expect(c.out).toEqual(["a/one.md: wrote a/one.html", "a/two.md: wrote a/two.html", "2 done, 0 failed"]);
    expect(c.err).toEqual([]);
  });

  it("drops a repeated file and refuses a folder, and the other files are still built", async () => {
    const dir = tree({ "one.md": quiz(), "sub/x.md": quiz() });
    const c = capture(dir);
    expect(await runBuild(["one.md", "*.md", "sub"], base, c.io)).toBe(2);
    expect(c.err).toEqual(["sub: is a folder, not a quiz file"]);
    expect(c.out).toEqual(["one.md: wrote one.html", "1 done, 1 failed"]);
  });

  it("every file is attempted and the exit is the worst: 1 for check errors, 2 over 1", async () => {
    const dir = tree({ "a.md": quiz(), "b.md": bad, "c.md": quiz() });
    const c = capture(dir);
    expect(await runBuild(["a.md", "b.md", "c.md"], base, c.io)).toBe(1);
    expect(existsSync(join(dir, "a.html"))).toBe(true);
    expect(existsSync(join(dir, "b.html"))).toBe(false);
    expect(existsSync(join(dir, "c.html"))).toBe(true);
    expect(c.out.some((l) => l.startsWith("b.md:") && l.includes("error"))).toBe(true);
    expect(c.out.at(-1)).toBe("2 done, 1 failed");
    const d = capture(dir);
    expect(await runBuild(["a.md", "b.md", "missing.md"], base, d.io)).toBe(2);
  });

  it("a file's issues are the ones it prints alone", async () => {
    const dir = tree({ "a.md": quiz(), "b.md": bad });
    const alone = capture(dir);
    await runBuild(["b.md"], base, alone.io);
    const batch = capture(dir);
    await runBuild(["a.md", "b.md"], base, batch.io);
    const issues = (lines: string[]) => lines.filter((l) => l.startsWith("b.md:") && l.includes(": error "));
    expect(issues(batch.out)).toEqual(issues(alone.out));
    expect(issues(alone.out).length).toBeGreaterThan(0);
  });

  it("-o names a folder, created if missing; each page keeps its source's name", async () => {
    const dir = tree({ "x/signals.md": quiz(), "y/other.md": quiz() });
    const c = capture(dir);
    expect(await runBuild(["x/signals.md", "y/other.md"], { ...base, output: "out/pages" }, c.io)).toBe(0);
    expect(readdirSync(join(dir, "out/pages")).sort()).toEqual(["other.html", "signals.html"]);
    expect(c.out[0]).toBe("x/signals.md: wrote out/pages/signals.html");
  });

  it("-o an existing file with several inputs exits 2 and builds nothing", async () => {
    const dir = tree({ "a.md": quiz(), "b.md": quiz(), "page.html": "mine" });
    const c = capture(dir);
    expect(await runBuild(["a.md", "b.md"], { ...base, output: "page.html" }, c.io)).toBe(2);
    expect(c.err.join("\n")).toContain("-o page.html is a file");
    expect(read(dir, "page.html")).toBe("mine");
    expect(existsSync(join(dir, "a.html"))).toBe(false);
  });

  it("-o with one input is still a file path", async () => {
    const dir = tree({ "a.md": quiz() });
    const c = capture(dir);
    expect(await runBuild(["a.md"], { ...base, output: "dist/x.html" }, c.io)).toBe(0);
    expect(existsSync(join(dir, "dist/x.html"))).toBe(true);
    expect(c.out).toEqual(["a.md: wrote dist/x.html"]);
  });

  it("two inputs with one name in different folders exit 2 naming both, before building anything", async () => {
    const dir = tree({ "x/signals.md": quiz(), "y/signals.md": quiz(), "z.md": quiz() });
    const c = capture(dir);
    expect(await runBuild(["z.md", "x/signals.md", "y/signals.md"], { ...base, output: "out" }, c.io)).toBe(2);
    expect(c.err).toEqual(["x/signals.md and y/signals.md would both be written to out/signals.html"]);
    expect(existsSync(join(dir, "out"))).toBe(false);
  });

  it("without -o the same names are fine: each page goes beside its source", async () => {
    const dir = tree({ "x/signals.md": quiz(), "y/signals.md": quiz() });
    const c = capture(dir);
    expect(await runBuild(["x/signals.md", "y/signals.md"], base, c.io)).toBe(0);
    expect(existsSync(join(dir, "y/signals.html"))).toBe(true);
  });

  it("--strict applies to each file on its own", async () => {
    const dir = tree({ "a.md": quiz(), "b.md": quiz("- [x] a\n- [ ] b", "title: T\nfont: serif\nlook: locked") });
    const c = capture(dir);
    expect(await runBuild(["a.md", "b.md"], { ...base, strict: true, fonts: "none" }, c.io)).toBe(1);
    expect(existsSync(join(dir, "a.html"))).toBe(true);
    expect(existsSync(join(dir, "b.html"))).toBe(false);
  });

  it("shows the progress line only on a terminal, and not with --plain", async () => {
    const dir = tree({ "a.md": quiz(), "b.md": quiz() });
    const raw = (tty: boolean, plain: boolean) => {
      const c = capture(dir);
      const chunks: string[] = [];
      c.io.errRaw = (t) => chunks.push(t);
      c.io.tty = tty;
      return runBuild(["a.md", "b.md"], { ...base, plain }, c.io).then(() => chunks.join(""));
    };
    expect(await raw(false, false)).toBe("");
    expect(await raw(true, true)).toBe("");
    const shown = await raw(true, false);
    expect(shown).toContain("[1/2] a.md");
    expect(shown).toContain("[2/2] b.md");
  });
});

describe("a folder of quizzes builds in one command", () => {
  it("every example: the batch page is byte-identical to the page built alone", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fullmark-batch-"));
    trees.push({ done: () => rmSync(dir, { recursive: true, force: true }) });
    const names = readdirSync(join(root, "examples"));
    for (const n of names) cpSync(join(root, "examples", n), join(dir, n), { recursive: true });
    mkdirSync(join(dir, ".git"));
    const batch = capture(dir);
    expect(
      await runBuild(
        names.map((n) => `${n}/quiz.md`),
        base,
        batch.io,
      ),
    ).toBe(0);
    for (const n of names) {
      const alone = capture(dir);
      expect(await runBuild([`${n}/quiz.md`], { ...base, output: `alone/${n}.html` }, alone.io)).toBe(0);
      expect(read(dir, n, "quiz.html") === read(dir, "alone", `${n}.html`), n).toBe(true);
    }
  });
});
