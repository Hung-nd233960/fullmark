import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { buildIn, card, root } from "./helpers";

/**
 * Screenshots of slice 2v, one per board built, to lay beside docs/mockup/images/. Not part of `npm run check`: run
 * with FULLMARK_SCREENS=1 npx playwright test e2e/screens-2v.spec.ts --project=chromium. They land in docs/screens/2v/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");

const mockup = buildIn("test/fixtures/page/mockup.md", "mockup.md");
const out = (name: string) => join(root, "docs", "screens", "2v", `${name}.png`);

/** The learner's pass through the quiz: q19 wrong, q20 wrong, q27 left empty, one flagged, an essay waiting. */
async function answer(page: Page) {
  await page.goto(mockup.url);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByLabel("A decaying exponential").check();
  await page.getByLabel("Hàm mũ suy giảm").check();
  await card(page, "q20").getByRole("textbox").first().fill("0,25");
  await card(page, "q20").getByRole("button", { name: "Flag for review" }).click();
  await page.getByLabel("The signal is band-limited").check();
  await card(page, "q32").getByRole("textbox").fill("Spectral copies overlap when fs is below 2 fmax.");
}

test("the start screen (Start board)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(mockup.url);
  await page.screenshot({ path: out("1-start") });
});

test("answering (Quiz board)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  await answer(page);
  await card(page, "q19").scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const el = document.querySelector('[data-qid="q19"]') as HTMLElement;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 160);
  });
  await page.screenshot({ path: out("2-answering") });
});

test("after Submit (Results board)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1560 });
  await answer(page);
  await page.locator(".fm-topbar").getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".fm-results")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: out("3-results") });
  await page.locator('[data-filter="missed"]').click();
  await page.screenshot({ path: out("4-missed-filter") });
});
