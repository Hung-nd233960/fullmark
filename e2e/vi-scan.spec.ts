import { cpSync, mkdirSync, mkdtempSync } from "node:fs";
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
    // biome-ignore lint/performance/useDomNodeTextContent: the text as rendered is what the scan is about
    const rendered = (el: HTMLElement): string => el.innerText;
    const notices = [...document.querySelectorAll<HTMLElement>(".fm-licences-texts pre, .fm-licences-copy")];
    let text = rendered(document.body);
    for (const el of notices) text = text.replace(rendered(el), " ");
    return [text, ...names].join("\n").replace(/\s+/g, " ");
  });
}

for (const s of subjects) {
  test(`no English chrome in a vi page, from Start to the Licences popup: ${s.name}`, async ({ page }) => {
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
    await look("the Licences popup");

    const leaks = seen.flatMap(([step, text]) => leaksIn(text, mine).map((l) => `${step}: ${l}`));
    expect(leaks, `${s.name}: English chrome in a vi page`).toEqual([]);
  });
}
