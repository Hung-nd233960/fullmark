import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, firefox, test } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { paperEn, paperVi } from "../src/core/i18n/paper";
import { noViolations, root, run } from "./helpers";

/**
 * The key, the study sheet and the materials page in a real browser (STEP2.md, slice 2k2). Chromium prints each paper
 * to PDF in A4 and Letter and `pdfjs-dist` reads each page's text: the materials page and the key each start a new
 * page, in that order; no question is cut from its answer block; a materials table that runs over a page repeats its
 * header row.
 */
const AT = "2026-10-28T10:00:00+07:00";
test.skip(({ browserName }) => browserName === "firefox" && !existsSync(firefox.executablePath()), "no Firefox here");

/** A folder holding these files (and a `.git`, which stops the search for fullmark.toml), built with `--print`. */
function paperFrom(files: Record<string, string>, flags: string[]): { dir: string; url: string } {
  const dir = mkdtempSync(join(tmpdir(), "fm-key-"));
  mkdirSync(join(dir, ".git"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  run(dir, "build", "quiz.md", "--print", "--built-at", AT, ...flags);
  return { dir, url: `file:///${join(dir, "quiz-print.html").replaceAll("\\", "/")}` };
}

async function pagesOf(data: Buffer): Promise<string[]> {
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
  return pages;
}

const two = (n: number): string => String(n).padStart(2, "0");
const filler = (n: number): string =>
  Array.from({ length: n % 4 }, () => "A line that makes the prompt taller.").join(" ");

/** 26 single-choice questions with a token in the prompt, each option and the explanation, and a long materials table. */
const QUIZ = [
  "---\ntitle: Key and study sheet\nid: keyed\nmaterials:\n  - m/long.md\n---\n",
  ...Array.from(
    { length: 26 },
    (_, i) =>
      `## P${two(i + 1)} ${filler(i)} {type=single id=q${i + 1}}\n\n- [x] O${two(i + 1)}a\n- [ ] O${two(i + 1)}b\n- [ ] O${two(i + 1)}c\n- [ ] O${two(i + 1)}d\n\n::: explanation\nE${two(i + 1)} because.\n:::\n`,
  ),
].join("\n");
const LONG = `# Long table\n\n| ColA | ColB |\n| --- | --- |\n${Array.from({ length: 70 }, (_, i) => `| RW${two(i + 1)} | value ${i + 1} |`).join("\n")}\n`;
const FILES = { "quiz.md": QUIZ, "m/long.md": LONG };

for (const size of ["A4", "Letter"] as const) {
  test(`${size}: the materials page and the key each start a new page, in that order`, async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "page.pdf() exists only in Chromium");
    const { url } = paperFrom(FILES, ["--answers", "key", "--answer-sheet", "--seed", "101"]);
    await page.goto(url);
    const pages = await pagesOf(await page.pdf({ format: size }));
    // the footer's margin boxes come first in the text of a page: "Page 4 / 8 Title · Version 849f · Paper code 101 "
    const body = (t: string) => t.replace(/^Page \d+ \/ \d+ .*? · Version \w+(?: · Paper code \w+)? /, "");
    const startsWith = (word: string) => pages.flatMap((t, i) => (body(t).startsWith(word) ? [i + 1] : []));
    expect(startsWith("Materials"), "the materials page starts a page").toHaveLength(1);
    expect(startsWith("Answer key"), "the key starts a page").toHaveLength(1);
    const materials = (startsWith("Materials") as number[])[0] as number;
    const key = (startsWith("Answer key") as number[])[0] as number;
    const lastQuestion = pages.findLastIndex((t) => /Question 26\./.test(t)) + 1;
    expect(materials).toBeGreaterThan(lastQuestion);
    expect(key).toBeGreaterThan(materials);
    expect(pages[materials - 1]).not.toMatch(/Question \d+\./);
    expect(pages[key - 1]).not.toContain("RW");
    // the long table runs over pages: its header row is repeated on each of them
    const rows = pages.flatMap((t, i) => (i + 1 >= materials && i + 1 < key && t.includes("RW") ? [t] : []));
    expect(rows.length).toBeGreaterThan(1);
    for (const t of rows) expect(t, "ColA ColB heads each page of the table").toContain("ColA ColB");
    // every row is there once
    const all = rows.join(" ");
    for (let n = 1; n <= 70; n++) expect(all.split(`RW${two(n)}`).length - 1, `row ${n}`).toBe(1);
  });

  test(`${size}: in a study sheet no question is cut from its answer block`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "page.pdf() exists only in Chromium");
    const { url } = paperFrom(FILES, ["--answers", "inline", "--materials", "none"]);
    await page.goto(url);
    const pages = await pagesOf(await page.pdf({ format: size }));
    expect(pages.length).toBeGreaterThan(2);
    for (let n = 1; n <= 26; n++) {
      const at = (token: string) =>
        pages.flatMap((t, i) => (new RegExp(`(^|[^A-Za-z0-9])${token}([^A-Za-z0-9]|$)`).test(t) ? [i + 1] : []));
      const together = [
        ...at(`Question ${n}\\.`),
        ...at(`P${two(n)}`),
        ...at(`O${two(n)}a`),
        ...at(`O${two(n)}d`),
        ...at(`E${two(n)}`),
      ];
      expect(new Set(together).size, `question ${n} and its answer are on one page`).toBe(1);
    }
    expect(pages.join(" ")).not.toContain("Materials");
  });
}

test("the study sheet's computed break rules, and no name boxes", async ({ page }) => {
  const { url } = paperFrom(FILES, ["--answers", "inline"]);
  await page.goto(url);
  await page.emulateMedia({ media: "print" });
  const r = await page.evaluate(() => ({
    blocks: [...document.querySelectorAll(".q .answer-block")].map((e) => getComputedStyle(e).breakInside),
    questions: [...document.querySelectorAll(".q")].map((e) => getComputedStyle(e).breakInside),
    rule: [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .find((r) => r instanceof CSSStyleRule && r.selectorText === ".answer-block")
      ?.cssText.match(/border-left[^;]*/)?.[0],
    lines: document.querySelectorAll(".lines").length,
    name: document.body.textContent?.includes("Student ID"),
    materials: [...document.querySelectorAll(".materials-page")].map((e) => getComputedStyle(e).breakBefore),
  }));
  expect(r.blocks).toHaveLength(26);
  for (const b of [...r.blocks, ...r.questions]) expect(b).toBe("avoid");
  expect(r.rule).toContain("1.5px solid");
  expect(r.lines).toBe(0);
  expect(r.name).toBe(false);
  expect(r.materials).toEqual(["page"]);
});

test("a long table's header row is a header group under print media", async ({ page }) => {
  const { url } = paperFrom(FILES, ["--answers", "key"]);
  await page.goto(url);
  await page.emulateMedia({ media: "print" });
  expect(
    await page.evaluate(() => getComputedStyle(document.querySelector(".mat-body thead") as Element).display),
  ).toBe("table-header-group");
});

test("axe finds nothing on a key or a study sheet", async ({ page }) => {
  const key = paperFrom({ "quiz.md": readFileSync(join(root, "test/fixtures/paper/exam.md"), "utf8") }, [
    "--answers",
    "key",
    "--answer-sheet",
    "--seed",
    "101",
  ]);
  await page.goto(key.url);
  await noViolations(page);
  const inline = paperFrom({ "quiz.md": readFileSync(join(root, "test/fixtures/paper/exam.md"), "utf8") }, [
    "--answers",
    "inline",
    "--seed",
    "101",
  ]);
  await page.goto(inline.url);
  await noViolations(page);
});

test("a Vietnamese key and study sheet show none of the English labels", async ({ page }) => {
  const exam = readFileSync(join(root, "test/fixtures/paper/exam.md"), "utf8");
  const own = exam.toLowerCase();
  const english = Object.entries(paperEn).filter(
    ([k, v]) =>
      typeof v === "string" &&
      v.length >= 2 &&
      v !== (paperVi as Record<string, unknown>)[k] &&
      !own.includes(v.toLowerCase()),
  );
  expect(english.length).toBeGreaterThan(20);
  for (const flags of [
    ["--answers", "key", "--answer-sheet", "--seed", "101"],
    ["--answers", "inline", "--seed", "101"],
  ]) {
    const { url } = paperFrom({ "quiz.md": exam }, [...flags, "--ui-lang", "vi"]);
    await page.goto(url);
    const text = await page.evaluate(() => document.body.textContent ?? "");
    for (const [key, value] of english) expect(text.includes(value as string), `${key}: ${value}`).toBe(false);
    if (flags.includes("key")) expect(text).toContain("Lời giải");
  }
  // the materials page too
  const mat = paperFrom(FILES, ["--answers", "key", "--ui-lang", "vi"]);
  await page.goto(mat.url);
  const text = await page.evaluate(() => document.body.textContent ?? "");
  expect(text).toContain("Tài liệu");
  expect(text).not.toContain("You may detach");
});
