import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { buildWith, root, run, submitAttempt } from "./helpers";

/**
 * Screenshots of slice 2j for the owner to compare with the ResultsReplay board. Not part of `npm run check`: run with
 * FULLMARK_SCREENS=1 npx playwright test e2e/screens-2j.spec.ts --project=chromium. They land in docs/screens/2j/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");
test.use({ viewport: { width: 1280, height: 940 } });

const out = (name: string) => join(root, "docs", "screens", "2j", `${name}.png`);
const STAMP = ["--built-at", "2026-10-28T10:00:00+07:00"];

/** A page built with `extra` front matter, answered and submitted, its export replayed: the replay's URL. */
async function replayOf(page: Page, extra: string[], name: string): Promise<string> {
  const built = buildWith("test/fixtures/page/results.md", "results.md", extra);
  await page.goto(built.url);
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByLabel("right r1").check();
  await page.getByLabel("wrong r2").check();
  await page.getByLabel("right r4").check();
  await page.getByLabel("wrong r5").check();
  await page.getByLabel("two r6").check();
  await submitAttempt(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download results" }).click();
  const file = await download;
  await file.saveAs(join(built.dir, `${name}.json`));
  run(built.dir, "replay", `${name}.json`, "--quiz", "results.md", "--no-open", ...STAMP);
  return `file:///${join(built.dir, `${name}-replay.html`).replaceAll("\\", "/")}`;
}

test("the replay on the board's theme and font, then light and dark", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1560 });
  const paper = await replayOf(page, ["theme: paper", "font: serif"], "paper");
  await page.goto(paper);
  await expect(page.locator("[data-replay-banner]")).toBeVisible();
  await page.screenshot({ path: out("1-replay-paper-serif"), fullPage: true });
  const light = await replayOf(page, [], "light");
  await page.goto(light);
  await page.screenshot({ path: out("2-replay-light"), fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: out("3-replay-dark"), fullPage: true });
});

test("the replay on a phone", async ({ page }) => {
  const url = await replayOf(page, [], "phone");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await expect(page.locator("[data-replay-banner]")).toBeVisible();
  await page.screenshot({ path: out("4-replay-phone") });
});
