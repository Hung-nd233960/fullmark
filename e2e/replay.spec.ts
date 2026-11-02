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

  test("Download results gives back the original results.json byte for byte", async ({ page }) => {
    const name = await attempt(page, "results-results-4.json");
    run(built.dir, "replay", name, "--quiz", "results.md", "--no-open", "--built-at", "2026-10-28T10:00:00+07:00");
    await page.goto(`file:///${join(built.dir, "results-results-4-replay.html").replaceAll("\\", "/")}`);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download results" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(name);
    await file.saveAs(join(built.dir, "again.json"));
    expect(readFileSync(join(built.dir, "again.json")).equals(readFileSync(join(built.dir, name)))).toBe(true);
  });

  test("Retry missed starts a fresh attempt under its own storage key; the built page's attempt stays", async ({
    page,
  }) => {
    const name = await attempt(page, "results-results-5.json");
    const stored = () =>
      page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.includes(":attempt"))));
    const builtKeys = await stored();
    expect(Object.keys(builtKeys)).toHaveLength(1);
    run(built.dir, "replay", name, "--quiz", "results.md", "--no-open", "--built-at", "2026-10-28T10:00:00+07:00");
    await page.goto(`file:///${join(built.dir, "results-results-5-replay.html").replaceAll("\\", "/")}`);
    const missed = Number(await page.locator('[data-filter="missed"] .fm-filter-count').innerText());
    expect(missed).toBeGreaterThan(0);
    await page.locator("[data-action=retry-missed]").click();
    await page.locator("[data-action=confirm-retry]").click();
    // a fresh attempt in the browser, as on a live page: only the missed questions, no banner, a running clock
    await expect(page.locator(".fm-quiz")).toHaveAttribute("data-phase", "answering");
    await expect(page.locator("[data-replay-banner]")).toHaveCount(0);
    await expect(page.locator("article.fm-question:not([hidden])")).toHaveCount(missed);
    await right(page, "r2");
    const now = await stored();
    const replayKey = Object.keys(now).find((k) => k.endsWith(":replay:attempt"));
    expect(replayKey).toBeDefined();
    // the built page's own key is exactly as it was
    for (const [key, value] of Object.entries(builtKeys)) expect(now[key]).toBe(value);
    // Submit: Download results now gives the new attempt, as any page exports it
    await submitAttempt(page);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download results" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^results-results-\d{8}-\d{6}\.json$/);
    await file.saveAs(join(built.dir, "retry.json"));
    const retry = JSON.parse(readFileSync(join(built.dir, "retry.json"), "utf8"));
    expect(retry.plan.source).toBe("retry");
    expect(retry.plan.questions).toHaveLength(missed);
    expect(retry.phase).toBe("submitted");
    // the built page still opens on its own submitted attempt
    await page.goto(built.url);
    await expect(page.locator(".fm-quiz")).toHaveAttribute("data-phase", "submitted");
    await expect(page.locator("[data-replay-banner]")).toHaveCount(0);
    // and the replay page opens on the replay again, whatever the Retry left in storage
    await page.goto(`file:///${join(built.dir, "results-results-5-replay.html").replaceAll("\\", "/")}`);
    await expect(page.locator("[data-replay-banner]")).toBeVisible();
  });

  test("a Retry missed in progress is offered back after a reload: Continue, and Start over", async ({ page }) => {
    const name = await attempt(page, "results-results-6.json");
    run(built.dir, "replay", name, "--quiz", "results.md", "--no-open", "--built-at", "2026-10-28T10:00:00+07:00");
    const url = `file:///${join(built.dir, "results-results-6-replay.html").replaceAll("\\", "/")}`;
    const stored = () =>
      page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.includes(":attempt"))));
    const builtKeys = Object.fromEntries(Object.entries(await stored()).filter(([k]) => !k.includes(":replay:")));
    await page.goto(url);
    await expect(page.locator("[data-resume-banner]")).toHaveCount(0);
    await page.locator("[data-action=retry-missed]").click();
    await page.locator("[data-action=confirm-retry]").click();
    await right(page, "r2");
    await expect(page.locator("article.fm-question:not([hidden])").first()).toBeVisible();
    // reload: the page opens on the replay, the retry offered back through the resume banner
    await page.reload();
    await expect(page.locator(".fm-quiz")).toHaveAttribute("data-phase", "submitted");
    await expect(page.locator("[data-replay-banner]")).toBeVisible();
    const banner = page.locator("[data-resume-banner]");
    await expect(banner).toContainText("You have a retry in progress");
    await expect(banner.locator("[data-resume]")).toContainText("1 of");
    await expect(banner.locator("[data-action=continue]")).toHaveText("Continue your retry");
    // Continue opens the retry where it was left
    await banner.locator("[data-action=continue]").click();
    await expect(page.locator(".fm-quiz")).toHaveAttribute("data-phase", "answering");
    await expect(page.locator("[data-replay-banner]")).toHaveCount(0);
    await expect(page.getByLabel("right r2")).toBeChecked();
    // and it is still saved: reload again, then Start over, which asks first and removes it
    await page.reload();
    await expect(page.locator("[data-resume-banner]")).toBeVisible();
    await page.locator("[data-resume-banner] [data-action=start-over]").click();
    await expect(page.locator("[data-resume-banner]")).toBeVisible();
    await page.locator("[data-action=confirm-start-over]").click();
    await expect(page.locator("[data-resume-banner]")).toHaveCount(0);
    await expect(page.locator(".fm-quiz")).toHaveAttribute("data-phase", "submitted");
    await expect(page.locator("[data-replay-banner]")).toBeVisible();
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes(":replay:")))).toEqual([]);
    await page.reload();
    await expect(page.locator("[data-resume-banner]")).toHaveCount(0);
    await expect(page.locator("[data-replay-banner]")).toBeVisible();
    // the built page's own saved attempt was never touched
    expect(await stored()).toEqual(builtKeys);
  });
});
