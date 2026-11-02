import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { quizHash } from "../src/core/hash";
import { resultsHash } from "../src/core/rubric/grades";
import { THEME_NAMES } from "../src/core/themes";
import { noViolations, root, run } from "./helpers";

/**
 * The explanation and feedback panels, and the phone's criterion table (STEP2.md, slice 2j3; TECHNICAL_DESIGN.md,
 * section 8, row "Answer panels"). The fixture is the replay of the `essay` quiz with its grades, built with `extra`
 * front matter lines (the lines change the hash, so the results and grades files are re-keyed to it).
 */
const FIXTURE = join(root, "test", "fixtures", "replay");

export function replayOf(extra: string[], name: string): string {
  const dir = mkdtempSync(join(tmpdir(), "fm-panels-"));
  mkdirSync(join(dir, ".git"));
  const source = readFileSync(join(FIXTURE, "essay.md"), "utf8").replace(/^---\n/, `---\n${extra.join("\n")}\n`);
  writeFileSync(join(dir, "essay.md"), source);
  const results = JSON.parse(readFileSync(join(FIXTURE, "essay-results.json"), "utf8"));
  results.quizHash = quizHash(source, []);
  writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(results, null, 2)}\n`);
  const grades = JSON.parse(readFileSync(join(FIXTURE, "essay-results-grades.json"), "utf8"));
  grades.results_hash = resultsHash(results);
  writeFileSync(join(dir, `${name}-grades.json`), JSON.stringify(grades));
  run(dir, "replay", `${name}.json`, "--quiz", "essay.md", "--no-open", "--built-at", "2026-10-28T10:00:00+07:00");
  return `file:///${join(dir, `${name}-replay.html`).replaceAll("\\", "/")}`;
}

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
