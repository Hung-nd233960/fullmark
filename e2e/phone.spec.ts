import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { buildFolder, card, noViolations, watch } from "./helpers";

/**
 * The page on a phone, below 760 px (TECHNICAL_DESIGN.md, section 8, rows "Top bar and status line", "Sidebar",
 * "Materials"). The test that matters: on a 390 x 844 touch screen everything the wide page offers is reachable, every
 * target is 44 px high, nothing scrolls sideways but a wide table in its own box, and the questions behind an open
 * sidebar can be neither seen nor tabbed to. Chromium runs as a touch phone; Firefox has no mobile mode, so it runs
 * as a narrow window without touch.
 */
const test = base.extend({
  page: async ({ browser, browserName }, use) => {
    const touch = browserName === "chromium" ? { hasTouch: true, isMobile: true } : {};
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...touch });
    await use(await context.newPage());
    await context.close();
  },
});

const quiz = buildFolder("test/fixtures/page", "materials.md");
const plain = buildFolder("test/fixtures/page", "map.md");

const side = (page: Page) => page.locator("aside.fm-side");
const bar = (page: Page) => page.locator(".fm-topbar");
const toggle = (page: Page) => page.locator("[data-action=sidebar]");
const back = (page: Page) => page.locator("[data-action=close-sidebar]");
const chip = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
/** the top bar is one row (title, then the buttons, all on one line), with the long title cut short */
const oneRow = async (page: Page): Promise<void> => {
  const boxes = await bar(page)
    .locator("h1, button")
    .evaluateAll((els) => els.map((e) => ({ y: e.getBoundingClientRect().y, h: e.getBoundingClientRect().height })));
  const first = boxes[0] as { y: number; h: number };
  for (const b of boxes.slice(1)) expect(Math.abs(b.y + b.h / 2 - (first.y + first.h / 2))).toBeLessThan(40);
  const bounds = (await bar(page).boundingBox()) as { height: number };
  expect(bounds.height).toBeLessThan(76);
  const title = bar(page).locator("h1");
  expect(await title.evaluate((e) => getComputedStyle(e).textOverflow)).toBe("ellipsis");
  expect(await title.evaluate((e) => e.getBoundingClientRect().right)).toBeLessThanOrEqual(390);
};
const press = async (page: Page, target: Locator): Promise<void> => {
  if (await page.evaluate(() => "ontouchstart" in window)) await target.tap();
  else await target.click();
};

async function begin(page: Page, url = quiz.url): Promise<void> {
  await page.goto(url);
  await page.getByRole("button", { name: "Start" }).click();
}

const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** Every visible button under 44 px high (the covered and the screen-reader-only ones do not count). */
const shortButtons = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== "hidden" && !b.closest("[inert]");
      })
      .filter((b) => b.getBoundingClientRect().height < 43.5)
      .map((b) => `${b.className} ${(b.textContent ?? "").trim().slice(0, 20)} ${b.getBoundingClientRect().height}`),
  );

test("the compact bar: the title over one muted line that follows the answers, Submit in the bar", async ({ page }) => {
  const seen = watch(page);
  await begin(page);
  await expect(page.locator(".fm-status")).toHaveCount(0);
  await expect(page.locator("[data-compact]")).toHaveText(/^Time \d\d:\d\d · 0 of 12 answered$/);
  await page.getByLabel(/right m1$/).check();
  await expect(page.locator("[data-compact]")).toHaveText(/^Time \d\d:\d\d · 1 of 12 answered$/);
  const names = await bar(page)
    .locator("button")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? e.textContent));
  expect(names[0]).toBe("Questions & materials");
  expect(names.at(-1)).toBe("Submit");
  await expect(toggle(page)).toHaveText("");
  await expect(toggle(page)).toHaveAttribute("title", /./);
  await oneRow(page);
  expect(await shortButtons(page)).toEqual([]);
  expect(await noSideways(page)).toBe(true);
  await noViolations(page);
  await press(page, bar(page).getByRole("button", { name: "Submit" }));
  await expect(page.locator(".fm-results")).toBeVisible();
  await expect(page.locator("[data-compact]")).toHaveText(/^Submitted \d+ \w+, \d\d:\d\d$/);
  await expect(bar(page).getByRole("button", { name: "Submit" })).toHaveCount(0);
  expect(seen.problems).toEqual([]);
});

test("a quiz without materials: the button says Questions, the sidebar has the heading and the map", async ({
  page,
}) => {
  await begin(page, plain.url);
  await expect(toggle(page)).toHaveText("");
  await expect(toggle(page)).toHaveAttribute("aria-label", "Questions");
  await press(page, toggle(page));
  await expect(side(page).getByRole("heading", { name: "Questions" })).toBeVisible();
  await expect(side(page).getByRole("tab")).toHaveCount(0);
  await expect(back(page)).toHaveText("Back to question 1");
  expect(await shortButtons(page)).toEqual([]);
  await noViolations(page);
});

test("the sidebar takes the screen, the questions behind it cannot be tabbed to, the way back keeps the place", async ({
  page,
}) => {
  await begin(page);
  await expect(side(page)).toHaveCount(0); // closed to begin with on a phone
  await card(page, "m6").scrollIntoViewIfNeeded();
  await page.getByLabel(/right m6$/).check();
  const at = await page.evaluate(() => window.scrollY);
  expect(at).toBeGreaterThan(100);
  await press(page, toggle(page));
  const box = (await side(page).boundingBox()) as { x: number; width: number; y: number; height: number };
  const dock = (await page.locator("[data-dock]").boundingBox()) as { y: number; height: number };
  expect(box).toMatchObject({ x: 0, width: 390 });
  expect(box.y).toBeCloseTo(dock.y + dock.height, 0);
  expect(box.y + box.height).toBeCloseTo(844, 0);
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(back(page)).toHaveText("Back to question 6");
  await expect(card(page, "m6")).toBeHidden();
  await expect(chip(page, "Questions")).toHaveAttribute("aria-selected", "true");
  await expect(chip(page, "Materials")).toBeVisible();
  await back(page).focus();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.closest(".fm-questions") != null)).toBe(false);
  }
  expect(await shortButtons(page)).toEqual([]);
  expect(await noSideways(page)).toBe(true);
  await noViolations(page);
  await press(page, back(page));
  await expect(side(page)).toHaveCount(0);
  await expect(toggle(page)).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(at);
  await expect(card(page, "m6")).toBeVisible();
});

test("Esc, the sidebar button and Q close it; a tapped cell closes it and jumps to its question", async ({ page }) => {
  await begin(page);
  await press(page, toggle(page));
  await page.keyboard.press("Escape");
  await expect(side(page)).toHaveCount(0);
  await expect(toggle(page)).toBeFocused();
  await press(page, toggle(page));
  await press(page, toggle(page));
  await expect(side(page)).toHaveCount(0);
  await page.keyboard.press("q");
  await expect(side(page)).toBeVisible();
  // the collapsible part list with its grid; the second part holds m5
  await press(page, side(page).locator('[data-part="fourier"] [data-part-head]'));
  await press(page, side(page).locator('[data-cell="m5"]'));
  await expect(side(page)).toHaveCount(0);
  await expect(card(page, "m5")).toBeInViewport();
  await expect(card(page, "m5").locator("input").first()).toBeFocused();
});

test("the Materials tab: chips in one scrolling row, the sheet, a wide table in its own box", async ({ page }) => {
  await begin(page);
  await page.keyboard.press("m");
  await expect(chip(page, "Materials")).toHaveAttribute("aria-selected", "true");
  const row = page.locator(".fm-chips");
  await expect(row).toBeVisible();
  const tops = await row
    .locator("button")
    .evaluateAll((els) => els.map((b) => Math.round(b.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1); // one row, not wrapped
  expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true); // and it scrolls
  await expect(chip(page, "Fourier transform properties")).toHaveAttribute("aria-selected", "true");
  const table = page.locator(".fm-sheet table").first();
  await expect(table).toBeVisible();
  const wide = await table.evaluate((el) => ({
    scrolls: el.scrollWidth > el.clientWidth,
    width: el.getBoundingClientRect().width,
  }));
  expect(wide.scrolls).toBe(true);
  expect(wide.width).toBeLessThanOrEqual(390);
  expect(await noSideways(page)).toBe(true);
  expect(await shortButtons(page)).toEqual([]);
  await noViolations(page);
  await chip(page, "Units and constants").scrollIntoViewIfNeeded();
  await press(page, chip(page, "Units and constants"));
  await expect(page.locator(".fm-sheet")).toContainText("Quantity");
  expect(await noSideways(page)).toBe(true);
});

test("after Submit: the results map, Back to the results, the tabs and the filter", async ({ page }) => {
  await begin(page);
  await page.getByLabel(/right m1$/).check();
  await press(page, bar(page).getByRole("button", { name: "Submit" }));
  await expect(page.locator(".fm-results")).toBeVisible();
  await press(page, toggle(page));
  await expect(back(page)).toHaveText("Back to the results");
  await expect(side(page).locator("[data-cell]")).toHaveCount(12);
  await expect(side(page).locator('[data-cell="m1"]')).toHaveAttribute("data-state", "correct");
  await press(page, chip(page, "Materials"));
  await expect(page.locator(".fm-sheet").first()).toBeVisible();
  await press(page, chip(page, "Questions"));
  expect(await shortButtons(page)).toEqual([]);
  await noViolations(page);
  await press(page, back(page));
  await expect(page.locator(".fm-filter")).toBeVisible();
  const rows = await page
    .locator(".fm-filter-button")
    .evaluateAll((els) => els.map((e) => ({ y: e.getBoundingClientRect().y, w: e.getBoundingClientRect().width })));
  expect(new Set(rows.map((r) => Math.round(r.y))).size).toBe(1);
  expect(Math.max(...rows.map((r) => r.w)) - Math.min(...rows.map((r) => r.w))).toBeLessThan(3);
  expect(rows.reduce((sum, r) => sum + r.w, 0)).toBeGreaterThan(390 - 32 - 12);
  await press(page, page.locator('[data-filter="missed"]'));
  expect(await shortButtons(page)).toEqual([]);
  expect(await noSideways(page)).toBe(true);
  await noViolations(page);
});

test("the start screen's Materials panel takes the screen and hides the start screen", async ({ page }) => {
  await page.goto(quiz.url);
  await press(page, page.locator("[data-action=materials]"));
  const panel = page.locator("aside.fm-shelf");
  const box = (await panel.boundingBox()) as { x: number; y: number; width: number; height: number };
  expect(box).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Start" })).toBeHidden();
  await page.locator("[data-action=close-materials]").focus();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.closest(".fm-main") != null)).toBe(false);
  }
  expect(await noSideways(page)).toBe(true);
  expect(await shortButtons(page)).toEqual([]);
  await noViolations(page);
  await press(page, page.locator("[data-action=close-materials]"));
  await expect(panel).toHaveCount(0);
  await expect(page.locator("[data-action=materials]")).toBeFocused();
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
});

test("resizing from 1280 to 390 and back keeps the tab and the sheet", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  await begin(page);
  await press(page, chip(page, "Trigonometric identities"));
  await expect(side(page)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(back(page)).toBeVisible();
  await press(page, chip(page, "Materials"));
  await expect(chip(page, "Trigonometric identities")).toHaveAttribute("aria-selected", "true");
  await page.setViewportSize({ width: 1280, height: 940 });
  await expect(page.locator("[data-form=stacked]")).toBeVisible();
  await expect(chip(page, "Trigonometric identities")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-compact]")).toHaveCount(0);
  await expect(page.locator(".fm-status")).toBeVisible();
});
