import { expect, type Page, test } from "@playwright/test";
import { buildIn, card, noViolations, submitAttempt } from "./helpers";

/**
 * Submit asks first (TECHNICAL_DESIGN.md, section 8, row "Submit asks first"). The test that matters: Submit never ends
 * an attempt without a second, deliberate press, except when the clock runs out; and the summary agrees with the status
 * line and the map.
 */
const map = buildIn("test/fixtures/page/map.md", "submit-map.md");
const timed = buildIn("test/fixtures/page/timed.md", "submit-timed.md");
const instant = buildIn("test/fixtures/page/instant.md", "submit-instant.md");
const results = buildIn("test/fixtures/page/results.md", "submit-results.md");
const vi = buildIn("test/fixtures/page/chrome-vi.md", "submit-vi.md");

const bar = (page: Page) => page.locator(".fm-topbar [data-action=submit]");
const dialog = (page: Page) => page.locator("dialog[data-submit-dialog]");
const phase = (page: Page) => page.locator("section.fm-quiz").getAttribute("data-phase");
const lineOf = (page: Page, kind: string) => dialog(page).locator(`[data-line="${kind}"]`);
const focusedCard = (page: Page) =>
  page.evaluate(() => document.activeElement?.closest("article")?.getAttribute("data-qid"));

async function start(page: Page, url = map.url): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(url);
  await page.getByRole("button", { name: /^(Start|Bắt đầu)$/ }).click();
}

test("Submit opens the dialog with the summary; Keep answering has the focus; nothing is submitted", async ({
  page,
}) => {
  await start(page);
  await page.getByLabel(/right m1$/).check();
  await page.getByLabel(/right m2$/).check();
  await card(page, "m5").getByRole("button", { name: "Flag for review" }).click();
  await bar(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole("heading", { name: "Submit your answers?" })).toBeVisible();
  await expect(dialog(page)).toContainText("You can't change them after this.");
  await expect(lineOf(page, "answered")).toHaveText("2 of 18 answered");
  await expect(lineOf(page, "unanswered")).toContainText("16 not answered");
  await expect(lineOf(page, "flagged")).toContainText("1 flagged");
  await expect(lineOf(page, "clock")).toContainText(/\d+:\d\d used/);
  // the same count as the status line
  await expect(page.locator('[data-seg="progress"]')).toContainText("2 of 18 answered");
  await expect(dialog(page).getByRole("button", { name: "Keep answering" })).toBeFocused();
  expect(await phase(page)).toBe("answering");
  // the colours: not answered in --bad, flagged in --flag
  const colour = (kind: string) =>
    lineOf(page, kind)
      .locator("span")
      .evaluate((el) => getComputedStyle(el).color);
  expect(await colour("unanswered")).not.toBe(await colour("answered"));
  expect(await colour("flagged")).not.toBe(await colour("unanswered"));
  await noViolations(page);
});

test("Esc, Enter on Keep answering, the button and a click outside each cancel; the focus returns to Submit", async ({
  page,
}) => {
  await start(page);
  await bar(page).click();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(bar(page)).toBeFocused();
  expect(await phase(page)).toBe("answering");

  await bar(page).click();
  await expect(dialog(page).getByRole("button", { name: "Keep answering" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toHaveCount(0);
  await expect(bar(page)).toBeFocused();
  expect(await phase(page)).toBe("answering");

  await bar(page).click();
  await dialog(page).getByRole("button", { name: "Keep answering" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(bar(page)).toBeFocused();
  expect(await phase(page)).toBe("answering");

  // a click inside, on the padding beside the title, keeps it open; a click outside cancels
  await bar(page).click();
  const box = await dialog(page).boundingBox();
  if (box === null) throw new Error("no dialog box");
  await page.mouse.click(box.x + 6, box.y + 6);
  await expect(dialog(page)).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(dialog(page)).toHaveCount(0);
  await expect(bar(page)).toBeFocused();
  expect(await phase(page)).toBe("answering");
});

test("only a press on Submit in the dialog submits, even with everything answered", async ({ page }) => {
  await start(page, timed.url);
  for (const id of ["t1", "t2"]) await page.getByLabel(new RegExp(`right ${id}$`)).check();
  await bar(page).click();
  await expect(lineOf(page, "answered")).toHaveText("2 of 2 answered");
  await expect(lineOf(page, "unanswered")).toHaveCount(0);
  await expect(lineOf(page, "flagged")).toHaveCount(0);
  await dialog(page).getByRole("button", { name: "Submit", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator(".fm-results")).toBeVisible();
  expect(await phase(page)).toBe("submitted");
});

test("Go to the first lands on the first not answered and the first flagged question", async ({ page }) => {
  await start(page);
  await page.getByLabel(/right m1$/).check();
  await page.getByLabel(/right m2$/).check();
  await card(page, "m9").getByRole("button", { name: "Flag for review" }).click();
  await card(page, "m7").getByRole("button", { name: "Flag for review" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));

  await bar(page).click();
  await lineOf(page, "unanswered").getByRole("button", { name: "Go to the first" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(card(page, "m3")).toBeInViewport();
  await expect.poll(() => focusedCard(page)).toBe("m3");
  expect(await phase(page)).toBe("answering");
  await expect(card(page, "m3")).toHaveAttribute("data-current", "true");

  await bar(page).click();
  await lineOf(page, "flagged").getByRole("button", { name: "Go to the first" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(card(page, "m7")).toBeInViewport();
  await expect.poll(() => focusedCard(page)).toBe("m7");
  await expect(page.locator('[data-seg="question"]')).toHaveText("Question 7 of 18");
});

test("a timed attempt shows the time left; when the deadline passes the attempt submits with no dialog", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-29T10:00:00") });
  await page.goto(timed.url);
  await page.clock.pauseAt(new Date("2026-10-29T10:00:10"));
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByLabel(/right t1$/).check();
  await page.clock.runFor(10_000);
  await bar(page).click();
  await expect(lineOf(page, "clock")).toHaveText("01:20 left on the clock");
  // the clock runs out with the dialog open: it submits itself, and the dialog goes
  await page.clock.runFor(85_000);
  await expect(page.locator('[data-notice="timed-out"]')).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  expect(await phase(page)).toBe("submitted");
});

test("an instant-feedback question counts as answered once checked", async ({ page }) => {
  await start(page, instant.url);
  await page.getByLabel(/right i1$/).check();
  await bar(page).click();
  await expect(lineOf(page, "answered")).toContainText("1 of 4 answered");
  await dialog(page).getByRole("button", { name: "Keep answering" }).click();
  await card(page, "i1").getByRole("button", { name: "Check" }).click();
  await bar(page).click();
  await expect(lineOf(page, "answered")).toContainText("1 of 4 answered");
  await expect(page.locator('[data-seg="progress"]')).toContainText("1 of 4 answered");
  await dialog(page).getByRole("button", { name: "Submit", exact: true }).click();
  expect(await phase(page)).toBe("submitted");
});

test("Retry missed asks first too, and an untimed attempt shows the time used", async ({ page }) => {
  await start(page, results.url);
  await page.getByLabel("wrong r2").check();
  await submitAttempt(page);
  await page.getByRole("button", { name: /Retry missed/ }).click();
  await page.locator('[data-action="confirm-retry"]').click();
  await bar(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(lineOf(page, "clock")).toContainText(/used/);
  await page.keyboard.press("Escape");
  expect(await phase(page)).toBe("answering");
  await submitAttempt(page);
  expect(await phase(page)).toBe("submitted");
});

test("in Focus mode the dialog shows in full screen, and confirming leaves it", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "Focus mode" }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await bar(page).click();
  await expect(dialog(page)).toBeVisible();
  expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await dialog(page).getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.locator(".fm-results")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
});

test("in Vietnamese the strings are the design's", async ({ page }) => {
  await start(page, vi.url);
  await page.getByRole("button", { name: "Nộp bài" }).click();
  await expect(dialog(page).getByRole("heading", { name: "Nộp bài?" })).toBeVisible();
  await expect(dialog(page)).toContainText("Sau khi nộp, bạn không thể sửa câu trả lời.");
  await expect(lineOf(page, "answered")).toContainText(/^Đã trả lời 0 trên \d+$/);
  await expect(lineOf(page, "unanswered")).toContainText("câu chưa trả lời");
  await expect(lineOf(page, "clock")).toContainText(/^Còn \d+:\d\d$/);
  await expect(dialog(page).getByRole("button", { name: "Tiếp tục làm bài" })).toBeFocused();
  await expect(dialog(page).getByRole("button", { name: "Đến câu đầu tiên" })).toBeVisible();
});
