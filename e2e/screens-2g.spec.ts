import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { buildWith, card, root } from "./helpers";

/**
 * Screenshots of slice 2g, one per theme board, to lay beside docs/mockup/images/. Not part of `npm run check`: run
 * with FULLMARK_SCREENS=1 npx playwright test e2e/screens-2g.spec.ts --project=chromium. They land in docs/screens/2g/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");

const SOURCE = "test/fixtures/page/mockup.md";
const out = (name: string) => join(root, "docs", "screens", "2g", `${name}.png`);
const quiz = (theme: string, look: "free" | "locked") =>
  buildWith(SOURCE, `${theme}.md`, [`theme: ${theme}`, `look: ${look}`]);

/** The learner's pass through the quiz, as the 2v screens do it. */
async function answer(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByLabel("A decaying exponential").check();
  await page.getByLabel("Hàm mũ suy giảm").check();
  await card(page, "q20").getByRole("textbox").first().fill("0,25");
  await card(page, "q20").getByRole("button", { name: "Flag for review" }).click();
  await page.getByLabel("The signal is band-limited").check();
  await card(page, "q32").getByRole("textbox").fill("Spectral copies overlap when fs is below 2 fmax.");
  await page.evaluate(() => {
    const el = document.querySelector('[data-qid="q19"]') as HTMLElement;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 160);
  });
}

const boards: [string, string, "free" | "locked"][] = [
  ["1-light", "light", "free"],
  ["2-dark", "dark", "free"],
  ["3-oled", "oled", "free"],
  ["4-white", "white", "locked"],
  ["5-paper", "paper", "locked"],
];

for (const [file, theme, look] of boards) {
  test(`${theme} board, answering`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 940 });
    await answer(page, quiz(theme, look).url);
    await page.screenshot({ path: out(file) });
  });
}

for (const [file, theme, look] of [
  ["6-start-oled", "oled", "free"],
  ["7-start-paper", "paper", "locked"],
] as const) {
  test(`${theme} start screen`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1240 });
    await page.goto(quiz(theme, look).url);
    await page.screenshot({ path: out(file) });
  });
}

test("the Appearance menu open", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  const q = quiz("light", "free");
  await answer(page, q.url);
  await page.getByRole("button", { name: "Appearance" }).click();
  await expect(page.locator("[data-look-menu]")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: out("8-menu-open") });
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.screenshot({ path: out("8b-menu-dark-picked") });
});

test.describe("the phone, 390 x 844", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the bar in one row, then the filter in one row", async ({ page }) => {
    await answer(page, quiz("light", "free").url);
    await page.screenshot({ path: out("9-phone-bar") });
    await page.locator(".fm-topbar").getByRole("button", { name: "Submit" }).tap();
    await expect(page.locator(".fm-results")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: out("10-phone-filter") });
  });
});
