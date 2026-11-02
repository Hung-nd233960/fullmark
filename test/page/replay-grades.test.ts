import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { afterAll, describe, expect, it } from "vitest";
import { pageQuizOf } from "../../src/build/page";
import { loadQuiz } from "../../src/cli/load";
import { readReplay } from "../../src/cli/replay";
import { App } from "../../src/page/App";
import type { PageQuiz } from "../../src/page/data";
import { createStore, type QuizState } from "../../src/page/store";
import { capture } from "../helpers/cli";

/**
 * The grades on a replay page (STEP2.md, slice 2j2): each graded essay or code answer shows its table and the grader's
 * line exactly as the grades file says, and the score counts them as `quiz grade` does (19.25 of 25 for this file).
 */
const fixtures = resolve(import.meta.dirname, "..", "fixtures", "replay");
const work = mkdtempSync(join(tmpdir(), "fullmark-replay-grades-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

type Grades = { grader: { at?: string }; grades: Record<string, unknown> };
type Edit = (grades: Grades) => void;

/** The fixture's replay page in a store, with the grades file edited by `edit` (null: no grades file at all). */
function pageOf(edit: Edit | null, uiLang: "en" | "vi" = "en", name = "case") {
  const dir = join(work, name);
  cpSync(fixtures, dir, { recursive: true });
  if (edit === null) rmSync(join(dir, "essay-results-grades.json"));
  else {
    const path = join(dir, "essay-results-grades.json");
    const grades = JSON.parse(readFileSync(path, "utf8"));
    edit(grades);
    writeFileSync(path, JSON.stringify(grades));
  }
  const loaded = loadQuiz(join(dir, "essay.md"));
  const io = capture(dir).io;
  const read = readReplay("essay-results.json", { quiz: "essay.md", loaded, grades: null, open: "default" }, io);
  if (!read.ok) throw new Error(read.problems.join("\n"));
  const page: PageQuiz = pageQuizOf({
    quiz: loaded.quiz as never,
    hash: loaded.hash as string,
    assets: [],
    uiLang,
    replay: read.replay,
  });
  const store = createStore({ version: 1, quizzes: [page] });
  const state = store.quizzes.get(page.id) as QuizState;
  return { store, state, html: renderToString(h(App, { store })), page };
}

const card = (html: string, id: string): string => {
  const at = html.indexOf(`data-qid="${id}"`);
  const start = html.lastIndexOf("<article", at);
  return html.slice(start, html.indexOf("</article>", at));
};
const text = (html: string): string =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe("grades on a replay page", () => {
  it("scores what `quiz grade` scores and shows no pending note", () => {
    const { state, html } = pageOf((g) => g);
    const total = state.graded.value;
    expect(total?.questions.map((q) => q.status)).not.toContain("pending");
    const earned = total?.questions.reduce((sum, q) => sum + (q.earned ?? 0), 0);
    expect(earned).toBe(19.25);
    expect(html).not.toContain("data-pending-note");
    expect(html).toContain('data-pending="0"');
  });

  it("shows an additive table: each criterion's awarded and maximum points and note, and the grader's line", () => {
    const { html } = pageOf((g) => g);
    const add = text(card(html, "add"));
    expect(add).toContain("Criterion Awarded Max Note");
    expect(add).toContain("Define the terms 0.5 0.5");
    expect(add).toContain("Derive the result 1.25 1.5 Skips the zero initial-conditions assumption.");
    expect(add).toContain("Interpret it 0.5 1 Does not link the result to stability.");
    expect(add).toContain("Graded by Claude Opus 5.5 · 24 Oct 2026 · 2.25 / 3 points");
    expect(add).toContain("Solid derivation; the interpretation is the weak part.");
    const code = text(card(html, "code"));
    expect(code).toContain("Is short and clear 0.5 1 x + x works, but 2 * x is the usual form.");
    expect(code).toContain("Graded by Claude Opus 5.5 · 24 Oct 2026 · 1.5 / 2 points");
  });

  it("shows a banded table: the band per criterion, the overall band and the points", () => {
    const { html } = pageOf((g) => g);
    const ielts = text(card(html, "ielts"));
    expect(ielts).toContain("Criterion Band Note");
    expect(ielts).toContain("Task Response 6 Room to improve here.");
    expect(ielts).toContain("Overall band 6.5 of 9");
    expect(ielts).toMatch(/Graded by Claude Opus 5\.5 · 24 Oct 2026 · [\d.]+ \/ 9 points/);
  });

  it("shows a holistic grade: the verdicts, the grader's words, the score", () => {
    const { html, state } = pageOf((g) => g);
    const holistic = text(card(html, "holistic"));
    const detail = state.replay.value?.grades?.details.find((d) => d.id === "holistic");
    expect(holistic).toContain("Graded by");
    expect(holistic).toContain(`${detail?.earned} / 4 points`);
    for (const c of detail?.criteria ?? []) expect(c.verdict === null || holistic.includes("met")).toBe(true);
  });

  it("a grades file without a date shows the grader's line without one", () => {
    const { html } = pageOf(
      (g) => {
        delete g.grader.at;
      },
      "en",
      "nodate",
    );
    const add = text(card(html, "add"));
    expect(add).toContain("Graded by Claude Opus 5.5 · 2.25 / 3 points");
    expect(add).not.toContain("2026 ·");
  });

  it("without grades the essays and code stay pending, with no table", () => {
    const { html, state } = pageOf(null, "en", "none");
    expect(state.graded.value?.questions.filter((q) => q.status === "pending").map((q) => q.id)).toEqual([
      "add",
      "ielts",
      "banded",
      "holistic",
      "code",
    ]);
    expect(html).not.toContain("fm-grade-table");
    expect(html).not.toContain("data-grader");
    expect(html).toContain("data-pending-note");
  });

  it("a question the grades file leaves out stays pending beside the graded ones", () => {
    const { state } = pageOf(
      (g) => {
        delete g.grades.code;
      },
      "en",
      "partial",
    );
    const by = new Map(state.graded.value?.questions.map((q) => [q.id, q.status]));
    expect(by.get("code")).toBe("pending");
    expect(by.get("add")).not.toBe("pending");
  });

  it("the same results, quiz and grades give the same page, byte for byte", () => {
    const a = pageOf((g) => g, "en", "same-a");
    const b = pageOf((g) => g, "en", "same-b");
    expect(a.html).toBe(b.html);
    expect(JSON.stringify(a.page)).toBe(JSON.stringify(b.page));
  });

  it("in Vietnamese the table and the line use the catalog", () => {
    const { html } = pageOf((g) => g, "vi", "vi");
    const add = text(card(html, "add"));
    expect(add).toContain("Tiêu chí Được Tối đa Ghi chú");
    expect(add).toContain("Chấm bởi Claude Opus 5.5 · 24 thg 10 2026 · 2,25 trên 3 điểm");
    expect(add).not.toContain("Graded by");
  });
});
