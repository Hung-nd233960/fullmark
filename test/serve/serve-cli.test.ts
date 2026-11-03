import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runServe, type ServeIo, type ServeOptions } from "../../src/cli/serve";
import type { Attempt } from "../../src/core/attempt";
import { quizHash } from "../../src/core/hash";

/**
 * `runServe` with the clock, the timer, Ctrl+C and the opener injected: no test waits for a real timeout, and none
 * sends a real signal (the subprocess tests in e2e/serve.spec.ts do both).
 */
const root = resolve(import.meta.dirname, "..", "..");
const QUIZ = join(root, "test", "fixtures", "page", "map.md");

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "fm-serve-unit-"));
  mkdirSync(join(dir, ".git"));
  copyFileSync(QUIZ, join(dir, "quiz.md"));
  const out: string[] = [];
  const err: string[] = [];
  let interrupt: (() => void) | undefined;
  let fire: (() => void) | undefined;
  const opened: string[] = [];
  const io: ServeIo = {
    out: (t) => out.push(t),
    err: (t) => err.push(t),
    errRaw: (t) => err.push(t),
    cwd: dir,
    tty: false,
    now: () => new Date(2026, 10, 3, 9, 5, 7),
    open: (url) => {
      opened.push(url);
    },
    onInterrupt: (h) => {
      interrupt = h;
      return () => undefined;
    },
    setTimer: (f) => {
      fire = f;
      return () => undefined;
    },
    machine: { cwd: dir, env: {}, platform: "linux", home: dir },
  };
  const options = (extra: Partial<ServeOptions> = {}): ServeOptions => ({
    out: null,
    timeout: null,
    open: false,
    port: null,
    json: true,
    profile: null,
    config: null,
    fonts: null,
    later: [],
    version: "1.0.0-test",
    ...extra,
  });
  return { dir, io, out, err, opened, options, interrupt: () => interrupt?.(), timeout: () => fire?.() };
}

/** Waits for the `listening` line and returns its url. */
async function listening(out: string[]): Promise<string> {
  for (let i = 0; i < 200; i++) {
    if (out[0]) return (JSON.parse(out[0]) as { url: string }).url;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("never listened");
}

const text = readFileSync(QUIZ, "utf8");
const attempt = (extra: Partial<Attempt> = {}): Attempt => ({
  quizHash: quizHash(text, []),
  plan: { source: "full", questions: ["m1"] },
  state: {
    answers: { m1: { choice: 0 } },
    startedAt: "2026-11-03T09:00:00",
    submittedAt: "2026-11-03T09:01:00",
    timeUsed: 60,
    sectionTime: {},
    flagged: [],
    checked: [],
    timedOut: false,
  },
  phase: "submitted",
  ...extra,
});

const post = (url: string, body: unknown) => {
  const port = new URL(url).port;
  return fetch(`${url}submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` },
    body: JSON.stringify(body),
  });
};

describe("quiz serve", () => {
  it("prints listening, then submitted, and writes the results to the default name in local time", async () => {
    const t = setup();
    const done = runServe("quiz.md", t.options({ open: true }), t.io);
    const url = await listening(t.out);
    expect(t.opened).toEqual([url]);
    expect(t.err.join("\n")).toContain("waiting for Submit (Ctrl+C to stop)");
    const reply = await post(url, { quizId: "map", attempt: attempt() });
    expect(reply.status).toBe(200);
    expect(await done).toBe(0);
    const second = JSON.parse(t.out[1] ?? "");
    expect(second).toMatchObject({ status: "submitted", results: "map-results-20261103-090507.json" });
    expect(second.score.earned).toBe(1);
    const file = join(t.dir, "map-results-20261103-090507.json");
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({
      format: "fullmark-results",
      version: 2,
      phase: "submitted",
    });
    expect(readdirSync(t.dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("answers 400 to an attempt whose answers do not fit the quiz, writes nothing, and keeps waiting", async () => {
    const t = setup();
    const done = runServe("quiz.md", t.options({ out: "r.json" }), t.io);
    const url = await listening(t.out);
    const bad = attempt({ plan: { source: "full", questions: ["m1", "ghost"] } });
    expect((await post(url, { quizId: "map", attempt: bad })).status).toBe(400);
    const wrongShape = attempt();
    wrongShape.state.answers.m1 = { choice: "first" };
    expect((await post(url, { quizId: "map", attempt: wrongShape })).status).toBe(400);
    expect(existsSync(join(t.dir, "r.json"))).toBe(false);
    expect((await post(url, { quizId: "map", attempt: attempt() })).status).toBe(200);
    expect(await done).toBe(0);
    expect(existsSync(join(t.dir, "r.json"))).toBe(true);
  });

  it("on the timeout prints {status: timeout}, writes nothing and exits 2", async () => {
    const t = setup();
    const done = runServe("quiz.md", t.options({ timeout: "30" }), t.io);
    await listening(t.out);
    t.timeout();
    expect(await done).toBe(2);
    expect(JSON.parse(t.out[1] ?? "")).toEqual({ status: "timeout" });
    expect(readdirSync(t.dir).filter((f) => f.includes("results"))).toEqual([]);
  });

  it("on Ctrl+C prints {status: interrupted}, writes nothing and exits 2", async () => {
    const t = setup();
    const done = runServe("quiz.md", t.options(), t.io);
    await listening(t.out);
    t.interrupt();
    expect(await done).toBe(2);
    expect(JSON.parse(t.out[1] ?? "")).toEqual({ status: "interrupted" });
    expect(readdirSync(t.dir).filter((f) => f.includes("results"))).toEqual([]);
  });

  it("exits 2 when the results cannot be written (--out is a folder), and says so", async () => {
    const t = setup();
    mkdirSync(join(t.dir, "taken"));
    const done = runServe("quiz.md", t.options({ out: "taken" }), t.io);
    const url = await listening(t.out);
    expect((await post(url, { quizId: "map", attempt: attempt() })).status).toBe(500);
    expect(await done).toBe(2);
    expect(JSON.parse(t.out[1] ?? "")).toMatchObject({ status: "error" });
  });

  it("exits 2 when the port is in use", async () => {
    const a = setup();
    const first = runServe("quiz.md", a.options(), a.io);
    const url = await listening(a.out);
    const b = setup();
    const code = await runServe("quiz.md", b.options({ port: new URL(url).port }), b.io);
    expect(code).toBe(2);
    expect(b.err.join("\n")).toContain("the port is in use");
    a.interrupt();
    await first;
  });

  it("serves nothing and exits 2 for --timeout and --port that are not numbers", async () => {
    const t = setup();
    expect(await runServe("quiz.md", t.options({ timeout: "-1" }), t.io)).toBe(2);
    expect(await runServe("quiz.md", t.options({ port: "70000" }), t.io)).toBe(2);
    expect(await runServe("quiz.md", t.options({ port: "0" }), t.io)).toBe(2);
  });
});
