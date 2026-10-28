import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildIn, root } from "./helpers";

/**
 * Screenshots of slice 2d for the owner to compare with the Design canvas. Not part of `npm run check`: run with
 * FULLMARK_SCREENS=1 npx playwright test e2e/screens-2d.spec.ts --project=chromium. They land in test-results/2d-screens/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");
test.use({ viewport: { width: 820, height: 900 } });

const parts = buildIn("test/fixtures/page/parts.md", "parts.md");
const timed = buildIn("test/fixtures/page/timed.md", "timed.md");
const out = (name: string) => join(root, "test-results", "2d-screens", `${name}.png`);

test("start screen with parts, without parts, Continue, the Start over dialog, storage blocked", async ({ page }) => {
  await page.goto(parts.url);
  await page.screenshot({ path: out("1-start-with-parts"), fullPage: true });

  await page.goto(timed.url);
  await page.screenshot({ path: out("2-start-without-parts-timed"), fullPage: true });

  await page.goto(parts.url);
  await page.getByRole("button", { name: "Start" }).click();
  const first = await page.locator("article.fm-question").first().getAttribute("data-qid");
  await page.getByLabel(`right ${first}`).check();
  await page.reload();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  await page.screenshot({ path: out("3-start-continue-or-start-over"), fullPage: true });
  await page.getByRole("button", { name: "Start over" }).click();
  await page.screenshot({ path: out("4-start-over-dialog") });
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.screenshot({ path: out("5-answering-untimed-line"), clip: { x: 0, y: 0, width: 820, height: 520 } });
});

test("the timer line, and the results after reopening", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-29T10:00:00") });
  await page.goto(timed.url);
  await page.clock.pauseAt(new Date("2026-10-29T10:00:10"));
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByLabel("right t1").check();
  await page.clock.runFor(35_000);
  await page.screenshot({ path: out("6-timer-line-timed"), clip: { x: 0, y: 0, width: 820, height: 520 } });
  await page.getByRole("button", { name: "Submit" }).click();
  await page.clock.resume();
  await page.reload();
  await expect(page.locator(".fm-total")).toBeVisible();
  await page.screenshot({ path: out("7-results-after-reopening"), fullPage: true });
});

test("storage blocked notice", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });
  });
  await page.goto(parts.url);
  await page.screenshot({ path: out("8-start-storage-blocked"), fullPage: true });
  await page.getByRole("button", { name: "Start" }).click();
  await page.screenshot({ path: out("9-answering-storage-blocked"), clip: { x: 0, y: 0, width: 820, height: 520 } });
});
