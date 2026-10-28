import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCheck } from "../src/cli/check";
import { runGrade } from "../src/cli/grade";
import { runIds } from "../src/cli/ids";
import { loadQuiz } from "../src/cli/load";
import { resultsOf } from "../src/core/attempt";
import { capture, quiz, tempTree } from "./helpers/cli";
import { attemptFor } from "./helpers/grading";

/** "Progress. On a terminal, stderr shows one updating line, `[3/12] signals.md`" (COMMANDS.md, Several files). */
const trees: { done(): void }[] = [];
afterEach(() => {
  for (const t of trees.splice(0)) t.done();
});

function tree(files: Record<string, string>) {
  const t = tempTree(files);
  trees.push(t);
  return t.dir;
}

/** A capture whose stderr is a terminal, with the raw progress writes recorded. */
function terminal(dir: string) {
  const c = capture(dir);
  const raw: string[] = [];
  c.io.tty = true;
  c.io.errRaw = (t) => raw.push(t);
  return { ...c, raw };
}

const CLEAR = "\r\u001b[K";

describe("the progress line", () => {
  it("check shows [n/total] name for each file on a terminal, and clears it before the result", () => {
    const dir = tree({ "a.md": quiz(), "b.md": quiz() });
    const t = terminal(dir);
    runCheck(
      ["a.md", "b.md"],
      { profile: null, config: null, strict: false, review: null, json: false, plain: false },
      t.io,
    );
    expect(t.raw).toEqual(["\r[1/2] a.md", CLEAR, "\r[2/2] b.md", CLEAR]);
  });

  it("ids shows it too", async () => {
    const dir = tree({ "a.md": quiz(), "b.md": quiz() });
    const t = terminal(dir);
    await runIds(["a.md", "b.md"], { dryRun: true, json: false, plain: false }, t.io);
    expect(t.raw).toEqual(["\r[1/2] a.md", CLEAR, "\r[2/2] b.md", CLEAR]);
  });

  it("grade shows it too", async () => {
    const dir = tree({ "quiz.md": quiz() });
    const hash = loadQuiz(join(dir, "quiz.md")).hash as string;
    for (const name of ["r1.json", "r2.json"]) {
      const attempt = { ...attemptFor({ q: { choice: 0 } }), quizHash: hash };
      writeFileSync(join(dir, name), JSON.stringify(resultsOf(attempt)));
    }
    const t = terminal(dir);
    const opts = { quiz: "quiz.md", output: null, grades: null, json: false, web: false, name: null, plain: false };
    await runGrade(["r1.json", "r2.json"], opts, t.io);
    expect(t.raw).toEqual(["\r[1/2] r1.json", CLEAR, "\r[2/2] r2.json", CLEAR]);
  });

  it("is not shown for one file, with --json, with --plain, or when stderr is not a terminal", () => {
    const dir = tree({ "a.md": quiz(), "b.md": quiz() });
    const base = { profile: null, config: null, strict: false, review: null, json: false, plain: false };
    const one = terminal(dir);
    runCheck(["a.md"], base, one.io);
    const json = terminal(dir);
    runCheck(["a.md", "b.md"], { ...base, json: true }, json.io);
    const plain = terminal(dir);
    runCheck(["a.md", "b.md"], { ...base, plain: true }, plain.io);
    const pipe = capture(dir);
    const raw: string[] = [];
    pipe.io.errRaw = (t) => raw.push(t);
    runCheck(["a.md", "b.md"], base, pipe.io);
    expect([one.raw, json.raw, plain.raw, raw]).toEqual([[], [], [], []]);
  });
});
