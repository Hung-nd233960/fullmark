import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { quizHash } from "../src/core/hash";
import { resultsHash } from "../src/core/rubric/grades";
import { root, run } from "./helpers";

/**
 * Screenshots of slice 2j2 for the owner to compare with the ResultsReplay board (its criterion tables under the essay
 * and the "Graded by ..." line). Not part of `npm run check`: run with
 * FULLMARK_SCREENS=1 npx playwright test e2e/screens-2j2.spec.ts --project=chromium. They land in docs/screens/2j2/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");
test.use({ viewport: { width: 1280, height: 940 } });

const out = (name: string) => join(root, "docs", "screens", "2j2", `${name}.png`);
const FIXTURE = join(root, "test", "fixtures", "replay");
const STAMP = ["--built-at", "2026-10-28T10:00:00+07:00"];

/**
 * The essay fixture's replay with `extra` front matter lines. The lines change the quiz's hash, so the results file
 * and the grades file are re-keyed to it (nothing else in them changes). `uiLang` builds the page in Vietnamese.
 */
function replayOf(extra: string[], name: string, uiLang = "en"): string {
  const dir = mkdtempSync(join(tmpdir(), "fm-screens-"));
  mkdirSync(join(dir, ".git"));
  const source = readFileSync(join(FIXTURE, "essay.md"), "utf8").replace(/^---\n/, `---\n${extra.join("\n")}\n`);
  writeFileSync(join(dir, "essay.md"), source);
  const results = JSON.parse(readFileSync(join(FIXTURE, "essay-results.json"), "utf8"));
  results.quizHash = quizHash(source, []);
  writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(results, null, 2)}\n`);
  const grades = JSON.parse(readFileSync(join(FIXTURE, "essay-results-grades.json"), "utf8"));
  grades.results_hash = resultsHash(results);
  writeFileSync(join(dir, `${name}-grades.json`), JSON.stringify(grades));
  run(dir, "replay", `${name}.json`, "--quiz", "essay.md", "--no-open", "--ui-lang", uiLang, ...STAMP);
  return `file:///${join(dir, `${name}-replay.html`).replaceAll("\\", "/")}`;
}

const shot = async (page: Page, name: string, full = true) => {
  await expect(page.locator(".fm-grade-table").first()).toBeVisible();
  await page.screenshot({ path: out(name), fullPage: full });
};

test("the graded replay on the board's theme and font, then light and dark", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1560 });
  await page.goto(replayOf(["theme: paper", "font: serif"], "paper"));
  await shot(page, "1-graded-paper-serif");
  await page.goto(replayOf([], "light"));
  await shot(page, "2-graded-light");
  await page.emulateMedia({ colorScheme: "dark" });
  await shot(page, "3-graded-dark");
});

test("the graded replay on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(replayOf([], "phone"));
  await page.locator('article[data-qid="add"]').scrollIntoViewIfNeeded();
  await page.locator('article[data-qid="add"] .fm-grade').scrollIntoViewIfNeeded();
  await shot(page, "4-graded-phone", false);
});

test("the banded and holistic grades", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(replayOf(["theme: paper", "font: serif"], "modes"));
  await page.locator('article[data-qid="ielts"]').scrollIntoViewIfNeeded();
  await page.locator('article[data-qid="ielts"]').screenshot({ path: out("5-banded") });
  await page.locator('article[data-qid="holistic"]').screenshot({ path: out("6-holistic") });
});

test("a retry in progress offered back on the replay", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(replayOf(["theme: paper", "font: serif"], "retry"));
  await page.locator("[data-action=retry-missed]").click();
  await page.locator("[data-action=confirm-retry]").click();
  await page.locator("article.fm-question:not([hidden]) textarea").first().fill("A second try.");
  await page.reload();
  await expect(page.locator("[data-resume-banner]")).toBeVisible();
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const el of document.querySelectorAll(".fm-main, .fm-body")) el.scrollTop = 0;
  });
  await page.screenshot({ path: out("7-retry-offered") });
});

test("the graded replay in Vietnamese", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1560 });
  await page.goto(replayOf(["theme: paper", "font: serif"], "vi", "vi"));
  await shot(page, "8-graded-vi");
});
