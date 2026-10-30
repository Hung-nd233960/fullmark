import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { buildWith, card, root } from "./helpers";

/**
 * Screenshots of slice 2h3: the Vietnamese example in each of the four fonts (stacked diacritics, none clipped), one
 * question card per font with the heights measured, the Appearance menu with the Font row (wide and phone), the
 * one-question row with its flag at the top right, and the Licences popup. Not part of `npm run check`: run with
 * FULLMARK_SCREENS=1 npx playwright test e2e/screens-2h3.spec.ts --project=chromium. They land in docs/screens/2h3/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");
test.describe.configure({ mode: "serial" });

const dir = join(root, "docs", "screens", "2h3");
const out = (name: string) => join(dir, `${name}.png`);
const FONTS = ["system", "sans", "serif", "readable"] as const;
const VI = "test/fixtures/page/vi-fonts.md";
const start = (page: Page) => page.getByRole("button", { name: "Bắt đầu" }).click();
const heights: Record<string, { row: number; card: number }> = {};

for (const font of FONTS) {
  test(`${font}: the Vietnamese example, stacked diacritics, row and card heights`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 940 });
    await page.goto(buildWith(VI, `vi-${font}.md`, [`font: ${font}`, "theme: light"]).url);
    await start(page);
    await page.evaluate(() => document.fonts.ready);
    if (font !== "system")
      expect(await page.evaluate((f) => document.fonts.check(`16px "${f}"`, "ế"), family(font))).toBe(true);
    // no element with a clipping overflow cuts its text off
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".fm-question *")]
        .filter((el) => getComputedStyle(el).overflowY !== "visible" && el.scrollHeight > el.clientHeight + 1)
        .map((el) => el.className),
    );
    expect(clipped).toEqual([]);
    const row = card(page, "q1").locator(".fm-choice").first();
    heights[font] = {
      row: (await row.boundingBox())?.height ?? 0,
      card: (await card(page, "q1").boundingBox())?.height ?? 0,
    };
    await page.screenshot({ path: out(`1-vi-${font}`) });
    await card(page, "q2").screenshot({ path: out(`2-stacked-${font}`) });
    await card(page, "q1").screenshot({ path: out(`3-card-${font}`) });
  });
}

test("the row and card heights across the four fonts", async () => {
  mkdirSync(dir, { recursive: true });
  const rows = FONTS.map((f) => heights[f]?.row ?? 0);
  const cards = FONTS.map((f) => heights[f]?.card ?? 0);
  writeFileSync(join(dir, "heights.json"), `${JSON.stringify(heights, null, 2)}\n`);
  console.log(`HEIGHTS ${JSON.stringify(heights)}`);
  console.log(
    `spread: row ${Math.max(...rows) - Math.min(...rows)} px, card ${Math.max(...cards) - Math.min(...cards)} px`,
  );
});

function family(font: (typeof FONTS)[number]): string {
  return { system: "Segoe UI", sans: "Be Vietnam Pro", serif: "Source Serif 4", readable: "Lexend" }[font];
}

const all = () => buildWith(VI, "vi-all.md", ["font: sans", "theme: light"], ["--fonts", "all"]);

test("the Appearance menu with the Font row, wide", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(all().url);
  await start(page);
  await page.getByRole("button", { name: "Giao diện" }).click();
  await page.screenshot({ path: out("4-menu-font-wide") });
});

test.describe("the phone, 390 x 844", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the Appearance menu with the Font row", async ({ page }) => {
    await page.goto(all().url);
    await page.getByRole("button", { name: "Bắt đầu" }).tap();
    await page.getByRole("button", { name: "Giao diện" }).tap();
    await page.screenshot({ path: out("5-menu-font-phone") });
  });
});

test("the one-question row with its flag at the top right", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(buildWith("test/fixtures/page/oneq.md", "oneq.md", ["theme: light"]).url);
  await page.getByRole("button", { name: "Start" }).click();
  await card(page, "b1").getByRole("radio").first().check();
  await card(page, "b1").getByRole("button", { name: "Flag for review" }).click();
  await page.screenshot({ path: out("6-oneq-flag") });
  await page.locator('[data-part="b"]').screenshot({ path: out("7-oneq-flag-row") });
});

test("the Licences popup open", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(all().url);
  await page.locator("[data-action=licences]").click();
  await expect(page.locator("dialog#fm-licences")).toBeVisible();
  await page.screenshot({ path: out("8-licences") });
});
