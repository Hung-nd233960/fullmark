import { expect, test } from "@playwright/test";
import { buildWith, noViolations } from "./helpers";

/**
 * The Information & Licences button and its popup (TECHNICAL_DESIGN.md, section 3, "Licences"): at the foot of the start screen and of
 * the page, never floating; Esc or a click outside closes it and the focus returns to the button; absent in Focus mode.
 */
const quiz = buildWith("test/fixtures/page/singles.md", "lic.md", ["font: serif"]);

const button = (page: import("@playwright/test").Page) => page.locator("[data-action=licences]");
const dialog = (page: import("@playwright/test").Page) => page.locator("dialog#fm-licences");

test("the button sits at the foot of the start screen and opens the popup with the notices", async ({ page }) => {
  await page.goto(quiz.url);
  await expect(button(page)).toBeVisible();
  await expect(button(page)).toHaveAccessibleName("Information & Licences");
  await expect(button(page)).toHaveAttribute("title", "Information & Licences");
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
  // the Information tab comes first; the notices are on the Licences tab
  await expect(dialog(page).getByRole("tab", { name: "Information" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog(page).getByRole("tabpanel")).toContainText("Quiz version");
  await dialog(page).getByRole("tab", { name: "Licences" }).click();
  await expect(dialog(page).getByRole("tabpanel")).toContainText("MIT License");
  const text = ((await dialog(page).locator("[data-info-panel=licences]").textContent()) ?? "").replace(/\s+/g, " ");
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
  await dialog(page).getByRole("heading", { name: "Information & Licences" }).click();
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
  await dialog(page).getByRole("tab", { name: "Licences" }).click();
  await noViolations(page);
});

test("the tabs: Information first; click, arrows, Home and End move between them; opening again starts at Information", async ({
  page,
}) => {
  await page.goto(quiz.url);
  await button(page).click();
  const info = dialog(page).getByRole("tab", { name: "Information" });
  const lic = dialog(page).getByRole("tab", { name: "Licences" });
  await expect(dialog(page).getByRole("tab")).toHaveCount(2);
  await expect(info).toHaveAttribute("aria-selected", "true");
  await expect(dialog(page).locator("[data-info-panel=licences]")).toBeHidden();
  await info.focus();
  await page.keyboard.press("ArrowRight");
  await expect(lic).toHaveAttribute("aria-selected", "true");
  await expect(lic).toBeFocused();
  await expect(dialog(page).locator("[data-info-panel=info]")).toBeHidden();
  await page.keyboard.press("Home");
  await expect(info).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(lic).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await button(page).click();
  await expect(info).toHaveAttribute("aria-selected", "true");
});

test("Information lists build inputs only: versions, the options as given, the quiz version and the build time", async ({
  page,
}) => {
  await page.goto(quiz.url);
  await button(page).click();
  const rows = await dialog(page)
    .locator(".fm-info-row")
    .evaluateAll((els) => els.map((e) => [...e.children].map((c) => c.textContent ?? "").join(" ")));
  expect(rows).toHaveLength(8);
  expect(rows[0]).toMatch(/^fullmark 1\./);
  expect(rows[1]).toMatch(/^Quiz version [0-9a-f]{8}$/);
  expect(rows[2]).toMatch(/^Built at\s*\d{4}-\d\d-\d\dT/);
  expect(rows[3]).toMatch(/Preact 1\d\.\d+\.\d+/);
  expect(rows[3]).toContain("Source Serif 4");
  expect(rows[3]).not.toContain("KaTeX");
  expect(rows.slice(4)).toEqual([
    "Profile default",
    "Fonts default",
    "Interface language default",
    "Strict off (default)",
  ]);
  // never the machine: no Node version, system or path
  const text = (await dialog(page).textContent()) ?? "";
  expect(text).not.toMatch(/node|linux|windows|darwin|\/home\/|\/Users\//i);
});
