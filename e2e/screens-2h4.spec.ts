import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { buildFolder, buildWith, card, root } from "./helpers";

/**
 * Screenshots of slice 2h4: the Licences icon at the foot, a hint closed and open and an explanation, the current card
 * next to a plain one (light and dark), the text size control at 100% and at 112% (bar and phone menu), the Submit
 * dialog (light English, dark Vietnamese, phone) and the question map with and without materials and on a phone. Not
 * part of `npm run check`: run with FULLMARK_SCREENS=1 npx playwright test e2e/screens-2h4.spec.ts --project=chromium.
 * They land in docs/screens/2h4/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");
test.describe.configure({ mode: "serial" });

const dir = join(root, "docs", "screens", "2h4");
mkdirSync(dir, { recursive: true });
const out = (name: string) => join(dir, `${name}.png`);
const MAP = "test/fixtures/page/map.md";
const start = (page: Page) => page.getByRole("button", { name: /^(Start|Bắt đầu)$/ }).click();
const bar = (page: Page) => page.locator(".fm-topbar [data-action=submit]");

for (const theme of ["light", "dark"]) {
  test(`${theme}: the current card next to a plain one`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 940 });
    await page.goto(buildWith(MAP, `current-${theme}.md`, [`theme: ${theme}`, "look: locked"]).url);
    await start(page);
    await page.getByLabel(/right m2$/).check();
    await card(page, "m2").scrollIntoViewIfNeeded();
    await page.screenshot({ path: out(`1-current-card-${theme}`) });
  });
}

test("the Licences icon at the foot of the page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(buildWith(MAP, "licences-foot.md", ["theme: light"]).url);
  await start(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator("[data-action=licences]")).toBeInViewport();
  await page.screenshot({ path: out("2-licences-icon-foot") });
});

test("a hint closed and open, and an explanation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(buildWith("test/fixtures/page/types.md", "hint.md", ["theme: light"]).url);
  await start(page);
  const b1 = card(page, "b1");
  await b1.scrollIntoViewIfNeeded();
  await b1.screenshot({ path: out("3-hint-closed") });
  await b1.getByRole("button", { name: "Hint" }).click();
  await b1.screenshot({ path: out("4-hint-open") });

  await page.goto(buildWith("test/fixtures/page/instant.md", "explanation.md", ["theme: light"]).url);
  await start(page);
  await page.getByLabel(/right i1$/).check();
  await card(page, "i1").getByRole("button", { name: "Check" }).click();
  await card(page, "i1").screenshot({ path: out("5-explanation") });
});

test("the text size control at 100% and at 112%, in the bar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(buildWith(MAP, "size-bar.md", ["theme: light"]).url);
  await start(page);
  await page.locator(".fm-dock").screenshot({ path: out("6-textsize-bar-100") });
  await page.getByRole("button", { name: "Larger text" }).click();
  await page.locator(".fm-dock").screenshot({ path: out("7-textsize-bar-112") });
});

test.describe("the phone, 390 x 844", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the text size control in the phone menu at 100% and 112%", async ({ page }) => {
    await page.goto(buildWith(MAP, "size-phone.md", ["theme: light"]).url);
    await start(page);
    await page.getByRole("button", { name: "Appearance" }).tap();
    await page.screenshot({ path: out("8-textsize-phone-100") });
    await page.getByRole("button", { name: "Larger text" }).tap();
    await page.screenshot({ path: out("9-textsize-phone-112") });
  });

  test("the Submit dialog on a phone, with not answered and flagged lines", async ({ page }) => {
    await page.goto(buildWith(MAP, "submit-phone.md", ["theme: light"]).url);
    await start(page);
    await page.getByLabel(/right m1$/).check();
    await card(page, "m3").getByRole("button", { name: "Flag for review" }).tap();
    await bar(page).tap();
    await expect(page.locator("dialog[data-submit-dialog]")).toBeVisible();
    await page.screenshot({ path: out("12-submit-dialog-phone") });
  });

  test("the question map on a phone, with and without materials", async ({ page }) => {
    await page.goto(buildWith(MAP, "map-phone.md", ["theme: light"]).url);
    await start(page);
    await page.locator("[data-action=sidebar]").tap();
    await page.screenshot({ path: out("15-map-phone") });
    const m = buildFolder("test/fixtures/page", "materials.md");
    await page.goto(m.url);
    await start(page);
    await page.locator("[data-action=sidebar]").tap();
    await page.screenshot({ path: out("16-map-phone-materials") });
  });
});

test("the Submit dialog in light English and dark Vietnamese", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(buildWith(MAP, "submit-light.md", ["theme: light"]).url);
  await start(page);
  await page.getByLabel(/right m1$/).check();
  await page.getByLabel(/right m2$/).check();
  await card(page, "m4").getByRole("button", { name: "Flag for review" }).click();
  await bar(page).click();
  await expect(page.locator("dialog[data-submit-dialog]")).toBeVisible();
  await page.screenshot({ path: out("10-submit-dialog-light-en") });

  await page.goto(
    buildWith("test/fixtures/page/types-vi.md", "submit-dark-vi.md", ["theme: dark", "look: locked"]).url,
  );
  await start(page);
  await card(page, "s1").getByRole("radio").first().check();
  await card(page, "s1")
    .getByRole("button", { name: /Đánh dấu/ })
    .click();
  await page.getByRole("button", { name: "Nộp bài" }).click();
  await expect(page.locator("dialog[data-submit-dialog]")).toBeVisible();
  await page.screenshot({ path: out("11-submit-dialog-dark-vi") });
});

test("the question map without and with materials", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(buildWith(MAP, "map-plain.md", ["theme: light"]).url);
  await start(page);
  await page.getByLabel(/right m1$/).check();
  await page.locator("aside.fm-side").screenshot({ path: out("13-map-no-materials") });
  const m = buildFolder("test/fixtures/page", "materials.md");
  await page.goto(m.url);
  await start(page);
  await page.getByLabel(/right m1$/).check();
  await page.locator("aside.fm-side").screenshot({ path: out("14-map-materials") });
});
