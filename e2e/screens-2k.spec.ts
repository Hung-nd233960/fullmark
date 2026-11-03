import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { root, run } from "./helpers";

/**
 * Screenshots of slice 2k for the owner: the first page of the board's paper (PrintPaper.dc.html, page="paper") at its
 * 794 x 1123 size, with and without the answer sheet, English and Vietnamese, serif and sans; and the whole paper as a
 * PDF, so that the real page breaks and footers can be seen (a screen has no margin boxes). Not part of `npm run check`:
 * run with FULLMARK_SCREENS=1 npx playwright test e2e/screens-2k.spec.ts --project=chromium. They land in docs/screens/2k/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");

const folder = join(root, "docs", "screens", "2k");
mkdirSync(folder, { recursive: true });

/** The board's quiz with a `font:` line, built with `--print` and the given flags; the URL of the paper. */
function paperIn(font: "serif" | "sans", flags: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "fm-screens-"));
  mkdirSync(join(dir, ".git"));
  const text = readFileSync(join(root, "test/fixtures/paper/board.md"), "utf8").replace(
    /^---\n/,
    `---\nfont: ${font}\n`,
  );
  writeFileSync(join(dir, "quiz.md"), text);
  run(dir, "build", "quiz.md", "--print", ...flags);
  return `file:///${join(dir, "quiz-print.html").replaceAll("\\", "/")}`;
}

for (const lang of ["en", "vi"] as const) {
  for (const font of ["serif", "sans"] as const) {
    for (const sheet of [false, true]) {
      test(`first page: ${lang}, ${font}${sheet ? ", with the answer sheet" : ""}`, async ({ page }) => {
        await page.setViewportSize({ width: 794, height: 1123 });
        const flags = [
          ...(sheet ? ["--answer-sheet", "--seed", "101"] : []),
          ...(lang === "vi" ? ["--ui-lang", "vi"] : []),
        ];
        await page.goto(paperIn(font, flags));
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: join(folder, `${lang}-${font}${sheet ? "-sheet" : ""}.png`) });
      });
    }
  }
}

test("the whole paper as a PDF, A4, with the footer and the page breaks", async ({ page }) => {
  await page.goto(paperIn("serif", ["--answer-sheet", "--seed", "101"]));
  await page.evaluate(() => document.fonts.ready);
  const pdf = await page.pdf({ format: "A4", path: join(folder, "paper.pdf") });
  expect(pdf.length).toBeGreaterThan(10_000);
});
