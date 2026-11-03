import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, firefox, type Page, test } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { paperEn, paperVi } from "../src/core/i18n/paper";
import { noViolations, root, run } from "./helpers";

/**
 * The printed paper in a real browser (STEP2.md, slice 2k). Chromium prints it to PDF in A4 and in Letter, and
 * `pdfjs-dist` (a test-only dependency) reads each PDF page's text: no question is cut from its number, prompt and
 * options by a page break, and the question taller than a page starts with its head. Firefox has no `page.pdf()`, so
 * it checks the computed `break-inside` and `break-after` of the same elements under print media.
 */
const AT = "2026-10-28T10:00:00+07:00";

// this container may have no Firefox build; the project then has nothing to run, and says so
const firefoxInstalled = existsSync(firefox.executablePath());
test.skip(({ browserName }) => browserName === "firefox" && !firefoxInstalled, "Firefox is not installed here");

/** A folder with the fixture copied in and the paper built; the URL of the file. */
function paperOf(fixture: string, flags: string[] = []): { dir: string; url: string } {
  const dir = mkdtempSync(join(tmpdir(), "fm-paper-"));
  mkdirSync(join(dir, ".git")); // it stops the search for fullmark.toml
  cpSync(join(root, "test", "fixtures", "paper", fixture), join(dir, "quiz.md"));
  run(dir, "build", "quiz.md", "--print", "--built-at", AT, ...flags);
  return { dir, url: `file:///${join(dir, "quiz-print.html").replaceAll("\\", "/")}` };
}

type Pdf = { pages: string[] };

/** The text of each page of a PDF, as one line of words. */
async function textOf(data: Buffer): Promise<Pdf> {
  const doc = await getDocument({ data: new Uint8Array(data), useSystemFonts: true, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " "),
    );
  }
  return { pages };
}

const pageOf = (pdf: Pdf, token: string): number => {
  const at = pdf.pages.flatMap((text, i) =>
    new RegExp(`(^|[^A-Za-z0-9])${token}([^A-Za-z0-9]|$)`).test(text) ? [i + 1] : [],
  );
  expect(at, `${token} is on exactly one page`).toHaveLength(1);
  return at[0] as number;
};
const two = (n: number): string => String(n).padStart(2, "0");

/** Question n: its options, in the fixture's tokens (`P07`, `O07A`, `L15-1`, `R15-a`). */
const TALL_SINGLE = 14;
const TALL_ESSAY = 28;
const MATCHING = [15, 27];
const PART_OF: Record<string, number> = { ALPHA: 1, BRAVO: 11, CHARLIE: 23 };

for (const size of ["A4", "Letter"] as const) {
  test(`${size}: no question is split from its number, prompt and options by a page break`, async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "page.pdf() exists only in Chromium");
    const { url } = paperOf("breaks.md");
    await page.goto(url);
    const pdf = await textOf(await page.pdf({ format: size }));
    expect(pdf.pages.length).toBeGreaterThan(5);

    for (let n = 1; n <= 30; n++) {
      const together = [pageOf(pdf, `Question ${n}\\.`), pageOf(pdf, `P${two(n)}`)];
      // a question's options are tokens O<nn><letter>; the tall one is checked on its own below
      if (n !== TALL_SINGLE) {
        const options = pdf.pages.flatMap((text, i) =>
          [...text.matchAll(new RegExp(`O${two(n)}[A-Za-z]`, "g"))].map(() => i + 1),
        );
        together.push(...options);
      }
      if (MATCHING.includes(n)) {
        together.push(
          ...pdf.pages.flatMap((text, i) => [...text.matchAll(new RegExp(`[LR]${two(n)}-`, "g"))].map(() => i + 1)),
        );
      }
      if (n !== TALL_ESSAY) expect(new Set(together).size, `question ${n} stays on one page`).toBe(1);
      else expect(new Set(together).size, `question ${n}: its number and prompt are together`).toBe(1);
    }

    // the question taller than a page starts with its head: the number, the prompt and the first two options
    const first = pageOf(pdf, `Question ${TALL_SINGLE}\\.`);
    expect(pageOf(pdf, `P${two(TALL_SINGLE)}`)).toBe(first);
    expect(pageOf(pdf, `O${two(TALL_SINGLE)}A`)).toBe(first);
    expect(pageOf(pdf, `O${two(TALL_SINGLE)}B`)).toBe(first);
    // and it really is taller than a page: its last option is on a later one
    expect(pageOf(pdf, `O${two(TALL_SINGLE)}n`)).toBeGreaterThan(first);
    // the essay of 40 lines is taller than a page too: the question after it starts after its prompt's page
    expect(pageOf(pdf, `Question ${TALL_ESSAY + 1}\\.`)).toBeGreaterThan(pageOf(pdf, `P${two(TALL_ESSAY)}`));

    // a part's heading is on the page of its first question
    for (const [name, firstQuestion] of Object.entries(PART_OF)) {
      expect(pageOf(pdf, name), `${name} heading`).toBe(pageOf(pdf, `Question ${firstQuestion}\\.`));
    }

    // the footer: "Page k / N" on every page, with the title and the version
    const total = pdf.pages.length;
    pdf.pages.forEach((text, i) => {
      expect(text, `footer of page ${i + 1}`).toContain(`Page ${i + 1} / ${total}`);
      expect(text).toContain("Page breaks - thirty awkward questions · Version");
    });
  });
}

test("the footer carries the paper code and the page count of a Vietnamese paper", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "page.pdf() exists only in Chromium");
  const { url } = paperOf("exam.md", ["--seed", "101", "--ui-lang", "vi"]);
  await page.goto(url);
  const pdf = await textOf(await page.pdf({ format: "A4" }));
  expect(pdf.pages.length).toBeGreaterThanOrEqual(2);
  expect(pdf.pages[0]).toContain(`Trang 1 / ${pdf.pages.length}`);
  expect(pdf.pages[0]).toContain("Mã đề 101");
  expect(pdf.pages[0]).toContain("Câu 1.");
});

/** The computed break rules of the paper's elements, read in the page under print media. */
async function breakRules(page: Page) {
  await page.emulateMedia({ media: "print" });
  return page.evaluate(() => {
    const rule = (selector: string) =>
      [...document.querySelectorAll(selector)].map((el) => {
        const s = getComputedStyle(el);
        return { inside: s.breakInside, after: s.breakAfter };
      });
    return {
      questions: rule(".q"),
      heads: rule(".q-head"),
      parts: rule(".part"),
      options: rule(".opt"),
      rows: rule(".grid-table tr"),
      lines: rule(".lines .line"),
      fields: rule(".field"),
    };
  });
}

test("every question, inner head and part heading asks not to be split (computed style)", async ({ page }) => {
  const { url } = paperOf("breaks.md");
  await page.goto(url);
  const r = await breakRules(page);
  expect(r.questions).toHaveLength(30);
  for (const q of r.questions) expect(q.inside).toBe("avoid");
  expect(r.heads).toHaveLength(30);
  for (const h of r.heads) expect(h.inside).toBe("avoid");
  expect(r.parts).toHaveLength(3);
  for (const p of r.parts) expect(p.after).toBe("avoid");
  for (const group of [r.options, r.rows, r.lines, r.fields]) {
    expect(group.length).toBeGreaterThan(0);
    for (const e of group) expect(e.inside).toBe("avoid");
  }
});

test("the paper has no script, and a CSP with neither a script nor a style attribute", async ({ page }) => {
  const { dir, url } = paperOf("exam.md", ["--seed", "101", "--answer-sheet"]);
  const html = readFileSync(join(dir, "quiz-print.html"), "utf8");
  expect(html).not.toContain("<script");
  expect(html).toContain("script-src 'none'");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(url);
  expect(await page.locator("script").count()).toBe(0);
  expect(await page.locator("[style]").count()).toBe(0);
  expect(errors).toEqual([]);
});

test("axe finds nothing on the paper", async ({ page }) => {
  const { url } = paperOf("exam.md", ["--seed", "101", "--answer-sheet"]);
  await page.goto(url);
  await noViolations(page);
});

test("a Vietnamese paper shows none of the English labels", async ({ page }) => {
  const { dir, url } = paperOf("exam.md", ["--seed", "101", "--answer-sheet", "--ui-lang", "vi"]);
  await page.goto(url);
  expect(await page.locator("html").getAttribute("lang")).toBe("vi");
  const text = await page.evaluate(() => document.body.textContent ?? "");
  const own = readFileSync(join(dir, "quiz.md"), "utf8").toLowerCase();
  const english = Object.entries(paperEn).filter(
    ([k, v]) => typeof v === "string" && v.length >= 2 && v !== (paperVi as Record<string, unknown>)[k],
  );
  expect(english.length).toBeGreaterThan(10);
  for (const [key, value] of english) {
    if (own.includes((value as string).toLowerCase())) continue;
    expect(text.includes(value as string), `${key}: ${value}`).toBe(false);
  }
  expect(text).toContain("Mã đề");
  expect(text).toContain("Phiếu trả lời");
});
