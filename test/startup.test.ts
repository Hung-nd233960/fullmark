import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The startup budget (TECHNICAL_DESIGN.md, section 7): `quiz --version` and `quiz check` on a small quiz each take under
 * 150 ms. Each is run 7 times through the built bundle and the median is judged. The test files run side by side, so a
 * busy machine can spoil one round of 7: a median over the limit is measured again, up to three rounds, and the best
 * round counts. The medians are printed so that a run shows how much room is left.
 */
const LIMIT_MS = 150;
const RUNS = 7;
const ROUNDS = 3;
const cli = resolve(import.meta.dirname, "..", "dist", "cli.js");

const QUIZ = [
  "---",
  "title: Small quiz",
  "---",
  "",
  "## Which number is prime? {type=single id=prime tags=numbers}",
  "",
  "- [ ] Four, which is two times two",
  "- [x] Seven, which has no divisors but one and itself",
  "- [ ] Nine, which is three times three",
  "",
  "::: explanation",
  "Seven has no divisors except one and itself, so it is prime. Four and nine are squares.",
  ":::",
  "",
].join("\n");

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "fullmark-startup-"));
  mkdirSync(join(dir, ".git"));
  writeFileSync(join(dir, "quiz.md"), QUIZ);
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function median(args: string[]): number {
  const times: number[] = [];
  const env = { ...process.env, NO_COLOR: "1", HOME: dir, USERPROFILE: dir, APPDATA: dir, XDG_CONFIG_HOME: dir };
  delete env.FULLMARK_CONFIG;
  for (let i = 0; i < RUNS; i++) {
    const start = process.hrtime.bigint();
    const r = spawnSync(process.execPath, [cli, ...args], { cwd: dir, env, stdio: "ignore" });
    times.push(Number(process.hrtime.bigint() - start) / 1e6);
    expect(r.status).toBe(0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(RUNS / 2)] ?? Number.NaN;
}

function best(label: string, args: string[]): number {
  const rounds: number[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    rounds.push(median(args));
    if ((rounds.at(-1) ?? Number.POSITIVE_INFINITY) <= LIMIT_MS) break;
  }
  const result = Math.min(...rounds);
  console.log(`startup: ${label} median of ${RUNS} runs: ${result.toFixed(0)} ms (limit ${LIMIT_MS} ms)`);
  return result;
}

describe("startup budget", () => {
  it("quiz --version is under 150 ms", () => {
    expect(best("quiz --version", ["--version"])).toBeLessThan(LIMIT_MS);
  }, 60_000);

  it("quiz check on a small quiz is under 150 ms", () => {
    expect(best("quiz check", ["check", "quiz.md"])).toBeLessThan(LIMIT_MS);
  }, 60_000);
});
