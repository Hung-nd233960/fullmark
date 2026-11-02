import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { buildIn, run, shown, submitAttempt, watch } from "./helpers";

/**
 * `quiz replay` (COMMANDS.md): the page already submitted shows exactly what the learner's page showed after Submit.
 * A page is built, answered and submitted; its export is replayed; the two pages are compared.
 */
const built = buildIn("test/fixtures/page/results.md", "results.md");

const right = (page: Page, id: string) => page.getByLabel(`right ${id}`).check();
const wrong = (page: Page, id: string) => page.getByLabel(`wrong ${id}`).check();

/** What the learner's page does: Start, answer (r1 right, r2 wrong, r3 left), flag r5, Submit; then Download results. */
async function attempt(page: Page, name: string): Promise<string> {
  await page.goto(built.url);
  await page.locator("[data-action=start]").click();
  await right(page, "r1");
  await wrong(page, "r2");
  await right(page, "r4");
  await wrong(page, "r5");
  await page.locator('article[data-qid="r5"] [data-action=flag]').click();
  await submitAttempt(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download results" }).click();
  const file = await download;
  await file.saveAs(join(built.dir, name));
  return name;
}

/** What a page shows after Submit, in a form that two pages can be compared by. */
async function snapshot(page: Page) {
  return {
    ...(await shown(page)),
    cards: await page.locator(".fm-questions").innerText(),
    filters: await page.locator(".fm-filter-button").allInnerTexts(),
    points: await page.locator("[data-cell=points]").innerText(),
    time: await page.locator("[data-cell=time]").innerText(),
    parts: await page.locator(".fm-part-row").allInnerTexts(),
    pending: await page.locator(".fm-pending-note").count(),
    marked: await page
      .locator("input:checked")
      .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? el.id)),
    flagged: await page.locator('article[data-flagged="true"], article .fm-flag[aria-pressed="true"]').count(),
    questions: await page.locator("article.fm-question").evaluateAll((els) => els.map((el) => el.className)),
    goal: await page.locator("[data-goal]").getAttribute("data-goal"),
  };
}

test.describe("replay", () => {
  test("shows exactly what the learner's page showed after Submit", async ({ page }) => {
    const seen = watch(page);
    const name = await attempt(page, "results-results-1.json");
    const before = await snapshot(page);
    expect(before.results.map((r) => r.status)).toContain("incorrect");
    run(built.dir, "replay", name, "--quiz", "results.md", "--no-open", "--built-at", "2026-10-28T10:00:00+07:00");
    await page.goto(`file:///${join(built.dir, "results-results-1-replay.html").replaceAll("\\", "/")}`);
    await expect(page.locator("[data-replay-banner]")).toBeVisible();
    await expect(page.locator(".fm-quiz")).toHaveAttribute("data-phase", "submitted");
    // no Start screen, no Submit, no clock
    await expect(page.locator("[data-action=start]")).toHaveCount(0);
    await expect(page.locator("[data-action=submit]")).toHaveCount(0);
    const after = await snapshot(page);
    expect(after).toEqual(before);
    // the clock does not run on a replay
    const used = await page.locator("[data-cell=time]").innerText();
    await page.waitForTimeout(2200);
    expect(await page.locator("[data-cell=time]").innerText()).toBe(used);
    expect(seen.problems).toEqual([]);
    expect(seen.requests).toEqual([]);
  });

  test("the banner and the status line name the attempt and the version", async ({ page }) => {
    const name = await attempt(page, "results-results-2.json");
    run(built.dir, "replay", name, "--quiz", "results.md", "--no-open", "--built-at", "2026-10-28T10:00:00+07:00");
    await page.goto(`file:///${join(built.dir, "results-results-2-replay.html").replaceAll("\\", "/")}`);
    const hash = JSON.parse(readFileSync(join(built.dir, name), "utf8")).quizHash.slice(0, 4);
    const banner = (await page.locator("[data-replay-banner]").innerText()).replaceAll(/\s+/g, " ");
    expect(banner).toMatch(new RegExp(`^Replay Attempt of \\d+ \\w{3} \\d{4} · version ${hash} · grades pending$`));
    await expect(page.locator(".fm-status-seg").first()).toContainText("Replay of the attempt submitted");
  });

  test("a replay is not written to storage: the built page's attempt stays as it was", async ({ page }) => {
    const name = await attempt(page, "results-results-3.json");
    const stored = () => page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.includes(":attempt")));
    const before = await stored();
    expect(before).toHaveLength(1);
    run(built.dir, "replay", name, "--quiz", "results.md", "--no-open", "--built-at", "2026-10-28T10:00:00+07:00");
    await page.goto(`file:///${join(built.dir, "results-results-3-replay.html").replaceAll("\\", "/")}`);
    await page.waitForTimeout(6500);
    expect(await stored()).toEqual(before);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes(":replay:")))).toEqual([]);
  });
});
