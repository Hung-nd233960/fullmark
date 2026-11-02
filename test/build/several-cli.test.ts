import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type BuildIo, type BuildOptions, runBuild } from "../../src/cli/build";
import { base } from "../helpers/build";
import { capture, quiz, tempTree } from "../helpers/cli";

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
    const dir = tree({ "a.md": quiz(), "b.md": quiz(), "page.out": "mine" });
    const c = capture(dir);
    expect(await runBuild(["a.md", "b.md"], { ...base, output: "page.out" }, c.io)).toBe(2);
    expect(c.err.join("\n")).toContain("-o page.out is a file");
    expect(read(dir, "page.out")).toBe("mine");
    expect(existsSync(join(dir, "a.html"))).toBe(false);
  });

  it("-o ending in .html or .htm, any case, with several inputs exits 2 and builds nothing", async () => {
    const dir = tree({ "a.md": quiz(), "b.md": quiz() });
    for (const name of ["out.html", "OUT.HTM", "x/Pages.Html"]) {
      const c = capture(dir);
      expect(await runBuild(["a.md", "b.md"], { ...base, output: name }, c.io)).toBe(2);
      expect(c.err).toEqual([`-o ${name} looks like a page, and building several files needs a folder`]);
      expect(c.out).toEqual([]);
    }
    expect(readdirSync(dir).sort()).toEqual(["a.md", "b.md"]);
    const d = capture(dir);
    expect(await runBuild(["a.md", "missing.md"], { ...base, output: "out.html" }, d.io)).toBe(2);
    expect(d.err.join("\n")).toContain("looks like a page");
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
    const names = readdirSync(join(root, "examples")).filter((n) => existsSync(join(root, "examples", n, "quiz.md")));
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

describe("build --json", () => {
  const parse = (lines: string[]) => lines.map((l) => JSON.parse(l) as Record<string, unknown>);

  it("one file built: status, output, bytes, errors and warnings, and nothing else on stdout", async () => {
    const dir = tree({ "a.md": quiz() });
    const c = capture(dir);
    expect(await runBuild(["a.md"], { ...base, json: true }, c.io)).toBe(0);
    const [line, ...rest] = parse(c.out);
    expect(rest).toEqual([]);
    expect(line).toEqual({
      status: "built",
      output: "a.html",
      bytes: readFileSync(join(dir, "a.html")).length,
      errors: [],
      warnings: [],
    });
    expect(c.err).toEqual([]);
  });

  it("one file failed: the check errors in check --json's shape, no output, nothing written", async () => {
    const dir = tree({ "a.md": bad });
    const c = capture(dir);
    expect(await runBuild(["a.md"], { ...base, json: true }, c.io)).toBe(1);
    const [line] = parse(c.out);
    expect(c.out).toHaveLength(1);
    expect(line).toMatchObject({ status: "failed", output: null, bytes: null, warnings: [] });
    const errors = line?.errors as Record<string, unknown>[];
    expect(Object.keys(errors[0] ?? {})).toEqual(["rule", "level", "file", "line", "message", "fix"]);
    expect(errors[0]).toMatchObject({ level: "error", file: "a.md", line: 5 });

    expect(existsSync(join(dir, "a.html"))).toBe(false);
  });

  it("warnings of a built page are in warnings", async () => {
    const dir = tree({ "a.md": quiz("- [x] a\n- [ ] b", "title: T\nfont: serif\nlook: locked") });
    const c = capture(dir);
    expect(await runBuild(["a.md"], { ...base, json: true, fonts: "none" }, c.io)).toBe(0);
    const [line] = parse(c.out);
    expect(line?.status).toBe("built");
    expect(((line?.warnings ?? []) as { rule: string }[]).map((w) => w.rule)).toEqual(["build.font-not-embedded"]);
  });

  it("several files: one line per file with file, then the done line", async () => {
    const dir = tree({ "a.md": quiz(), "b.md": bad, "c.md": quiz() });
    const c = capture(dir);
    expect(await runBuild(["a.md", "b.md", "c.md", "none.md"], { ...base, json: true }, c.io)).toBe(2);
    const lines = parse(c.out);
    expect(lines.map((l) => [l.status, l.file])).toEqual([
      ["built", "a.md"],
      ["failed", "b.md"],
      ["built", "c.md"],
      ["error", "none.md"],
      ["done", undefined],
    ]);
    expect(lines.at(-1)).toEqual({ status: "done", ok: 2, failed: 2 });
    expect(c.err).toEqual(["none.md: no such file"]);
  });

  it("a usage error is a JSON error line, and there is no progress line", async () => {
    const dir = tree({ "a.md": quiz() });
    const c = capture(dir);
    expect(await runBuild(["a.md"], { ...base, json: true, fonts: "some" }, c.io)).toBe(2);
    expect(parse(c.out)).toEqual([{ status: "error", message: "--fonts some is not one of quiz, all, none" }]);
  });
});

describe("build --open", () => {
  const withOpener = (dir: string, open: (p: string) => void | Promise<void>) => {
    const c = capture(dir);
    (c.io as BuildIo).open = open;
    return c;
  };

  it("one file built is opened once, by its full path", async () => {
    const dir = tree({ "a.md": quiz() });
    const opened: string[] = [];
    const c = withOpener(dir, (p) => void opened.push(p));
    expect(await runBuild(["a.md"], { ...base, open: true }, c.io)).toBe(0);
    expect(opened).toEqual([join(dir, "a.html")]);
    expect(c.err).toEqual([]);
  });

  it("opens nothing without --open", async () => {
    const dir = tree({ "a.md": quiz() });
    const opened: string[] = [];
    const c = withOpener(dir, (p) => void opened.push(p));
    await runBuild(["a.md"], base, c.io);
    expect(opened).toEqual([]);
  });

  it("several files open nothing and say how many were built; the exit is unaffected", async () => {
    const dir = tree({ "a.md": quiz(), "b.md": quiz(), "c.md": bad });
    const opened: string[] = [];
    const c = withOpener(dir, (p) => void opened.push(p));
    expect(await runBuild(["a.md", "b.md", "c.md"], { ...base, open: true }, c.io)).toBe(1);
    expect(opened).toEqual([]);
    expect(c.err).toEqual(["--open opens one page; built 2"]);
  });

  it("a failed build opens nothing", async () => {
    const dir = tree({ "a.md": bad });
    const opened: string[] = [];
    const c = withOpener(dir, (p) => void opened.push(p));
    expect(await runBuild(["a.md"], { ...base, open: true }, c.io)).toBe(1);
    expect(opened).toEqual([]);
  });

  it("an opener that throws, or rejects, is a warning and the exit stays 0", async () => {
    const dir = tree({ "a.md": quiz() });
    const thrown = withOpener(dir, () => {
      throw new Error("no opener");
    });
    expect(await runBuild(["a.md"], { ...base, open: true }, thrown.io)).toBe(0);
    expect(thrown.err).toEqual(["warning: cannot open the page: no opener"]);
    const rejected = withOpener(dir, () => Promise.reject(Object.assign(new Error("x"), { code: "ENOENT" })));
    expect(await runBuild(["a.md"], { ...base, open: true }, rejected.io)).toBe(0);
    expect(rejected.err).toEqual(["warning: cannot open the page: the system's opener was not found"]);
    expect(existsSync(join(dir, "a.html"))).toBe(true);
  });
});

describe("build --ui-lang", () => {
  const build = async (front: string, uiLang: string | null) => {
    const dir = tree({ "a.md": quiz("- [x] a\n- [ ] b", front) });
    const c = capture(dir);
    const code = await runBuild(["a.md"], { ...base, uiLang }, c.io);
    return { code, err: c.err, html: existsSync(join(dir, "a.html")) ? read(dir, "a.html") : null };
  };
  const data = (html: string) =>
    JSON.parse(/<script type="application\/json" id="fm-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "{}") as {
      quizzes: { uiLang: string; lang: string; hash: string; key: string }[];
    };

  it("vi over an English quiz: the chrome, <html lang> and the catalog change; en over a vi quiz likewise", async () => {
    const en = (await build("title: T", null)).html ?? "";
    const vi = (await build("title: T", "vi")).html ?? "";
    expect(en).toContain('<html lang="en">');
    expect(vi).toContain('<html lang="vi">');
    expect(data(vi).quizzes[0]?.uiLang).toBe("vi");
    expect(vi).not.toBe(en);
    const viQuiz = (await build("title: T\nlang: vi", null)).html ?? "";
    const forced = (await build("title: T\nlang: vi", "en")).html ?? "";
    expect(viQuiz).toContain('<html lang="vi">');
    expect(forced).toContain('<html lang="en">');
    expect(data(forced).quizzes[0]?.uiLang).toBe("en");
  });

  it("the value of the flag equal to the quiz's own changes nothing", async () => {
    expect((await build("title: T", "en")).html).toBe((await build("title: T", null)).html);
  });

  it("the same --ui-lang gives the same bytes", async () => {
    expect((await build("title: T", "vi")).html).toBe((await build("title: T", "vi")).html);
  });

  it("grading is unchanged: the hash, the key and the quiz's lang are the same in both pages", async () => {
    const a = data((await build("title: T", "en")).html ?? "").quizzes[0];
    const b = data((await build("title: T", "vi")).html ?? "").quizzes[0];
    expect(b?.hash).toBe(a?.hash);
    expect(b?.lang).toBe(a?.lang);
    expect(b?.key).toBe(a?.key);
    expect(a?.key).toBeTruthy();
  });

  it("any other value exits 2 and writes nothing", async () => {
    const r = await build("title: T", "xx");
    expect(r.code).toBe(2);
    expect(r.err).toEqual(["--ui-lang xx is not one of en, vi"]);
    expect(r.html).toBeNull();
  });
});

describe("build.size", () => {
  const profile = (rule: string) => `[profiles.p]\nextends = "default"\nrules."build.size" = ${rule}\n`;
  const run = async (rule: string, opts: Partial<BuildOptions> = {}, json = false) => {
    const dir = tree({ "a.md": quiz(), "fullmark.toml": profile(rule) });
    const c = capture(dir);
    const code = await runBuild(["a.md"], { ...base, profile: "p", json, ...opts }, c.io);
    return { code, dir, out: c.out, written: existsSync(join(dir, "a.html")) };
  };

  it("under warn-mb says nothing", async () => {
    const r = await run("{ level = 'warning' }");
    expect(r.code).toBe(0);
    expect(r.out).toEqual(["a.md: wrote a.html"]);
  });

  it("over warn-mb is a warning that names the size and the limit, and the page is written", async () => {
    const r = await run("{ level = 'warning', warn-mb = 0.1 }");
    expect(r.code).toBe(0);
    expect(r.written).toBe(true);
    expect(r.out[0]).toMatch(
      /^a\.md:1: warning build\.size: the page is \d+\.\d MB \(1 MB is 1,000,000 bytes\), over warn-mb 0\.1 MB$/,
    );
    expect(r.out[1]).toContain("fix: use smaller or fewer images");
  });

  it("--strict turns the warning into an error and writes nothing", async () => {
    const r = await run("{ level = 'warning', warn-mb = 0.1 }", { strict: true });
    expect(r.code).toBe(1);
    expect(r.written).toBe(false);
    expect(r.out[0]).toContain(": error build.size:");
  });

  it("the profile's level is honoured: error fails, off is silent", async () => {
    expect((await run("{ level = 'error', warn-mb = 0.1 }")).code).toBe(1);
    const off = await run("{ level = 'off', warn-mb = 0.1 }");
    expect(off.code).toBe(0);
    expect(off.out).toEqual(["a.md: wrote a.html"]);
  });

  it("over max-mb is an error whatever the profile, and nothing is written", async () => {
    const r = await run("{ level = 'off', warn-mb = 0.1, max-mb = 0.2 }");
    expect(r.code).toBe(1);
    expect(r.written).toBe(false);
    expect(r.out[0]).toMatch(
      /: error build\.size: the page is \d+\.\d MB .*over max-mb 0\.2 MB, so nothing was written$/,
    );
  });

  it("is in --json's warnings and errors", async () => {
    const w = JSON.parse((await run("{ level = 'warning', warn-mb = 0.1 }", {}, true)).out[0] ?? "{}");
    expect(w.status).toBe("built");
    expect(w.warnings.map((i: { rule: string }) => i.rule)).toEqual(["build.size"]);
    const e = JSON.parse((await run("{ level = 'warning', warn-mb = 0.1, max-mb = 0.2 }", {}, true)).out[0] ?? "{}");
    expect(e.status).toBe("failed");
    expect(e.errors.map((i: { rule: string }) => i.rule)).toEqual(["build.size"]);
  });

  it("a page made big by an inline asset crosses the default 20 MB", async () => {
    const png = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(8_000_000, 7)]);
    const dir = tree({ "a.md": quiz("![big](assets/big.png)\n\n- [x] a\n- [ ] b") });
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "assets", "big.png"), png);
    const c = capture(dir);
    expect(await runBuild(["a.md"], base, c.io)).toBe(0);
    expect(c.out[0]).toMatch(/warning build\.size: the page is 2\d\.\d MB .*over warn-mb 20 MB$/);
  });
});
