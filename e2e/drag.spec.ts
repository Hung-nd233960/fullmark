import { expect, type Locator, type Page, test } from "@playwright/test";
import { buildIn, card, expectGradeMatches, noViolations, watch } from "./helpers";

const types = buildIn("test/fixtures/page/types.md", "types.md");

const sourcesOf = (list: Locator): Promise<number[]> =>
  list.locator(".fm-order-item").evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-source"))));

/** What the attempt stores for a question: the autosaved answer. */
const stored = (page: Page, id: string): Promise<unknown> =>
  page.evaluate((qid) => {
    const key = Object.keys(localStorage).find((k) => k.endsWith(":attempt"));
    const saved = key === undefined ? null : JSON.parse(localStorage.getItem(key) ?? "null");
    return saved?.attempt?.state?.answers?.[qid] ?? null;
  }, id);

const centre = async (el: Locator): Promise<{ x: number; y: number; height: number }> => {
  const box = await el.boundingBox();
  if (box === null) throw new Error("not on the page");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, height: box.height };
};

/** Presses on the handle of the item at `from` and carries it to the middle of the item at `to`, plus `nudge` px. */
async function carry(page: Page, list: Locator, from: number, to: number, nudge = 0): Promise<void> {
  await list.scrollIntoViewIfNeeded();
  const handle = await centre(list.locator(".fm-order-item").nth(from).locator(".fm-drag-handle"));
  const target = await centre(list.locator(".fm-order-item").nth(to));
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x, (handle.y + target.y) / 2, { steps: 4 });
  await page.mouse.move(handle.x, target.y + nudge, { steps: 4 });
}

const moveItem = (order: number[], from: number, to: number): number[] => {
  const rest = order.filter((_, i) => i !== from);
  rest.splice(to, 0, order[from] as number);
  return rest;
};

async function begin(page: Page) {
  await page.goto(types.url);
  await page.getByRole("button", { name: "Start" }).click();
  return card(page, "o1");
}

test("a drag moves an item, stores the order as the buttons do, and grades the same", async ({ page }) => {
  const seen = watch(page);
  const q = await begin(page);
  const start = await sourcesOf(q);
  expect(await stored(page, "o1")).toBeNull();

  // with the buttons: the first item down twice
  await q.locator(".fm-order-item").nth(0).locator('[data-dir="down"]').click();
  await q.locator(".fm-order-item").nth(1).locator('[data-dir="down"]').click();
  const byButtons = await stored(page, "o1");
  expect(byButtons).toEqual({ order: moveItem(start, 0, 2) });
  // and back to the start with the buttons
  await q.locator(".fm-order-item").nth(2).locator('[data-dir="up"]').click();
  await q.locator(".fm-order-item").nth(1).locator('[data-dir="up"]').click();
  expect(await sourcesOf(q)).toEqual(start);

  // with the mouse: the same item to the end
  await carry(page, q, 0, 2, 10);
  await expect(q.locator(".fm-order-slot")).toHaveCount(1);
  await expect(q.locator('.fm-order-item[data-lifted="true"]')).toHaveCount(1);
  await page.mouse.up();
  await expect(q.locator(".fm-order-slot")).toHaveCount(0);
  expect(await sourcesOf(q)).toEqual(moveItem(start, 0, 2));
  expect(await stored(page, "o1")).toEqual(byButtons);
  await expect(q.locator(".fm-sr")).toHaveText("Moved to position 3 of 3");

  await page.getByRole("button", { name: "Submit" }).click();
  await expect(q.locator(".fm-drag-handle")).toHaveCount(0);
  await expectGradeMatches(page, types.dir, "types.md");
  expect(seen.problems).toEqual([]);
});

test("Escape mid-drag puts the item back and the question stays unanswered", async ({ page }) => {
  const q = await begin(page);
  const start = await sourcesOf(q);
  await carry(page, q, 0, 2, 10);
  await expect(q.locator(".fm-order-slot")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(q.locator(".fm-order-slot")).toHaveCount(0);
  await page.mouse.up();
  expect(await sourcesOf(q)).toEqual(start);
  expect(await stored(page, "o1")).toBeNull();
});

test("a drop in place records nothing", async ({ page }) => {
  const q = await begin(page);
  const start = await sourcesOf(q);
  await carry(page, q, 1, 1, 3);
  await page.mouse.up();
  expect(await sourcesOf(q)).toEqual(start);
  expect(await stored(page, "o1")).toBeNull();
});

test("an item can go to the top, and the page has no violations mid-drag", async ({ page }) => {
  const q = await begin(page);
  const start = await sourcesOf(q);
  await carry(page, q, 2, 0, -10);
  await noViolations(page);
  await page.mouse.up();
  expect(await sourcesOf(q)).toEqual(moveItem(start, 2, 0));
  expect(await stored(page, "o1")).toEqual({ order: moveItem(start, 2, 0) });
});

test("a finger drags too (a touch screen, Chromium)", async ({ browser, browserName }) => {
  test.skip(browserName !== "chromium", "Playwright can drive touch moves only through the Chromium protocol");
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });
  const page = await context.newPage();
  const q = await begin(page);
  await q.scrollIntoViewIfNeeded();
  const start = await sourcesOf(q);
  const handle = await centre(q.locator(".fm-order-item").nth(0).locator(".fm-drag-handle"));
  const target = await centre(q.locator(".fm-order-item").nth(2));
  const cdp = await context.newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", y: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: handle.x, y }],
    });
  await touch("touchStart", handle.y);
  for (let i = 1; i <= 6; i++) await touch("touchMove", handle.y + ((target.y + 10 - handle.y) * i) / 6);
  await touch("touchEnd", 0);
  expect(await sourcesOf(q)).toEqual(moveItem(start, 0, 2));
  expect(await stored(page, "o1")).toEqual({ order: moveItem(start, 0, 2) });
  await context.close();
});
