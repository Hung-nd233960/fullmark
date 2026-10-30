import { expect, type Page, test } from "@playwright/test";
import { SETS, THEME_NAMES, type ThemeName } from "../src/core/themes";
import { buildWith, noViolations, watch } from "./helpers";

/**
 * The themes (TECHNICAL_DESIGN.md, section 8): a page opens in the quiz's theme and never in another unless the learner
 * chose one under `look: free`; `auto` and high contrast follow the device while the page is open.
 */
const SOURCE = "test/fixtures/page/map.md";
const open = (extra: string[], name: string) => buildWith(SOURCE, `${name}.md`, extra);

const token = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const bg = (page: Page) => token(page, "--bg");
const dataTheme = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const start = async (page: Page) => page.getByRole("button", { name: "Start" }).click();

for (const name of THEME_NAMES) {
  test(`a page of theme ${name} opens in it, with no data-theme to switch to`, async ({ page }) => {
    const quiz = open([`theme: ${name}`], `t-${name}`);
    const seen = watch(page);
    await page.goto(quiz.url);
    expect(await bg(page)).toBe(SETS[name].tokens.bg);
    expect(await token(page, "--text")).toBe(SETS[name].tokens.text);
    expect(await token(page, "--card-radius")).toBe(`${SETS[name].radius}px`);
    expect(await dataTheme(page)).toBeNull();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(SETS[name].scheme);
    expect(seen.problems).toEqual([]);
  });
}

test("auto follows the device both ways while the page is open", async ({ page }) => {
  const quiz = open(["theme: auto"], "t-auto");
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(quiz.url);
  expect(await bg(page)).toBe(SETS.light.tokens.bg);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => bg(page)).toBe(SETS.dark.tokens.bg);
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => bg(page)).toBe(SETS.light.tokens.bg);
});

const contrastOf = (page: Page) => page.evaluate(() => matchMedia("(prefers-contrast: more)").matches);

for (const look of ["free", "locked"]) {
  test(`prefers-contrast: more gives white for paper and oled for dark, live (look: ${look})`, async ({
    page,
    browserName,
  }) => {
    for (const [theme, expected] of [
      ["paper", "white"],
      ["dark", "oled"],
      ["light", "white"],
    ] as [ThemeName, ThemeName][]) {
      const quiz = open([`theme: ${theme}`, `look: ${look}`], `c-${theme}-${look}`);
      await page.emulateMedia({ contrast: "no-preference" });
      await page.goto(quiz.url);
      expect(await bg(page)).toBe(SETS[theme].tokens.bg);
      await page.emulateMedia({ contrast: "more" });
      test.skip(!(await contrastOf(page)), `${browserName} has no prefers-contrast emulation`);
      // Firefox's emulation changes the query but sends no `change` event, so there the page is reloaded
      if (browserName === "firefox") await page.reload();
      await expect.poll(() => bg(page)).toBe(SETS[expected].tokens.bg);
      await page.emulateMedia({ contrast: "no-preference" });
      if (browserName === "firefox") await page.reload();
      await expect.poll(() => bg(page)).toBe(SETS[theme].tokens.bg);
    }
  });
}

const button = (page: Page) => page.getByRole("button", { name: "Appearance" });
const pick = (page: Page, name: string) => page.locator(`[data-theme-pick="${name}"]`);
const reset = (page: Page) => page.getByRole("button", { name: "Default look" });
/** after a reload the quiz may offer to continue; the look does not depend on it */
const resume = async (page: Page): Promise<void> => {
  const again = page.getByRole("button", { name: "Continue" });
  if (await again.isVisible()) await again.click();
};

test("the menu picks a theme, keeps it across a reload, resets to the quiz's, and Esc closes it", async ({ page }) => {
  const quiz = open(["theme: paper"], "menu");
  await page.goto(quiz.url);
  await start(page);
  await expect(button(page)).toHaveAttribute("aria-expanded", "false");
  await button(page).click();
  await expect(button(page)).toHaveAttribute("aria-expanded", "true");
  await expect(pick(page, "paper")).toHaveAttribute("aria-pressed", "true");
  await expect(pick(page, "paper")).toHaveText("Paper ·");
  await expect(pick(page, "paper")).toHaveAccessibleName("Paper, the quiz's look");
  await expect(reset(page)).toHaveCount(0);
  await pick(page, "dark").click();
  expect(await bg(page)).toBe(SETS.dark.tokens.bg);
  expect(await dataTheme(page)).toBe("dark");
  await expect(pick(page, "dark")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  expect(await bg(page)).toBe(SETS.dark.tokens.bg);
  await resume(page);
  await button(page).click();
  await reset(page).click();
  expect(await bg(page)).toBe(SETS.paper.tokens.bg);
  expect(await dataTheme(page)).toBeNull();
  await page.reload();
  expect(await bg(page)).toBe(SETS.paper.tokens.bg);
  await resume(page);
  await button(page).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-look-menu]")).toHaveCount(0);
  await expect(button(page)).toBeFocused();
  await button(page).click();
  await page
    .locator(".fm-question")
    .first()
    .click({ position: { x: 5, y: 5 } });
  await expect(page.locator("[data-look-menu]")).toHaveCount(0);
});

test("Auto is a pill of its own: it follows the device after the learner picks it", async ({ page }) => {
  const quiz = open(["theme: paper"], "menu-auto");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(quiz.url);
  await start(page);
  await button(page).click();
  await pick(page, "auto").click();
  await expect.poll(() => bg(page)).toBe(SETS.dark.tokens.bg);
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => bg(page)).toBe(SETS.light.tokens.bg);
});

test("look: locked has no button and ignores a stored look", async ({ page }) => {
  const quiz = open(["theme: paper", "look: locked"], "locked");
  await page.goto(quiz.url);
  const key = await page.evaluate(() => {
    const data = JSON.parse(document.getElementById("fm-data")?.textContent ?? "") as {
      quizzes: { id: string; hash: string }[];
    };
    const q = data.quizzes[0] as { id: string; hash: string };
    return `fullmark:v1:${q.id}:${q.hash}:look`;
  });
  await page.evaluate((k) => localStorage.setItem(k, '{"theme":"dark"}'), key);
  await page.reload();
  expect(await bg(page)).toBe(SETS.paper.tokens.bg);
  await start(page);
  await expect(button(page)).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe('{"theme":"dark"}');
});

test("a picked look stays after Submit, and the button is there in both phases", async ({ page }) => {
  const quiz = open(["theme: light"], "free");
  await page.goto(quiz.url);
  await start(page);
  await button(page).click();
  await pick(page, "oled").click();
  await page.getByLabel(/right m1$/).check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".fm-results")).toBeVisible();
  expect(await bg(page)).toBe(SETS.oled.tokens.bg);
  await expect(button(page)).toBeVisible();
});

for (const name of THEME_NAMES) {
  test(`axe finds nothing in ${name}, answering and after Submit`, async ({ page }) => {
    const quiz = open([`theme: ${name}`], `axe-${name}`);
    await page.goto(quiz.url);
    await noViolations(page);
    await start(page);
    await page.getByLabel(/right m1$/).check();
    await button(page).click();
    await noViolations(page);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.locator(".fm-results")).toBeVisible();
    await noViolations(page);
  });
}

/** The Font row: only the fonts the page offers; the pick sets `data-font` and the body's font-family. */
const FONT_FIRST = { system: "Segoe UI", sans: "Be Vietnam Pro", serif: "Source Serif 4", readable: "Lexend" } as const;
const fontPick = (page: Page, id: string) => page.locator(`[data-font-pick="${id}"]`);
const family = (page: Page) => page.evaluate(() => getComputedStyle(document.body).fontFamily);
const dataFont = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-font"));
const withFonts = (name: string, extra: string[] = []) => buildWith(SOURCE, `${name}.md`, extra, ["--fonts", "all"]);

test("the Font row picks each font, keeps it across a reload, and Default look resets it", async ({ page }) => {
  const quiz = withFonts("font-menu", ["theme: paper"]);
  await page.goto(quiz.url);
  await start(page);
  await button(page).click();
  await expect(page.locator("[data-font-row] .fm-pill")).toHaveText([
    "System",
    "Be Vietnam Pro",
    "Source Serif 4",
    "Lexend",
  ]);
  await expect(fontPick(page, "system")).toHaveAttribute("aria-pressed", "true");
  expect(await family(page)).toContain("Segoe UI");
  for (const id of ["sans", "serif", "readable"] as const) {
    await fontPick(page, id).click();
    await expect(fontPick(page, id)).toHaveAttribute("aria-pressed", "true");
    expect(await family(page)).toMatch(new RegExp(`^"?${FONT_FIRST[id]}"?,`));
    expect(await dataFont(page)).toBe(id);
    // each pill shows its name in its own font
    expect(await fontPick(page, id).evaluate((el) => getComputedStyle(el).fontFamily)).toContain(FONT_FIRST[id]);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate((f) => document.fonts.check(`16px "${f}"`), FONT_FIRST[id])).toBe(true);
  }
  await fontPick(page, "serif").click();
  await page.reload();
  expect((await family(page)).startsWith('"Source Serif 4"')).toBe(true);
  await resume(page);
  await button(page).click();
  await expect(fontPick(page, "serif")).toHaveAttribute("aria-pressed", "true");
  await reset(page).click();
  expect(await dataFont(page)).toBeNull();
  expect(await family(page)).toContain("Segoe UI");
  await page.reload();
  expect(await family(page)).toContain("Segoe UI");
});

test("the Font row is left out with one font offered, and under look: locked", async ({ page }) => {
  const one = buildWith(SOURCE, "font-one.md", ["theme: paper"], ["--fonts", "none"]);
  await page.goto(one.url);
  await start(page);
  await button(page).click();
  await expect(page.locator("[data-font-row]")).toHaveCount(0);
  const locked = withFonts("font-locked", ["look: locked", "font: sans"]);
  await page.goto(locked.url);
  expect((await family(page)).startsWith('"Be Vietnam Pro"')).toBe(true);
  const key = await page.evaluate(() => {
    const data = JSON.parse(document.getElementById("fm-data")?.textContent ?? "") as {
      quizzes: { id: string; hash: string }[];
    };
    const q = data.quizzes[0] as { id: string; hash: string };
    return `fullmark:v1:${q.id}:${q.hash}:look`;
  });
  await page.evaluate((k) => localStorage.setItem(k, '{"font":"serif"}'), key);
  await page.reload();
  expect((await family(page)).startsWith('"Be Vietnam Pro"')).toBe(true);
  await start(page);
  await expect(page.locator("[data-font-row]")).toHaveCount(0);
});

test("axe finds nothing in the open Appearance menu with the Font row", async ({ page }) => {
  const quiz = withFonts("font-axe");
  await page.goto(quiz.url);
  await start(page);
  await button(page).click();
  await fontPick(page, "readable").click();
  await noViolations(page);
});
