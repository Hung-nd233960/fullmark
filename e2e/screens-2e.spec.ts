import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildIn, card, root, submitAttempt } from "./helpers";

/**
 * Screenshots of slice 2e for the owner to compare with the Design canvas. Not part of `npm run check`: run with
 * FULLMARK_SCREENS=1 npx playwright test e2e/screens-2e.spec.ts --project=chromium. They land in docs/screens/2e/, which is committed for the owner's review.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");
test.use({ viewport: { width: 1280, height: 940 } });

const results = buildIn("test/fixtures/page/results.md", "results.md");
const instant = buildIn("test/fixtures/page/instant.md", "instant.md");
const out = (name: string) => join(root, "docs", "screens", "2e", `${name}.png`);

test("the results card, the Missed filter and the retry confirm", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1560 });
  await page.goto(results.url);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByLabel("right r1").check();
  await page.getByLabel("wrong r2").check();
  await page.getByLabel("right r4").check();
  await page.getByLabel("wrong r5").check();
  await page.getByLabel("two r6").check();
  await card(page, "r2").getByRole("button", { name: "Flag for review" }).click();
  await submitAttempt(page);
  await expect(page.locator(".fm-results")).toBeVisible();
  await page.screenshot({ path: out("1-results-card"), fullPage: true });
  await page.locator('[data-filter="missed"]').click();
  await page.screenshot({ path: out("2-missed-filter"), fullPage: true });
  await page.getByRole("button", { name: "Retry missed (4)" }).click();
  await page.screenshot({ path: out("3-retry-confirm") });
});

test("a checked question under instant feedback", async ({ page }) => {
  await page.goto(instant.url);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByLabel("wrong i1").check();
  await page.screenshot({ path: out("4-before-check"), fullPage: true });
  await card(page, "i1").getByRole("button", { name: "Check" }).click();
  await page.screenshot({ path: out("5-checked-question"), fullPage: true });
});
