import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The startup budget (TECHNICAL_DESIGN.md, section 7): fullmark's own share of `quiz --version` and `quiz check` on a
 * small quiz is under its limit below (a command loads only what it uses: test/cli-graph.test.ts). The share is the median of the CLI's time minus the median of a bare `node -e ""`, both
 * timed in this run the same number of times, so a slow moment of the laptop moves both. `npm test` runs this file on
 * its own, after the others. A share over the limit is measured once more (the best of the two counts). All three
 * numbers are printed with --silent=false.
 */
/**
 * Set from three runs on 2026-10-30 (2h2): the best of each run's two rounds was 35, 16 and 1 ms for `--version` and
 * 98, 92 and 114 ms for `check`; each limit is the largest of those times 1.5, rounded up to the next 10 ms.
 */
const LIMIT_VERSION_MS = 60;
const LIMIT_CHECK_MS = 180;
const RUNS = 7;
const ROUNDS = 2;
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
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

function median(args: string[], quiz: boolean): number {
  const times: number[] = [];
  const env: Record<string, string | undefined> = {
    ...process.env,
    NO_COLOR: "1",
    HOME: dir,
    USERPROFILE: dir,
    APPDATA: dir,
    XDG_CONFIG_HOME: dir,
  };
  delete env.FULLMARK_CONFIG;
  for (let i = 0; i < RUNS; i++) {
    const start = process.hrtime.bigint();
    const r = spawnSync(process.execPath, args, { cwd: dir, env, stdio: "ignore" });
    times.push(Number(process.hrtime.bigint() - start) / 1e6);
    if (quiz) expect(r.status).toBe(0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(RUNS / 2)] ?? Number.NaN;
}

/** The median of the CLI's time minus the median of bare Node's, measured together so the two see the same load. */
function share(label: string, args: string[], limit: number): number {
  const rounds: number[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    const bare = median(["-e", ""], false);
    const cliTime = median([cli, ...args], true);
    rounds.push(cliTime - bare);
    console.log(
      `startup: ${label}: CLI ${cliTime.toFixed(0)} ms, bare Node ${bare.toFixed(0)} ms, share ${(cliTime - bare).toFixed(0)} ms (limit ${limit} ms)`,
    );
    if ((rounds.at(-1) ?? Number.POSITIVE_INFINITY) < limit) break;
  }
  return Math.min(...rounds);
}

describe("startup budget", () => {
  it("quiz --version costs under its limit beyond bare Node", () => {
    expect(share("quiz --version", ["--version"], LIMIT_VERSION_MS)).toBeLessThan(LIMIT_VERSION_MS);
  }, 60_000);

  it("quiz check on a small quiz costs under its limit beyond bare Node", () => {
    expect(share("quiz check", ["check", "quiz.md"], LIMIT_CHECK_MS)).toBeLessThan(LIMIT_CHECK_MS);
  }, 60_000);
});
