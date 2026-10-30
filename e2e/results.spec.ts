import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { buildIn, card, expectGradeMatches, noViolations, run, submitAttempt, watch } from "./helpers";

const results = buildIn("test/fixtures/page/results.md", "results.md");
const instant = buildIn("test/fixtures/page/instant.md", "instant.md");

const right = (page: Page, id: string) => page.getByLabel(`right ${id}`).check();
const wrong = (page: Page, id: string) => page.getByLabel(`wrong ${id}`).check();

/** The ids of the cards that are shown (not hidden), top to bottom. */
const shownIds = (page: Page): Promise<string[]> =>
  page
    .locator("article.fm-question:not([hidden])")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-qid") ?? ""));

type Report = {
  score: { earned: number; points: number; percent: number | null };
  sections: { id: string; earned: number; points: number; percent: number | null }[];
  attempt: { source: string; questions: number };
};

/** Downloads the results, grades them with `quiz grade`, and returns the report. */
async function graded(page: Page, dir: string, quizFile: string): Promise<Report> {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download results" }).click();
  const file = await download;
  await file.saveAs(join(dir, file.suggestedFilename()));
  const out = JSON.parse(
    run(dir, "grade", file.suggestedFilename(), "--quiz", quizFile, "--json").split("\n")[0] ?? "",
  );
  return JSON.parse(readFileSync(join(dir, out.report ?? out.reports?.[0] ?? ""), "utf8")) as Report;
}

/** The card's score, and each part's row, against what `quiz grade` says of the export. */
async function expectCardMatches(page: Page, report: Report): Promise<void> {
  const total = page.locator(".fm-total");
  expect(Number(await total.getAttribute("data-earned"))).toBeCloseTo(report.score.earned, 6);
  expect(Number(await total.getAttribute("data-points"))).toBeCloseTo(report.score.points, 6);
  const percent = Number(await total.getAttribute("data-percent"));
  expect(Math.abs(percent - (report.score.percent ?? 0))).toBeLessThanOrEqual(0.5);
  const rows = await page.locator(".fm-part-row").evaluateAll((els) =>
    els.map((el) => ({
      id: el.getAttribute("data-part") ?? "",
      earned: Number(el.getAttribute("data-earned")),
      points: Number(el.getAttribute("data-points")),
    })),
  );
  if (report.sections.length > 1) {
    expect(rows.map((r) => r.id)).toEqual(report.sections.map((s) => s.id));
    for (const [i, row] of rows.entries()) {
      expect(row.earned).toBeCloseTo(report.sections[i]?.earned ?? NaN, 6);
      expect(row.points).toBeCloseTo(report.sections[i]?.points ?? NaN, 6);
    }
  } else {
    expect(rows).toEqual([]);
  }
}

async function answerSome(page: Page): Promise<void> {
  await right(page, "r1");
  await wrong(page, "r2");
  // r3 is left
  await right(page, "r4");
  await wrong(page, "r5");
  await page.getByLabel("two r6").check(); // partly right
  await card(page, "r2").getByRole("button", { name: "Flag for review" }).click();
  await card(page, "r5").getByRole("button", { name: "Flag for review" }).click();
}

test("nothing is marked right or wrong while answering", async ({ page }) => {
  await page.goto(results.url);
  await page.getByRole("button", { name: "Start" }).click();
  await wrong(page, "r1");
  await right(page, "r2");
  await expect(page.locator("[data-correct]")).toHaveCount(0);
  await expect(page.locator(".fm-result")).toHaveCount(0);
});

test("the flag toggles while answering, and survives a reload", async ({ page }) => {
  await page.goto(results.url);
  await page.getByRole("button", { name: "Start" }).click();
  const flag = card(page, "r1").getByRole("button", { name: "Flag for review" });
  await expect(flag).toHaveAttribute("aria-pressed", "false");
  await flag.click();
  await expect(flag).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(card(page, "r1").getByRole("button", { name: "Flag for review" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("the results card, the filter and Retry missed all agree with quiz grade", async ({ page }) => {
  const seen = watch(page);
  await page.goto(results.url);
  await page.getByRole("button", { name: "Start" }).click();
  await answerSome(page);
  await submitAttempt(page);

  // the card
  await expect(page.locator(".fm-results")).toBeVisible();
  await expect(page.locator('[data-cell="time"]')).toContainText("/ 30:00");
  await expect(page.locator(".fm-goal")).toBeVisible();
  await expect(page.locator(".fm-part-row")).toHaveCount(2);
  const report = await graded(page, results.dir, "results.md");
  expect(report.attempt.source).toBe("full");
  await expectCardMatches(page, report);
  await expectGradeMatches(page, results.dir, "results.md");
  await noViolations(page);

  // the filter: counts, the cards it shows, the order kept
  const all = await shownIds(page);
  expect(all).toHaveLength(6);
  await expect(page.locator('[data-filter="all"]')).toHaveText("All 6");
  await expect(page.locator('[data-filter="missed"]')).toHaveText("Missed 4");
  await expect(page.locator('[data-filter="flagged"]')).toHaveText("Flagged 2");
  await page.locator('[data-filter="missed"]').click();
  const missed = await shownIds(page);
  expect(missed).toHaveLength(4);
  expect(missed).toEqual(all.filter((id) => ["r2", "r3", "r5", "r6"].includes(id)));
  await noViolations(page);
  await page.locator('[data-filter="flagged"]').click();
  expect((await shownIds(page)).sort()).toEqual(["r2", "r5"]);
  await expect(card(page, "r2").locator("[data-flag-mark]")).toBeVisible();
  await page.locator('[data-filter="all"]').click();
  expect(await shownIds(page)).toEqual(all);

  // Retry missed: a confirm, then only the missed questions, with no time limit
  await page.getByRole("button", { name: "Retry missed (4)" }).click();
  await expect(page.getByRole("dialog")).toContainText("This replaces your results");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".fm-results")).toBeVisible();
  await page.getByRole("button", { name: "Retry missed (4)" }).click();
  await page.locator('[data-action="confirm-retry"]').click();
  await expect(page.locator(".fm-results")).toHaveCount(0);
  expect((await shownIds(page)).sort()).toEqual(["r2", "r3", "r5", "r6"]);
  await expect(page.locator("[data-timer]")).toHaveText(/^Time \d+:\d\d$/);
  await expect(page.locator("[data-correct]")).toHaveCount(0);
  for (const id of ["r2", "r3", "r5"]) await right(page, id);
  await page.getByLabel("two r6").check();
  await page.getByLabel("three r6").check();
  await submitAttempt(page);
  const retry = await graded(page, results.dir, "results.md");
  expect(retry.attempt.source).toBe("retry");
  expect(retry.attempt.questions).toBe(4);
  await expectCardMatches(page, retry);
  await expectGradeMatches(page, results.dir, "results.md");
  await expect(page.locator("[data-nothing-missed]")).toHaveText("Nothing missed");
  await expect(page.getByRole("button", { name: /Retry missed/ })).toHaveCount(0);
  // the retry replaced the saved attempt: reopening shows its results
  await page.reload();
  await expect(page.locator(".fm-results")).toBeVisible();
  await expect(page.locator("[data-nothing-missed]")).toBeVisible();
  expect(seen.problems).toEqual([]);
  expect(seen.requests).toEqual([]);
});

test("a one-part attempt is scored on its own part", async ({ page }) => {
  await page.goto(results.url);
  await page.getByRole("radio", { name: /Geometry/ }).check();
  await page.getByRole("button", { name: "Start" }).click();
  await right(page, "r4");
  await submitAttempt(page);
  const report = await graded(page, results.dir, "results.md");
  expect(report.attempt.source).toBe("section");
  await expectCardMatches(page, report);
  // one part: no per-part rows
  await expect(page.locator(".fm-part-row")).toHaveCount(0);
});

test("instant feedback: Check shows the result and locks the answer, and a reload keeps it", async ({ page }) => {
  const seen = watch(page);
  await page.goto(instant.url);
  await page.getByRole("button", { name: "Start" }).click();
  const check1 = card(page, "i1").getByRole("button", { name: "Check" });
  await expect(check1).toBeDisabled();
  await expect(card(page, "i4").getByRole("button", { name: "Check" })).toHaveCount(0);
  await wrong(page, "i1");
  await expect(check1).toBeEnabled();
  await check1.click();
  const first = card(page, "i1");
  await expect(first.locator(".fm-result")).toContainText("Wrong");
  await expect(first.locator(".fm-explanation")).toContainText("Explained i1.");
  await expect(first.getByLabel("right i1")).toBeDisabled();
  await expect(first.getByLabel("wrong i1")).toBeChecked();
  await expect(first.locator('[data-correct="true"]')).toHaveCount(1);
  await expect(first.getByRole("button", { name: "Check" })).toHaveCount(0);
  await expect(page.locator('.fm-sr[role="status"]')).toHaveText("Question 1: Wrong");
  // the others show nothing
  await expect(card(page, "i2").locator(".fm-result")).toHaveCount(0);
  await expect(card(page, "i2").locator("[data-correct]")).toHaveCount(0);
  await noViolations(page);

  // a reload keeps it locked
  await page.reload();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(card(page, "i1").getByLabel("right i1")).toBeDisabled();
  await expect(card(page, "i1").locator(".fm-result")).toContainText("Wrong");

  // an unchecked answer is graded at Submit all the same
  await right(page, "i2");
  await page.getByLabel("False").check();
  await submitAttempt(page);
  await expect(card(page, "i2").locator(".fm-result")).toContainText("Correct");
  const report = await graded(page, instant.dir, "instant.md");
  await expectCardMatches(page, report);
  await expectGradeMatches(page, instant.dir, "instant.md");
  expect(seen.problems).toEqual([]);
});

test("the export of an instant-feedback attempt lists what was checked", async ({ page }) => {
  await page.goto(instant.url);
  await page.getByRole("button", { name: "Start" }).click();
  await right(page, "i1");
  await card(page, "i1").getByRole("button", { name: "Check" }).click();
  await submitAttempt(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download results" }).click();
  const file = await download;
  const path = join(instant.dir, file.suggestedFilename());
  await file.saveAs(path);
  expect(JSON.parse(readFileSync(path, "utf8")).state.checked).toEqual(["i1"]);
});
