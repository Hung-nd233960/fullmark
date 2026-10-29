import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildFolder, card, root } from "./helpers";

/**
 * Screenshots of slice 2f4 for the owner to compare with the MaterialsPhone board's source (the board has no image
 * yet). Not part of `npm run check`: run with FULLMARK_SCREENS=1 npx playwright test e2e/screens-2f4.spec.ts
 * --project=chromium. They land in docs/screens/2f4/, which is committed for the owner's review.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const quiz = buildFolder("test/fixtures/page", "materials.md");
const out = (name: string) => join(root, "docs", "screens", "2f4", `${name}.png`);

async function answering(page: import("@playwright/test").Page) {
  await page.goto(quiz.url);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByLabel(/right m1$/).check();
  await page.getByLabel(/right m2$/).check();
  await card(page, "m2").getByRole("button", { name: "Flag for review" }).click();
}

test("answering, with the compact bar", async ({ page }) => {
  await answering(page);
  await page.screenshot({ path: out("1-answering-bar") });
});

test("the sidebar on Materials, the first sheet open", async ({ page }) => {
  await answering(page);
  await page.locator("[data-action=sidebar]").tap();
  await page.getByRole("tab", { name: "Materials", exact: true }).tap();
  await expect(page.locator(".fm-sheet")).toBeVisible();
  await page.screenshot({ path: out("2-sidebar-materials") });
});

test("the sidebar on Questions", async ({ page }) => {
  await answering(page);
  await page.locator("[data-action=sidebar]").tap();
  await page.locator('[data-part="fourier"] [data-part-head]').tap();
  await page.screenshot({ path: out("3-sidebar-questions") });
});

test("after Submit, the results map", async ({ page }) => {
  await answering(page);
  await page.locator(".fm-topbar").getByRole("button", { name: "Submit" }).tap();
  await expect(page.locator(".fm-results")).toBeVisible();
  await page.screenshot({ path: out("4-submitted") });
  await page.locator("[data-action=sidebar]").tap();
  await page.screenshot({ path: out("5-submitted-map") });
});

test("the start screen's Materials panel", async ({ page }) => {
  await page.goto(quiz.url);
  await page.locator("[data-action=materials]").tap();
  await expect(page.locator(".fm-sheet")).toBeVisible();
  await page.screenshot({ path: out("6-start-panel") });
});

test("the 2f screens' phone shot, regenerated", async ({ page }) => {
  const chrome = buildFolder("test/fixtures/page", "chrome.md");
  await page.goto(chrome.url);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByLabel("right d1").check();
  await page.getByLabel("right f3").check();
  await page.screenshot({ path: join(root, "docs", "screens", "2f", "4-phone-answering.png") });
});
