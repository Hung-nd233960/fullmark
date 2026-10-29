import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildFolder, card, root } from "./helpers";

/**
 * Screenshots of slice 2f3 for the owner to compare with the MaterialsStacked, Materials, MaterialsFocus and Start
 * boards. Not part of `npm run check`: run with FULLMARK_SCREENS=1 npx playwright test e2e/screens-2f3.spec.ts
 * --project=chromium. They land in docs/screens/2f3/, which is committed for the owner's review.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");
test.use({ viewport: { width: 1280, height: 940 } });

const quiz = buildFolder("test/fixtures/page", "materials.md");
const out = (name: string) => join(root, "docs", "screens", "2f3", `${name}.png`);

test("the stacked sidebar while answering, part 2 chosen", async ({ page }) => {
  await page.goto(quiz.url);
  await page.getByRole("button", { name: "Start" }).click();
  for (let i = 1; i <= 4; i++) await page.getByLabel(new RegExp(`right m${i}$`)).check();
  await page.getByLabel(/right m5$/).check();
  await card(page, "m6").getByRole("button", { name: "Flag for review" }).click();
  await page.getByRole("tab", { name: /^Part 2/ }).click();
  await card(page, "m6").scrollIntoViewIfNeeded();
  await page.screenshot({ path: out("1-materials-stacked") });
});

test("after Submit, the Materials tab", async ({ page }) => {
  await page.goto(quiz.url);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByLabel(/right m1$/).check();
  await page.getByLabel(/wrong m2$/).check();
  await page.locator(".fm-topbar").getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".fm-results")).toBeVisible();
  await page.getByRole("tab", { name: "Materials" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: out("2-materials-tab-after-submit") });
});

test("in Focus mode with the sidebar opened", async ({ page }) => {
  await page.goto(quiz.url);
  await page.getByRole("button", { name: "Start" }).click();
  await page.keyboard.press("f");
  await expect(page.locator('[data-seg="clock"]')).toBeVisible();
  await page.locator("[data-action=sidebar]").click();
  await expect(page.locator("aside.fm-side")).toBeVisible();
  await page.screenshot({ path: out("3-materials-focus") });
});

test("the start screen with the Materials panel open", async ({ page }) => {
  await page.goto(quiz.url);
  await page.getByRole("button", { name: "Materials", exact: true }).click();
  await expect(page.locator("aside.fm-shelf")).toBeVisible();
  await page.screenshot({ path: out("4-start-materials") });
});
