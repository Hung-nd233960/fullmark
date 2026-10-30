import { expect, type Page, test } from "@playwright/test";
import { buildIn, card, noViolations, watch } from "./helpers";

/**
 * The part list's headings and rows (TECHNICAL_DESIGN.md, section 8, row "Question map"): a double-click or Enter on a
 * heading jumps to a question and leaves the heading as it was; Space still opens and closes it; after Submit a heading
 * jumps to the first question the filter shows; a part with one question is a single row.
 */
const oneq = buildIn("test/fixtures/page/oneq.md", "oneq.md");

const side = (page: Page) => page.locator("aside.fm-side");
const head = (page: Page, part: string) => side(page).locator(`[data-part="${part}"] [data-part-head]`);
const row = (page: Page, id: string) => side(page).locator(`[data-cell="${id}"].fm-cell-row`);
const submit = (page: Page) => page.locator(".fm-topbar").getByRole("button", { name: "Submit" }).click();

/** The id of the question card that holds the focus. */
const focused = (page: Page) =>
  page.evaluate(() => document.activeElement?.closest("article")?.getAttribute("data-qid") ?? null);

async function start(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(oneq.url);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(side(page)).toBeVisible();
}

test("a double-click on a heading jumps to the part's first unanswered question and leaves it closed", async ({
  page,
}) => {
  const seen = watch(page);
  await start(page);
  await expect(head(page, "r")).toHaveAttribute("aria-expanded", "false");
  await head(page, "r").dblclick();
  await expect.poll(() => focused(page)).toBe("r1");
  await expect(head(page, "r")).toHaveAttribute("aria-expanded", "false");
  // answered, the next jump goes to the next unanswered one
  await card(page, "r1").getByLabel("one r1").check();
  await head(page, "r").dblclick();
  await expect.poll(() => focused(page)).toBe("r2");
  await expect(head(page, "r")).toHaveAttribute("aria-expanded", "false");
  // an open heading stays open
  await head(page, "w").click();
  await expect(head(page, "w")).toHaveAttribute("aria-expanded", "true");
  await head(page, "w").dblclick();
  await expect(head(page, "w")).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => focused(page)).toBe("w1");
  expect(seen.problems).toEqual([]);
});

test("Enter on a heading jumps, Space opens and closes it", async ({ page }) => {
  await start(page);
  await head(page, "r").focus();
  await page.keyboard.press("Space");
  await expect(head(page, "r")).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Space");
  await expect(head(page, "r")).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect.poll(() => focused(page)).toBe("r1");
  await expect(head(page, "r")).toHaveAttribute("aria-expanded", "false");
  await expect(head(page, "r")).toHaveAccessibleDescription(
    "Double-click or press Enter to go to the first unanswered question",
  );
});

test("after Submit a heading jumps to the first question the filter shows", async ({ page }) => {
  const seen = watch(page);
  await start(page);
  await card(page, "w2").getByLabel("wrong w2").check(); // wrong
  await card(page, "w3").getByLabel("right w3").check(); // right
  await card(page, "w3").getByRole("button", { name: "Flag for review" }).click();
  await submit(page);
  await expect(page.locator(".fm-results")).toBeVisible();
  await expect(head(page, "w")).toHaveAccessibleDescription("Go to the first question shown");
  // All: the part's first question
  await head(page, "r").click();
  await expect.poll(() => focused(page)).toBe("r1");
  await head(page, "w").click();
  await expect.poll(() => focused(page)).toBe("w1");
  // Missed: w1 is unanswered, so also missed; answer-wise the first missed is w1
  await page.locator('[data-filter="missed"]').click();
  await head(page, "w").click();
  await expect.poll(() => focused(page)).toBe("w1");
  // Flagged: the only flagged question of the part is w3
  await page.locator('[data-filter="flagged"]').click();
  await head(page, "w").click();
  await expect.poll(() => focused(page)).toBe("w3");
  // Flagged shows none of the Review part: the heading goes nowhere
  await head(page, "r").click({ force: true }); // Playwright waits on an aria-disabled button otherwise
  expect(await focused(page)).toBeNull(); // the focus stayed on the heading: nothing was jumped to
  await expect(head(page, "r")).toHaveAttribute("aria-disabled", "true");
  await noViolations(page);
  expect(seen.problems).toEqual([]);
});

test("a part of one question is a single row that jumps and shows the cell's state, then its result", async ({
  page,
}) => {
  const seen = watch(page);
  await start(page);
  await expect(side(page).locator('[data-part="b"] .fm-grid')).toHaveCount(0);
  await expect(side(page).locator('[data-part="b"] [data-part-head]')).toHaveCount(0);
  await expect(side(page).locator('[data-part="w"] .fm-grid')).toHaveCount(1);
  await expect(row(page, "b1")).toHaveAccessibleName("Question 4, 2 · Bonus");
  await expect(row(page, "b1")).toHaveText("2 · Bonus");
  await row(page, "b1").click();
  await expect.poll(() => focused(page)).toBe("b1");
  // answered and flagged and current: the cell's own marks
  await card(page, "b1").getByLabel("right b1").check();
  await card(page, "b1").getByRole("button", { name: "Flag for review" }).click();
  await expect(row(page, "b1")).toHaveAttribute("data-answered", "true");
  await expect(row(page, "b1")).toHaveAttribute("data-flagged", "true");
  await expect(row(page, "b1")).toHaveAttribute("data-current", "true");
  await expect(row(page, "b1")).toHaveAccessibleName("Question 4, answered, flagged, current, 2 · Bonus");
  await noViolations(page);
  await submit(page);
  await expect(page.locator(".fm-results")).toBeVisible();
  await expect(row(page, "b1")).toHaveAttribute("data-state", "correct");
  await expect(row(page, "b1")).toHaveAttribute("data-flagged", "true");
  await expect(row(page, "b1")).toHaveAccessibleName("Question 4, correct, flagged, 2 · Bonus");
  await expect(row(page, "b1").locator(".fm-cell-glyph")).toHaveText("✓");
  await row(page, "b1").click();
  await expect.poll(() => focused(page)).toBe("b1");
  await noViolations(page);
  expect(seen.problems).toEqual([]);
});
