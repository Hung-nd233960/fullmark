import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildPaper, linesFor, type PaperOptions } from "../../src/build/paper";
import { katexTools } from "../../src/build/tex";
import { loadQuiz } from "../../src/cli/load";
import { paperEn, paperVi } from "../../src/core/i18n/paper";
import { planFor } from "../../src/core/plan";
import { seedProblem } from "../../src/core/plan/seed";
import { tempTree } from "../helpers/cli";
import { catalogStrings, leaksIn, own, visibleText } from "../helpers/vi-scan";

/** The printed paper (STEP2.md, slice 2k): what it holds, what it must not, and the order it takes from the plan. */
const root = resolve(import.meta.dirname, "..", "..");
const css = readFileSync(join(root, "dist", "paper.css"), "utf8");
const options: PaperOptions = { css, seed: null, answerSheet: false, math: katexTools() };

const trees: { done(): void }[] = [];
afterAll(() => {
  for (const t of trees) t.done();
});

function load(path: string) {
  const loaded = loadQuiz(path);
  if (loaded.quiz === null || loaded.hash === null) throw new Error(`${path} does not load`);
  return { quiz: loaded.quiz, hash: loaded.hash, assets: loaded.assets };
}
const exam = load(join(root, "test/fixtures/paper/exam.md"));
const paper = (o: Partial<PaperOptions> = {}, q = exam, uiLang?: "en" | "vi") =>
  buildPaper({ ...q, ...(uiLang ? { uiLang } : {}) }, { ...options, ...o });

/** A quiz made of the given text, loaded from a temporary folder. */
function made(text: string) {
  const t = tempTree({ "q.md": text, "a.png": "x" });
  trees.push(t);
  return load(join(t.dir, "q.md"));
}
const front = (extra = "") => `---\ntitle: T\n${extra}---\n\n`;
const single = (n: number, option = "A", more = "") =>
  `## Q${n} {type=single id=s${n}}\n\n- [x] ${option}\n- [ ] B\n${more}\n`;
const tf = (n: number) => `## T${n} {type=truefalse id=t${n}}\n\n\`\`\`answer\nvalue: true\n\`\`\`\n\n`;

const NEEDLES: Record<string, string> = {
  zqid1: "Which signal is periodic",
  zqid2: "conditions of the sampling theorem",
  zqid3: "even signal satisfies",
  zqid4: "fundamental period",
  zqid5: "Name the effect",
  zqid6: "A system whose output",
  zqid7: "Calculations",
  zqid8: "How sure are you",
  zqid9: "Put the steps",
  zqid10: "Match each tool",
  zqid11: "Explain why sampling",
  zqid12: "Write ",
};
/** The question ids in the order the paper prints them. */
function orderOf(html: string): string[] {
  const text = visibleText(html);
  return Object.keys(NEEDLES).sort((a, b) => text.indexOf(NEEDLES[a] as string) - text.indexOf(NEEDLES[b] as string));
}

describe("the paper carries no answer", () => {
  const html = paper({ seed: "101", answerSheet: true }).html;
  const plain = paper().html;
  it("has no key, no correct option, no explanation, no hint, no sample answer, no rubric and no accepted value", () => {
    for (const text of [html, plain]) {
      for (const secret of [
        "zq-explain",
        "zq-hint",
        "zq-sample-essay",
        "zq-criterion",
        "zq-code-criterion",
        "zq-accept-aliasing",
        "zq-causal",
        "zq-field-name",
        "4242.5",
        "0.001",
        "zqtag",
        "zqid",
        "[x]",
        "correct",
        "explanation",
        "rubric",
        "fm-data",
        "fm-root",
        "sampleAnswer",
        ".unwrap()",
      ]) {
        expect(text.includes(secret), secret).toBe(false);
      }
      // the key blob is a long base64 run; nothing of that length is in the file but the fonts and styles
      expect(/[A-Za-z0-9+/=]{300,}/.test(text.slice(text.indexOf("<body>"))), "a long base64 run").toBe(false);
    }
  });
  it("has no script, no style attribute and a CSP that allows neither", () => {
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).toContain("script-src 'none'");
    expect(html).toContain("default-src 'none'");
  });
  it("prints the question's starter, which is part of the question, but not the sample answer", () => {
    expect(visibleText(html)).toContain("fn zqlargest(v: &[i32]) -> i32");
  });
});

describe("the paper's order is the plan's", () => {
  it("the same seed gives byte-identical papers, different seeds different orders", () => {
    const a = paper({ seed: "101" }).html;
    expect(paper({ seed: "101" }).html).toBe(a);
    const b = paper({ seed: "102" }).html;
    expect(b).not.toBe(a);
    expect(orderOf(b)).not.toEqual(orderOf(a));
  });
  it("is the order planFor draws for the seed, parts in source order", () => {
    for (const seed of ["101", "abc", "7"]) {
      const plan = planFor(exam.quiz, { source: "bank", seed, quizHash: exam.hash });
      expect(orderOf(paper({ seed }).html)).toEqual(plan.questions);
    }
  });
  it("without a seed is the short version's plan, with no paper code", () => {
    const html = paper().html;
    const plan = planFor(exam.quiz, { source: "bank", quizHash: exam.hash });
    expect(orderOf(html)).toEqual(plan.questions);
    expect(plan.seed).toBe(exam.hash.slice(0, 4));
    expect(visibleText(html)).not.toContain("Paper code");
    expect(visibleText(html)).toContain(`Version ${exam.hash.slice(0, 4)}`);
  });
  it("lists a choice question's options in the plan's order, and the ordering items scrambled", () => {
    const plan = planFor(exam.quiz, { source: "bank", seed: "101", quizHash: exam.hash });
    const text = visibleText(paper({ seed: "101" }).html);
    const q2 = exam.quiz.sections.flatMap((s) => s.questions).find((q) => q.id === "zqid2");
    const texts =
      q2 && "choices" in q2
        ? q2.choices.map((c) => c.text.replace("zq-right-one ", "").replace("zq-right-two ", ""))
        : [];
    const shown = (plan.optionOrder?.zqid2 ?? []).map((i) => texts[i]);
    const at = shown.map((t) => text.toLowerCase().indexOf((t ?? "").toLowerCase().slice(0, 22)));
    expect(at).toEqual([...at].sort((x, y) => x - y));
    expect(plan.optionOrder?.zqid9).not.toEqual([0, 1, 2]);
  });
});

describe("the seed's rule", () => {
  it("is the plan's rule, in the plan's words", () => {
    for (const seed of ["", "123456789", "a b", "mã", "ok", "12345678", "A1"]) {
      let said: string | null = null;
      try {
        planFor(exam.quiz, { source: "bank", seed, quizHash: exam.hash });
      } catch (e) {
        said = (e as Error).message;
      }
      expect(seedProblem(seed)).toBe(said);
    }
  });
});

describe("the header and the marker's table", () => {
  const text = visibleText(paper({ seed: "101" }).html);
  it("has the title, the time, the total, the version and the paper code", () => {
    expect(text).toContain("Signals and Systems: midterm practice");
    expect(text).toContain(`Time allowed: 45 minutes · Total: 23 points · Version ${exam.hash.slice(0, 4)}`);
    expect(text).toContain("Paper code: 101");
    for (const label of ["Name:", "Class:", "Date:", "Student ID:", "Signature:"]) expect(text).toContain(label);
  });
  it("has one column per part, the points and a total", () => {
    expect(text).toContain("For the marker Signals Short answers Long answers Total Maximum 4 6 13 23 Score");
  });
  it("shows the time only when the quiz has one, and a quiz without parts has only a total", () => {
    const q = made(`${front()}${single(1)}${single(2)}`);
    const t = visibleText(paper({}, q).html);
    expect(t).not.toContain("Time allowed");
    expect(t).toContain("For the marker Total Maximum 2 Score");
  });
  it("wraps more than six parts into a second table", () => {
    const parts = Array.from({ length: 8 }, (_, i) => `# Part ${i + 1}\n\n${single(i + 1)}`).join("\n");
    const html = paper({}, made(`${front()}${parts}`)).html;
    expect(html.match(/class="box-table marker"/g)?.length).toBe(2);
    const t = visibleText(html);
    expect(t).toContain("Part 6 Maximum 1 1 1 1 1 1 Score");
    expect(t).toContain("Part 7 Part 8 Total Maximum 1 1 8 Score");
  });
  it("says nothing about the materials page, which 2k2 builds", () => {
    expect(text).not.toContain("Materials");
  });
  it("is in Vietnamese with the quiz's ui_lang or --ui-lang", () => {
    const t = visibleText(paper({ seed: "101" }, exam, "vi").html);
    expect(t).toContain("Thời gian làm bài: 45 phút · Tổng: 23 điểm");
    expect(t).toContain("Mã đề: 101");
    expect(t).toContain("Câu 1.");
    expect(paper({}, exam, "vi").html).toContain('<html lang="vi">');
  });
});

describe("the questions", () => {
  const html = paper({ seed: "101" }).html;
  const text = visibleText(html);
  it("are numbered on across parts, with the points right-aligned and none of the author's ids or tags", () => {
    const numbers = [...text.matchAll(/Question (\d+)\./g)].map((m) => Number(m[1]));
    expect(numbers).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(text).toContain("(1 point)");
    expect(text).toContain("(2 points)");
    expect(html.match(/class="part"/g)?.length).toBe(3);
  });
  it("give each part a heading with its points, and print its intro", () => {
    expect(text).toContain("Signals (4 points)");
    expect(text).toContain("Answer every question. Calculators are not allowed.");
  });
  it("give multi its line, true/false its letters, a numeric answer its box and unit", () => {
    expect(text).toContain("Choose all that apply.");
    expect(text).toContain("T. True F. False");
    expect(html).toContain('class="box wide"');
    expect(text).toContain("Answer: s");
    expect(visibleText(paper({}, exam, "vi").html)).toContain("Đ. Đúng S. Sai");
  });
  it("give blanks a line in the sentence, never an input", () => {
    expect(html).toContain('<span class="blank"></span>');
    expect(html).not.toContain("<input");
  });
  it("give every type its own answer space", () => {
    for (const cls of ["fields", "tick", "ordbox", "grid-table", "links", "lines", "short line"]) {
      expect(html.includes(cls), cls).toBe(true);
    }
    expect(html.match(/class="ordbox"/g)?.length).toBe(3);
    expect(text).toContain("1 → 2 → 3 →");
  });
  it("split each question at its head and the rest, so a tall one still starts with its prompt", () => {
    expect(html.match(/class="q-head"/g)?.length).toBe(12);
    // the essay (4 points, 60 words: 5 lines) and the code question (3 points: 15 lines) keep three lines in the head
    expect(html).toContain('class="lines"');
  });
});

describe("two columns, and the ruled lines", () => {
  it("puts options in two columns when each is 40 characters or fewer, with no image or block maths", () => {
    const wide = single(1, "x".repeat(41));
    const img = single(2, "![pic](a.png)");
    const block = single(3, "$$x$$");
    const html = (body: string) => paper({}, made(`${front()}${body}`)).html;
    expect(html(single(1, "x".repeat(40)))).toContain('class="opts two"');
    expect(html(wide)).not.toContain("opts two");
    expect(html(img)).not.toContain("opts two");
    expect(html(block)).not.toContain("opts two");
  });
  it("counts the lines: 5 a point, or 1 per 12 words of the limit; at least 4, at most 40", () => {
    expect(linesFor(1, null)).toBe(5);
    expect(linesFor(0.5, null)).toBe(4);
    expect(linesFor(4, null)).toBe(20);
    expect(linesFor(20, null)).toBe(40);
    expect(linesFor(4, 60)).toBe(5);
    expect(linesFor(4, 24)).toBe(4);
    expect(linesFor(4, 150)).toBe(13);
    expect(linesFor(4, 1000)).toBe(40);
    const lines = (html: string) => html.match(/class="line"/g)?.length ?? 0;
    // exam: essay 5 lines, code 15, one short line is class "short line", fields use "line" in each row
    expect(lines(paper().html)).toBe(5 + 15 + 2);
  });
});

describe("the answer sheet", () => {
  it("is a grid of the single-choice and true/false questions in paper order, 10 to a row, with its sentence", () => {
    const body = [...Array.from({ length: 12 }, (_, i) => (i % 3 === 0 ? tf(i + 1) : single(i + 1)))].join("");
    const html = paper({ answerSheet: true }, made(`${front()}${body}`)).html;
    const text = visibleText(html);
    expect(text).toContain(
      "Answer sheet Write the letter of your answer (A or B; T or F) in the box under each question number.",
    );
    expect(html.match(/class="gn"/g)?.length).toBe(12);
    // a second row of the grid holds numbers 11 and 12 and eight unused cells
    expect(html.match(/class="gn gx"/g)?.length).toBe(8);
    expect(html.match(/class="gb"/g)?.length).toBe(12);
    expect(html.includes('class="code-box"')).toBe(false);
  });
  it("leaves multi, short and the rest off the sheet, and has a Paper code box with a seed", () => {
    const html = paper({ answerSheet: true, seed: "101" }).html;
    expect(html.includes('class="code-box"')).toBe(true);
    const numbers = [...html.matchAll(/class="gn">(\d+)</g)].map((m) => Number(m[1]));
    const types = new Map(exam.quiz.sections.flatMap((s) => s.questions).map((q) => [q.id, q.type]));
    const plan = planFor(exam.quiz, { source: "bank", seed: "101", quizHash: exam.hash });
    expect(numbers).toEqual(
      plan.questions.flatMap((id, i) => (types.get(id) === "single" || types.get(id) === "truefalse" ? [i + 1] : [])),
    );
    expect(visibleText(html)).toContain("(A, B, C or D; T or F)");
  });
  it("names only the letters in use: no true/false, or no single-choice", () => {
    const onlyTf = visibleText(paper({ answerSheet: true }, made(`${front()}${tf(1)}`)).html);
    expect(onlyTf).toContain("(T or F)");
    const onlySingle = visibleText(paper({ answerSheet: true }, made(`${front()}${single(1)}`)).html);
    expect(onlySingle).toContain("(A or B)");
  });
  it("is a warning, with no grid, when no question can use it", () => {
    const r = paper(
      { answerSheet: true },
      made(`${front()}## Q {type=short id=q}\n\n\`\`\`answer\naccept: [a]\n\`\`\`\n`),
    );
    expect(r.warnings).toEqual([
      {
        rule: "build.answer-sheet-empty",
        message: "no single-choice or true/false question for the answer sheet",
        fix: "leave out --answer-sheet, or add a single-choice or true/false question",
      },
    ]);
    expect(r.html).not.toContain('class="grid"');
    expect(paper({ answerSheet: true }).warnings).toEqual([]);
  });
});

describe("the footer, the styles and the file", () => {
  const html = paper({ seed: "101" }).html;
  it("carries the footer's text for the page's margin boxes", () => {
    expect(html).toContain(
      `@bottom-left{content:"Signals and Systems: midterm practice · Version ${exam.hash.slice(0, 4)} · Paper code 101"}`,
    );
    expect(html).toContain('@bottom-right{content:"Page " counter(page) " / " counter(pages)}');
    expect(paper({}, exam, "vi").html).toContain('content:"Trang " counter(page)');
  });
  it("escapes a title in the footer's CSS string", () => {
    const q = made(`---\ntitle: 'A "quoted" \\ title'\n---\n\n${single(1)}`);
    expect(paper({}, q).html).toContain('content:"A \\"quoted\\" \\\\ title · Version');
  });
  it("hashes every style in the CSP and shows no build time", () => {
    const csp = /Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(csp).toContain("style-src 'sha256-");
    expect(html).not.toMatch(/built|20\d\d-\d\d-\d\dT/);
  });
  it("carries KaTeX's styles only when there is maths", () => {
    expect(html).toContain('id="fm-katex"');
    expect(paper({}, made(`${front()}${single(1)}`)).html).not.toContain("fm-katex");
  });
});

describe("the vi scan", () => {
  it("a Vietnamese paper holds none of the English labels", () => {
    const html = paper({ seed: "101", answerSheet: true }, exam, "vi").html;
    const text = visibleText(html);
    const english = Object.entries(paperEn).filter(
      ([k, v]) => typeof v === "string" && v !== (paperVi as Record<string, unknown>)[k] && v.length >= 2,
    );
    expect(english.length).toBeGreaterThan(10);
    const mine = own(join(root, "test/fixtures/paper"));
    for (const [key, value] of english) {
      if (mine.includes((value as string).toLowerCase())) continue;
      expect(text, key).not.toContain(value as string);
    }
    expect(leaksIn(text, mine).length).toBe(0);
    expect(catalogStrings.length).toBeGreaterThan(100);
  });
});
