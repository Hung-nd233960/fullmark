import { expect, test } from "@playwright/test";
import { THEME_NAMES } from "../src/core/themes";
import { noViolations, replayOf } from "./helpers";

/**
 * The explanation and feedback panels, and the phone's criterion table (STEP2.md, slice 2j3; TECHNICAL_DESIGN.md,
 * section 8, row "Answer panels"). The fixture is the replay of the `essay` quiz with its grades, built with `extra`
 * front matter lines (the lines change the hash, so the results and grades files are re-keyed to it).
 */
const style = (page: import("@playwright/test").Page, selector: string, props: string[]) =>
  page
    .locator(selector)
    .first()
    .evaluate((el, ps) => {
      const cs = getComputedStyle(el);
      return Object.fromEntries(ps.map((p) => [p, cs.getPropertyValue(p)]));
    }, props);

for (const theme of THEME_NAMES) {
  test(`the explanation and the feedback panels in ${theme}: bar, wash, labels, and axe`, async ({ page }) => {
    await page.goto(replayOf([`theme: ${theme}`], `p-${theme}`));
    const explanation = await style(page, ".fm-explanation", [
      "border-left-width",
      "border-top-width",
      "border-top-left-radius",
      "border-top-right-radius",
      "padding-top",
      "padding-left",
    ]);
    expect(explanation).toMatchObject({
      "border-left-width": "3px",
      "border-top-width": "0px",
      "border-top-left-radius": "0px",
      "border-top-right-radius": "8px",
      "padding-top": "12px",
      "padding-left": "16px",
    });
    const bars = await page.evaluate(() => {
      const c = (sel: string) => getComputedStyle(document.querySelector(sel) as Element);
      return {
        info: c(".fm-explanation").borderLeftColor,
        accent: c(".fm-feedback").borderLeftColor,
        chip: c(".fm-explanation-label").backgroundColor,
        labelColour: c(".fm-feedback-label").color,
        wash: c(".fm-feedback").backgroundColor,
        washInfo: c(".fm-explanation").backgroundColor,
      };
    });
    expect(bars.info).toBe(bars.chip);
    expect(bars.accent).toBe(bars.labelColour);
    expect(bars.wash).not.toBe(bars.washInfo);
    const label = await style(page, ".fm-feedback-label", [
      "font-size",
      "font-weight",
      "letter-spacing",
      "text-transform",
      "display",
    ]);
    expect(label["font-weight"]).toBe("700");
    expect(label["text-transform"]).toBe("uppercase");
    expect(label.display).toBe("block");
    const px = parseFloat(label["letter-spacing"] as string);
    const size = parseFloat(label["font-size"] as string);
    expect(px / size).toBeCloseTo(0.06, 2);
    const parts = page.locator('article[data-qid="add"] .fm-feedback-part');
    await expect(parts).toHaveCount(2);
    await expect(parts.first()).toContainText("Why this score");
    await expect(page.locator('article[data-qid="add"] [data-grader]')).toBeVisible();
    await noViolations(page);
  });
}

/** A row as drawn: each cell's generated text ("/ ", "Band ") and its own, joined by spaces. */
const drawn = async (row: import("@playwright/test").Locator): Promise<string> =>
  (
    await row.locator("td").evaluateAll((tds) =>
      tds.map((td) => {
        const before = getComputedStyle(td, "::before").content;
        const made = before === "none" || before === "normal" ? "" : before.slice(1, -1);
        return `${made}${td.textContent ?? ""}`;
      }),
    )
  )
    .join(" ")
    .replaceAll(/\s+/g, " ")
    .trim();

test.describe("the criterion table on a 390 px phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("each criterion is a block, nothing is cut or scrolls sideways, and it is still a table", async ({ page }) => {
    await page.goto(replayOf([], "phone"));
    const add = page.locator('article[data-qid="add"]');
    await add.scrollIntoViewIfNeeded();
    // nothing wider than the card; the page does not scroll sideways; the table's own box does not scroll
    const wide = await page.evaluate(() => {
      const box = document.querySelector('article[data-qid="add"]')?.getBoundingClientRect();
      const over = [...document.querySelectorAll("article[data-qid] .fm-grade *")].filter(
        (el) => el.getBoundingClientRect().right > (box?.right ?? 0) + 0.5,
      );
      const scroller = document.querySelector('article[data-qid="add"] .fm-grade-scroll') as HTMLElement;
      return {
        page: document.documentElement.scrollWidth > window.innerWidth,
        over: over.map((el) => el.className || el.tagName),
        scroller: scroller.scrollWidth > scroller.clientWidth,
      };
    });
    expect(wide).toEqual({ page: false, over: [], scroller: false });
    // the header row is clipped, and a row is a block: name, then marks, then note, one under the other
    const rows = add.locator(".fm-grade-table tbody tr");
    const derive = rows.nth(1);
    const boxes = await derive.locator("td").evaluateAll((tds) =>
      tds.map((td) => {
        const r = td.getBoundingClientRect();
        return { top: Math.round(r.top), left: Math.round(r.left), visible: r.width > 0 && r.height > 0 };
      }),
    );
    expect(boxes.every((b) => b.visible)).toBe(true);
    const [name, awarded, max, note] = boxes as [
      (typeof boxes)[0],
      (typeof boxes)[0],
      (typeof boxes)[0],
      (typeof boxes)[0],
    ];
    expect(awarded.top).toBeGreaterThan(name.top);
    expect(max.top).toBe(awarded.top);
    expect(max.left).toBeGreaterThan(awarded.left);
    expect(note.top).toBeGreaterThan(awarded.top);
    await expect(derive).toContainText("Derive the result");
    expect(await drawn(derive)).toBe("Derive the result 1.25 / 1.5 Skips the zero initial-conditions assumption.");
    expect(
      await page.locator('article[data-qid="add"] thead').evaluate((el) => el.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(1);
    // banded: "Band 6"; holistic: the verdict
    const ielts = page.locator('article[data-qid="ielts"]');
    expect(await drawn(ielts.locator("tbody tr").first())).toMatch(/^Task Response Band 6\b/);
    expect(await drawn(page.locator('article[data-qid="holistic"] tbody tr').first())).toMatch(
      /\S+ (Met|Partly met|Missed)$/,
    );
    // still a table to assistive technology
    const table = add.getByRole("table");
    await expect(table).toHaveCount(1);
    await expect(table.getByRole("columnheader")).toHaveText(["Criterion", "Awarded", "Max", "Note"]);
    await expect(table.getByRole("row")).toHaveCount(4);
    await expect(table.getByRole("cell")).toHaveCount(12);
    await expect(table.getByRole("cell", { name: "Define the terms" })).toBeVisible();
    await noViolations(page);
  });
});
