import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { buildIn, card, root } from "./helpers";

/**
 * Screenshots of slice 2f2 for the owner to compare with the Quiz, Results and Focus boards. Not part of
 * `npm run check`: run with FULLMARK_SCREENS=1 npx playwright test e2e/screens-2f2.spec.ts --project=chromium. They
 * land in docs/screens/2f2/, which is committed for the owner's review.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");
test.use({ viewport: { width: 1280, height: 940 } });

const map = buildIn("test/fixtures/page/map.md", "map.md");
const out = (name: string) => join(root, "docs", "screens", "2f2", `${name}.png`);

async function answering(page: Page): Promise<void> {
  await page.goto(map.url);
  await page.getByRole("button", { name: "Start" }).click();
  for (let i = 1; i <= 6; i++) await page.getByLabel(new RegExp(`right m${i}$`)).check();
  await card(page, "m7").getByLabel("two").check();
  await card(page, "m9").getByRole("button", { name: "Flag for review" }).click();
  await card(page, "m9").locator("button.fm-move:not([disabled])").first().focus();
  await card(page, "m9").scrollIntoViewIfNeeded();
}

test("answering with the sidebar open and closed", async ({ page }) => {
  await answering(page);
  await page.screenshot({ path: out("1-answering-sidebar-open") });
  await page.keyboard.press("Escape");
  await expect(page.locator("aside.fm-side")).toHaveCount(0);
  await page.screenshot({ path: out("2-answering-sidebar-closed") });
});

test("after Submit with the results map", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1560 });
  await page.goto(map.url);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByLabel(/right m1$/).check();
  await page.getByLabel(/wrong m2$/).check();
  await card(page, "m2").getByRole("button", { name: "Flag for review" }).click();
  await card(page, "m7").getByLabel("two").check();
  await card(page, "m8").getByRole("textbox").fill("an answer");
  await page.getByLabel(/wrong m4$/).check();
  await card(page, "m4").getByRole("button", { name: "Flag for review" }).click();
  await page.locator(".fm-topbar").getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".fm-results")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: out("3-submitted-results-map") });
});

test("in Focus mode, and the sidebar opened there", async ({ page }) => {
  await answering(page);
  await page.keyboard.press("f");
  await expect(page.locator('[data-seg="clock"]')).toBeVisible();
  await expect(page.locator("aside.fm-side")).toHaveCount(0);
  await page.screenshot({ path: out("4-focus-mode-sidebar-closed") });
  await page.locator("[data-action=sidebar]").click();
  await expect(page.locator("aside.fm-side")).toBeVisible();
  await page.screenshot({ path: out("5-focus-mode-sidebar-opened") });
});

test("the ordering question mid-drag with the live numbers", async ({ page }) => {
  await answering(page);
  const q = card(page, "m9");
  const handle = await q.locator(".fm-order-item").nth(0).locator(".fm-drag-handle").boundingBox();
  const target = await q.locator(".fm-order-item").nth(2).boundingBox();
  if (handle === null || target === null) throw new Error("not on the page");
  await page.mouse.move(handle.x + 22, handle.y + 22);
  await page.mouse.down();
  await page.mouse.move(handle.x + 22, handle.y + 60, { steps: 4 });
  await page.mouse.move(handle.x + 22, target.y + target.height / 2 + 8, { steps: 6 });
  await expect(q.locator(".fm-order-slot")).toHaveCount(1);
  await page.screenshot({ path: out("6-ordering-dragging-live-numbers") });
  await page.mouse.up();
});
