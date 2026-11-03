import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { root, run } from "./helpers";

/**
 * Screenshots of slice 2k3 for the owner: the first page of the answer key grouped by type, English and Vietnamese
 * (a decimal comma in the `vi` key), at 794 x 1123, and `key.pdf`, the whole paper, where the real page breaks show.
 * Not part of `npm run check`: run with FULLMARK_SCREENS=1 npx playwright test e2e/screens-2k3.spec.ts
 * --project=chromium. They land in docs/screens/2k3/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");

const folder = join(root, "docs", "screens", "2k3");
mkdirSync(folder, { recursive: true });

/** The board's quiz with its sheets, built with `--print` and the given flags; the URL of the paper. */
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

async function shoot(page: Page, selector: string, name: string): Promise<void> {
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.evaluate(() => document.fonts.ready);
  const top = await page.locator(selector).evaluate((el) => el.getBoundingClientRect().top + scrollY);
  await page.screenshot({
    path: join(folder, name),
    fullPage: true,
    clip: { x: 0, y: Math.max(0, top - 10), width: 794, height: 1123 },
  });
}

for (const lang of ["en", "vi"] as const) {
  test(`key grouped by type: ${lang}`, async ({ page }) => {
    await page.goto(paperIn(["--answers", "key", "--seed", "101", ...(lang === "vi" ? ["--ui-lang", "vi"] : [])]));
    await shoot(page, ".key-page", `key-${lang}.png`);
  });
}

test("the whole paper as a PDF: key.pdf", async ({ page }) => {
  await page.goto(paperIn(["--answers", "key", "--seed", "101"]));
  await page.evaluate(() => document.fonts.ready);
  const pdf = await page.pdf({ format: "A4", path: join(folder, "key.pdf") });
  expect(pdf.length).toBeGreaterThan(10_000);
});
