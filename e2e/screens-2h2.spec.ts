import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { buildWith, card, root, submitAttempt } from "./helpers";

/**
 * Screenshots of slice 2h2: the part list with a one-question part, an ordering question mid-drag and at rest, single
 * and multi side by side, and the badge's inset on a one-line and a wrapped row. Not part of `npm run check`: run with
 * FULLMARK_SCREENS=1 npx playwright test e2e/screens-2h2.spec.ts --project=chromium. They land in docs/screens/2h2/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");

const out = (name: string) => join(root, "docs", "screens", "2h2", `${name}.png`);
const quiz = (source: string, name: string, theme = "light") =>
  buildWith(source, `${name}-${theme}.md`, [`theme: ${theme}`]);
const submit = (page: Page) => submitAttempt(page);

const scrollTo = (page: Page, id: string, above = 140) =>
  page.evaluate(
    ([qid, gap]) => {
      const el = document.querySelector(`[data-qid="${qid}"]`) as HTMLElement;
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - (gap as number));
    },
    [id, above] as const,
  );

test("the part list with a one-question part, answering and after Submit", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(quiz("test/fixtures/page/oneq.md", "oneq").url);
  await page.getByRole("button", { name: "Start" }).click();
  await card(page, "w1").getByRole("radio").first().check();
  await card(page, "b1").getByRole("radio").first().check();
  await card(page, "b1").getByRole("button", { name: "Flag for review" }).click();
  await page.locator('[data-part="r"] [data-part-head]').click();
  await page.screenshot({ path: out("1-parts-answering") });
  await submit(page);
  await expect(page.locator(".fm-results")).toBeVisible();
  await page.screenshot({ path: out("2-parts-submitted") });
});

const types = quiz("test/fixtures/page/types.md", "types");

async function ordering(page: Page) {
  await page.goto(types.url);
  await page.getByRole("button", { name: "Start" }).click();
  const q = card(page, "o1");
  await scrollTo(page, "o1", 120);
  return q;
}

test("ordering at rest, and mid-drag by the row's text with a mouse", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  const q = await ordering(page);
  await page.screenshot({ path: out("3-ordering-rest") });
  const text = (await q.locator(".fm-order-item").nth(0).locator(".fm-order-text").boundingBox()) as {
    x: number;
    y: number;
  };
  const target = (await q.locator(".fm-order-item").nth(2).boundingBox()) as { y: number; height: number };
  await page.mouse.move(text.x + 20, text.y + 8);
  await page.mouse.down();
  await page.mouse.move(text.x + 20, text.y + 40, { steps: 4 });
  await page.mouse.move(text.x + 20, target.y + target.height / 2 + 6, { steps: 4 });
  await page.screenshot({ path: out("4-ordering-drag") });
  await page.mouse.up();
});

test.describe("the phone, 390 x 844", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("ordering at rest on a touch screen: 44 px buttons", async ({ page }) => {
    await ordering(page);
    await page.screenshot({ path: out("5-ordering-phone") });
  });

  test("a wrapped choice row keeps the badge at the top", async ({ page }) => {
    await page.goto(quiz("test/fixtures/page/oneq.md", "oneq").url);
    await page.getByRole("button", { name: "Start" }).tap();
    await scrollTo(page, "b1", 80);
    await page.screenshot({ path: out("6-wrapped-row-phone") });
  });
});

for (const theme of ["light", "dark"]) {
  test(`${theme}: a single and a multi question, unanswered, answered and after Submit`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 940 });
    await page.goto(quiz("test/fixtures/page/types.md", "types", theme).url);
    await page.getByRole("button", { name: "Start" }).click();
    await scrollTo(page, "s1");
    await page.screenshot({ path: out(`7-${theme}-single-multi-empty`) });
    await card(page, "s1").getByRole("radio").first().check();
    const boxes = card(page, "m1").getByRole("checkbox");
    await boxes.nth(0).check();
    await boxes.nth(2).check();
    await page.screenshot({ path: out(`8-${theme}-single-multi-answered`) });
    await submit(page);
    await expect(page.locator(".fm-results")).toBeVisible();
    await scrollTo(page, "s1");
    await page.screenshot({ path: out(`9-${theme}-single-multi-submitted`) });
  });
}
