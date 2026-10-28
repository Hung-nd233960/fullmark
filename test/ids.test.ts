import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Io, randomId, runIds, seededIds } from "../src/cli/ids";
import { applyIds, planIds } from "../src/core/ids";
import { parse } from "../src/core/parse";

const root = resolve(import.meta.dirname, "..");
const cli = join(root, "dist", "cli.js");

// -- the pure part -------------------------------------------------------------------------------------------

const two =
  "---\ntitle: T\n---\n\n## First {type=single}\n\n- [x] a\n- [ ] b\n\n## Second {type=single id=have}\n\n- [x] a\n- [ ] b\n";

describe("planIds", () => {
  it("lists the questions without an id, and the ids in use", () => {
    const plan = planIds(two);
    expect(plan.missing.map((m) => [m.line, m.form])).toEqual([[5, "join"]]);
    expect([...plan.used]).toEqual(["have"]);
    expect(plan.problems).toEqual([]);
  });

  it("uses the three forms: after the last pair, in an empty block, as a new block", () => {
    const text = "---\ntitle: T\n---\n\n## A {type=single}\n\n## B {}\n\n## C\n\n## D { type=short }\n";
    expect(planIds(text).missing.map((m) => m.form)).toEqual(["join", "first", "block", "join"]);
    expect(applyIds(text, planIds(text).missing, ["q-1", "q-2", "q-3", "q-4"])).toBe(
      "---\ntitle: T\n---\n\n## A {type=single id=q-1}\n\n## B {id=q-2}\n\n## C {id=q-3}\n\n## D { type=short id=q-4 }\n",
    );
  });

  it("counts the explicit ids of sections as used", () => {
    expect([...planIds("---\ntitle: T\n---\n\n# Part {id=part-1}\n\n## Q {type=short}\n").used]).toEqual(["part-1"]);
  });

  it("reports a duplicate id at the second heading, and a block that does not parse", () => {
    const dup = planIds("---\ntitle: T\n---\n\n## A {type=short id=x}\n\n## B {type=short id=x}\n");
    expect(dup.problems.map((p) => [p.rule, p.line])).toEqual([["question.id-duplicate", 7]]);
    const bad = planIds("---\ntitle: T\n---\n\n## A {type=short id=}\n");
    expect(bad.problems.map((p) => [p.rule, p.line])).toEqual([["syntax.attributes", 5]]);
  });

  it("does not look inside code or containers", () => {
    const text = "---\ntitle: T\n---\n\n```\n## not a question\n```\n\n::: explanation\n## nor this\n:::\n";
    expect(planIds(text).missing).toEqual([]);
  });

  it("is not fooled by braces in maths in the heading", () => {
    const text = "---\ntitle: T\n---\n\n## Poles of $\\frac{1}{s+2}$ {type=numeric}\n";
    expect(applyIds(text, planIds(text).missing, ["q-1"])).toContain("{type=numeric id=q-1}");
  });
});

describe("applyIds keeps every other byte", () => {
  const ids = ["q-aaaaaa", "q-bbbbbb"];
  const withCrlf = two.replaceAll("\n", "\r\n");

  it("keeps CRLF files CRLF, and a BOM", () => {
    for (const text of [withCrlf, `﻿${two}`, `﻿${withCrlf}`, two.replaceAll("\n", "\r")]) {
      const out = applyIds(text, planIds(text).missing, ["q-aaaaaa"]);
      expect(out.replace(" id=q-aaaaaa", "")).toBe(text);
      expect(out.length).toBe(text.length + " id=q-aaaaaa".length);
    }
  });

  it("keeps trailing spaces, tabs and a missing final newline", () => {
    const text = "---\ntitle: T\n---\n\n## A {type=short}  \n\t\n## B\t\n- [x] a   ";
    const out = applyIds(text, planIds(text).missing, ids);
    expect(out).toBe("---\ntitle: T\n---\n\n## A {type=short id=q-aaaaaa}  \n\t\n## B {id=q-bbbbbb}\t\n- [x] a   ");
  });

  it("writes an id at line 1 when the file has a BOM and no front matter", () => {
    const text = "﻿## A {type=short}\n";
    expect(applyIds(text, planIds(text).missing, ["q-1"])).toBe("﻿## A {type=short id=q-1}\n");
  });

  it("gives a parseable quiz whose question hash is the one it had with that id", () => {
    const withIds = (a: string, b: string) =>
      `---\ntitle: T\n---\n\n## First {type=single id=${a}}\n\n- [x] a\n- [ ] b\n\n## Second {type=single id=${b}}\n\n- [x] a\n- [ ] b\n`;
    const out = applyIds(two, planIds(two).missing, ["q-new"]);
    expect(out).toBe(withIds("q-new", "have").replace("{type=single id=q-new}", "{type=single id=q-new}"));
    const before = parse(withIds("old-id", "have"), "t.md").quiz;
    const after = parse(out, "t.md").quiz;
    expect(after?.sections[0]?.questions.map((q) => q.hash)).toEqual(before?.sections[0]?.questions.map((q) => q.hash));
  });
});

describe("randomId", () => {
  it("is q- and six characters from a-z0-9, and not one already used", () => {
    const used = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = randomId(used);
      expect(id).toMatch(/^q-[a-z0-9]{6}$/);
      expect(used.has(id)).toBe(false);
      used.add(id);
    }
  });
});

describe("seededIds (FULLMARK_TEST_SEED, test-only)", () => {
  it("gives the same ids for the same seed, other ids for another, all of the id format and unused", () => {
    const run = (seed: string) => {
      const next = seededIds(seed);
      const used = new Set<string>(["q-aaaaaa"]);
      return Array.from({ length: 50 }, () => {
        const id = next(used);
        expect(id).toMatch(/^q-[a-z0-9]{6}$/);
        expect(used.has(id)).toBe(false);
        used.add(id);
        return id;
      });
    };
    expect(run("one")).toEqual(run("one"));
    expect(run("one")).not.toEqual(run("two"));
  });

  it("is what the CLI uses when the variable is set, and only then", () => {
    const text = ["---", "title: T", "---", "", "## Q {type=single}", "", "- [x] a", "- [ ] b", ""].join("\n");
    const ids = (seed?: string) => {
      const d = mkdtempSync(join(tmpdir(), "fullmark-seed-"));
      writeFileSync(join(d, "q.md"), text);
      const env = { ...process.env, ...(seed ? { FULLMARK_TEST_SEED: seed } : {}) };
      if (!seed) delete env.FULLMARK_TEST_SEED;
      const r = spawnSync(process.execPath, [cli, "ids", "q.md", "--json"], { cwd: d, env, encoding: "utf8" });
      rmSync(d, { recursive: true, force: true });
      return r.stdout;
    };
    expect(ids("s")).toBe(ids("s"));
    expect(ids("s")).not.toBe(ids("t"));
    expect(ids()).not.toBe(ids());
  });
});

// -- the command ---------------------------------------------------------------------------------------------

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fullmark-ids-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(args: string[], newId?: Io["newId"]) {
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = {
    out: (t) => out.push(t),
    err: (t) => err.push(t),
    errRaw: (t) => err.push(t),
    cwd: dir,
    tty: false,
    ...(newId ? { newId } : {}),
  };
  const json = args.includes("--json");
  const dryRun = args.includes("--dry-run");
  const files = args.filter((a) => !a.startsWith("--"));
  return runIds(files, { json, dryRun, plain: true }, io).then((exit) => ({ exit, out, err }));
}

const counter = () => {
  let n = 0;
  return (used: ReadonlySet<string>) => {
    let id: string;
    do id = `q-test${String(++n).padStart(2, "0")}`;
    while (used.has(id));
    return id;
  };
};

const write = (name: string, text: string) => {
  mkdirSync(join(dir, name, ".."), { recursive: true });
  writeFileSync(join(dir, name), text);
};
const read = (name: string) => readFileSync(join(dir, name), "utf8");

describe("quiz ids", () => {
  it("adds ids only where they are missing, and a second run is unchanged", async () => {
    write("a.md", two);
    const first = await run(["a.md", "--json"], counter());
    expect(first.exit).toBe(0);
    expect(JSON.parse(first.out[0] ?? "")).toEqual({
      status: "written",
      file: "a.md",
      added: [{ line: 5, id: "q-test01" }],
      problems: [],
    });
    expect(read("a.md")).toBe(two.replace("{type=single}", "{type=single id=q-test01}"));
    const second = await run(["a.md", "--json"], counter());
    expect(second.exit).toBe(0);
    expect(JSON.parse(second.out[0] ?? "")).toEqual({ status: "unchanged", file: "a.md", added: [], problems: [] });
    expect(read("a.md")).toBe(two.replace("{type=single}", "{type=single id=q-test01}"));
  });

  it("never gives an id already in the file, section ids included", async () => {
    write("a.md", "---\ntitle: T\n---\n\n# S {id=q-test01}\n\n## A {type=short id=q-test02}\n\n## B {type=short}\n");
    const r = await run(["a.md", "--json"], counter());
    expect(JSON.parse(r.out[0] ?? "").added).toEqual([{ line: 9, id: "q-test03" }]);
  });

  it("writes CRLF files with CRLF, byte for byte apart from the insertions", async () => {
    const text = `﻿${two.replaceAll("\n", "\r\n")}`;
    write("crlf.md", text);
    await run(["crlf.md"], () => "q-crlf01");
    expect(read("crlf.md")).toBe(text.replace("{type=single}", "{type=single id=q-crlf01}"));
  });

  it("--dry-run lists the ids and writes nothing", async () => {
    write("a.md", two);
    const r = await run(["a.md", "--dry-run", "--json"], counter());
    expect(r.exit).toBe(0);
    expect(JSON.parse(r.out[0] ?? "").added).toEqual([{ line: 5, id: "q-test01" }]);
    expect(read("a.md")).toBe(two);
    const human = await run(["a.md", "--dry-run"], counter());
    expect(human.out.join("\n")).toContain("would add 1 id");
  });

  it("leaves a file with a duplicate id or a block that does not parse untouched, with exit 1", async () => {
    const dup = "---\ntitle: T\n---\n\n## A {type=short id=x}\n\n## B {type=short id=x}\n\n## C {type=short}\n";
    const bad = "---\ntitle: T\n---\n\n## A {type=short id=}\n\n## B {type=short}\n";
    write("dup.md", dup);
    write("bad.md", bad);
    const r = await run(["dup.md", "bad.md", "--json"], counter());
    expect(r.exit).toBe(1);
    const lines = r.out.map((l) => JSON.parse(l));
    expect(lines[0]).toMatchObject({
      status: "problems",
      file: "dup.md",
      added: [],
      problems: [{ rule: "question.id-duplicate", line: 7 }],
    });
    expect(lines[1]).toMatchObject({
      status: "problems",
      file: "bad.md",
      problems: [{ rule: "syntax.attributes", line: 5 }],
    });
    expect(lines[2]).toEqual({ status: "done", ok: 0, failed: 2 });
    expect(read("dup.md")).toBe(dup);
    expect(read("bad.md")).toBe(bad);
  });

  it("does not run check: a quiz with other errors still gets its ids", async () => {
    write("a.md", "---\ntitle: T\n---\n\n## A {type=single}\n\nNo choices at all.\n");
    const r = await run(["a.md"], () => "q-aaaaaa");
    expect(r.exit).toBe(0);
    expect(read("a.md")).toContain("{type=single id=q-aaaaaa}");
  });

  it("handles several files and globs: sorted, one line each, then a summary", async () => {
    write("quizzes/b.md", two);
    write("quizzes/a.md", two);
    write("quizzes/done.md", two.replace("{type=single}", "{type=single id=d}"));
    const r = await run(["quizzes/*.md", "quizzes/a.md", "--json"], counter());
    expect(r.exit).toBe(0);
    const lines = r.out.map((l) => JSON.parse(l));
    expect(lines.map((l) => [l.status, l.file])).toEqual([
      ["written", "quizzes/a.md"],
      ["written", "quizzes/b.md"],
      ["unchanged", "quizzes/done.md"],
      ["done", undefined],
    ]);
    expect(lines[3]).toEqual({ status: "done", ok: 3, failed: 0 });
  });

  it("every input is attempted, and a missing file or a folder is exit 2", async () => {
    write("a.md", two);
    mkdirSync(join(dir, "folder"));
    const r = await run(["missing.md", "folder", "a.md", "--json"], counter());
    expect(r.exit).toBe(2);
    const lines = r.out.map((l) => JSON.parse(l));
    expect(lines.map((l) => l.status)).toEqual(["error", "error", "written", "done"]);
    expect(lines[1].message).toContain("folder");
    expect(lines[3]).toEqual({ status: "done", ok: 1, failed: 2 });
    expect(read("a.md")).toContain("id=q-test01");
  });

  it("exit 2 for a glob with no match, and for a file that is not UTF-8", async () => {
    expect((await run(["*.nothing", "--json"])).exit).toBe(2);
    writeFileSync(join(dir, "latin1.md"), Buffer.from([0x2d, 0x2d, 0x2d, 0x0a, 0xe9, 0x0a]));
    const r = await run(["latin1.md", "--json"]);
    expect(r.exit).toBe(2);
    expect(JSON.parse(r.out[0] ?? "").message).toContain("UTF-8");
    expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("prints a plain line per file without --json", async () => {
    write("a.md", two);
    const r = await run(["a.md"], counter());
    expect(r.out).toEqual(["a.md: added 1 id", "  line 5: q-test01"]);
  });
});

describe("quiz ids through the bundle", () => {
  const quiz = (args: string[]) => spawnSync("node", [cli, "ids", ...args], { cwd: dir, encoding: "utf8" });

  it("adds ids and prints one JSON line per file", () => {
    write("a.md", two);
    const r = quiz(["a.md", "--json"]);
    expect(r.status).toBe(0);
    const line = JSON.parse(r.stdout.trim());
    expect(line.status).toBe("written");
    expect(line.added[0].id).toMatch(/^q-[a-z0-9]{6}$/);
    expect(read("a.md")).toContain(`id=${line.added[0].id}}`);
    expect(parse(read("a.md"), "a.md").issues.filter((i) => i.rule === "question.id-missing")).toEqual([]);
  });

  it("exits 1 for problems, 2 for a missing file and for a missing argument", () => {
    write("dup.md", "---\ntitle: T\n---\n\n## A {type=short id=x}\n\n## B {type=short id=x}\n");
    expect(quiz(["dup.md"]).status).toBe(1);
    expect(quiz(["nope.md"]).status).toBe(2);
    expect(quiz([]).status).toBe(2);
  });
});
