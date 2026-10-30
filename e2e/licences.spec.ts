import { expect, test } from "@playwright/test";
import { buildWith, noViolations } from "./helpers";

/**
 * The Licences button and its popup (TECHNICAL_DESIGN.md, section 3, "Licences"): at the foot of the start screen and of
 * the page, never floating; Esc or a click outside closes it and the focus returns to the button; absent in Focus mode.
 */
const quiz = buildWith("test/fixtures/page/singles.md", "lic.md", ["font: serif"]);

const button = (page: import("@playwright/test").Page) => page.locator("[data-action=licences]");
const dialog = (page: import("@playwright/test").Page) => page.locator("dialog#fm-licences");

test("the button sits at the foot of the start screen and opens the popup with the notices", async ({ page }) => {
  await page.goto(quiz.url);
  await expect(button(page)).toBeVisible();
  await expect(button(page)).toHaveAccessibleName("Licences");
  await expect(button(page)).toHaveAttribute("title", "Licences");
  await expect(button(page)).toHaveText("");
  // a 44 px target at the bottom right of the foot
  const box = await button(page).boundingBox();
  expect(box?.width).toBe(44);
  expect(box?.height).toBe(44);
  // at the right end of the foot (which is the content column)
  const foot = await button(page).evaluate((el) => (el.parentElement as HTMLElement).getBoundingClientRect().right);
  expect(Math.abs((box?.x ?? 0) + 44 - (foot - 16))).toBeLessThan(1);
  await expect(dialog(page)).toBeHidden();
  // in the flow, not floating: scrolled to the bottom it is below the Start button
  const [b, s] = [await button(page).boundingBox(), await page.getByRole("button", { name: "Start" }).boundingBox()];
  expect(b && s && b.y > s.y).toBe(true);
  expect(await button(page).evaluate((el) => getComputedStyle(el.parentElement as HTMLElement).position)).toBe(
    "static",
  );
  await button(page).click();
  await expect(dialog(page)).toBeVisible();
  const text = (await dialog(page).innerText()).replace(/\s+/g, " ");
  for (const name of ["Preact", "Zod", "Source Serif 4", "MIT License", "SIL Open Font License"]) {
    expect(text).toContain(name);
  }
  expect(text).not.toContain("KaTeX");
  expect(text).not.toContain("Lexend");
});

test("Esc closes the popup and the focus returns to the button; so does a click outside", async ({ page }) => {
  await page.goto(quiz.url);
  await button(page).click();
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(button(page)).toBeFocused();

  await button(page).click();
  await expect(dialog(page)).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(dialog(page)).toBeHidden();
  await expect(button(page)).toBeFocused();

  // a click inside does not close it; the close button does
  await button(page).click();
  await dialog(page).getByRole("heading", { name: "Licences" }).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Close" }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(button(page)).toBeFocused();
});

test("the button is also at the foot of the questions, and absent in Focus mode until it ends", async ({ page }) => {
  await page.goto(quiz.url);
  await page.getByRole("button", { name: "Start" }).click();
  const last = page.locator("article[data-qid]").last();
  const [b, q] = [await button(page).boundingBox(), await last.boundingBox()];
  expect(b && q && b.y >= q.y + q.height - 1).toBe(true);
  await page.getByRole("button", { name: "Focus mode" }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await expect(button(page)).toHaveCount(0);
  await page.keyboard.press("f");
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
  await expect(button(page)).toBeVisible();
});

test("axe: the page with the popup open has no violations", async ({ page }) => {
  await page.goto(quiz.url);
  await button(page).click();
  await expect(dialog(page)).toBeVisible();
  await noViolations(page);
});
