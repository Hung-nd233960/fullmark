import { test as base, expect, type Page } from "@playwright/test";

const test = base;

import { buildWith, noViolations, watch } from "./helpers";

/**
 * A− / A+ (TECHNICAL_DESIGN.md, section 8, "The look"): five sizes, 15 to 23 px. The test that matters: at every size the
 * page keeps its layout (no sideways scroll at 390 px, every target 44 px high) and the size survives a reload under
 * both `look: free` and `look: locked`.
 */
const SOURCE = "test/fixtures/page/map.md";
const open = (extra: string[], name: string) => buildWith(SOURCE, `${name}.md`, extra);

const rootSize = (page: Page) =>
  page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
const smaller = (page: Page) => page.getByRole("button", { name: "Smaller text" });
const larger = (page: Page) => page.getByRole("button", { name: "Larger text" });
const start = (page: Page) => page.getByRole("button", { name: "Start" }).click();
/** after a reload the quiz may offer to continue; the look does not depend on it */
const resume = async (page: Page): Promise<void> => {
  const again = page.getByRole("button", { name: "Continue" });
  if (await again.isVisible()) await again.click();
};
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
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

for (const look of ["free", "locked"]) {
  test(`A+ to the top and A- to the bottom disable at the ends, and the size survives a reload (look: ${look})`, async ({
    page,
  }) => {
    const quiz = open([`look: ${look}`], `size-${look}`);
    const seen = watch(page);
    await page.goto(quiz.url);
    await start(page);
    expect(await rootSize(page)).toBe(17);
    const pair = page.locator("[data-textsize]");
    await expect(pair).toHaveCount(1);
    expect((await pair.boundingBox())?.height).toBe(44);
    for (const size of [19, 21, 23]) {
      await larger(page).click();
      expect(await rootSize(page)).toBe(size);
    }
    await expect(larger(page)).toBeDisabled();
    await expect(larger(page)).toHaveAttribute("aria-disabled", "true");
    await page.reload();
    expect(await rootSize(page)).toBe(23);
    await resume(page);
    for (const size of [21, 19, 17, 15]) {
      await smaller(page).click();
      expect(await rootSize(page)).toBe(size);
    }
    await expect(smaller(page)).toBeDisabled();
    await expect(smaller(page)).toHaveAttribute("aria-disabled", "true");
    await page.reload();
    expect(await rootSize(page)).toBe(15);
    expect(seen.problems).toEqual([]);
  });
}

test("the start screen shows the stored size, and the page at 23 px keeps its layout at 1280 px (no sideways scroll)", async ({
  page,
}) => {
  const quiz = open([], "size-start");
  await page.goto(quiz.url);
  await start(page);
  for (let i = 0; i < 3; i++) await larger(page).click();
  await page.reload();
  expect(await rootSize(page)).toBe(23);
  await resume(page);
  expect(await noSideways(page)).toBe(true);
});

test("Default look resets the theme and the size", async ({ page }) => {
  const quiz = open(["theme: paper"], "size-reset");
  await page.goto(quiz.url);
  await start(page);
  await larger(page).click();
  await page.getByRole("button", { name: "Appearance" }).click();
  await page.locator('[data-theme-pick="dark"]').click();
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("dark");
  expect(await rootSize(page)).toBe(19);
  await page.getByRole("button", { name: "Default look" }).click();
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBeNull();
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-size"))).toBeNull();
  expect(await rootSize(page)).toBe(17);
  await page.reload();
  expect(await rootSize(page)).toBe(17);
});

const phone = base.extend({
  page: async ({ browser, browserName }, use) => {
    const touch = browserName === "chromium" ? { hasTouch: true, isMobile: true } : { hasTouch: true };
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...touch });
    await use(await context.newPage());
    await context.close();
  },
});

for (const look of ["free", "locked"]) {
  phone(
    `on a phone at 23 px: no sideways scroll, every button 44 px, the line whole, Text size in the menu (look: ${look})`,
    async ({ page }) => {
      const quiz = open([`look: ${look}`], `size-phone-${look}`);
      const seen = watch(page);
      await page.goto(quiz.url);
      await start(page);
      const bar = page.locator(".fm-topbar");
      // the pair is not in the bar on a phone; the menu button is there under both looks
      await expect(bar.locator("[data-textsize]")).toHaveCount(0);
      const menu = bar.getByRole("button", { name: "Appearance" });
      await expect(menu).toBeVisible();
      await menu.click();
      const row = page.locator("[data-look-menu]");
      await expect(row.getByText("Text size", { exact: true })).toBeVisible();
      if (look === "locked") await expect(row.locator("[data-theme-pick]")).toHaveCount(0);
      else await expect(row.locator("[data-theme-pick]").first()).toBeVisible();
      for (let i = 0; i < 3; i++) await larger(page).click();
      expect(await rootSize(page)).toBe(23);
      await expect(larger(page)).toBeDisabled();
      // the compact line and no drawn title
      const line = bar.locator("[data-compact]");
      await expect(line).toBeVisible();
      expect(await line.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
      expect(await line.evaluate((e) => getComputedStyle(e).textOverflow)).not.toBe("ellipsis");
      expect(await noSideways(page)).toBe(true);
      expect(await shortButtons(page)).toEqual([]);
      await noViolations(page);
      await page.reload();
      expect(await rootSize(page)).toBe(23);
      expect(seen.problems).toEqual([]);
    },
  );
}

const reset = (page: Page) => page.locator("[data-action=reset-size]");

for (const look of ["free", "locked"]) {
  test(`the middle button shows the size as a percentage: inert at 100%, resets otherwise and is stored (look: ${look})`, async ({
    page,
  }) => {
    const quiz = open([`look: ${look}`], `size-pct-${look}`);
    await page.goto(quiz.url);
    await start(page);
    const box = await reset(page).boundingBox();
    expect(box?.width).toBeCloseTo(46, 0);
    expect(box?.height).toBe(44);
    await expect(reset(page)).toHaveText("100%");
    await expect(reset(page)).toHaveAttribute("aria-disabled", "true");
    await expect(reset(page)).toHaveAccessibleName("Text size 100%");
    await expect(reset(page)).toHaveAttribute("title", "Text size 100%");
    await reset(page).click({ force: true });
    expect(await rootSize(page)).toBe(17);
    const inert = await reset(page).evaluate((el) => getComputedStyle(el).color);

    await larger(page).click();
    expect(await rootSize(page)).toBe(19);
    await expect(reset(page)).toHaveText("112%");
    await expect(reset(page)).toHaveAttribute("aria-disabled", "false");
    await expect(reset(page)).toHaveAccessibleName("Text size 112%, reset to 100%");
    await expect(reset(page)).toHaveAttribute("title", "Back to 100%");
    expect(await reset(page).evaluate((el) => getComputedStyle(el).color)).not.toBe(inert);
    await larger(page).click();
    await expect(reset(page)).toHaveText("124%");
    await larger(page).click();
    await expect(reset(page)).toHaveText("135%");
    await reset(page).click({ force: true });
    expect(await rootSize(page)).toBe(17);
    await expect(reset(page)).toHaveText("100%");
    await smaller(page).click();
    await expect(reset(page)).toHaveText("88%");
    await page.reload();
    expect(await rootSize(page)).toBe(15);
    await resume(page);
    await reset(page).click({ force: true });
    await page.reload();
    expect(await rootSize(page)).toBe(17);
    await noViolations(page);
  });
}

for (const look of ["free", "locked"]) {
  phone(`the phone menu's Text size row has the same middle button (look: ${look})`, async ({ page }) => {
    const quiz = open([`look: ${look}`], `size-pct-phone-${look}`);
    await page.goto(quiz.url);
    await start(page);
    await page.locator(".fm-topbar").getByRole("button", { name: "Appearance" }).click();
    const row = page.locator("[data-look-menu]");
    await expect(row.locator("[data-action=reset-size]")).toHaveText("100%");
    await larger(page).click();
    await expect(row.locator("[data-action=reset-size]")).toHaveText("112%");
    await row.locator("[data-action=reset-size]").click();
    expect(await rootSize(page)).toBe(17);
    await larger(page).click();
    await page.reload();
    await resume(page);
    expect(await rootSize(page)).toBe(19);
    await page.locator(".fm-topbar").getByRole("button", { name: "Appearance" }).click();
    await expect(page.locator("[data-look-menu] [data-action=reset-size]")).toHaveText("112%");
    expect(await shortButtons(page)).toEqual([]);
    await noViolations(page);
  });
}
