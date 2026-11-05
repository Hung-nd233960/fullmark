import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { localIso, type ReviewOptions, runReview } from "../../src/cli/review";
import type { ServeIo } from "../../src/cli/serve";
import { reviewCounts } from "../../src/core/review/counts";
import { readReview } from "../../src/core/review/read";
import type { Judged } from "../../src/core/review/reasons";
import type { ReviewData } from "../../src/review/data";

/**
 * `runReview` with the clock, the timer, Ctrl+C and the opener injected, as test/serve/serve-cli.test.ts has `runServe`:
 * the server binds port 0 and is driven with `fetch`; no test waits for a real timeout or sends a signal.
 */
const QUIZ = `---
title: Tiny
id: tiny
---

## Which one? {type=single id=pick-one}

- [x] one
- [ ] two

## How many? {type=numeric id=how-many}

\`\`\`answer
value: 3
\`\`\`

## Explain it. {type=essay id=explain}

\`\`\`answer
rubric:
  - Names the cause (2)
  - Gives an example (1)
\`\`\`
`;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

function setup(quiz: string = QUIZ) {
  const dir = mkdtempSync(join(tmpdir(), "fm-review-unit-"));
  dirs.push(dir);
  mkdirSync(join(dir, ".git"));
  writeFileSync(join(dir, "quiz.md"), quiz);
  const out: string[] = [];
  const err: string[] = [];
  const opened: string[] = [];
  let interrupt: (() => void) | undefined;
  let fire: (() => void) | undefined;
  const at = { now: new Date(2026, 10, 3, 9, 5, 7) };
  const io: ServeIo = {
    out: (t) => out.push(t),
    err: (t) => err.push(t),
    errRaw: (t) => err.push(t),
    cwd: dir,
    tty: false,
    now: () => at.now,
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
  const options = (extra: Partial<ReviewOptions> = {}): ReviewOptions => ({
    out: null,
    since: null,
    timeout: null,
    open: false,
    port: null,
    json: true,
    profile: null,
    config: null,
    version: "1.0.0-test",
    ...extra,
  });
  return { dir, io, out, err, opened, options, at, interrupt: () => interrupt?.(), timeout: () => fire?.() };
}

async function listening(out: string[]): Promise<string> {
  for (let i = 0; i < 300; i++) {
    if (out[0]) return (JSON.parse(out[0]) as { url: string }).url;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("never listened");
}

const post = (url: string, body: unknown) => {
  const port = new URL(url).port;
  return fetch(`${url}submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` },
    body: JSON.stringify(body),
  });
};

/** The data block of the served form. */
async function dataOf(url: string): Promise<ReviewData> {
  const html = await (await fetch(url)).text();
  const m = /<script type="application\/json" id="fm-data">([\s\S]*?)<\/script>/.exec(html);
  return JSON.parse(m?.[1] ?? "") as ReviewData;
}

const keep: Judged = { verdict: "keep", reasons: [], note: "" };
const assumed: Judged = { verdict: "keep", reasons: [], note: "", assumed: true };
const fix: Judged = { verdict: "fix", reasons: ["key-wrong"], note: "the key says 1" };

/** A submit body for the quiz as served: the id and hash come from the form's own data. */
async function body(url: string, judged: Record<string, Judged>) {
  const data = await dataOf(url);
  const page = data.page.quizzes[0];
  return { quizId: page.id, quizHash: page.hash, judged };
}

const read = (path: string) => {
  const r = readReview(readFileSync(path, "utf8"));
  if (!r.ok) throw new Error(r.problems.join("; "));
  return r.review;
};

describe("quiz review", () => {
  it("prints listening, serves the form, writes review.json next to the quiz and prints the counts", async () => {
    const t = setup();
    const done = runReview("quiz.md", t.options({ open: true }), t.io);
    const url = await listening(t.out);
    expect(t.opened).toEqual([url]);
    expect(t.err.join("\n")).toContain("waiting for Finish (Ctrl+C to stop)");
    const reply = await post(url, await body(url, { "pick-one": keep, "how-many": assumed, explain: fix }));
    expect(reply.status).toBe(200);
    expect(await done).toBe(0);
    expect(JSON.parse(t.out[1] ?? "")).toEqual({ status: "written", review: "review.json", keep: 2, fix: 1, drop: 0 });
    const review = read(join(t.dir, "review.json"));
    expect(review.quizId).toBe("tiny");
    expect(review.questions["pick-one"]).toMatchObject({ verdict: "keep", reasons: [], note: "" });
    expect(review.questions["how-many"]).toMatchObject({ verdict: "keep", assumed: true });
    expect(review.questions.explain).toMatchObject({ verdict: "fix", reasons: ["key-wrong"], note: "the key says 1" });
    // a fix keeps the block as judged, so `review --since` can show what changed
    expect(review.questions.explain?.source).toContain("## Explain it.");
    expect(review.questions["pick-one"]).not.toHaveProperty("source");
  });

  it("takes reviewedAt from the injected clock, in local time with its offset", async () => {
    const t = setup();
    const done = runReview("quiz.md", t.options(), t.io);
    const url = await listening(t.out);
    await post(url, await body(url, { "pick-one": keep, "how-many": keep, explain: keep }));
    await done;
    const { reviewedAt } = read(join(t.dir, "review.json"));
    expect(reviewedAt).toBe(localIso(new Date(2026, 10, 3, 9, 5, 7)));
    expect(reviewedAt).toMatch(/^2026-11-03T09:05:07[+-]\d\d:\d\d$/);
    expect(new Date(reviewedAt).getTime()).toBe(new Date(2026, 10, 3, 9, 5, 7).getTime());
  });

  it("says it in words without --json, with the next command, and omits (0 not looked at)", async () => {
    const t = setup();
    const done = runReview("quiz.md", t.options({ json: false, out: "mine/review.json" }), t.io);
    for (let i = 0; i < 300 && !t.err.some((l) => l.startsWith("reviewing")); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const url = /at (http\S+)/.exec(t.err.join("\n"))?.[1] ?? "";
    await post(
      url,
      await body(url, {
        "pick-one": keep,
        "how-many": keep,
        explain: { ...fix, verdict: "drop", reasons: ["duplicate"] },
      }),
    );
    expect(await done).toBe(0);
    expect(t.out).toEqual([
      "mine/review.json written: 2 keep, 0 fix, 1 drop",
      "next: quiz check quiz.md --review mine/review.json",
    ]);
    expect(existsSync(join(t.dir, "mine", "review.json"))).toBe(true);
  });

  it("merges into an existing review: new verdicts replace, the others stay, also those of questions gone", async () => {
    const first = setup();
    const done1 = runReview("quiz.md", first.options(), first.io);
    const url1 = await listening(first.out);
    await post(url1, await body(url1, { "pick-one": fix, "how-many": keep, explain: keep }));
    await done1;
    const file = join(first.dir, "review.json");
    // a question the quiz no longer has: its entry is history, and stays
    const earlier = JSON.parse(readFileSync(file, "utf8"));
    earlier.questions["gone-id"] = { verdict: "keep", reasons: [], note: "old", hash: "a".repeat(64) };
    writeFileSync(file, JSON.stringify(earlier));

    const second = setup();
    writeFileSync(join(second.dir, "review.json"), readFileSync(file));
    second.at.now = new Date(2026, 10, 4, 10, 0, 0);
    const done2 = runReview("quiz.md", second.options(), second.io);
    const url2 = await listening(second.out);
    await post(url2, await body(url2, { "pick-one": keep, "how-many": keep, explain: keep }));
    await done2;
    const merged = read(join(second.dir, "review.json"));
    expect(merged.questions["pick-one"]?.verdict).toBe("keep");
    expect(merged.questions["gone-id"]).toMatchObject({ note: "old" });
    expect(merged.reviewedAt).toBe(localIso(new Date(2026, 10, 4, 10, 0, 0)));
    // counted over the quiz's current questions: the one that is gone is left out
    expect(JSON.parse(second.out[1] ?? "")).toMatchObject({ keep: 3, fix: 0, drop: 0 });
  });

  it("opens with the earlier verdicts whose question is unchanged (G53) and writes them back unchanged", async () => {
    const first = setup();
    const done1 = runReview("quiz.md", first.options(), first.io);
    const url1 = await listening(first.out);
    await post(url1, await body(url1, { "pick-one": fix, "how-many": assumed, explain: keep }));
    await done1;
    const before = read(join(first.dir, "review.json"));

    // the quiz changes: the essay's rubric, so its hash differs; the other two stay
    const second = setup(QUIZ.replace("Gives an example (1)", "Gives two examples (1)"));
    writeFileSync(join(second.dir, "review.json"), readFileSync(join(first.dir, "review.json")));
    const done2 = runReview("quiz.md", second.options(), second.io);
    const url2 = await listening(second.out);
    const data = await dataOf(url2);
    expect(Object.keys(data.earlier).sort()).toEqual(["how-many", "pick-one"]);
    expect(data.earlier["pick-one"]).toEqual({ verdict: "fix", reasons: ["key-wrong"], note: "the key says 1" });
    expect(data.earlier["how-many"]).toEqual({ verdict: "keep", reasons: [], note: "", assumed: true });
    // the form sends what it holds: the earlier verdicts as they were, and a verdict for the changed question
    await post(
      url2,
      await body(url2, { "pick-one": data.earlier["pick-one"] as Judged, "how-many": assumed, explain: keep }),
    );
    await done2;
    const after = read(join(second.dir, "review.json"));
    expect(after.questions["pick-one"]).toEqual(before.questions["pick-one"]);
    expect(after.questions["how-many"]).toEqual(before.questions["how-many"]);
    expect(after.questions.explain?.hash).not.toBe(before.questions.explain?.hash);
    expect(after.quizHash).not.toBe(before.quizHash);
  });

  it("--since writes back every question it did not ask byte for byte, into its own file (G59)", async () => {
    const first = setup();
    const done1 = runReview("quiz.md", first.options(), first.io);
    const url1 = await listening(first.out);
    await post(url1, await body(url1, { "pick-one": fix, "how-many": assumed, explain: keep }));
    await done1;
    const text = readFileSync(join(first.dir, "review.json"), "utf8");
    const before = JSON.parse(text);
    // the essay changes and a question is added: only those two are asked
    const next = `${QUIZ.replace("Gives an example (1)", "Gives two examples (1)")}
## Is it? {type=single id=is-it}

- [x] yes
- [ ] no
`;
    const t = setup(next);
    writeFileSync(join(t.dir, "elsewhere.json"), text);
    // --out beside --since is allowed when it names the same file
    const done = runReview("quiz.md", t.options({ since: "elsewhere.json", out: "./elsewhere.json" }), t.io);
    const url = await listening(t.out).catch((e) => {
      throw new Error(`${e} ${t.out} ${t.err}`);
    });
    const data = await dataOf(url);
    expect(Object.keys(data.earlier).sort()).toEqual(["how-many", "pick-one"]);
    const sent = { "pick-one": data.earlier["pick-one"] as Judged, "how-many": data.earlier["how-many"] as Judged };
    await post(url, await body(url, { ...sent, explain: keep, "is-it": keep }));
    expect(await done).toBe(0);
    expect(existsSync(join(t.dir, "review.json"))).toBe(false);
    const after = JSON.parse(readFileSync(join(t.dir, "elsewhere.json"), "utf8"));
    expect(JSON.stringify(after.questions["pick-one"])).toBe(JSON.stringify(before.questions["pick-one"]));
    expect(JSON.stringify(after.questions["how-many"])).toBe(JSON.stringify(before.questions["how-many"]));
    expect(after.questions.explain).toMatchObject({ verdict: "keep" });
    expect(after.questions.explain.hash).not.toBe(before.questions.explain.hash);
    expect(after.questions["is-it"]).toMatchObject({ verdict: "keep" });
    expect(JSON.parse(t.out[1] ?? "")).toEqual({
      status: "written",
      review: "elsewhere.json",
      keep: 3,
      fix: 1,
      drop: 0,
    });
  });

  it("--since with nothing new or changed serves nothing and leaves the file alone (G60)", async () => {
    const first = setup();
    const done1 = runReview("quiz.md", first.options(), first.io);
    const url1 = await listening(first.out);
    await post(url1, await body(url1, { "pick-one": fix, "how-many": keep, explain: keep }));
    await done1;
    const t = setup();
    const original = readFileSync(join(first.dir, "review.json"));
    writeFileSync(join(t.dir, "review.json"), original);
    expect(await runReview("quiz.md", t.options({ since: "review.json", json: false }), t.io)).toBe(0);
    expect(t.out).toEqual(["nothing new or changed since your review of 3 Nov"]);
    expect(readFileSync(join(t.dir, "review.json")).equals(original)).toBe(true);
  });

  it("counts what it wrote as inspect --review counts it", async () => {
    const t = setup();
    const done = runReview("quiz.md", t.options(), t.io);
    const url = await listening(t.out);
    await post(url, await body(url, { "pick-one": keep, "how-many": assumed, explain: assumed }));
    await done;
    const review = read(join(t.dir, "review.json"));
    expect(JSON.parse(t.out[1] ?? "")).toMatchObject({ keep: 3, fix: 0, drop: 0 });
    // the same counting function, on the same file
    const quizData = (await import("../../src/cli/load")).loadQuiz(join(t.dir, "quiz.md")).quiz;
    expect(quizData && reviewCounts(quizData, review)).toMatchObject({ keep: 3, assumed: 2, fix: 0, drop: 0 });
  });

  it("answers 400 for another version, another quiz, a missing or unknown id and a broken verdict, and goes on", async () => {
    const t = setup();
    const done = runReview("quiz.md", t.options(), t.io);
    const url = await listening(t.out);
    const good = await body(url, { "pick-one": keep, "how-many": keep, explain: keep });
    const refused = async (b: unknown, words: string) => {
      const r = await post(url, b);
      expect(r.status).toBe(400);
      expect(await r.text()).toContain(words);
    };
    await refused({ ...good, quizHash: "b".repeat(64) }, "another version");
    await refused({ ...good, quizId: "other" }, 'not "other"');
    await refused({ ...good, judged: { "pick-one": keep, "how-many": keep } }, "explain: no verdict");
    await refused({ ...good, judged: { ...good.judged, nope: keep } }, 'no question with the id "nope"');
    await refused(
      { ...good, judged: { ...good.judged, explain: { verdict: "fix", reasons: [], note: "" } } },
      "needs at least one reason",
    );
    await refused(
      { ...good, judged: { ...good.judged, explain: { verdict: "fix", reasons: ["other"], note: " " } } },
      "needs a note",
    );
    await refused(
      { ...good, judged: { ...good.judged, "pick-one": { verdict: "fix", reasons: ["rubric-loose"], note: "" } } },
      "is for essays and code",
    );
    await refused(
      { ...good, judged: { ...good.judged, explain: { verdict: "maybe", reasons: [], note: "" } } },
      "not keep, fix or drop",
    );
    await refused(
      { ...good, judged: { ...good.judged, explain: { verdict: "fix", reasons: ["bogus"], note: "" } } },
      "known reasons",
    );
    await refused(
      {
        ...good,
        judged: { ...good.judged, explain: { verdict: "fix", reasons: ["unclear"], note: "", assumed: true } },
      },
      "only a keep can be assumed",
    );
    await refused("[]", "not a review");
    // nothing was written, the server is still waiting, and a good submit goes through
    expect(existsSync(join(t.dir, "review.json"))).toBe(false);
    expect((await post(url, good)).status).toBe(200);
    expect(await done).toBe(0);
  });

  it("leaves an existing --out byte for byte on Ctrl+C, and on a timeout", async () => {
    const seed = setup();
    const d0 = runReview("quiz.md", seed.options(), seed.io);
    const u0 = await listening(seed.out);
    await post(u0, await body(u0, { "pick-one": keep, "how-many": keep, explain: keep }));
    await d0;
    const original = readFileSync(join(seed.dir, "review.json"));

    const t = setup();
    writeFileSync(join(t.dir, "review.json"), original);
    const done = runReview("quiz.md", t.options(), t.io);
    await listening(t.out);
    t.interrupt();
    expect(await done).toBe(2);
    expect(JSON.parse(t.out[1] ?? "")).toEqual({ status: "interrupted" });
    expect(readFileSync(join(t.dir, "review.json")).equals(original)).toBe(true);

    const u = setup();
    writeFileSync(join(u.dir, "review.json"), original);
    const timed = runReview("quiz.md", u.options({ timeout: "7" }), u.io);
    await listening(u.out);
    u.timeout();
    expect(await timed).toBe(2);
    expect(JSON.parse(u.out[1] ?? "")).toEqual({ status: "timeout" });
    expect(u.err.join("\n")).toContain("timed out after 7 seconds without a Finish; nothing was written");
    expect(readFileSync(join(u.dir, "review.json")).equals(original)).toBe(true);
  });

  it("refuses an --out that has changed into one check --review would refuse, when Finish arrives", async () => {
    const t = setup();
    const done = runReview("quiz.md", t.options(), t.io);
    const url = await listening(t.out);
    writeFileSync(join(t.dir, "review.json"), "{not json");
    const r = await post(url, await body(url, { "pick-one": keep, "how-many": keep, explain: keep }));
    expect(r.status).toBe(400);
    expect(await r.text()).toContain("review.json is not a usable review");
    expect(readFileSync(join(t.dir, "review.json"), "utf8")).toBe("{not json");
    t.interrupt();
    expect(await done).toBe(2);
  });

  it("serves a form whose page carries the review script by hash and nothing from the page runtime", async () => {
    const t = setup();
    const done = runReview("quiz.md", t.options(), t.io);
    const url = await listening(t.out);
    const response = await fetch(url);
    const html = await response.text();
    const csp = /Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("default-src 'none'");
    expect((html.match(/<script(?! type="application\/json")>/g) ?? []).length).toBe(1);
    expect(html).toContain('<div id="fm-root"></div>');
    const data = await dataOf(url);
    expect(data.out).toBe("review.json");
    expect(data.check).toBe("quiz check quiz.md --review review.json");
    // every question of the quiz, in source order
    expect(data.page.quizzes[0].sections.flatMap((s) => s.questions.map((q) => q.id))).toEqual([
      "pick-one",
      "how-many",
      "explain",
    ]);
    // the rubric is shown whatever `show_rubric` says
    t.interrupt();
    await done;
  });
});
