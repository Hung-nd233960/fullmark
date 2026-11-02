import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BuildIo } from "../src/cli/build";
import { loadQuiz } from "../src/cli/load";
import { type ReplayCommandOptions, runReplay } from "../src/cli/replay-command";
import { resultsOf } from "../src/core/attempt";
import { capture, quiz, tempTree } from "./helpers/cli";
import { attemptFor } from "./helpers/grading";

const QUIZ = quiz("- [x] a\n- [ ] b");
const OPTS: ReplayCommandOptions = {
  quiz: "q.md",
  grades: null,
  output: null,
  builtAt: "2026-10-28T10:00:00+07:00",
  uiLang: null,
  fonts: null,
  plain: true,
  json: false,
  open: false,
  noOpen: true,
  version: "1.0.0-test",
};

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

/** A results file for the quiz in `dir`, as the page writes it (`results-v2`, two-space indent, a final newline). */
function results(dir: string, answers = { q: { choice: 0 } }, hash?: string): string {
  const quizHash = hash ?? (loadQuiz(join(dir, "q.md")).hash as string);
  return `${JSON.stringify(resultsOf({ ...attemptFor(answers), quizHash }), null, 2)}\n`;
}

describe("replay", () => {
  it("writes the page beside the results file, with -replay.html, and never over a built page", async () => {
    const base = tree({ "q.md": QUIZ });
    const r = results(base);
    const d = tree({ "q.md": QUIZ, "q.html": "built page", "sub/attempt-results-1.json": r, "sub/other.json": r });
    const c = capture(d);
    expect(await runReplay(["sub/attempt-results-1.json"], OPTS, c.io)).toBe(0);
    expect(c.out).toEqual(["sub/attempt-results-1.json: wrote sub/attempt-results-1-replay.html"]);
    expect(existsSync(join(d, "sub/attempt-results-1-replay.html"))).toBe(true);
    expect(readFileSync(join(d, "q.html"), "utf8")).toBe("built page");
  });

  it("-o names the page for one file and a folder for several", async () => {
    const base = tree({ "q.md": QUIZ });
    const r = results(base);
    const d = tree({ "q.md": QUIZ, "a.json": r, "b.json": r });
    const one = capture(d);
    expect(await runReplay(["a.json"], { ...OPTS, output: "out/one.html" }, one.io)).toBe(0);
    expect(existsSync(join(d, "out/one.html"))).toBe(true);
    const two = capture(d);
    expect(await runReplay(["*.json"], { ...OPTS, output: "pages" }, two.io)).toBe(0);
    expect(two.out).toEqual([
      "a.json: wrote pages/a-replay.html",
      "b.json: wrote pages/b-replay.html",
      "2 done, 0 failed",
    ]);
  });

  it("an attempt taken on another version exits 1 and names that version; nothing is written", async () => {
    const d = tree({ "q.md": QUIZ });
    const other = tree({ "a.json": results(d, { q: { choice: 0 } }, `ab12${"0".repeat(60)}`) });
    const dir = tree({ "q.md": QUIZ, "a.json": readFileSync(join(other, "a.json"), "utf8") });
    const c = capture(dir);
    expect(await runReplay(["a.json"], OPTS, c.io)).toBe(1);
    const hash = (loadQuiz(join(dir, "q.md")).hash as string).slice(0, 4);
    expect(c.err).toEqual([
      `a.json: the attempt was taken on version ab12, but q.md is version ${hash}: replay it with the quiz as it was then`,
    ]);
    expect(existsSync(join(dir, "a-replay.html"))).toBe(false);
  });

  it("a results file that does not parse exits 1 with grade's message; a missing one exits 2", async () => {
    const dir = tree({ "q.md": QUIZ, "bad.json": "{}" });
    const c = capture(dir);
    expect(await runReplay(["bad.json"], OPTS, c.io)).toBe(1);
    expect(c.err).toEqual(['bad.json: not a results file: its format is not "fullmark-results"']);
    const d = capture(dir);
    expect(await runReplay(["missing.json"], OPTS, d.io)).toBe(2);
  });

  it("an answer that does not fit its question exits 1, as grade says it", async () => {
    const base = tree({ "q.md": QUIZ });
    const dir = tree({ "q.md": QUIZ, "a.json": results(base, { q: { choice: "x" } } as never) });
    const c = capture(dir);
    expect(await runReplay(["a.json"], OPTS, c.io)).toBe(1);
    expect(c.err).toEqual([
      "a.json: q: `choice` does not fit a single question: Invalid input: expected number, received string",
    ]);
  });

  it("--quiz: a quiz with errors exits 1, a missing one 2", async () => {
    const dir = tree({ "q.md": quiz("- [x] only one"), "a.json": "{}" });
    const c = capture(dir);
    expect(await runReplay(["a.json"], OPTS, c.io)).toBe(1);
    expect(c.err[0]).toContain("the quiz has errors");
    const none = capture(dir);
    expect(await runReplay(["a.json"], { ...OPTS, quiz: "nope.md" }, none.io)).toBe(2);
    expect(none.err).toEqual(["nope.md: cannot read the quiz: no such file"]);
  });

  it("--json prints status, output, bytes, attempt and graded", async () => {
    const base = tree({ "q.md": QUIZ });
    const dir = tree({ "q.md": QUIZ, "a.json": results(base) });
    const c = capture(dir);
    expect(await runReplay(["a.json"], { ...OPTS, json: true }, c.io)).toBe(0);
    const line = JSON.parse(c.out[0] as string);
    expect(Object.keys(line)).toEqual(["status", "output", "bytes", "attempt", "graded"]);
    expect(line).toMatchObject({ status: "built", output: "a-replay.html", graded: false });
    expect(line.bytes).toBe(readFileSync(join(dir, "a-replay.html")).length);
    expect(line.attempt).toMatchObject({ phase: "submitted", submittedAt: "2026-10-23T16:30:00" });
  });

  it("several files: the worst exit, a summary, and one bad file does not stop the others", async () => {
    const base = tree({ "q.md": QUIZ });
    const dir = tree({ "q.md": QUIZ, "a.json": results(base), "b.json": "{}", "c.json": results(base) });
    const c = capture(dir);
    expect(await runReplay(["a.json", "b.json", "c.json"], OPTS, c.io)).toBe(1);
    expect(c.out.at(-1)).toBe("2 done, 1 failed");
    expect(existsSync(join(dir, "c-replay.html"))).toBe(true);
  });

  it("--grades takes one results file only", async () => {
    const dir = tree({ "q.md": QUIZ, "a.json": "{}", "b.json": "{}", "g.json": "{}" });
    const c = capture(dir);
    expect(await runReplay(["a.json", "b.json"], { ...OPTS, grades: "g.json" }, c.io)).toBe(2);
    expect(c.err).toEqual(["--grades takes one results file: it grades one attempt"]);
  });

  it("a replay is byte-identical for the same input, and --built-at pins it", async () => {
    const base = tree({ "q.md": QUIZ });
    const dir = tree({ "q.md": QUIZ, "a.json": results(base) });
    await runReplay(["a.json"], OPTS, capture(dir).io);
    const first = readFileSync(join(dir, "a-replay.html"));
    await runReplay(["a.json"], OPTS, capture(dir).io);
    expect(readFileSync(join(dir, "a-replay.html")).equals(first)).toBe(true);
  });

  describe("--open", () => {
    const run = async (files: string[], o: Partial<ReplayCommandOptions>) => {
      const base = tree({ "q.md": QUIZ });
      const r = results(base);
      const dir = tree({ "q.md": QUIZ, ...Object.fromEntries(files.map((f) => [f, r])) });
      const opened: string[] = [];
      const c = capture(dir);
      (c.io as BuildIo).open = (p) => void opened.push(p);
      const code = await runReplay(files, { ...OPTS, noOpen: false, ...o }, c.io);
      return { code, opened, c, dir };
    };

    it("opens the page by default for one file", async () => {
      const { opened, dir } = await run(["a.json"], {});
      expect(opened).toEqual([join(dir, "a-replay.html")]);
    });
    it("opens nothing for several files, and nothing with --no-open", async () => {
      expect((await run(["a.json", "b.json"], {})).opened).toEqual([]);
      expect((await run(["a.json"], { noOpen: true })).opened).toEqual([]);
    });
    it("--open with several files says so and opens nothing", async () => {
      const { opened, c } = await run(["a.json", "b.json"], { open: true });
      expect(opened).toEqual([]);
      expect(c.err).toEqual(["--open opens one page; built 2"]);
    });
  });
});
