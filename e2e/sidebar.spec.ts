import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { buildIn, card, noViolations, run, watch } from "./helpers";

/**
 * The sidebar and the question map (TECHNICAL_DESIGN.md, section 8, rows "Sidebar" and "Question map"). The test that
 * matters: the map always tells the truth, and the sidebar never covers or traps the questions.
 */
const map = buildIn("test/fixtures/page/map.md", "map.md");

const side = (page: Page) => page.locator("aside.fm-side");
const cell = (page: Page, id: string) => side(page).locator(`[data-cell="${id}"]`);
const head = (page: Page, part: string) => side(page).locator(`[data-part="${part}"] [data-part-head]`);

async function start(page: Page, width = 1280): Promise<void> {
  await page.setViewportSize({ width, height: 940 });
  await page.goto(map.url);
  await page.getByRole("button", { name: "Start" }).click();
}

const answeredCells = (page: Page) => side(page).locator("[data-cell][data-answered]");
const submit = (page: Page) => page.locator(".fm-topbar").getByRole("button", { name: "Submit" }).click();

test("the button and Q open and close the sidebar, Esc closes it and returns the focus", async ({ page }) => {
  const seen = watch(page);
  await page.goto(map.url);
  await expect(page.locator("[data-action=sidebar]")).toHaveCount(0); // not on the start screen
  await start(page);
  await expect(side(page)).toBeVisible();
  await expect(side(page)).toHaveAttribute("aria-label", "Sidebar");
  await expect(side(page).getByRole("heading", { name: "Questions" })).toBeVisible();
  const toggle = page.locator("[data-action=sidebar]");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toHaveAttribute("aria-keyshortcuts", "Q");
  await expect(toggle).toHaveAttribute("title", "The question map (Q)");
  // before Focus mode in the top bar
  const order = await page.locator(".fm-topbar-actions button").evaluateAll((els) => els.map((e) => e.textContent));
  expect(order.slice(0, 2)).toEqual(["Questions", "Focus mode"]);

  await toggle.click();
  await expect(side(page)).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(side(page)).toBeVisible();

  await page.getByRole("button", { name: "Close the sidebar" }).click();
  await expect(side(page)).toHaveCount(0);
  await expect(toggle).toBeFocused();

  // Q opens it and the focus goes to the current part's heading; Q closes it again
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("q");
  await expect(side(page)).toBeVisible();
  await expect(head(page, "sig")).toBeFocused();
  await page.keyboard.press("q");
  await expect(side(page)).toHaveCount(0);

  // Esc closes it, and the focus returns to the button
  await page.keyboard.press("q");
  await expect(side(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(side(page)).toHaveCount(0);
  await expect(toggle).toBeFocused();
  expect(seen.problems).toEqual([]);
  expect(seen.requests).toEqual([]);
});

test("Q typed in a text box does nothing", async ({ page }) => {
  await start(page);
  await expect(side(page)).toBeVisible();
  const box = card(page, "m8").getByRole("textbox");
  await box.click();
  await page.keyboard.type("quiet");
  await expect(box).toHaveValue("quiet");
  await expect(side(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(side(page)).toBeVisible();
});

test("the state is kept, and a first visit opens it from 1100 px", async ({ page }) => {
  await start(page, 1280);
  await expect(side(page)).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(side(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(side(page)).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(side(page)).toHaveCount(0);
  // stored: a wide window does not reopen it
  await page.keyboard.press("q");
  await expect(side(page)).toBeVisible();
  await page.reload();
  await page.setViewportSize({ width: 900, height: 900 });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(side(page)).toBeVisible();
});

test("a first visit at 900 px starts closed", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 900 } });
  const page = await context.newPage();
  await page.goto(map.url);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(side(page)).toHaveCount(0);
  await expect(page.locator("[data-action=sidebar]")).toHaveAttribute("aria-expanded", "false");
  await context.close();
});

test("the questions keep their reading width when it is closed and share the room when it is open", async ({
  page,
}) => {
  await start(page);
  const column = async () => (await card(page, "m1").boundingBox()) as { x: number; width: number };
  const open = await column();
  const aside = (await side(page).boundingBox()) as { x: number; width: number };
  expect(aside.width).toBeCloseTo(320, 0);
  expect(aside.x + aside.width).toBeCloseTo(1280, 0);
  expect(open.x + open.width).toBeLessThanOrEqual(aside.x);
  await page.keyboard.press("Escape");
  const closed = await column();
  expect(closed.x + closed.width / 2).toBeCloseTo(640, 0);
});

test("Focus mode closes the sidebar, the button opens it in full screen, leaving keeps it closed", async ({ page }) => {
  await start(page);
  await expect(side(page)).toBeVisible();
  await page.keyboard.press("f");
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await expect(side(page)).toHaveCount(0);
  await page.locator("[data-action=sidebar]").click();
  await expect(side(page)).toBeVisible();
  await page.keyboard.press("f");
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
  await expect(side(page)).toBeVisible(); // opened in full screen, so still as the learner left it
});

test("while answering, the cells follow answers, flags and the current question", async ({ page }) => {
  await start(page);
  // three parts, the current one open
  await expect(side(page).locator("[data-part-head]")).toHaveCount(3);
  await expect(head(page, "sig")).toHaveText(/1 · Signals.*0\/6/);
  await expect(head(page, "sig")).toHaveAttribute("aria-expanded", "true");
  await expect(head(page, "fourier")).toHaveAttribute("aria-expanded", "false");
  await expect(side(page).locator("[data-cell]")).toHaveCount(6);
  await expect(cell(page, "m1")).toHaveAttribute("aria-label", "Question 1, current");

  await page.getByLabel(/right m2$/).check();
  await expect(cell(page, "m2")).toHaveAttribute("aria-label", "Question 2, answered, current");
  await expect(cell(page, "m1")).toHaveAttribute("aria-label", "Question 1");
  await expect(head(page, "sig")).toContainText("1/6");
  await expect(head(page, "sig")).toContainText("1 of 6 answered");

  await card(page, "m4").getByRole("button", { name: "Flag for review" }).click();
  await expect(cell(page, "m4")).toHaveAttribute("aria-label", "Question 4, flagged, current");
  await expect(head(page, "sig")).toContainText("1/6 · 1 flag");
  await expect(head(page, "sig")).toContainText("1 of 6 answered, 1 flagged");

  // a card in another part: its part opens, the old one closes, the current question moves
  await page.getByLabel(/right m11$/).check();
  await expect(head(page, "fourier")).toHaveAttribute("aria-expanded", "true");
  await expect(head(page, "sig")).toHaveAttribute("aria-expanded", "false");
  await expect(cell(page, "m11")).toHaveAttribute("aria-label", "Question 11, answered, current");
  await expect(page.locator('[data-seg="question"]')).toHaveText("Question 11 of 18");
  await expect(page.locator('[data-seg="progress"]')).toContainText("2 of 18 answered");

  // the learner's own opening and closing wins
  await head(page, "fourier").click();
  await expect(head(page, "fourier")).toHaveAttribute("aria-expanded", "false");
  await head(page, "sig").click();
  await expect(head(page, "sig")).toHaveAttribute("aria-expanded", "true");
  await expect(cell(page, "m1")).toBeVisible();
  await page.getByLabel(/right m12$/).check();
  await expect(head(page, "fourier")).toHaveAttribute("aria-expanded", "false");
  await expect(answeredCells(page)).toHaveCount(1);
  await expect(head(page, "fourier")).toContainText("2/6");
  await noViolations(page);
});

test("a cell scrolls to its question, focuses it and becomes the current question", async ({ page }) => {
  await start(page);
  await head(page, "sampling").click();
  await cell(page, "m16").click();
  const target = card(page, "m16");
  await expect(target).toBeInViewport();
  await expect(target.getByLabel(/right m16$/)).toBeFocused();
  await expect(page.locator('[data-seg="question"]')).toHaveText("Question 16 of 18");
  await expect(cell(page, "m16")).toHaveAttribute("aria-current", "true");
  // below the docked block, not under it
  const dock = (await page.locator("[data-dock]").boundingBox()) as { y: number; height: number };
  const top = (await target.boundingBox()) as { y: number };
  expect(top.y).toBeGreaterThanOrEqual(dock.y + dock.height - 1);
  // an ordering question: the first control is a move button
  await head(page, "fourier").click();
  await cell(page, "m9").click();
  await expect(card(page, "m9")).toBeInViewport();
  await expect(card(page, "m9").locator("button.fm-move:not([disabled])").first()).toBeFocused();
});

test("the sidebar never traps the questions: the page and the map keep their own scroll", async ({ page }) => {
  await start(page);
  await card(page, "m18").scrollIntoViewIfNeeded();
  await expect(card(page, "m18")).toBeInViewport();
  const { top, height } = await side(page).evaluate((el) => ({
    top: el.getBoundingClientRect().top,
    height: el.getBoundingClientRect().height,
  }));
  const dock = (await page.locator("[data-dock]").boundingBox()) as { y: number; height: number };
  expect(top).toBeCloseTo(dock.y + dock.height, 0);
  expect(top + height).toBeCloseTo(940, 0);
});

test("below 760 px an open sidebar covers the questions at full width, and closes", async ({ page }) => {
  await start(page, 700);
  await page.locator("[data-action=sidebar]").click();
  const box = (await side(page).boundingBox()) as { x: number; width: number };
  expect(box).toMatchObject({ x: 0, width: 700 });
  await page.getByRole("button", { name: "Back to question 1" }).click();
  await expect(side(page)).toHaveCount(0);
  await expect(card(page, "m1")).toBeInViewport();
});

type Report = { questions: { id: string; status: string }[] };

test("after Submit, each cell's state is what quiz grade gives for the export", async ({ page }) => {
  await start(page);
  await page.getByLabel(/right m1$/).check(); // correct
  await page.getByLabel(/wrong m2$/).check(); // wrong
  await card(page, "m2").getByRole("button", { name: "Flag for review" }).click();
  // m3 left: unanswered
  await card(page, "m7").getByLabel("two").check(); // partly right
  await card(page, "m8").getByRole("textbox").fill("an answer"); // waits for a grader
  await submit(page);
  await expect(page.locator(".fm-results")).toBeVisible();
  await expect(side(page)).toBeVisible();

  // heading rows with the part scores, always open
  await expect(side(page).locator("[data-part-head]")).toHaveCount(0);
  await expect(side(page).locator("[data-part]")).toHaveCount(3);
  await expect(side(page).locator('[data-part="sig"] [data-part-score]')).toHaveText("1 / 6 · 17%");
  await expect(side(page).locator("[data-cell]")).toHaveCount(18);
  // every state is shown, with words on the cell and a mark that is not read
  const word = {
    m1: ["correct", "Question 1, correct"],
    m2: ["incorrect", "Question 2, wrong, flagged"],
    m3: ["unanswered", "Question 3, unanswered"],
    m7: ["partial", "Question 7, partly right"],
    m8: ["pending", "Question 8, waiting for a grader"],
  } as const;
  for (const [id, [state, label]] of Object.entries(word)) {
    await expect(cell(page, id)).toHaveAttribute("data-state", state);
    await expect(cell(page, id)).toHaveAttribute("aria-label", label);
  }
  await expect(cell(page, "m1").locator(".fm-cell-glyph")).toHaveAttribute("aria-hidden", "true");
  await expect(side(page).locator(".fm-legend-results li")).toHaveCount(6);

  // against quiz grade on the exported file
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download results" }).click();
  const file = await download;
  await file.saveAs(join(map.dir, file.suggestedFilename()));
  const out = JSON.parse(
    run(map.dir, "grade", file.suggestedFilename(), "--quiz", "map.md", "--json").split("\n")[0] ?? "",
  );
  const report = JSON.parse(readFileSync(join(map.dir, out.report ?? out.reports?.[0] ?? ""), "utf8")) as Report;
  expect(report.questions.length).toBe(18);
  for (const q of report.questions) {
    await expect(cell(page, q.id), q.id).toHaveAttribute("data-state", q.status);
  }

  // a cell whose card the Missed filter hides sets the filter to All first
  await page.locator('[data-filter="missed"]').click();
  await expect(card(page, "m1")).toBeHidden();
  await expect(side(page).locator("[data-cell]")).toHaveCount(18);
  await cell(page, "m1").click();
  await expect(page.locator('[data-filter="all"]')).toHaveAttribute("aria-pressed", "true");
  await expect(card(page, "m1")).toBeVisible();
  await expect(card(page, "m1")).toBeFocused();
  await noViolations(page);
});

test("axe is clean with the sidebar open, while answering and after Submit", async ({ page }) => {
  await start(page);
  await page.getByLabel(/right m1$/).check();
  await head(page, "fourier").click();
  await expect(side(page)).toBeVisible();
  await noViolations(page);
  await submit(page);
  await expect(side(page).locator("[data-state]").first()).toBeVisible();
  await noViolations(page);
});
