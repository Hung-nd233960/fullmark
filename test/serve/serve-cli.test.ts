import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
  const clock: { now: number; timer: { fire(): void; ms: number } | null } = { now: 10_000, timer: null };
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
    // `--autosave`'s once-a-second rule runs on this clock: a test moves it by hand and fires the timer itself
    autosaveClock: {
      now: () => clock.now,
      setTimer: (f, ms) => {
        clock.timer = { fire: f, ms };
        return () => {
          clock.timer = null;
        };
      },
    },
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
    focus: false,
    section: null,
    autosave: null,
    version: "1.0.0-test",
    ...extra,
  });
  return { dir, io, out, err, opened, options, clock, interrupt: () => interrupt?.(), timeout: () => fire?.() };
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

/** The fm-data block of a served page. */
async function dataOf(url: string): Promise<Record<string, unknown>> {
  const html = await (await fetch(url)).text();
  return JSON.parse(/<script type="application\/json" id="fm-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "");
}

const inProgress = (extra: Partial<Attempt> = {}): Attempt =>
  attempt({
    phase: "answering",
    state: { ...attempt().state, submittedAt: null, answers: { m1: { choice: 0 } } },
    ...extra,
  });

const progress = (url: string, body: unknown) => {
  const port = new URL(url).port;
  return fetch(`${url}progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` },
    body: JSON.stringify(body),
  });
};

describe("quiz serve --focus and --section", () => {
  it("--focus puts focus and served in the page's data", async () => {
    const t = setup();
    const done = runServe("quiz.md", t.options({ focus: true }), t.io);
    const url = await listening(t.out);
    const data = await dataOf(url);
    expect(data).toMatchObject({ served: true, focus: true });
    t.interrupt();
    await done;
    const plain = setup();
    const again = runServe("quiz.md", plain.options(), plain.io);
    const data2 = await dataOf(await listening(plain.out));
    expect(data2.served).toBe(true);
    expect(data2).not.toHaveProperty("focus");
    plain.interrupt();
    await again;
  });

  it("--section takes a slug or a title in any case, and leaves that section alone on the page", async () => {
    for (const name of ["sig", "SIG", "signals", "Signals"]) {
      const t = setup();
      const done = runServe("quiz.md", t.options({ section: name }), t.io);
      const data = await dataOf(await listening(t.out));
      expect(data.section, name).toBe("sig");
      expect((data.quizzes as { sections: { id: string }[] }[])[0]?.sections.map((x) => x.id)).toEqual(["sig"]);
      t.interrupt();
      await done;
    }
  });

  it("an unknown section exits 2 before anything is served, listing the valid ones", async () => {
    const t = setup();
    expect(await runServe("quiz.md", t.options({ section: "calculus" }), t.io)).toBe(2);
    expect(JSON.parse(t.out[0] ?? "")).toEqual({
      status: "error",
      message:
        'unknown section "calculus"; the sections are: sig (Signals), fourier (Fourier transform), sampling (Sampling)',
    });
    expect(t.out).toHaveLength(1);
  });

  it("takes a section attempt, which is written as the page made it", async () => {
    const t = setup();
    const done = runServe("quiz.md", t.options({ section: "sig", out: "r.json" }), t.io);
    const url = await listening(t.out);
    const mine = attempt({ plan: { source: "section", section: "sig", questions: ["m1"] } });
    expect((await post(url, { quizId: "map", attempt: mine })).status).toBe(200);
    expect(await done).toBe(0);
    expect(JSON.parse(readFileSync(join(t.dir, "r.json"), "utf8")).plan).toMatchObject({
      source: "section",
      section: "sig",
    });
  });
});

describe("quiz serve --autosave", () => {
  it("has no progress path without --autosave", async () => {
    const t = setup();
    const done = runServe("quiz.md", t.options(), t.io);
    const url = await listening(t.out);
    expect((await progress(url, { quizId: "map", attempt: inProgress() })).status).toBe(404);
    expect(await dataOf(url)).not.toHaveProperty("autosave");
    t.interrupt();
    await done;
  });

  it("writes the progress as results-v2 in progress, at most once a second, and the last body wins", async () => {
    const t = setup();
    const done = runServe("quiz.md", t.options({ autosave: "p.json" }), t.io);
    const url = await listening(t.out);
    expect(await dataOf(url)).toMatchObject({ autosave: true, served: true });
    const file = join(t.dir, "p.json");
    const withAnswer = (n: number): Attempt => {
      const a = inProgress();
      a.state.timeUsed = n;
      return a;
    };
    expect((await progress(url, { quizId: "map", attempt: withAnswer(1) })).status).toBe(204);
    await settled(() => existsSync(file));
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({
      format: "fullmark-results",
      version: 2,
      phase: "answering",
      state: { timeUsed: 1 },
    });
    // within the second: kept, not written
    t.clock.now += 300;
    await progress(url, { quizId: "map", attempt: withAnswer(2) });
    t.clock.now += 300;
    await progress(url, { quizId: "map", attempt: withAnswer(3) });
    await new Promise((r) => setTimeout(r, 30));
    expect(JSON.parse(readFileSync(file, "utf8")).state.timeUsed).toBe(1);
    expect(t.clock.timer?.ms).toBe(700);
    t.clock.now += 400;
    t.clock.timer?.fire();
    await settled(() => JSON.parse(readFileSync(file, "utf8")).state.timeUsed === 3);
    t.interrupt();
    await done;
  });

  it("keeps the last progress on Ctrl+C, even if its second has not passed", async () => {
    const t = setup();
    const done = runServe("quiz.md", t.options({ autosave: "p.json" }), t.io);
    const url = await listening(t.out);
    const file = join(t.dir, "p.json");
    await progress(url, { quizId: "map", attempt: inProgress() });
    await settled(() => existsSync(file));
    const later = inProgress();
    later.state.timeUsed = 9;
    t.clock.now += 100;
    await progress(url, { quizId: "map", attempt: later });
    t.interrupt();
    expect(await done).toBe(2);
    expect(JSON.parse(readFileSync(file, "utf8")).state.timeUsed).toBe(9);
    expect(JSON.parse(t.out[1] ?? "")).toEqual({ status: "interrupted" });
  });

  it("hands a file of the same version to the page, and deletes it once the results are written", async () => {
    const t = setup();
    const file = join(t.dir, "p.json");
    const kept = inProgress();
    writeFileSync(file, `${JSON.stringify({ format: "fullmark-results", version: 2, ...kept })}\n`);
    const done = runServe("quiz.md", t.options({ autosave: "p.json", out: "r.json" }), t.io);
    const url = await listening(t.out);
    const data = (await dataOf(url)) as { saved: { v: number; attempt: Attempt } };
    expect(data.saved.v).toBe(1);
    expect(data.saved.attempt).toEqual(kept);
    expect(t.err.join("\n")).toContain("resuming the attempt kept in p.json");
    expect((await post(url, { quizId: "map", attempt: attempt() })).status).toBe(200);
    expect(await done).toBe(0);
    expect(existsSync(join(t.dir, "r.json"))).toBe(true);
    expect(existsSync(file)).toBe(false);
  });

  it("removes the temp files a killed run left beside the progress file, at the start and once the results are written", async () => {
    const t = setup();
    const left = join(t.dir, ".p.json.0123abcd.tmp");
    const other = join(t.dir, ".q.json.0123abcd.tmp");
    writeFileSync(left, "{");
    writeFileSync(other, "{");
    const done = runServe("quiz.md", t.options({ autosave: "p.json", out: "r.json" }), t.io);
    const url = await listening(t.out);
    expect(existsSync(left)).toBe(false);
    expect(existsSync(other)).toBe(true);
    const during = join(t.dir, ".p.json.89abcdef.tmp");
    writeFileSync(during, "{");
    expect((await post(url, { quizId: "map", attempt: attempt() })).status).toBe(200);
    expect(await done).toBe(0);
    expect(existsSync(during)).toBe(false);
    expect(existsSync(other)).toBe(true);
  });

  it("leaves the temp files alone when the run exits 1 on a wrong progress file", async () => {
    const t = setup();
    const left = join(t.dir, ".p.json.0123abcd.tmp");
    writeFileSync(left, "{");
    writeFileSync(join(t.dir, "p.json"), "not a progress file");
    expect(await runServe("quiz.md", t.options({ autosave: "p.json" }), t.io)).toBe(1);
    expect(existsSync(left)).toBe(true);
  });

  it("exits 1 naming the version for a file of another version, and leaves it alone", async () => {
    const t = setup();
    const file = join(t.dir, "p.json");
    const other = `${JSON.stringify({ format: "fullmark-results", version: 2, ...inProgress({ quizHash: "c".repeat(64) }) })}\n`;
    writeFileSync(file, other);
    expect(await runServe("quiz.md", t.options({ autosave: "p.json" }), t.io)).toBe(1);
    const line = JSON.parse(t.out[0] ?? "");
    expect(line.status).toBe("error");
    expect(line.message).toContain("version cccc");
    expect(line.message).toContain(`version ${quizHash(text, []).slice(0, 4)}`);
    expect(t.out).toHaveLength(1);
    expect(readFileSync(file, "utf8")).toBe(other);
  });

  it("exits 1 for a file that is not a progress file, a submitted attempt, or another section's, leaving it alone", async () => {
    for (const [content, section] of [
      ["not json", null],
      [JSON.stringify({ format: "fullmark-results", version: 2, ...attempt() }), null],
      [JSON.stringify({ format: "fullmark-results", version: 2, ...inProgress() }), "sig"],
    ] as const) {
      const t = setup();
      const file = join(t.dir, "p.json");
      writeFileSync(file, content);
      expect(await runServe("quiz.md", t.options({ autosave: "p.json", section }), t.io)).toBe(1);
      expect(readFileSync(file, "utf8")).toBe(content);
    }
  });

  it("refuses --autosave and --out naming the same file", async () => {
    const t = setup();
    expect(await runServe("quiz.md", t.options({ autosave: "r.json", out: "r.json" }), t.io)).toBe(2);
  });

  it("keeps the section's plan: a section attempt resumes under --section", async () => {
    const t = setup();
    const file = join(t.dir, "p.json");
    const mine = inProgress({ plan: { source: "section", section: "sig", questions: ["m1"] } });
    writeFileSync(file, JSON.stringify({ format: "fullmark-results", version: 2, ...mine }));
    const done = runServe("quiz.md", t.options({ autosave: "p.json", section: "sig" }), t.io);
    const data = (await dataOf(await listening(t.out))) as { saved: { attempt: Attempt }; section: string };
    expect(data.section).toBe("sig");
    expect(data.saved.attempt.plan).toEqual({ source: "section", section: "sig", questions: ["m1"] });
    t.interrupt();
    await done;
  });
});

/** Waits (a few milliseconds at a time) until `ready` holds; the writes are asynchronous, the clock is not real. */
async function settled(ready: () => boolean): Promise<void> {
  for (let i = 0; i < 300; i++) {
    try {
      if (ready()) return;
    } catch {
      // the file is not there yet
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("never settled");
}
