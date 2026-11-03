import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPaper, type PaperOptions } from "../../src/build/paper";
import { katexTools } from "../../src/build/tex";
import { loadQuiz } from "../../src/cli/load";
import { visibleText } from "../helpers/vi-scan";

/** The key page, the study sheet and the materials page (STEP2.md, slice 2k2). */
const root = resolve(import.meta.dirname, "..", "..");
const css = readFileSync(join(root, "dist", "paper.css"), "utf8");
const options: PaperOptions = { css, seed: null, answerSheet: false, math: katexTools() };

function load(file: string) {
  const loaded = loadQuiz(join(root, "test/fixtures/paper", file));
  if (loaded.quiz === null || loaded.hash === null) throw new Error(`${file} does not load`);
  return { quiz: loaded.quiz, hash: loaded.hash, assets: loaded.assets, sheets: loaded.sheets };
}
const exam = load("exam.md");
const rubrics = load("rubrics.md");
const paper = (o: Partial<PaperOptions> = {}, q = exam, uiLang?: "en" | "vi") =>
  buildPaper({ ...q, ...(uiLang ? { uiLang } : {}) }, { ...options, ...o });
const bodyOf = (html: string) => html.slice(html.indexOf("<body>"), html.indexOf("</body>") + 7);
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("the exam paper (answers none)", () => {
  it("keeps 2k's body, byte for byte, for a quiz without materials", () => {
    const was = readFileSync(join(root, "test/fixtures/paper/exam-2k-body.html"), "utf8");
    expect(bodyOf(paper({ seed: "101" }).html)).toBe(was);
    expect(bodyOf(paper({ seed: "101", answers: "none", materials: false }).html)).toBe(was);
  });
  it("has no key page and no answer block", () => {
    const html = bodyOf(paper({ seed: "101" }).html);
    for (const word of ["key-page", "answer-block", "materials-page", "zq-explain", "zq-sample"]) {
      expect(html, word).not.toContain(word);
    }
  });
});

describe("--answers key", () => {
  const key = paper({ seed: "101", answers: "key", answerSheet: true });
  const text = visibleText(key.html);
  it("adds one key page after the paper, headed with the paper code", () => {
    expect(count(key.html, 'class="key-page"')).toBe(1);
    expect(key.html.indexOf('class="key-page"')).toBeGreaterThan(key.html.lastIndexOf('class="q"'));
    expect(text).toContain("Answer key, paper code 101");
    expect(text).toContain("Answer sheet questions");
    expect(text).toContain("Other questions");
  });
  it("fills the grid with the answers and lists the grid questions' explanations", () => {
    const gridAfterKey = key.html.slice(key.html.indexOf('class="key-page"'));
    expect(gridAfterKey).toMatch(/class="gb">[A-DTF]</);
    expect(gridAfterKey).toContain("zq-explain-one");
    expect(gridAfterKey).toContain("Explanations");
  });
  it("prints rubrics and the sample answer, and never a hint", () => {
    expect(text).toContain("zq-criterion-one");
    expect(text).toContain("Sample answer");
    expect(text).toContain("zq-sample-essay");
    expect(text).not.toContain("zq-hint-one");
  });
  it("without the sheet is one table of every question", () => {
    const html = paper({ seed: "101", answers: "key" }).html;
    const page = html.slice(html.indexOf('class="key-page"'));
    expect(page).not.toContain("Answer sheet questions");
    const tables = page.slice(0, page.indexOf('class="mark-block"'));
    expect(count(tables, "<tr>") - count(tables, "<thead><tr>")).toBe(12);
  });
  it("groups the other questions by type, in the default order, then Other", () => {
    const html = paper({ seed: "101", answers: "key" }).html;
    const text = visibleText(html.slice(html.indexOf('class="key-page"')));
    const at = ["Multiple choice", "True or false", "Fill in the blanks", "Short answers", "Essays"].map((h) =>
      text.indexOf(h),
    );
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
  it("is in Vietnamese with ui_lang vi", () => {
    const vi = visibleText(paper({ seed: "101", answers: "key", answerSheet: true }, exam, "vi").html);
    expect(vi).toContain("Đáp án mã đề 101");
    expect(vi).toContain("Lời giải");
    expect(vi).not.toContain("Answer key");
  });
});

describe("rubric modes in the key", () => {
  const html = visibleText(paper({ answers: "key" }, rubrics).html);
  it("prints an additive rubric as Criterion and Points", () => {
    expect(html).toMatch(/Criterion\s*Points\s*Definitions\s*1\s*Derivation\s*3/);
  });
  it("prints a banded one with weights and the scale line", () => {
    expect(html).toMatch(/Criterion\s*Weight\s*Task response\s*2\s*Coherence\s*1/);
    expect(html).toContain("Bands 0 to 9, step 0.5, rounding down");
  });
  it("prints a holistic one as a list and its score range", () => {
    expect(html).toContain("Clear thesis");
    expect(html).toContain("Score 0 to 4 points");
  });
  it("prints a preset by its name and criteria, not their descriptors", () => {
    expect(html).toContain("IELTS Writing Task 2");
    expect(html).toMatch(/Task Response\s*Coherence and Cohesion\s*Lexical Resource\s*Grammatical Range and Accuracy/);
    expect(html).toContain("Bands 0 to 9, step 0.5, IELTS rounding");
  });
});

describe("--answers inline", () => {
  const inline = paper({ seed: "101", answers: "inline" });
  const text = visibleText(inline.html);
  it("is a study sheet: no name boxes, no marker's table, no key page, no ruled lines", () => {
    const body = bodyOf(inline.html);
    for (const word of ["Name:", "Student ID", "For the marker", "key-page", 'class="lines"']) {
      expect(body, word).not.toContain(word);
    }
    expect(inline.html).toContain("study-head");
  });
  it("puts an answer block under every question, with the explanation, rubric and sample answer", () => {
    expect(count(inline.html, 'class="answer-block"')).toBe(12);
    expect(text).toContain("zq-explain-one");
    expect(text).toContain("zq-criterion-one");
    expect(text).toContain("zq-sample-essay");
    expect(text).not.toContain("zq-hint-one");
  });
  it("keeps the answer space of the other types", () => {
    expect(inline.html).toContain('class="short line"');
    expect(inline.html).toContain("box wide");
  });
  it("does not draw an answer sheet", () => {
    expect(paper({ seed: "101", answers: "inline", answerSheet: true }).html).not.toContain('class="sheet"');
  });
});

describe("materials", () => {
  const withSheets = load("materials-quiz.md");
  it("a quiz with materials gets the header line and the page before the key", () => {
    const html = paper({ answers: "key" }, withSheets).html;
    const text = visibleText(html);
    expect(text).toContain("Materials after the last question");
    expect(text).toContain("You may detach this page. It holds no questions.");
    expect(html.indexOf('class="materials-page"')).toBeGreaterThan(html.lastIndexOf('class="q"'));
    expect(html.indexOf('class="materials-page"')).toBeLessThan(html.indexOf('class="key-page"'));
    expect(count(html, 'class="materials-page"')).toBe(1);
  });
  it("renders each sheet under its name, once, with its maths and table", () => {
    const html = bodyOf(paper({}, withSheets).html);
    expect(count(html, '<h2 class="heading">Fourier transform properties</h2>')).toBe(1);
    expect(html).toContain("<table>");
    expect(html).toContain("katex");
    expect(html.slice(html.indexOf('class="materials-page"'))).not.toContain("<h1");
  });
  it("--materials none leaves out the page and the line", () => {
    const html = bodyOf(paper({ materials: false }, withSheets).html);
    expect(html).not.toContain("materials-page");
    expect(visibleText(html)).not.toContain("Materials after");
  });
  it("is in Vietnamese with ui_lang vi", () => {
    const text = visibleText(paper({}, withSheets, "vi").html);
    expect(text).toContain("Tài liệu ở sau câu hỏi cuối");
    expect(text).toContain("Bạn có thể tách trang này ra. Trang này không có câu hỏi.");
  });
});

describe("the key grouped by type", () => {
  const headings = (q: ReturnType<typeof load>, lang?: "en" | "vi") => {
    const html = paper({ answers: "key" }, q, lang).html;
    const page = html.slice(html.indexOf('class="key-page"'));
    const groups = page
      .split('<div class="label">')
      .slice(1)
      .map((g) => ({
        title: g.slice(0, g.indexOf("</div>")),
        numbers: [...g.slice(0, g.indexOf("</table>")).matchAll(/<td class="n">(\d+)<\/td>/g)]
          .map((m) => Number(m[1]))
          .filter((_, i) => i % 2 === 0),
      }));
    return groups;
  };
  it("uses the default order, paper order inside a group, and Other last", () => {
    const g = headings(load("grouped.md"));
    expect(g.map((x) => x.title)).toEqual([
      "Multiple choice",
      "True or false",
      "Matching and ordering",
      "Short answers",
      "Essays",
      "Other",
    ]);
    expect(g.map((x) => x.numbers)).toEqual([[5], [3], [7], [2, 6, 8], [1], [4]]);
  });
  it("uses the quiz's own order, naming a group of several types by its types", () => {
    const g = headings(load("grouped-custom.md"));
    expect(g.map((x) => x.title)).toEqual(["Essays", "Short answers and numeric answers", "Single choice", "Other"]);
    expect(g.map((x) => x.numbers)).toEqual([[1], [2, 6, 8], [5], [3, 4, 7]]);
  });
  it("is in Vietnamese with the approved-for-review headings", () => {
    const g = headings(load("grouped.md"), "vi");
    expect(g.map((x) => x.title)).toEqual([
      "Trắc nghiệm",
      "Đúng hay sai",
      "Ghép cặp và sắp xếp",
      "Trả lời ngắn",
      "Tự luận",
      "Khác",
    ]);
  });
});
