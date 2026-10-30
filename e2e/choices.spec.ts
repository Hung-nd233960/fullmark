import { expect, type Page, test } from "@playwright/test";
import { buildIn, card, noViolations, submitAttempt, watch } from "./helpers";

/**
 * One answer or several, and the letter badge's even inset (TECHNICAL_DESIGN.md, section 8, row "Question card"): round
 * badges for `single` and true/false, square for `multi`; a tick on a picked `multi` row; the tag in the header; the
 * badge 12px from the row's top, bottom and left edges, at the top when the text wraps.
 */
const types = buildIn("test/fixtures/page/types.md", "types.md");
const oneq = buildIn("test/fixtures/page/oneq.md", "oneq.md");

const radius = (page: Page, id: string) =>
  card(page, id)
    .locator(".fm-letter")
    .first()
    .evaluate((el) => getComputedStyle(el).borderTopLeftRadius);

test("single and true/false badges are round, multi's are square, and the header says which", async ({ page }) => {
  const seen = watch(page);
  await page.goto(types.url);
  await page.getByRole("button", { name: "Start" }).click();
  expect(await radius(page, "s1")).toBe("50%");
  expect(await radius(page, "t1")).toBe("50%");
  expect(await radius(page, "m1")).toBe("8px");
  await expect(card(page, "s1").locator(".fm-kind")).toHaveText("Choose one");
  await expect(card(page, "m1").locator(".fm-kind")).toHaveText("Choose all that apply");
  await expect(card(page, "t1").locator(".fm-kind")).toHaveCount(0);
  // a tick on a picked multi row only, while answering
  await expect(card(page, "m1").locator(".fm-tick")).toHaveCount(0);
  await card(page, "m1").getByRole("checkbox").first().check();
  await expect(card(page, "m1").locator(".fm-tick")).toHaveCount(1);
  await card(page, "s1").getByRole("radio").first().check();
  await expect(card(page, "s1").locator(".fm-tick")).toHaveCount(0);
  await noViolations(page);
  await submitAttempt(page);
  await expect(card(page, "m1").locator(".fm-tick")).toHaveCount(0);
  await noViolations(page);
  expect(seen.problems).toEqual([]);
});

/** Pixels from the row's border box to the badge's, on each side, and the row's height. */
const insets = (page: Page, id: string, row = 0) =>
  card(page, id)
    .locator(".fm-choice")
    .nth(row)
    .evaluate((li) => {
      const a = li.getBoundingClientRect();
      const b = (li.querySelector(".fm-letter") as HTMLElement).getBoundingClientRect();
      const c = li.querySelector(".fm-choice-text") as HTMLElement;
      const t = document.createRange();
      t.selectNodeContents(c);
      const first = t.getClientRects()[0] as DOMRect;
      return {
        top: b.top - a.top,
        bottom: a.bottom - b.bottom,
        left: b.left - a.left,
        height: a.height,
        gap: c.getBoundingClientRect().left - b.right,
        textMiddle: first.top + first.height / 2 - (b.top + b.height / 2),
      };
    });

test("the badge sits 12px from the top, bottom and left of a one-line row (56 px inside its 1px border)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(oneq.url);
  await page.getByRole("button", { name: "Start" }).click();
  const one = await insets(page, "w1");
  expect(one.top).toBeCloseTo(13, 0); // 1px border + 12px
  expect(one.bottom).toBeCloseTo(13, 0);
  expect(one.left).toBeCloseTo(13, 0);
  expect(one.height).toBeCloseTo(58, 0);
  expect(one.gap).toBeCloseTo(14, 0);
  expect(Math.abs(one.textMiddle)).toBeLessThan(2);
  // a picked row has a 2px border and the badge does not move
  await card(page, "w1").getByRole("radio").first().check();
  const picked = await insets(page, "w1");
  expect(picked.top).toBeCloseTo(13, 0);
  expect(picked.left).toBeCloseTo(13, 0);
  expect(picked.height).toBeCloseTo(58, 0);
});

test("when the text wraps the badge stays at the top, and the first line is centred on it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(oneq.url);
  await page.getByRole("button", { name: "Start" }).click();
  const wrapped = await insets(page, "b1", 1);
  expect(wrapped.height).toBeGreaterThan(80);
  expect(wrapped.top).toBeCloseTo(13, 0);
  expect(wrapped.left).toBeCloseTo(13, 0);
  expect(wrapped.bottom).toBeGreaterThan(30);
  expect(Math.abs(wrapped.textMiddle)).toBeLessThan(2);
  await noViolations(page);
});
