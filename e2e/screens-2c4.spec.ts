import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildIn, card, root, submitAttempt } from "./helpers";

/**
 * Screenshots of slice 2c4. Not part of `npm run check`: run with
 * FULLMARK_SCREENS=1 npx playwright test e2e/screens-2c4.spec.ts --project=chromium. They land in docs/screens/2c4/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");

const types = buildIn("test/fixtures/page/types.md", "types.md");
const parts = buildIn("test/fixtures/page/parts.md", "parts.md");
const out = (name: string) => join(root, "docs", "screens", "2c4", `${name}.png`);

test("ordering at rest, mid-drag and after Submit", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(types.url);
  await page.getByRole("button", { name: "Start" }).click();
  const q = card(page, "o2");
  await q.scrollIntoViewIfNeeded();
  await q.screenshot({ path: out("1-ordering-rest") });

  const handle = await q.locator(".fm-order-item").nth(0).locator(".fm-drag-handle").boundingBox();
  const target = await q.locator(".fm-order-item").nth(2).boundingBox();
  if (handle === null || target === null) throw new Error("not on the page");
  await page.mouse.move(handle.x + 22, handle.y + 22);
  await page.mouse.down();
  await page.mouse.move(handle.x + 22, handle.y + 60, { steps: 4 });
  await page.mouse.move(handle.x + 22, target.y + target.height / 2 + 8, { steps: 6 });
  await expect(q.locator(".fm-order-slot")).toHaveCount(1);
  await page.screenshot({ path: out("2-ordering-dragging") });
  await page.mouse.up();

  await submitAttempt(page);
  await expect(page.locator(".fm-results")).toBeVisible();
  await q.scrollIntoViewIfNeeded();
  await q.screenshot({ path: out("3-ordering-submitted") });
});

test("the hint closed and opened, and a typed answer after Submit", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(types.url);
  await page.getByRole("button", { name: "Start" }).click();
  const b1 = card(page, "b1");
  await b1.scrollIntoViewIfNeeded();
  await b1.screenshot({ path: out("4-hint-closed") });
  await b1.getByRole("button", { name: "Hint" }).click();
  await b1.screenshot({ path: out("5-hint-open") });
  await card(page, "n3").locator("input.fm-text").fill("2.4");
  await submitAttempt(page);
  await expect(page.locator(".fm-results")).toBeVisible();
  await card(page, "n3").scrollIntoViewIfNeeded();
  await card(page, "n3").screenshot({ path: out("6-typed-after-submit") });
});

test("the resume banner", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1240 });
  await page.goto(parts.url);
  await page.getByRole("button", { name: "Start" }).click();
  const first = await page.locator("article.fm-question").first().getAttribute("data-qid");
  await page.getByLabel(`right ${first}`).check();
  await page.reload();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  await page.screenshot({ path: out("7-resume-banner") });
});
