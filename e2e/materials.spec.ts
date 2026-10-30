import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { buildFolder, card, noViolations, submitAttempt, watch } from "./helpers";

/**
 * The materials (TECHNICAL_DESIGN.md, section 8, rows "Sidebar", "Question map" and "Materials"). The test that matters:
 * a sheet reads the same wherever it is opened, the browser's find reaches it, and opening one is never recorded.
 */
const quiz = buildFolder("test/fixtures/page", "materials.md");

const side = (page: Page) => page.locator("aside.fm-side");
const chip = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const submit = (page: Page) => submitAttempt(page);

async function start(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(quiz.url);
  await page.getByRole("button", { name: "Start" }).click();
}

test("while answering the sidebar is stacked: the current part's grid, a part tab, a cell, a chip", async ({
  page,
}) => {
  const seen = watch(page);
  await start(page);
  const toggle = page.locator("[data-action=sidebar]");
  await expect(toggle).toHaveText("Questions & materials");
  await expect(toggle).toHaveAttribute("aria-keyshortcuts", "Q M");
  await expect(toggle).toHaveAttribute("title", "The question map and the materials (Q, M)");
  await expect(side(page)).toHaveAttribute("data-form", "stacked");
  const width = (await side(page).boundingBox())?.width ?? 0;
  expect(Math.abs(width - 512)).toBeLessThan(4); // 40% of 1280
  const tabs = side(page).getByRole("tablist", { name: "Parts" });
  await expect(tabs.getByRole("tab")).toHaveCount(3);
  await expect(tabs.getByRole("tab").first()).toHaveAttribute("aria-selected", "true");
  await expect(side(page).locator("[data-cell]")).toHaveCount(4);
  await expect(side(page).getByRole("tabpanel", { name: "Part 1 · Signals" })).toBeVisible();

  await tabs.getByRole("tab", { name: /^Part 2/ }).click();
  await expect(side(page).locator("[data-cell]")).toHaveCount(5);
  await expect(side(page).getByRole("tabpanel", { name: "Part 2 · Fourier transform" })).toBeVisible();
  await side(page).locator('[data-cell="m7"]').click();
  await expect(card(page, "m7")).toBeInViewport();
  await expect(side(page).locator('[data-cell="m7"]')).toHaveAttribute("aria-current", "true");

  // a chip opens its sheet; the first is open at first
  await expect(chip(page, "Fourier transform properties")).toHaveAttribute("aria-selected", "true");
  await expect(side(page).getByRole("heading", { name: "Fourier transform properties" })).toHaveCount(1);
  await chip(page, "Trigonometric identities").click();
  await expect(side(page).getByRole("heading", { name: "Trigonometric identities" })).toBeVisible();
  await expect(side(page).getByRole("heading", { name: "Fourier transform properties" })).toHaveCount(0);
  await noViolations(page);
  expect(seen.problems).toEqual([]);
  expect(seen.requests).toEqual([]);
});

test("a table wider than the panel scrolls in its own box; the text is visible to the browser's find", async ({
  page,
}) => {
  await start(page);
  await page.setViewportSize({ width: 800, height: 940 });
  await expect(side(page).getByText("both signals absolutely integrable")).toBeVisible();
  const table = side(page).locator(".fm-sheet table").first();
  const [scroll, client] = await table.evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(scroll).toBeGreaterThanOrEqual(client);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const hidden = await side(page)
    .locator(".fm-sheet-panel")
    .evaluate((el) => el.closest("[hidden]") !== null);
  expect(hidden).toBe(false);
});

test("M and Q while answering; M typed in a text field does nothing", async ({ page }) => {
  await start(page);
  await page.keyboard.press("m");
  await expect(side(page)).toBeVisible();
  await expect(chip(page, "Fourier transform properties")).toBeFocused();
  await page.keyboard.press("q"); // Q closes the stacked sidebar
  await expect(side(page)).toHaveCount(0);
  await page.keyboard.press("q");
  await expect(side(page).getByRole("tab", { name: /^Part 1/ })).toBeFocused();
  await page.keyboard.press("m"); // already open: the focus moves to the chips
  await expect(side(page)).toBeVisible();
  await expect(chip(page, "Fourier transform properties")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(side(page)).toHaveCount(0);
  await expect(page.locator("[data-action=sidebar]")).toBeFocused();
  // a text field: M is a letter
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.id = "probe";
    document.body.append(input);
    input.focus();
  });
  await page.keyboard.press("m");
  await expect(side(page)).toHaveCount(0);
  await expect(page.locator("#probe")).toHaveValue("m");
});

test("after Submit the tabs switch, the chosen sheet is kept and the keys move between them", async ({ page }) => {
  await start(page);
  await chip(page, "Units and constants").click();
  await page.getByLabel(/right m1$/).check();
  await submit(page);
  await expect(page.locator(".fm-results")).toBeVisible();
  await expect(side(page)).toHaveAttribute("data-form", "tabs");
  const tabs = side(page).getByRole("tablist", { name: "Sidebar" });
  await expect(tabs.getByRole("tab", { name: "Questions" })).toHaveAttribute("aria-selected", "true");
  expect(Math.abs(((await side(page).boundingBox())?.width ?? 0) - 320)).toBeLessThan(2);
  await expect(side(page).locator("[data-cell]")).toHaveCount(12);
  await tabs.getByRole("tab", { name: "Materials" }).click();
  expect(Math.abs(((await side(page).boundingBox())?.width ?? 0) - 512)).toBeLessThan(4);
  await expect(chip(page, "Units and constants")).toHaveAttribute("aria-selected", "true");
  await expect(side(page).getByText("Gain in decibels")).toBeVisible();
  await noViolations(page);
  await page.keyboard.press("q");
  await expect(side(page).getByRole("tab", { name: "Questions" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("m");
  await expect(chip(page, "Units and constants")).toBeFocused();
  await page.keyboard.press("m");
  await expect(side(page)).toHaveCount(0);
  await page.keyboard.press("m"); // opens at Materials
  await expect(chip(page, "Units and constants")).toBeFocused();
  await page.keyboard.press("Escape");
  await page.locator("[data-action=sidebar]").click(); // the tab last used
  await expect(side(page).getByRole("tab", { name: "Materials" })).toHaveAttribute("aria-selected", "true");
});

test("the start screen's Materials opens a sheet, closes by Esc, by Close and by Start", async ({ page }) => {
  const seen = watch(page);
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(quiz.url);
  const open = page.getByRole("button", { name: "Materials", exact: true });
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Materials can be opened first.")).toBeVisible();
  await open.click();
  await expect(open).toHaveAttribute("aria-expanded", "true");
  const panel = page.locator("aside.fm-shelf");
  await expect(panel).toBeVisible();
  expect(Math.abs(((await panel.boundingBox())?.width ?? 0) - 380)).toBeLessThan(2);
  await expect(panel.getByRole("heading", { name: "Materials", exact: true })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Fourier transform properties" })).toBeVisible();
  await noViolations(page);
  await chip(page, "Trigonometric identities").click();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  await panel.getByRole("button", { name: "Close the materials" }).click();
  await expect(panel).toHaveCount(0);
  await open.click();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(panel).toHaveCount(0);
  // the sheet chosen there is the one the sidebar shows
  await expect(chip(page, "Trigonometric identities")).toHaveAttribute("aria-selected", "true");
  expect(seen.problems).toEqual([]);
});

test("opening sheets leaves the export the same", async ({ page }) => {
  const exportOf = async (open: boolean): Promise<string> => {
    await page.goto(quiz.url);
    await page.evaluate(() => localStorage.clear());
    await page.goto(quiz.url);
    if (open) {
      await page.getByRole("button", { name: "Materials", exact: true }).click();
      await chip(page, "Units and constants").click();
    }
    await page.getByRole("button", { name: "Start" }).click();
    await page.getByLabel(/right m1$/).check();
    if (open) {
      await page.keyboard.press("m");
      await chip(page, "Trigonometric identities").click();
    }
    await submit(page);
    if (open) {
      await page.keyboard.press("m");
      await chip(page, "Fourier transform properties").click();
    }
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download results" }).click();
    const file = await download;
    const path = join(quiz.dir, `export-${open}.json`);
    await file.saveAs(path);
    return readFileSync(path, "utf8");
  };
  // the seed and the clock differ between runs, so compare the shape and the answers, and look for any trace of a sheet
  const shape = (text: string): unknown => {
    const data = JSON.parse(text);
    return { keys: Object.keys(data).sort(), answers: JSON.stringify(data.answers ?? data.attempt?.state?.answers) };
  };
  const without = await exportOf(false);
  const withSheets = await exportOf(true);
  expect(shape(withSheets)).toEqual(shape(without));
  expect(withSheets).not.toMatch(/sheet|materials|Fourier transform properties/i);
});
