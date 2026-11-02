import { cpSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { leaksIn, own } from "../test/helpers/vi-scan";
import { buildWith, root, run, submitAttempt } from "./helpers";

/**
 * The `vi` scan after Submit (STEP2.md, slice 2i2): `test/build/vi-scan.test.ts` reads the page as built, which is the
 * start screen. Here a page built with `--ui-lang vi` is used the way a learner does, and the text on screen at each
 * step (and every accessible name and title) is compared with the same catalog: no English chrome in a `vi` page.
 */
const AT = "2026-10-28T10:00:00+07:00";

/** A quiz from a folder (so sheets and images resolve), built with `--ui-lang vi`. */
function buildFolderVi(sourceDir: string, name: string): { dir: string; url: string } {
  const dir = mkdtempSync(join(tmpdir(), "fm-e2e-vi-"));
  mkdirSync(join(dir, ".git")); // it stops the search for fullmark.toml
  cpSync(join(root, sourceDir), dir, { recursive: true });
  run(dir, "build", name, "--built-at", AT, "--ui-lang", "vi");
  return { dir, url: `file:///${join(dir, name.replace(/\.md$/, ".html")).replaceAll("\\", "/")}` };
}

const subjects = [
  { name: "example exam", ...buildFolderVi("examples/exam", "quiz.md") },
  {
    name: "fixture results",
    ...buildWith("test/fixtures/page/results.md", "scan-results.md", [], ["--ui-lang", "vi"]),
  },
  { name: "fixture materials", ...buildFolderVi("test/fixtures/page", "materials.md") },
];

/**
 * The text on screen, and the names and titles that are not text.
 * The licence texts and copyright lines are the packages' own words, in English, so they are left out.
 */
async function onScreen(page: Page): Promise<string> {
  return page.evaluate(() => {
    const names = [...document.querySelectorAll("[aria-label],[title],[placeholder]")].flatMap((el) =>
      ["aria-label", "title", "placeholder"].map((a) => el.getAttribute(a) ?? ""),
    );
    const rendered = (el: HTMLElement): string => el.innerText;
    const notices = [...document.querySelectorAll<HTMLElement>(".fm-licences-texts pre, .fm-licences-copy")];
    let text = rendered(document.body);
    for (const el of notices) text = text.replace(rendered(el), " ");
    return [text, ...names].join("\n").replace(/\s+/g, " ");
  });
}

for (const s of subjects) {
  test(`no English chrome in a vi page, from Start to the Information & Licences popup: ${s.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 940 });
    await page.goto(s.url);
    const mine = own(s.dir);
    const seen: [string, string][] = [];
    const look = async (step: string) => seen.push([step, await onScreen(page)]);

    await look("the start screen");
    await page.getByRole("button", { name: "Bắt đầu" }).click();
    await page.locator("article[data-qid] input[type=radio], article[data-qid] input[type=checkbox]").first().check();
    await look("answering");
    await page.locator(".fm-topbar [data-action=submit]").click();
    await expect(page.locator("dialog[data-submit-dialog]")).toBeVisible();
    await look("the Submit dialog");
    await page.locator("dialog[data-submit-dialog] [data-action=keep-answering]").click();
    await submitAttempt(page);
    await expect(page.locator(".fm-results")).toBeVisible();
    await look("the results");
    for (const filter of await page
      .locator("[data-filter]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-filter")))) {
      await page.locator(`[data-filter="${filter}"]`).click();
      await look(`the filter ${filter}`);
    }
    const toggle = page.locator("[data-action=sidebar]");
    if ((await toggle.count()) > 0 && (await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
    await look("the sidebar");
    for (const tab of await page.locator("aside.fm-side [role=tab]").all()) {
      await tab.click();
      await look("a sidebar tab");
    }
    await page.locator("[data-action=appearance]").click();
    await look("the appearance menu");
    await page.keyboard.press("Escape");
    await page.locator("[data-action=licences]").click();
    await expect(page.locator("dialog#fm-licences")).toBeVisible();
    await look("the Information tab");
    await page.locator("dialog#fm-licences [data-info-tab=licences]").click();
    await look("the Licences tab");

    const leaks = seen.flatMap(([step, text]) => leaksIn(text, mine).map((l) => `${step}: ${l}`));
    expect(leaks, `${s.name}: English chrome in a vi page`).toEqual([]);
  });
}

/**
 * A replay page built with `--ui-lang vi` (slice 2j2): the banner, the status segment, the criterion tables and the
 * grader's line, then a Retry missed left in progress and offered back through the resume banner, and its dialog.
 */
test("no English chrome in a vi replay page, with grades and with a retry left in progress", async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), "fm-e2e-vi-replay-"));
  mkdirSync(join(dir, ".git"));
  cpSync(join(root, "test", "fixtures", "replay"), dir, { recursive: true });
  run(dir, "replay", "essay-results.json", "--quiz", "essay.md", "--no-open", "--built-at", AT, "--ui-lang", "vi");
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(`file:///${join(dir, "essay-results-replay.html").replaceAll("\\", "/")}`);
  // the grader's own words are the author's, like the quiz: they may be English
  const mine = own(dir) + readFileSync(join(dir, "essay-results-grades.json"), "utf8").toLowerCase();
  const seen: [string, string][] = [];
  const look = async (step: string) => seen.push([step, await onScreen(page)]);

  await expect(page.locator("[data-replay-banner]")).toBeVisible();
  await expect(page.locator(".fm-grade-table").first()).toBeVisible();
  await look("the replay");
  expect(seen[0]?.[1]).toContain("Chấm bởi");
  expect(seen[0]?.[1]).toContain("Tiêu chí");
  await page.locator("[data-action=retry-missed]").click();
  await look("the Retry missed dialog");
  await page.locator("[data-action=confirm-retry]").click();
  await page.locator("article.fm-question:not([hidden]) textarea").first().fill("Một câu trả lời khác.");
  await page.reload();
  await expect(page.locator("[data-resume-banner]")).toBeVisible();
  await look("the retry offered back");
  await page.locator("[data-resume-banner] [data-action=start-over]").click();
  await look("the Start over dialog");
  await page.keyboard.press("Escape");
  await page.locator("[data-resume-banner] [data-action=continue]").click();
  await expect(page.locator(".fm-quiz")).toHaveAttribute("data-phase", "answering");
  await look("the retry continued");

  const leaks = seen.flatMap(([step, text]) => leaksIn(text, mine).map((l) => `${step}: ${l}`));
  expect(leaks, "English chrome in a vi replay page").toEqual([]);
});
