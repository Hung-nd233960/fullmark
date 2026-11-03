import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { root, run } from "./helpers";

/**
 * Screenshots of slice 2k2 for the owner: the first page of the answer key (with and without the answer sheet), of a
 * study sheet and of the materials page, from the board's content (PrintPaper.dc.html, page="key" and page="materials")
 * at its 794 x 1123 size, English and Vietnamese; and `key.pdf`, `inline.pdf` and `materials.pdf`, the whole paper each,
 * where the real page breaks and footers show. Not part of `npm run check`: run with
 * FULLMARK_SCREENS=1 npx playwright test e2e/screens-2k2.spec.ts --project=chromium. They land in docs/screens/2k2/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");

const folder = join(root, "docs", "screens", "2k2");
mkdirSync(folder, { recursive: true });

/** The board's quiz with its three sheets, built with `--print` and the given flags; the URL of the paper. */
function paperIn(flags: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "fm-screens-"));
  mkdirSync(join(dir, ".git"));
  const text = readFileSync(join(root, "test/fixtures/paper/board.md"), "utf8").replace(
    /^---\n/,
    "---\nfont: serif\nmaterials:\n  - materials/fourier.md\n  - materials/identities.md\n  - materials/constants.md\n",
  );
  writeFileSync(join(dir, "quiz.md"), text);
  cpSync(join(root, "test/fixtures/paper/materials"), join(dir, "materials"), { recursive: true });
  run(dir, "build", "quiz.md", "--print", "--built-at", "2026-10-28T10:00:00+07:00", ...flags);
  return `file:///${join(dir, "quiz-print.html").replaceAll("\\", "/")}`;
}

/** One 794 x 1123 page of the document, from just above an element. */
async function shoot(page: Page, selector: string | null, name: string): Promise<void> {
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.evaluate(() => document.fonts.ready);
  const top =
    selector === null ? 0 : await page.locator(selector).evaluate((el) => el.getBoundingClientRect().top + scrollY);
  await page.screenshot({
    path: join(folder, name),
    fullPage: true,
    clip: { x: 0, y: Math.max(0, top - 10), width: 794, height: 1123 },
  });
}

for (const lang of ["en", "vi"] as const) {
  const ui = lang === "vi" ? ["--ui-lang", "vi"] : [];
  test(`key: ${lang}, with the answer sheet`, async ({ page }) => {
    await page.goto(paperIn(["--answers", "key", "--answer-sheet", "--seed", "101", ...ui]));
    await shoot(page, ".key-page", `key-sheet-${lang}.png`);
  });
  test(`key: ${lang}, without the answer sheet`, async ({ page }) => {
    await page.goto(paperIn(["--answers", "key", ...ui]));
    await shoot(page, ".key-page", `key-${lang}.png`);
  });
  test(`study sheet: ${lang}`, async ({ page }) => {
    await page.goto(paperIn(["--answers", "inline", "--materials", "none", ...ui]));
    await shoot(page, null, `inline-${lang}.png`);
  });
  test(`materials page: ${lang}`, async ({ page }) => {
    await page.goto(paperIn(["--answers", "key", ...ui]));
    await shoot(page, ".materials-page", `materials-${lang}.png`);
  });
}

for (const [name, flags] of [
  ["key", ["--answers", "key", "--answer-sheet", "--seed", "101"]],
  ["inline", ["--answers", "inline", "--seed", "101"]],
  ["materials", ["--seed", "101", "--answer-sheet"]],
] as const) {
  test(`the whole paper as a PDF: ${name}.pdf`, async ({ page }) => {
    await page.goto(paperIn([...flags]));
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({ format: "A4", path: join(folder, `${name}.pdf`) });
    expect(pdf.length).toBeGreaterThan(10_000);
  });
}
