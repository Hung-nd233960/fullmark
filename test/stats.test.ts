import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Answer } from "../src/core/attempt/answers";
import { en } from "../src/core/i18n";
import { buildReport, type Report } from "../src/core/report";
import { renderStats, summarise } from "../src/core/stats";
import { attemptFor, quizOf } from "./helpers/grading";

/** A report from the real builder: a quiz, a version's hash, the answers and when they were submitted. */
function reportOf(
  body: string,
  answers: Record<string, Answer | null>,
  opts: {
    hash?: string;
    at?: string;
    front?: string;
    ids?: string[];
    source?: "full" | "section" | "retry";
    section?: string;
  } = {},
): Report {
  const quiz = quizOf(body, opts.front ?? "id: stats-quiz");
  const base = attemptFor(answers, opts.ids);
  const attempt = {
    ...base,
    plan: { ...base.plan, source: opts.source ?? "full", ...(opts.section ? { section: opts.section } : {}) },
    state: { ...base.state, submittedAt: opts.at ?? "2026-10-03T10:00:00" },
  };
  return buildReport({ quiz, quizHash: opts.hash ?? "a".repeat(64), attempt }, en.report);
}

const single = (id: string, tags = "", prompt = "Pick one.") =>
  `## ${prompt} {type=single id=${id}${tags ? ` tags=${tags}` : ""}}\n\n- [x] right\n- [ ] wrong`;
const right: Answer = { choice: 0 };
const wrong: Answer = { choice: 1 };

describe("stats: an attempt counts only the questions it had", () => {
  const body = `# One {id=one}\n\n${single("a", "x")}\n\n${single("b", "y")}\n\n# Two {id=two}\n\n${single("c", "x")}`;

  it("a section attempt and a retry are scored on their own questions, not as a low score on the whole quiz", () => {
    const full = reportOf(body, { a: right, b: wrong, c: right }, { at: "2026-10-03T10:00:00" });
    const section = reportOf(
      body,
      { c: right },
      { at: "2026-10-10T10:00:00", source: "section", section: "two", ids: ["c"] },
    );
    const retry = reportOf(body, { b: right }, { at: "2026-10-17T10:00:00", source: "retry", ids: ["b"] });
    const s = summarise([
      { file: "retry.json", report: retry },
      { file: "full.json", report: full },
      { file: "section.json", report: section },
    ]);
    expect(s.attempts.map((a) => [a.file, a.plan, a.percent])).toEqual([
      ["full.json", { source: "full", section: null }, 66.67],
      ["section.json", { source: "section", section: "two" }, 100],
      ["retry.json", { source: "retry", section: null }, 100],
    ]);
    const x = s.tags.find((t) => t.tag === "x");
    expect(x).toMatchObject({ earned: 3, points: 3, percent: 100, attempts: 2 });
    expect(s.tags.find((t) => t.tag === "y")).toMatchObject({ earned: 1, points: 2, attempts: 2 });
    expect(s.questions.find((q) => q.id === "b")).toMatchObject({ seen: 2, missed: 1, earned: 1, points: 2 });
    expect(renderStats(s)[1]).toBe("Attempts   3 Oct 67% · 10 Oct 100% (section two) · 17 Oct 100% (retry)");
  });

  it("the weakest tags are the lowest of those seen in two attempts, at most three, 'no tag' left out", () => {
    const text = [
      single("a", "t1"),
      single("b", "t2"),
      single("c", "t3"),
      single("d", "t4"),
      single("e", "t5"),
      single("f"),
    ].join("\n\n");
    const one = reportOf(
      text,
      { a: wrong, b: wrong, c: right, d: wrong, e: wrong, f: wrong },
      { at: "2026-10-01T10:00:00" },
    );
    const two = reportOf(
      text,
      { a: wrong, b: right, c: wrong, d: wrong, f: wrong },
      { at: "2026-10-02T10:00:00", ids: ["a", "b", "c", "d", "f"] },
    );
    const s = summarise([
      { file: "1", report: one },
      { file: "2", report: two },
    ]);
    // t5 was seen once: it is no candidate; t1 0%, t4 0%, t3 50%, t2 50%
    expect(s.weakest).toEqual(["t1", "t4", "t2"]);
    expect(s.tags.at(-1)?.tag).toBeNull();
  });
});

describe("stats: questions across versions", () => {
  it("matches by id, marks a changed question, and takes the title from the newest report", () => {
    const v1 = reportOf(
      single("q", "t", "Old wording."),
      { q: wrong },
      { hash: "1".repeat(64), at: "2026-10-01T10:00:00" },
    );
    const v2 = reportOf(
      single("q", "t", "New wording."),
      { q: wrong },
      { hash: "2".repeat(64), at: "2026-10-02T10:00:00" },
    );
    const s = summarise([
      { file: "v1.json", report: v1 },
      { file: "v2.json", report: v2 },
    ]);
    expect(s.questions).toEqual([
      expect.objectContaining({
        id: "q",
        title: "New wording.",
        seen: 2,
        missed: 2,
        changed: true,
        hash: v2.questions[0]?.hash,
      }),
    ]);
    expect(s.attempts.map((a) => a.version)).toEqual(["1".repeat(64), "2".repeat(64)]);
    expect(renderStats(s)[0]).toBe("stats-quiz · T · 2 attempts, 2 versions");
    const same = summarise([
      { file: "a", report: v2 },
      { file: "b", report: v2 },
    ]);
    expect(same.questions[0]?.changed).toBe(false);
  });

  it("names questions and tags from the current source when it is given", () => {
    const old = reportOf(single("q", "old-tag", "Old wording."), { q: wrong }, { at: "2026-10-01T10:00:00" });
    const s = summarise(
      [
        { file: "a", report: old },
        { file: "b", report: old },
      ],
      { title: "Current title", questions: new Map([["q", { title: "Current wording.", tags: ["new-tag"] }]]) },
    );
    expect(s.quiz.title).toBe("Current title");
    expect(s.questions[0]?.title).toBe("Current wording.");
    expect(s.tags.map((t) => t.tag)).toEqual(["new-tag"]);
  });
});

describe("stats: pending grades are not yet scored", () => {
  it("an essay waiting for a grader adds to pending and to no score", () => {
    const body = `${single("a", "t")}\n\n## Write. {type=essay id=e points=4 tags=t}\n\n\`\`\`answer\nrubric:\n  mode: additive\n  criteria:\n    - {id: c, text: C, points: 4}\n\`\`\``;
    const r = reportOf(body, { a: right, e: { text: "words" } }, { at: "2026-10-01T10:00:00" });
    const s = summarise([
      { file: "a", report: r },
      { file: "b", report: r },
    ]);
    expect(s.attempts[0]).toMatchObject({ earned: 1, points: 1, percent: 100, pending: 4 });
    expect(s.questions.map((q) => q.id)).toEqual(["a"]);
    expect(s.criteria).toEqual([]);
    expect(renderStats(s)[1]).toContain("(4 points pending)");
  });
});

describe("stats: a survey shows its answers over time", () => {
  it("has no score and lists each attempt's answer per question", () => {
    const body = `## Where? {type=single id=w}\n\n- [ ] Home\n- [ ] Library`;
    const a = reportOf(body, { w: { choice: 0 } }, { front: "id: sv\nkind: survey", at: "2026-10-01T10:00:00" });
    const b = reportOf(body, { w: { choice: 1 } }, { front: "id: sv\nkind: survey", at: "2026-10-08T10:00:00" });
    const s = summarise([
      { file: "b", report: b },
      { file: "a", report: a },
    ]);
    expect(s.attempts.map((x) => x.percent)).toEqual([null, null]);
    expect(s.tags).toEqual([]);
    expect(s.answers).toEqual([
      {
        question: "w",
        hash: a.questions[0]?.hash,
        title: "Where?",
        answers: [
          { file: "a", submitted: "2026-10-01T10:00:00", answer: "Home" },
          { file: "b", submitted: "2026-10-08T10:00:00", answer: "Library" },
        ],
      },
    ]);
    expect(renderStats(s).join("\n")).toContain('w "Where?"  1 Oct: Home · 8 Oct: Library');
  });
});

describe("stats: criteria from the fixture reports (made by `quiz grade --json`)", () => {
  const dir = resolve(import.meta.dirname, "fixtures", "stats", "reports");
  const reports = readdirSync(dir)
    .filter((f) => f.startsWith("a"))
    .sort()
    .map((f) => ({ file: f, report: JSON.parse(readFileSync(join(dir, f), "utf8")) as Report }));

  it("additive criteria give a percent of the marks, banded ones the average band", () => {
    const s = summarise(reports);
    const get = (q: string, c: string) => s.criteria.find((x) => x.question === q && x.criterion === c);
    expect(get("add", "derive")).toEqual({
      question: "add",
      criterion: "derive",
      earned: 4.5,
      max: 6,
      percent: 75,
      band: null,
      attempts: 4,
    });
    expect(get("ielts", "TR")).toMatchObject({ earned: null, percent: null, band: 5.9, attempts: 4 });
  });

  it("five attempts over two versions give the summary in COMMANDS.md's shape", () => {
    const s = summarise(reports);
    expect(s.attempts).toHaveLength(5);
    expect(new Set(s.attempts.map((a) => a.version)).size).toBe(2);
    const lines = renderStats(s);
    expect(lines.map((l) => l.split(" ")[0])).toEqual(["study", "Attempts", "Tags", "Weakest", "Missed", "Criteria"]);
    expect(s.questions.find((q) => q.id === "prime")?.changed).toBe(true);
  });

  it("the attempt totals add up to the report's scores", () => {
    for (const { report } of reports) {
      const s = summarise([{ file: "x", report }]);
      expect(s.attempts[0]?.earned).toBe(report.score?.earned);
      const scored = report.questions.filter((q) => q.points > 0 && q.status !== "pending" && q.status !== "ungraded");
      expect(scored.reduce((n, q) => n + q.points, 0)).toBe(report.score?.points);
    }
  });
});

describe("stats: a report whose question has an empty id (G21)", () => {
  it("exits 1 with the fix, since such questions would merge under one key", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { runStats } = await import("../src/cli/stats");
    const { capture } = await import("./helpers/cli");
    const dir = mkdtempSync(join(tmpdir(), "fullmark-stats-"));
    try {
      const names = readdirSync(resolve(__dirname, "fixtures/stats/reports")).sort();
      const report = JSON.parse(readFileSync(resolve(__dirname, "fixtures/stats/reports", names[0] as string), "utf8"));
      report.questions[0].id = "";
      writeFileSync(join(dir, "a-report.json"), JSON.stringify(report));
      writeFileSync(join(dir, "b-report.json"), JSON.stringify(report));
      const c = capture(dir);
      const code = runStats(["a-report.json", "b-report.json"], { quiz: null, json: false }, c.io);
      expect(code).toBe(1);
      expect(c.err.join("\n")).toContain("run `quiz ids FILE`, then make it again with `quiz grade --json`");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
