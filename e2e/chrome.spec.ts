import { expect, test } from "@playwright/test";
import { buildIn, card, noViolations, watch } from "./helpers";

/**
 * The top bar, the status line and Focus mode (TECHNICAL_DESIGN.md, section 8). The test that matters: the status line
 * always tells the truth, and Focus mode never traps the learner.
 */
const chrome = buildIn("test/fixtures/page/chrome.md", "chrome.md");
const vi = buildIn("test/fixtures/page/chrome-vi.md", "chrome-vi.md");

const seg = (page: import("@playwright/test").Page, kind: string) => page.locator(`[data-seg="${kind}"]`);

test("the status line follows each answer, flag and move, and the timer stays visible", async ({ page }) => {
  const seen = watch(page);
  await page.goto(chrome.url);
  await expect(page.locator("[data-dock]")).toHaveCount(0);
  await page.getByRole("button", { name: "Start" }).click();

  await expect(seg(page, "time")).toHaveText(/^Time left (29:5\d|30:00)$/);
  await expect(seg(page, "part")).toContainText("Part 1 of 2, Definitions: ");
  await expect(seg(page, "question")).toHaveText("Question 1 of 14");
  await expect(seg(page, "progress")).toContainText("0 of 14 answered");
  await expect(page.getByRole("progressbar", { name: "0 of 14 answered" })).toBeVisible();
  await expect(seg(page, "flags")).toHaveCount(0);

  await page.getByLabel("right d1").check();
  await expect(seg(page, "progress")).toContainText("1 of 14 answered");
  await expect(seg(page, "progress")).toContainText("7%");

  await card(page, "d1").getByRole("button", { name: "Flag for review" }).click();
  await expect(seg(page, "flags")).toHaveText("1 flagged");

  // a question in another part: the part and the question segments follow
  await page.getByLabel("right f3").check();
  await expect(seg(page, "question")).toHaveText("Question 5 of 14");
  await expect(seg(page, "part")).toContainText("Part 2 of 2, Fourier transform: ");
  await expect(seg(page, "progress")).toContainText("2 of 14 answered");

  // scrolled to the last question: the bar is docked and the timer is still there
  await card(page, "f12").scrollIntoViewIfNeeded();
  await expect(seg(page, "time")).toBeInViewport();
  await expect(page.locator("[data-dock]")).toBeInViewport();

  // the one Submit is in the top bar
  await expect(page.getByRole("button", { name: "Submit" })).toHaveCount(1);
  await expect(page.locator(".fm-topbar").getByRole("button", { name: "Submit" })).toBeVisible();
  await noViolations(page);

  await page.locator(".fm-topbar").getByRole("button", { name: "Submit" }).click();
  await expect(seg(page, "submitted")).toHaveText(/^Submitted \d{1,2} [A-Z][a-z]{2}, \d\d:\d\d$/);
  await expect(seg(page, "taken")).toHaveText("The whole quiz · 14 questions");
  await expect(seg(page, "used")).toHaveText(/^Time used \d+:\d\d of 30:00$/);
  // the filter sits in the docked block, under the status line
  await expect(page.locator("[data-dock] .fm-filter")).toBeVisible();
  await expect(page.locator(".fm-results > h2")).toHaveCount(0);
  await noViolations(page);
  expect(seen.problems).toEqual([]);
  expect(seen.requests).toEqual([]);
});

test("a vi page prints a decimal comma", async ({ page }) => {
  await page.goto(vi.url);
  await page.getByRole("button", { name: "Bắt đầu" }).click();
  await expect(page.locator(".fm-question-points")).toHaveText("2,5 điểm");
  await expect(seg(page, "time")).toContainText("Còn lại");
  await page.getByLabel("đúng v1").check();
  await page.getByRole("button", { name: "Nộp bài" }).click();
  await expect(page.locator('[data-cell="points"]')).toHaveText("2,5 / 2,5");
  await expect(page.locator(".fm-result")).toContainText("2,5 trên 2,5 điểm");
});

/**
 * Fullscreen needs a user gesture; Playwright's clicks and key presses are trusted input, so Chromium grants it. Where
 * a browser refuses it headless, the tests fall back to asserting that the request was made.
 */
const fullscreenNow = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.fullscreenElement !== null);

async function recordRequests(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __fsRequests: number };
    w.__fsRequests = 0;
    const original = Element.prototype.requestFullscreen;
    Element.prototype.requestFullscreen = function (...args) {
      w.__fsRequests += 1;
      return original.apply(this, args);
    };
  });
}
const requests = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __fsRequests: number }).__fsRequests);

test("Focus mode: the button and F enter and leave, the clock shows, Submit leaves", async ({ page }) => {
  await recordRequests(page);
  await page.goto(chrome.url);
  await page.getByRole("button", { name: "Start" }).click();
  const button = page.getByRole("button", { name: "Focus mode" });
  await expect(button).toHaveAttribute("aria-pressed", "false");

  await button.click();
  await expect.poll(() => requests(page)).toBe(1);
  await expect.poll(() => fullscreenNow(page)).toBe(true);
  await expect(page.getByRole("button", { name: "Leave focus mode" })).toHaveAttribute("aria-pressed", "true");
  await expect(seg(page, "clock")).toHaveText(/^Clock \d\d:\d\d · Esc leaves full screen$/);
  await expect(seg(page, "time")).toBeVisible();

  // F leaves, F enters
  await page.keyboard.press("f");
  await expect.poll(() => fullscreenNow(page)).toBe(false);
  await expect(seg(page, "clock")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Focus mode" })).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("f");
  await expect.poll(() => fullscreenNow(page)).toBe(true);

  // Submit leaves full screen
  await page.getByRole("button", { name: "Submit" }).click();
  await expect.poll(() => fullscreenNow(page)).toBe(false);
  await expect(seg(page, "clock")).toHaveCount(0);
});

test("F typed in a short-answer box does not toggle Focus mode", async ({ page }) => {
  await recordRequests(page);
  await page.goto(chrome.url);
  await page.getByRole("button", { name: "Start" }).click();
  await card(page, "d2").getByRole("textbox").fill("");
  await card(page, "d2").getByRole("textbox").press("f");
  await card(page, "d2").getByRole("textbox").press("Shift+F");
  await expect(card(page, "d2").getByRole("textbox")).toHaveValue("fF");
  expect(await requests(page)).toBe(0);
  expect(await fullscreenNow(page)).toBe(false);
});

test("the Focus mode checkbox, then Start, enters full screen", async ({ page }) => {
  await recordRequests(page);
  await page.goto(chrome.url);
  const box = page.getByRole("checkbox", { name: "Focus mode" });
  await expect(box).not.toBeChecked();
  await noViolations(page);
  await box.check();
  await page.getByRole("button", { name: "Start" }).click();
  await expect.poll(() => requests(page)).toBe(1);
  await expect.poll(() => fullscreenNow(page)).toBe(true);
  await expect(seg(page, "clock")).toBeVisible();
});

test("where the browser has no fullscreen for pages, there is no button and no checkbox", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, "fullscreenEnabled", { value: false, configurable: true });
  });
  await page.goto(chrome.url);
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Focus mode" })).toHaveCount(0);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator("[data-dock]")).toBeVisible();
  await expect(page.locator('[data-action="focus-mode"]')).toHaveCount(0);
  // F does nothing
  await page.keyboard.press("f");
  await expect(page.locator("[data-dock]")).toBeVisible();
});
