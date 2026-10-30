import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import { buildFolder, run } from "./helpers";

/**
 * One map cell everywhere (TECHNICAL_DESIGN.md, section 8, row "Question map"): every cell is square, 40 px (44 px on a
 * phone), in the sidebar with and without materials and in the phone tabs; the columns follow from the width.
 */
const test = base;
const phone = base.extend({
  page: async ({ browser, browserName }, use) => {
    const touch = browserName === "chromium" ? { hasTouch: true, isMobile: true } : { hasTouch: true };
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...touch });
    await use(await context.newPage());
    await context.close();
  },
});

const plain = buildFolder("test/fixtures/page", "map.md");
const materials = buildFolder("test/fixtures/page", "materials.md");
/** the materials quiz with one more part of 40 questions, so its map has to scroll */
const long = buildFolder("test/fixtures/page", "materials.md");
appendFileSync(
  join(long.dir, "materials.md"),
  [
    "",
    "# Long {id=long}",
    "",
    ...Array.from(
      { length: 40 },
      (_, i) => `## Question l${i + 1}? {type=single id=l${i + 1} points=1}\n\n- [x] right\n- [ ] wrong\n`,
    ),
  ].join("\n"),
);
run(long.dir, "build", "materials.md", "--built-at", "2026-10-28T10:00:00+07:00");

async function start(page: Page, url: string, width = 1280): Promise<void> {
  await page.setViewportSize({ width, height: 940 });
  await page.goto(url);
  await page.getByRole("button", { name: "Start" }).click();
}

/** the width and height of every visible grid cell (not the one-question row, which is a heading, not a cell) */
const sizes = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".fm-grid .fm-cell")]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .map((r) => `${Math.round(r.width * 10) / 10}x${Math.round(r.height * 10) / 10}`),
  );
const allEqual = (list: string[], size: string) => list.length > 0 && list.every((s) => s === size);

test("without materials the sidebar's cells are 40 x 40, from the left, with the number at 0.82em", async ({
  page,
}) => {
  await start(page, plain.url);
  expect(allEqual(await sizes(page), "40x40")).toBe(true);
  const grid = page.locator("aside.fm-side .fm-grid >> visible=true").first();
  expect(
    await grid.evaluate((el) =>
      getComputedStyle(el)
        .gridTemplateColumns.split(" ")
        .every((c) => c === "40px"),
    ),
  ).toBe(true);
  const [g, first] = [await grid.boundingBox(), await grid.locator(".fm-cell").first().boundingBox()];
  expect(Math.abs((g?.x ?? 0) - (first?.x ?? 99))).toBeLessThan(1);
  const font = await grid
    .locator(".fm-cell")
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return Number.parseFloat(s.fontSize) / Number.parseFloat(getComputedStyle(document.body).fontSize);
    });
  expect(font).toBeCloseTo(0.82, 2);
});

test("with materials the stacked sidebar's cells are 40 x 40 too", async ({ page }) => {
  await start(page, materials.url);
  await expect(page.locator(".fm-grid-mini")).toBeVisible();
  expect(allEqual(await sizes(page), "40x40")).toBe(true);
});

test("the materials map scrolls after about four rows", async ({ page }) => {
  await start(page, long.url);
  await page.getByRole("tab", { name: /Long/ }).click();
  const mini = page.locator(".fm-grid-mini");
  await expect(mini).toBeVisible();
  const [client, scroll] = await mini.evaluate((el) => [el.clientHeight, el.scrollHeight]);
  expect(scroll).toBeGreaterThan(client);
  expect(client).toBe(196);
  expect(await mini.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
  expect(allEqual(await sizes(page), "40x40")).toBe(true);
});

test("cells are still buttons the Tab key walks in order (the grid has no arrow-key movement)", async ({ page }) => {
  await start(page, plain.url);
  await page.locator("aside.fm-side [data-cell]").first().focus();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-cell"))).toBe("m2");
});

for (const [name, url] of [
  ["without materials", plain.url],
  ["with materials", materials.url],
] as const) {
  phone(`on a phone the tabs' cells are 44 x 44 (${name})`, async ({ page }) => {
    await start(page, url, 390);
    await page.locator("[data-action=sidebar]").click();
    expect(allEqual(await sizes(page), "44x44")).toBe(true);
    const grid = page.locator("aside.fm-side .fm-grid >> visible=true").first();
    expect(
      await grid.evaluate((el) =>
        getComputedStyle(el)
          .gridTemplateColumns.split(" ")
          .every((c) => c === "44px"),
      ),
    ).toBe(true);
    expect(await grid.evaluate((el) => getComputedStyle(el).rowGap)).toBe("6px");
  });
}
