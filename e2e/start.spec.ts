import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { buildIn, card, expectGradeMatches, noViolations, run, submitAttempt, watch } from "./helpers";

const parts = buildIn("test/fixtures/page/parts.md", "parts.md");
const timed = buildIn("test/fixtures/page/timed.md", "timed.md");
const types = buildIn("test/fixtures/page/types.md", "types.md");

/** The ids of the questions on the page, top to bottom. */
const idsOn = (page: Page): Promise<string[]> =>
  page.locator("article.fm-question").evaluateAll((els) => els.map((el) => el.getAttribute("data-qid") ?? ""));

/** Answers a `single` question of the fixtures by its right choice. */
const right = (page: Page, id: string) => page.getByLabel(`right ${id}`).check();

/** The parts of an export these tests read. */
type ExportedFile = {
  plan: { source: string; section: string; questions: string[]; seed: string; optionOrder: Record<string, number[]> };
  state: { timedOut: boolean; timeUsed: number; answers: Record<string, unknown>; sectionTime: Record<string, number> };
};

/** Saves the export and returns the parsed file. */
async function exported(page: Page, dir: string): Promise<{ name: string; file: ExportedFile }> {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download results" }).click();
  const file = await download;
  const path = join(dir, file.suggestedFilename());
  await file.saveAs(path);
  return { name: file.suggestedFilename(), file: JSON.parse(readFileSync(path, "utf8")) };
}

/** The saved attempt's key in this page's storage. */
const savedKey = (page: Page): Promise<string | null> =>
  page.evaluate(() => Object.keys(localStorage).find((k) => k.endsWith(":attempt")) ?? null);

test("the start screen: the whole quiz pinned and recommended, the parts in a list of five rows, a bank's count", async ({
  page,
}) => {
  const seen = watch(page);
  await page.goto(parts.url);
  await expect(page.locator("h1")).toHaveText("Parts");
  // the description is rendered at build, maths included
  await expect(page.locator(".fm-description .katex")).toHaveCount(1);
  await expect(page.locator('[data-fact="questions"] .fm-tile-value')).toHaveText("12");
  const whole = page.getByRole("radio", { name: /The whole quiz/ });
  await expect(whole).toBeChecked();
  await expect(page.locator(".fm-part-whole")).toContainText("Recommended");
  await expect(page.locator(".fm-part-whole")).toContainText("12 questions");
  // six parts, five visible rows: the list scrolls
  await expect(page.locator(".fm-part-list .fm-part")).toHaveCount(6);
  expect(
    await page
      .locator(".fm-part-list")
      .evaluate((el) => ({ scrolls: el.scrollHeight > el.clientHeight, rows: el.querySelectorAll(".fm-part").length })),
  ).toEqual({ scrolls: true, rows: 6 });
  const algebra = page.locator(".fm-part", { hasText: "Algebra" });
  await expect(algebra).toContainText("2 of 3 questions");
  await expect(algebra).toContainText("suggested 20 min");
  await expect(page.locator(".fm-part", { hasText: "Geometry" })).toContainText("2 questions");
  await expect(page.locator(".fm-question").first()).toBeHidden();
  await noViolations(page);

  await page.getByRole("button", { name: "Start" }).click();
  // Algebra is a bank: it draws 2 of its 3, the other five parts keep both
  await expect(page.locator("article.fm-question")).toHaveCount(12);
  expect((await idsOn(page)).filter((id) => id.startsWith("al"))).toHaveLength(2);
  await expect(page.locator("[data-timer]")).toHaveText(/^Time \d+:\d\d$/);
  await noViolations(page);
  await right(page, (await idsOn(page))[0] as string);
  await submitAttempt(page);
  await noViolations(page);
  expect(seen.problems).toEqual([]);
  expect(seen.requests).toEqual([]);
});

test("a quiz without sections has no choice, only Start", async ({ page }) => {
  await page.goto(timed.url);
  await expect(page.locator(".fm-parts")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  await expect(page.locator('[data-fact="questions"] .fm-tile-value')).toHaveText("2");
  await expect(page.locator('[data-fact="time"] .fm-tile-value')).toHaveText("1 min 30 s");
});

test("reload offers Continue with the same plan and answers; Start over asks first", async ({ page }) => {
  const seen = watch(page);
  await page.goto(parts.url);
  await page.getByRole("button", { name: "Start" }).click();
  const before = await idsOn(page);
  await right(page, before[0] as string);
  await right(page, before[3] as string);
  const key = await savedKey(page);
  expect(key).toMatch(/^fullmark:v1:parts:[0-9a-f]{64}:attempt$/);

  await page.reload();
  await expect(page.locator("[data-resume]")).toHaveText(/^Started \d+ \w+ · 2 of 12 answered · \d\d:\d\d used$/);
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start over" })).toBeVisible();
  // the part picker is hidden while an attempt can be continued
  await expect(page.locator(".fm-parts")).toHaveCount(0);
  await expect(page.locator(".fm-question").first()).toBeHidden();
  await noViolations(page);

  // Start over asks first: Cancel keeps everything
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByRole("dialog", { name: "Start over?" })).toBeVisible();
  await noViolations(page);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await savedKey(page)).toBe(key);

  await page.getByRole("button", { name: "Continue" }).click();
  expect(await idsOn(page)).toEqual(before);
  await expect(page.getByLabel(`right ${before[0]}`)).toBeChecked();
  await expect(page.getByLabel(`right ${before[3]}`)).toBeChecked();
  await expect(page.getByLabel(`right ${before[1]}`)).not.toBeChecked();

  // reload again and confirm Start over: the answers and the saved attempt are gone
  await page.reload();
  await page.getByRole("button", { name: "Start over" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Start over" }).click();
  await expect(page.locator(".fm-parts")).toBeVisible();
  expect(await savedKey(page)).toBeNull();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator('input[type="radio"]:checked')).toHaveCount(0);
  expect(seen.problems).toEqual([]);
});

test("a submitted attempt reopens on its results until New attempt", async ({ page }) => {
  await page.goto(parts.url);
  await page.getByRole("button", { name: "Start" }).click();
  const ids = await idsOn(page);
  await right(page, ids[0] as string);
  await submitAttempt(page);
  const total = await page.locator(".fm-total").textContent();
  const statuses = await page
    .locator(".fm-result")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-status")));

  await page.reload();
  await expect(page.locator(".fm-total")).toHaveText(total ?? "");
  expect(
    await page.locator(".fm-result").evaluateAll((els) => els.map((el) => el.getAttribute("data-status"))),
  ).toEqual(statuses);
  expect(await idsOn(page)).toEqual(ids);
  await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download results" })).toBeVisible();
  await noViolations(page);

  await page.getByRole("button", { name: "New attempt" }).click();
  await expect(page.locator(".fm-parts")).toBeVisible();
  await expect(page.locator(".fm-total")).toHaveCount(0);
  expect(await savedKey(page)).toBeNull();
  await page.reload();
  await expect(page.locator(".fm-parts")).toBeVisible();
});

test("one part: only its questions, and the export grades the same with quiz grade", async ({ page }) => {
  await page.goto(parts.url);
  await page.getByRole("radio", { name: /Geometry/ }).check();
  await page.getByRole("button", { name: "Start" }).click();
  expect((await idsOn(page)).sort()).toEqual(["ge1", "ge2"]);
  await expect(page.getByRole("heading", { level: 2, name: "Geometry" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Algebra" })).toHaveCount(0);
  await right(page, "ge1");
  await submitAttempt(page);
  const results = await expectGradeMatches(page, parts.dir, "parts.md");
  expect(results.map((r) => r.id).sort()).toEqual(["ge1", "ge2"]);
  const { file } = await exported(page, parts.dir);
  expect(file.plan.source).toBe("section");
  expect(file.plan.section).toBe("geometry");
  expect(file.plan.questions.slice().sort()).toEqual(["ge1", "ge2"]);
  expect(file.plan.seed).toMatch(/^[a-z0-9]{8}$/);
});

test("a timed quiz runs on the clock, submits itself with timedOut, and grades the same", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-29T10:00:00") });
  await page.goto(timed.url);
  await page.clock.pauseAt(new Date("2026-10-29T10:00:10"));
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator("[data-timer]")).toHaveText("Time left 01:30");
  await right(page, "t1");
  await page.clock.runFor(31_000);
  await expect(page.locator("[data-timer]")).toHaveText("Time left 00:59");
  // 5 minutes was never announced (the quiz is shorter); 1 minute is, once
  await expect(page.locator('[role="status"]').filter({ hasText: "minute" })).toHaveText("1 minute left");
  await page.clock.runFor(50_000);
  await expect(page.locator(".fm-total")).toHaveCount(0);
  await page.clock.runFor(10_000);
  await expect(page.locator(".fm-total")).toBeVisible();
  await expect(page.locator('[data-notice="timed-out"]')).toHaveText("Time ran out, so your answers were submitted.");
  const { name, file } = await exported(page, timed.dir);
  expect(file.state.timedOut).toBe(true);
  expect(file.state.timeUsed).toBe(90);
  expect(file.state.answers.t1).toEqual({ choice: 0 });
  const out = JSON.parse(run(timed.dir, "grade", name, "--quiz", "timed.md", "--json").split("\n")[0] ?? "");
  const report = JSON.parse(readFileSync(join(timed.dir, out.report ?? out.reports?.[0] ?? ""), "utf8"));
  expect(report.score.earned).toBe(1);
  expect(report.score.points).toBe(2);
});

test("a page reopened after the deadline submits on open", async ({ page }) => {
  await page.goto(timed.url);
  await page.getByRole("button", { name: "Start" }).click();
  await right(page, "t1");
  // closed for ten minutes: the next load finds the saved start ten minutes back (the page saves again as it leaves, so
  // the edit is made by a script that runs when the next load begins)
  await page.addInitScript(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith(":attempt"));
    if (!key) return;
    const saved = JSON.parse(localStorage.getItem(key) as string);
    saved.startMs -= 600_000;
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();
  await expect(page.locator(".fm-total")).toBeVisible();
  await expect(page.locator('[data-notice="timed-out"]')).toBeVisible();
  await expect(page.locator("dialog[data-submit-dialog]")).toHaveCount(0);
  const { file } = await exported(page, timed.dir);
  expect(file.state.timedOut).toBe(true);
  expect(file.state.timeUsed).toBe(90);
  expect(file.state.answers.t1).toEqual({ choice: 0 });
});

test("an untimed quiz counts only the time the page is visible", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-29T10:00:00") });
  await page.goto(parts.url);
  await page.clock.pauseAt(new Date("2026-10-29T10:00:10"));
  await page.getByRole("button", { name: "Start" }).click();
  await page.clock.runFor(10_000);
  await expect(page.locator("[data-timer]")).toHaveText("Time 00:10");
  const visibility = (state: "hidden" | "visible") =>
    page.evaluate((s) => {
      Object.defineProperty(document, "visibilityState", { value: s, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
  await visibility("hidden");
  await page.clock.runFor(60_000);
  await visibility("visible");
  await page.clock.runFor(5_000);
  await expect(page.locator("[data-timer]")).toHaveText("Time 00:15");
  await submitAttempt(page);
  const { file } = await exported(page, parts.dir);
  expect(file.state.timeUsed).toBe(15);
  expect(file.state.timedOut).toBe(false);
  // the seconds went to a section that was on screen
  const spent = Object.values(file.state.sectionTime).reduce((a, b) => a + b, 0);
  expect(spent).toBe(15);
});

test("storage blocked: the page says so, and still starts, submits and exports", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });
  });
  const seen = watch(page);
  await page.goto(parts.url);
  const notice = "This browser is not saving your progress. Export before you close the page.";
  await expect(page.locator('[data-notice="storage"]')).toHaveText(notice);
  await noViolations(page);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator('[data-notice="storage"]')).toHaveText(notice);
  await right(page, (await idsOn(page))[0] as string);
  await submitAttempt(page);
  await expectGradeMatches(page, parts.dir, "parts.md");
  expect(seen.problems).toEqual([]);
});

test("a working storage shows no notice", async ({ page }) => {
  await page.goto(parts.url);
  await expect(page.locator('[data-notice="storage"]')).toHaveCount(0);
});

test("the page shows the items in the order the plan drew, and the export records it", async ({ page }) => {
  await page.goto(types.url);
  await page.getByRole("button", { name: "Start" }).click();
  const source = ["zq-parse", "zq-check", "zq-render"];
  const shown = await card(page, "o1").locator(".fm-order-text").allTextContents();
  expect(shown).not.toEqual(source);
  await submitAttempt(page);
  const { file } = await exported(page, types.dir);
  const order = file.plan.optionOrder.o1 ?? [];
  expect(order.map((i) => source[i])).toEqual(shown);
});
