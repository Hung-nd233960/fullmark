import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { buildWith, card, root } from "./helpers";

/**
 * Screenshots of slice 2h: the question card's new header and choice rows, A- / A+, the phone bar and its menu. Not part
 * of `npm run check`: run with FULLMARK_SCREENS=1 npx playwright test e2e/screens-2h.spec.ts --project=chromium. They
 * land in docs/screens/2h/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");

const SOURCE = "test/fixtures/page/mockup.md";
const out = (name: string) => join(root, "docs", "screens", "2h", `${name}.png`);
const quiz = (theme: string, look: "free" | "locked" = "free") =>
  buildWith(SOURCE, `${theme}-${look}.md`, [`theme: ${theme}`, `look: ${look}`]);

async function answer(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByLabel("A decaying exponential").check();
  await page.getByLabel("Hàm mũ suy giảm").check();
  await card(page, "q20").getByRole("textbox").first().fill("0,25");
  await card(page, "q20").getByRole("button", { name: "Flag for review" }).click();
  await page.getByLabel("The signal is band-limited").check();
  await card(page, "q32").getByRole("textbox").fill("Spectral copies overlap when fs is below 2 fmax.");
}

const toCards = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-qid="q19"]') as HTMLElement;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 160);
  });

for (const theme of ["light", "dark"]) {
  test(`${theme}: the cards answering, and after Submit`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 940 });
    await answer(page, quiz(theme).url);
    await toCards(page);
    await page.screenshot({ path: out(`1-${theme}-answering`) });
    await page.locator(".fm-topbar").getByRole("button", { name: "Submit" }).click();
    await expect(page.locator(".fm-results")).toBeVisible();
    await toCards(page);
    await page.screenshot({ path: out(`2-${theme}-submitted`) });
  });
}

test("light at 23 px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  await answer(page, quiz("light").url);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Larger text" }).click();
  await toCards(page);
  await page.screenshot({ path: out("3-light-23px") });
});

test.describe("the phone, 390 x 844", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the bar at 17 px and at 23 px, the menu open (free and locked)", async ({ page }) => {
    await answer(page, quiz("light").url);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: out("4-phone-bar") });
    await page.getByRole("button", { name: "Appearance" }).tap();
    await expect(page.locator("[data-look-menu]")).toBeVisible();
    await page.screenshot({ path: out("5-phone-menu") });
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Larger text" }).tap();
    await page.screenshot({ path: out("6-phone-menu-23px") });
    await answer(page, quiz("paper", "locked").url);
    await page.getByRole("button", { name: "Appearance" }).tap();
    await expect(page.locator("[data-look-menu]")).toBeVisible();
    await page.screenshot({ path: out("7-phone-menu-locked") });
  });
});
