import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type BuildOptions, runBuild } from "../../src/cli/build";
import { base } from "../helpers/build";
import { capture, quiz, tempTree } from "../helpers/cli";

/** `build --print` (COMMANDS.md): the flags, the refusals, the output name and the build file's `print`, `seed` and `answer-sheet`. */
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
const print = (extra: Partial<BuildOptions> = {}): BuildOptions => ({ ...base, print: true, ...extra });
const bad = quiz("- [x] only one");
const read = (...p: string[]) => readFileSync(join(...p), "utf8");

describe("build --print: the flags", () => {
  it("writes FILE with -print.html, and says so", async () => {
    const dir = tree({ "quiz.md": quiz() });
    const c = capture(dir);
    expect(await runBuild(["quiz.md"], print(), c.io)).toBe(0);
    expect(c.out).toEqual(["quiz.md: wrote quiz-print.html"]);
    expect(existsSync(join(dir, "quiz-print.html"))).toBe(true);
    expect(existsSync(join(dir, "quiz.html"))).toBe(false);
  });

  it("takes -o for one file, or a folder for several, keeping each name with -print", async () => {
    const dir = tree({ "a.md": quiz(), "b.md": quiz() });
    const one = capture(dir);
    expect(await runBuild(["a.md"], print({ output: "paper.html" }), one.io)).toBe(0);
    expect(existsSync(join(dir, "paper.html"))).toBe(true);
    const many = capture(dir);
    expect(await runBuild(["a.md", "b.md"], print({ output: "out" }), many.io)).toBe(0);
    expect(readdirSync(join(dir, "out")).sort()).toEqual(["a-print.html", "b-print.html"]);
  });

  it("a page and a paper of one file sit side by side without a clash", async () => {
    const dir = tree({ "a.md": quiz() });
    expect(await runBuild(["a.md"], base, capture(dir).io)).toBe(0);
    expect(await runBuild(["a.md"], print(), capture(dir).io)).toBe(0);
    expect(readdirSync(dir).sort()).toEqual(["a-print.html", "a.html", "a.md"]);
  });

  it("is a page with no script: black ink, the plan's paper, and no runtime in it", async () => {
    const dir = tree({ "quiz.md": quiz() });
    await runBuild(["quiz.md"], print(), capture(dir).io);
    const html = read(dir, "quiz-print.html");
    expect(html).not.toContain("<script");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('class="paper"');
  });

  it("is byte-identical across runs, and --built-at changes nothing", async () => {
    const dir = tree({ "quiz.md": quiz() });
    await runBuild(["quiz.md"], print({ builtAt: "2026-10-28T10:00:00+07:00", seed: "101" }), capture(dir).io);
    const first = read(dir, "quiz-print.html");
    await runBuild(["quiz.md"], print({ builtAt: "2030-01-01T00:00:00Z", seed: "101" }), capture(dir).io);
    expect(read(dir, "quiz-print.html")).toBe(first);
    await runBuild(["quiz.md"], print({ builtAt: null, seed: "101" }), capture(dir).io);
    expect(read(dir, "quiz-print.html")).toBe(first);
  });

  it("follows ui_lang and --ui-lang", async () => {
    const dir = tree({ "vi.md": quiz("- [x] a\n- [ ] b", "title: T\nui_lang: vi"), "en.md": quiz() });
    await runBuild(["vi.md", "en.md"], print(), capture(dir).io);
    expect(read(dir, "vi-print.html")).toContain('<html lang="vi">');
    expect(read(dir, "vi-print.html")).toContain("Câu 1.");
    await runBuild(["en.md"], print({ uiLang: "vi" }), capture(dir).io);
    expect(read(dir, "en-print.html")).toContain("Câu 1.");
  });

  it("--json gives the page's object, with the paper's path", async () => {
    const dir = tree({ "quiz.md": quiz() });
    const c = capture(dir);
    expect(await runBuild(["quiz.md"], print({ json: true }), c.io)).toBe(0);
    const line = JSON.parse(c.out[0] ?? "") as Record<string, unknown>;
    expect(line).toMatchObject({ status: "built", output: "quiz-print.html", errors: [], warnings: [] });
    expect(typeof line.bytes).toBe("number");
  });

  it("check errors write nothing and exit 1", async () => {
    const dir = tree({ "bad.md": bad });
    const c = capture(dir);
    expect(await runBuild(["bad.md"], print(), c.io)).toBe(1);
    expect(readdirSync(dir)).toEqual(["bad.md"]);
  });

  it("an answer sheet with nothing to put on it is a warning, and an error with --strict", async () => {
    const short = quiz("```answer\naccept: [a]\n```", "title: T", "Q {type=short id=q}");
    const dir = tree({ "s.md": short });
    const c = capture(dir);
    expect(await runBuild(["s.md"], print({ answerSheet: true }), c.io)).toBe(0);
    expect(c.out.join("\n")).toContain(
      "warning build.answer-sheet-empty: no single-choice or true/false question for the answer sheet",
    );
    expect(existsSync(join(dir, "s-print.html"))).toBe(true);
    const strict = tree({ "s.md": short });
    expect(await runBuild(["s.md"], print({ answerSheet: true, strict: true }), capture(strict).io)).toBe(1);
    expect(existsSync(join(strict, "s-print.html"))).toBe(false);
  });
});

describe("build --print: the refusals", () => {
  const refused = async (opts: Partial<BuildOptions>, files: Record<string, string> = { "quiz.md": quiz() }) => {
    const dir = tree(files);
    const c = capture(dir);
    const code = await runBuild(["quiz.md"], { ...base, ...opts }, c.io);
    return { code, err: c.err, written: readdirSync(dir).filter((f) => f.endsWith(".html")) };
  };

  it("--seed and --answer-sheet need --print", async () => {
    expect(await refused({ seed: "7" })).toEqual({ code: 2, err: ["--seed needs --print"], written: [] });
    expect(await refused({ answerSheet: true })).toEqual({
      code: 2,
      err: ["--answer-sheet needs --print"],
      written: [],
    });
  });

  it("a seed that is not 1 to 8 letters or digits exits 2 with the plan's message, before anything is checked", async () => {
    for (const seed of ["", "123456789", "a b", "mã"]) {
      const r = await refused({ print: true, seed }, { "quiz.md": bad });
      expect(r.code).toBe(2);
      expect(r.err).toEqual([`seed "${seed}" must be 1 to 8 letters or digits`]);
      expect(r.written).toEqual([]);
    }
    expect((await refused({ seed: "bad!" })).err).toEqual(['seed "bad!" must be 1 to 8 letters or digits']);
  });

  it("--answers and --materials need --print", async () => {
    expect((await refused({ answers: "key" })).err).toEqual(["--answers needs --print"]);
    expect((await refused({ materials: "none" })).err).toEqual(["--materials needs --print"]);
  });

  it("--answers takes none, key or inline; --materials takes none; anything else exits 2", async () => {
    const a = await refused({ print: true, answers: "all" });
    expect(a).toEqual({ code: 2, err: ["--answers all is not one of none, key, inline"], written: [] });
    const m = await refused({ print: true, materials: "all" });
    expect(m).toEqual({ code: 2, err: ["--materials all is not none"], written: [] });
  });

  it("--answer-sheet with --answers inline exits 2", async () => {
    const r = await refused({ print: true, answers: "inline", answerSheet: true });
    expect(r).toEqual({ code: 2, err: ["`--answer-sheet` needs `--answers none` or `key`"], written: [] });
  });

  it("--answers key and inline write the paper with the key; --materials none on a quiz without materials says nothing", async () => {
    const dir = tree({ "quiz.md": quiz() });
    expect(await runBuild(["quiz.md"], print({ answers: "key", output: "k.html" }), capture(dir).io)).toBe(0);
    expect(read(dir, "k.html")).toContain('class="key-page"');
    expect(await runBuild(["quiz.md"], print({ answers: "inline", output: "i.html" }), capture(dir).io)).toBe(0);
    expect(read(dir, "i.html")).toContain('class="answer-block"');
    const c = capture(dir);
    expect(await runBuild(["quiz.md"], print({ materials: "none", output: "m.html" }), c.io)).toBe(0);
    expect(c.out).toEqual(["quiz.md: wrote m.html"]);
    expect(c.err).toEqual([]);
  });

  it("build.answer-sheet-empty is held to the profile's level: the exam profile makes it an error", async () => {
    const short = quiz("```answer\naccept: [a]\n```", "title: T", "Q {type=short id=q}");
    const dir = tree({ "s.md": short });
    const c = capture(dir);
    expect(await runBuild(["s.md"], print({ answerSheet: true, profile: "exam" }), c.io)).toBe(1);
    expect(existsSync(join(dir, "s-print.html"))).toBe(false);
  });
});

describe("the build file's print, seed and answer-sheet", () => {
  const file = (toml: string, extra: Record<string, string> = {}) => ({ "build.toml": toml, "a.md": quiz(), ...extra });
  const run = async (files: Record<string, string>, opts: Partial<BuildOptions> = {}) => {
    const dir = tree(files);
    const c = capture(dir);
    const code = await runBuild([], { ...base, builtAt: null, buildFile: "build.toml", ...opts }, c.io);
    return { dir, code, c };
  };

  it("builds a paper for an entry with print, and a page for another", async () => {
    const r = await run(
      file(
        '[[build]]\nfiles = ["a.md"]\nprint = true\nseed = 101\nanswer-sheet = true\n[[build]]\nfiles = ["a.md"]\nout = "site"\n',
      ),
    );
    expect(r.code).toBe(0);
    expect(r.c.out.slice(0, 2)).toEqual(["a.md: wrote a-print.html", "a.md: wrote site/a.html"]);
    const paper = read(r.dir, "a-print.html");
    expect(paper).toContain("Paper code: <b>101</b>");
    expect(paper).toContain('class="gn"');
  });

  it("two entries of one file with two seeds, into one folder, clash, and the fix stands", async () => {
    const r = await run(
      file(
        'out = "x"\nprint = true\n[[build]]\nfiles = ["a.md"]\nseed = 101\n[[build]]\nfiles = ["a.md"]\nseed = 102\n',
      ),
    );
    expect(r.code).toBe(2);
    expect(r.c.err.join("\n")).toContain("would both write x/a-print.html");
    expect(r.c.err.join("\n")).toContain("fix: give each entry its own out");
  });

  it("two seeds in two folders build two papers that differ only as the plan does", async () => {
    const many = Array.from({ length: 6 }, (_, i) => `## Q${i} {type=single id=q${i}}\n\n- [x] a\n- [ ] b\n`).join(
      "\n",
    );
    const q = `---\ntitle: T\nshuffle_questions: true\n---\n\n${many}`;
    const r = await run(
      file(
        'print = true\n[[build]]\nfiles = ["a.md"]\nseed = "x1"\nout = "one"\n[[build]]\nfiles = ["a.md"]\nseed = "x2"\nout = "two"\n',
        { "a.md": q },
      ),
    );
    expect(r.code).toBe(0);
    expect(read(r.dir, "one/a-print.html")).not.toBe(read(r.dir, "two/a-print.html"));
  });

  it("refuses seed or answer-sheet without print, naming the line", async () => {
    const seed = await run(file('[[build]]\nfiles = ["a.md"]\nseed = 7\n'));
    expect(seed.code).toBe(2);
    expect(seed.c.err.join("\n")).toContain("build.toml:3: `seed` needs `print = true` in the same entry");
    const sheet = await run(file('[[build]]\nfiles = ["a.md"]\nanswer-sheet = true\n'));
    expect(sheet.c.err.join("\n")).toContain("build.toml:3: `answer-sheet` needs `print = true` in the same entry");
    expect(readdirSync(seed.dir).filter((f) => f.endsWith(".html"))).toEqual([]);
  });

  it("answers and materials in the file work as the flags, with the same refusals", async () => {
    const r = await run(file('[[build]]\nfiles = ["a.md"]\nprint = true\nanswers = "key"\nmaterials = "none"\n'));
    expect(r.code).toBe(0);
    expect(read(r.dir, "a-print.html")).toContain('class="key-page"');
    const noPrint = await run(file('[[build]]\nfiles = ["a.md"]\nanswers = "key"\n'));
    expect(noPrint.c.err.join("\n")).toContain("build.toml:3: `answers` needs `print = true` in the same entry");
    const noPrintM = await run(file('[[build]]\nfiles = ["a.md"]\nmaterials = "none"\n'));
    expect(noPrintM.c.err.join("\n")).toContain("build.toml:3: `materials` needs `print = true` in the same entry");
    const both = await run(
      file('[[build]]\nfiles = ["a.md"]\nprint = true\nanswers = "inline"\nanswer-sheet = true\n'),
    );
    expect(both.code).toBe(2);
    expect(both.c.err.join("\n")).toContain('build.toml:5: `answer-sheet` needs `answers = "none"`');
    const bad = await run(file('[[build]]\nfiles = ["a.md"]\nprint = true\nanswers = "all"\n'));
    expect(bad.c.err.join("\n")).toContain("build.toml:4: answers all is not one of none, key, inline");
  });

  it("--print on the command line makes an entry's seed legal; a flag beats the file", async () => {
    const r = await run(file('[[build]]\nfiles = ["a.md"]\nseed = 7\n'), { print: true, seed: "9" });
    expect(r.code).toBe(0);
    expect(read(r.dir, "a-print.html")).toContain("Paper code: <b>9</b>");
  });

  it("a seed in the file that is not 1 to 8 letters or digits is refused with its line", async () => {
    const r = await run(file('[[build]]\nfiles = ["a.md"]\nprint = true\nseed = 123456789\n'));
    expect(r.code).toBe(2);
    expect(r.c.err.join("\n")).toContain('build.toml:4: seed "123456789" must be 1 to 8 letters or digits');
  });
});
