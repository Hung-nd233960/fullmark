import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadQuestions } from "../../src/cli/brief-questions";

/**
 * The real command, `node dist/cli.js brief --tui`, answered through a pseudo-terminal made by script(1) (util-linux):
 * the prompts need a terminal on stdin and stderr, which a pipe is not. Ctrl+C is the byte 0x03 typed into the
 * terminal. Linux only; skipped by name where script(1) is not there (macOS's takes other arguments, Windows has none).
 */
const cli = resolve(import.meta.dirname, "..", "..", "dist", "cli.js");
const hasScript =
  process.platform === "linux" &&
  spawnSync("script", ["--version"], { encoding: "utf8" }).stdout.includes("util-linux");
const SCOPE = "lectures 3 to 5, the Fourier transform";
const questions = loadQuestions().questions;
const label = (key: string): string => questions.find((q) => q.key === key)?.label.en ?? key;

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

/** Runs the command under script(1) and feeds `steps`: each waits for a question's label to be drawn, then types. */
function drive(dir: string, steps: [after: string, keys: string][]): Promise<{ code: number | null; out: string }> {
  return new Promise((resolveRun, reject) => {
    const child: ChildProcess = spawn(
      "script",
      ["-qefc", `stty cols 100 rows 50; exec node ${JSON.stringify(cli)} brief d --tui --json`, "/dev/null"],
      { cwd: dir, env: { ...process.env, NO_COLOR: "1", COLUMNS: "100", LINES: "50" } },
    );
    let out = "";
    let at = 0;
    let next = 0;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`timed out; drawn so far:\n${out}`));
    }, 30000);
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      for (;;) {
        const step = steps[next];
        if (!step) return;
        const found = out.indexOf(step[0], at);
        if (found < 0) return;
        at = found + step[0].length;
        next++;
        // one key press at a time, so a prompt that has not started listening is not given the next one's keys
        setTimeout(() => child.stdin?.write(step[1]), 100);
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveRun({ code, out });
    });
  });
}

describe.skipIf(!hasScript)("quiz brief --tui under script(1)", () => {
  it("answers through a pseudo-terminal and writes the brief the flags write", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fullmark-pty-"));
    dirs.push(dir);
    const ENTER = "\r";
    const steps: [string, string][] = [
      [label("purpose"), `${"\x1b[B"}${ENTER}`], // exam-prep
      [label("scope"), `${SCOPE}${ENTER}`],
      ...(
        [
          "content.kinds",
          "content.elsewhere",
          "count",
          "minutes",
          "mix",
          "difficulty",
          "mode",
          "language",
          "request",
          "weak_topics",
          "commitment",
          "profile",
        ] as const
      ).map((key): [string, string] => [label(key), ENTER]),
      ["Your answers", ""],
      ["Ready to write", ENTER],
    ].filter((s): s is [string, string] => s[1] !== "");
    const run = await drive(dir, steps);
    expect(run.code, run.out).toBe(0);
    expect(run.out).toContain('"status":"written"');
    const text = readFileSync(join(dir, "d/brief.yaml"), "utf8");

    const other = mkdtempSync(join(tmpdir(), "fullmark-pty-flags-"));
    dirs.push(other);
    const flags = spawnSync(
      process.execPath,
      [cli, "brief", "d", "--purpose", "exam-prep", "--scope", SCOPE, "--json"],
      { cwd: other, encoding: "utf8" },
    );
    expect(flags.status).toBe(0);
    expect(text).toBe(readFileSync(join(other, "d/brief.yaml"), "utf8"));
  }, 40000);

  it("Ctrl+C mid-form writes nothing and exits 2 with cancelled", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fullmark-pty-"));
    dirs.push(dir);
    const run = await drive(dir, [
      [label("purpose"), "\r"],
      [label("scope"), "lectures 3\x03"],
    ]);
    expect(run.code, run.out).toBe(2);
    expect(run.out).toContain('"status":"cancelled"');
    expect(existsSync(join(dir, "d"))).toBe(false);
  }, 40000);

  it("without a terminal (stdin from /dev/null) it exits 2 with the message", () => {
    const dir = mkdtempSync(join(tmpdir(), "fullmark-pty-"));
    dirs.push(dir);
    const r = spawnSync("sh", ["-c", `node ${JSON.stringify(cli)} brief d --tui < /dev/null`], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("--tui needs an interactive terminal: use --web, or give the answers as flags");
    expect(existsSync(join(dir, "d"))).toBe(false);
  });
});

describe.skipIf(hasScript)("quiz brief --tui under script(1) (skipped: script(1) of util-linux is not here)", () => {
  it.skip("needs Linux and script(1)", () => undefined);
});
