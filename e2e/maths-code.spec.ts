import { expect, test } from "@playwright/test";
import { buildFolder, card, noViolations, watch } from "./helpers";

/**
 * axe reads no text out of MathML, so it finds a choice or a dropdown whose label is only maths unnamed. Browsers name
 * it from the MathML (the tests check that), so these two rules are skipped on pages with maths in a label.
 */
const MATHML_NAMES = ["label", "select-name"];

const calculus = buildFolder("examples/calculus");
const rust = buildFolder("examples/rust");
const mathsAndCode = buildFolder("test/golden/build/maths-and-code/input");

test("examples/calculus shows KaTeX maths from fonts inside the file, and axe is clean", async ({ page }) => {
  const seen = watch(page);
  await page.goto(calculus.url);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator(".katex").first()).toBeVisible();
  // a style attribute would be blocked by the CSP: KaTeX's layout is classes (the quiz's own `--dock-h`, set from
  // script, is the one custom property the page keeps on its root)
  expect(await page.locator("[style]:not(.fm-quiz)").count()).toBe(0);
  // the fonts load from data: URIs, so the maths is set in KaTeX's own faces
  await expect
    .poll(() =>
      page.evaluate(() => [...document.fonts].some((f) => f.family.startsWith("KaTeX") && f.status === "loaded")),
    )
    .toBe(true);
  await noViolations(page, MATHML_NAMES);
  expect(seen.problems).toEqual([]);
  expect(seen.requests).toEqual([]);
});

test("examples/rust shows highlighted code, and axe is clean", async ({ page }) => {
  const seen = watch(page);
  await page.goto(rust.url);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator("pre.fm-hl span[class^='fm-tk-']").first()).toBeVisible();
  // the colours come from the --fm-code- variables: a keyword is not the colour of the text around it
  const colours = await page.evaluate(() => {
    const keyword = document.querySelector<HTMLElement>("pre.fm-hl .fm-tk-keyword");
    const block = document.querySelector<HTMLElement>("pre.fm-hl");
    return { keyword: keyword && getComputedStyle(keyword).color, block: block && getComputedStyle(block).color };
  });
  expect(colours.keyword).not.toBeNull();
  expect(colours.keyword).not.toBe(colours.block);
  await noViolations(page);
  expect(seen.problems).toEqual([]);
  expect(seen.requests).toEqual([]);
});

test("a blank in highlighted code is an input in its place, and the matching items read as TeX", async ({ page }) => {
  await page.goto(mathsAndCode.url);
  await page.getByRole("button", { name: "Start" }).click();
  const blanks = card(page, "b1");
  await expect(blanks.locator("pre.fm-hl input.fm-blank")).toHaveCount(1);
  await expect(blanks.locator("pre.fm-hl .fm-tk-keyword").first()).toHaveText("def");
  // a matching option cannot hold HTML: its text is the TeX source
  await expect(card(page, "g1").locator("select").first().locator("option").nth(1)).toHaveText(/^\$.*\$$/);
  await expect(card(page, "s1").locator(".katex").first()).toBeVisible();
  // the browser names a maths-only choice from its MathML
  await expect(card(page, "s1").getByRole("radio").first()).toHaveAccessibleName(/[0-9]/);
  await noViolations(page, MATHML_NAMES);
});
