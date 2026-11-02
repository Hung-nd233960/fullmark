import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { buildIn, noViolations, root, run, watch } from "./helpers";

/**
 * Grades on a replay page (STEP2.md, slice 2j2): the `essay` fixture is a quiz of one single, an additive essay, an
 * IELTS banded essay, a banded one, a holistic one and an additive code question, with its results file and the grades
 * file `quiz grade` reads. The page shows what the grades file says and scores what `quiz grade` scores (19.25 of 25).
 */
const FIXTURE = join(root, "test", "fixtures", "replay");
const AT = "2026-10-28T10:00:00+07:00";

type Edit = (grades: { grader: { at?: string } }) => void;

/** The fixture's replay page, with the grades file edited (`null`: none beside the results), and its `file://` URL. */
function replay(name: string, edit: Edit | null, extra: string[] = []): { url: string; dir: string } {
  const built = buildIn("test/fixtures/replay/essay.md", "essay.md");
  copyFileSync(join(FIXTURE, "essay-results.json"), join(built.dir, "essay-results.json"));
  if (edit !== null) {
    const grades = JSON.parse(readFileSync(join(FIXTURE, "essay-results-grades.json"), "utf8"));
    edit(grades);
    writeFileSync(join(built.dir, "essay-results-grades.json"), JSON.stringify(grades));
  }
  run(
    built.dir,
    "replay",
    "essay-results.json",
    "--quiz",
    "essay.md",
    "--no-open",
    "--built-at",
    AT,
    "-o",
    `${name}.html`,
    ...extra,
  );
  return { dir: built.dir, url: `file:///${join(built.dir, `${name}.html`).replaceAll("\\", "/")}` };
}

const lines = async (page: Page, selector: string): Promise<string> =>
  (await page.locator(selector).innerText()).replaceAll(/\s+/g, " ");

test.describe("grades on a replay page", () => {
  test("each graded answer shows its table and grader's line, and the score counts them", async ({ page }) => {
    const seen = watch(page);
    await page.goto(replay("graded", (g) => g).url);
    const add = page.locator('article[data-qid="add"]');
    await expect(add.locator(".fm-grade-table tbody tr")).toHaveCount(3);
    expect(await lines(page, 'article[data-qid="add"] .fm-grade-table')).toContain(
      "Derive the result 1.25 1.5 Skips the zero initial-conditions assumption.",
    );
    await expect(add.locator("[data-grader]")).toHaveText("Graded by Claude Opus 5.5 · 24 Oct 2026 · 2.25 / 3 points");
    await expect(add.locator(".fm-result")).toHaveAttribute("data-status", "partial");
    const ielts = page.locator('article[data-qid="ielts"]');
    await expect(ielts.locator(".fm-grade-band")).toHaveText("Overall band 6.5 of 9");
    expect(await lines(page, 'article[data-qid="ielts"] .fm-grade-table')).toContain("Task Response 6");
    const code = page.locator('article[data-qid="code"]');
    await expect(code.locator("[data-grader]")).toContainText("1.5 / 2 points");
    // the score includes them, as `quiz grade` has it (no asterisk, no waiting note)
    const total = page.locator(".fm-total");
    await expect(total).toHaveAttribute("data-earned", "19.25");
    await expect(total).toHaveAttribute("data-points", "25");
    await expect(page.locator(".fm-pending-note")).toHaveCount(0);
    await expect(page.locator("[data-replay-banner]")).toContainText("grades from the report of 24 Oct");
    await expect(page.locator("main, .fm-main").first().locator(".fm-grade")).toHaveCount(5);
    await noViolations(page);
    expect(seen.problems).toEqual([]);
    expect(seen.requests).toEqual([]);
  });

  test("a grades file without a date shows the grader's line without one", async ({ page }) => {
    await page.goto(
      replay("nodate", (g) => {
        delete g.grader.at;
      }).url,
    );
    await expect(page.locator('article[data-qid="add"] [data-grader]')).toHaveText(
      "Graded by Claude Opus 5.5 · 2.25 / 3 points",
    );
    await expect(page.locator("[data-replay-banner]")).toContainText("grades from the report");
  });

  test("without a grades file the answers stay pending, as before", async ({ page }) => {
    await page.goto(replay("pending", null).url);
    await expect(page.locator(".fm-grade")).toHaveCount(0);
    await expect(page.locator('article[data-qid="add"] .fm-result')).toHaveAttribute("data-status", "pending");
    await expect(page.locator(".fm-pending-note")).toHaveCount(1);
    await expect(page.locator("[data-replay-banner]")).toContainText("grades pending");
  });

  test("on a phone the table scrolls in its own box and the page does not scroll sideways", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(replay("phone", (g) => g).url);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(wide).toBe(false);
    await expect(page.locator('article[data-qid="add"] .fm-grade-table')).toBeVisible();
  });
});
