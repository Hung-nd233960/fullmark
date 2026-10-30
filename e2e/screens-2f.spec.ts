import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildIn, card, root, submitAttempt } from "./helpers";

/**
 * Screenshots of slice 2f for the owner to compare with the Design canvas. Not part of `npm run check`: run with
 * FULLMARK_SCREENS=1 npx playwright test e2e/screens-2f.spec.ts --project=chromium. They land in docs/screens/2f/, which is committed for the owner's review.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");
test.use({ viewport: { width: 1280, height: 940 } });

const chrome = buildIn("test/fixtures/page/chrome.md", "chrome.md");
const out = (name: string) => join(root, "docs", "screens", "2f", `${name}.png`);

async function answering(page: import("@playwright/test").Page) {
  await page.goto(chrome.url);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByLabel("right d1").check();
  await card(page, "d1").getByRole("button", { name: "Flag for review" }).click();
  await page.getByLabel("right f3").check();
}

test("the docked bar and status line while answering", async ({ page }) => {
  await page.goto(chrome.url);
  await page.screenshot({ path: out("1-start-with-focus-box") });
  await answering(page);
  await page.screenshot({ path: out("2-answering") });
});

test("after Submit", async ({ page }) => {
  await answering(page);
  await submitAttempt(page);
  await expect(page.locator(".fm-results")).toBeVisible();
  await page.screenshot({ path: out("3-submitted") });
});

test("on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await answering(page);
  await page.screenshot({ path: out("4-phone-answering") });
});

test("in Focus mode", async ({ page }) => {
  await answering(page);
  await page.keyboard.press("f");
  await expect(page.locator('[data-seg="clock"]')).toBeVisible();
  await page.screenshot({ path: out("5-focus-mode") });
});
