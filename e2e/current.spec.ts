import { expect, type Page, test } from "@playwright/test";
import { buildIn, card, submitAttempt } from "./helpers";

/**
 * The current card (TECHNICAL_DESIGN.md, section 8, row "Hint, explanation label and current card"): the card the
 * status line and the map call current is marked, with a border a little toward the accent. None in Focus mode, none
 * after Submit.
 */
const map = buildIn("test/fixtures/page/map.md", "current.md");

const marked = (page: Page) => page.locator("article[data-qid][data-current]");
const question = (page: Page) => page.locator('[data-seg="question"]');
const border = (page: Page, id: string) => card(page, id).evaluate((el) => getComputedStyle(el).borderTopColor);

async function start(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(map.url);
  await page.getByRole("button", { name: "Start" }).click();
}

test("the marked card is the one the status line names, as the learner answers and jumps", async ({ page }) => {
  await start(page);
  await expect(marked(page)).toHaveCount(1);
  await expect(question(page)).toHaveText("Question 1 of 18");
  await expect(card(page, "m1")).toHaveAttribute("data-current", "true");

  await page.getByLabel(/right m4$/).check();
  await expect(question(page)).toHaveText("Question 4 of 18");
  await expect(marked(page)).toHaveCount(1);
  await expect(card(page, "m4")).toHaveAttribute("data-current", "true");

  await page.locator("aside.fm-side [data-part-head]").nth(1).click();
  await page.locator("aside.fm-side [data-cell]").nth(8).click();
  const n = (await question(page).innerText()).match(/Question (\d+) of/)?.[1];
  await expect(card(page, `m${n}`)).toHaveAttribute("data-current", "true");
  await expect(marked(page)).toHaveCount(1);
});

test("the marked card's border is mixed toward the accent; a plain card's is not", async ({ page }) => {
  await start(page);
  const plain = await border(page, "m2");
  const current = await border(page, "m1");
  expect(current).not.toBe(plain);
  const style = await card(page, "m1").evaluate((el) => {
    const s = getComputedStyle(el);
    return { transition: s.transitionProperty, duration: s.transitionDuration, shadow: s.boxShadow };
  });
  expect(style.transition).toBe("border-color");
  expect(style.duration).toBe("0.15s");
  const plainShadow = await card(page, "m2").evaluate((el) => getComputedStyle(el).boxShadow);
  expect(style.shadow).toBe(plainShadow);
});

test("no transition under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page);
  expect(await card(page, "m1").evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
});

test("no card is marked in Focus mode, and it returns when Focus mode ends", async ({ page }) => {
  await start(page);
  await expect(marked(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Focus mode" }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await expect(marked(page)).toHaveCount(0);
  await page.keyboard.press("f");
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
  await expect(marked(page)).toHaveCount(1);
});

test("no card is marked after Submit", async ({ page }) => {
  await start(page);
  await page.getByLabel(/right m2$/).check();
  await expect(marked(page)).toHaveCount(1);
  await submitAttempt(page);
  await expect(page.locator("section.fm-quiz")).toHaveAttribute("data-phase", "submitted");
  await expect(marked(page)).toHaveCount(0);
});
