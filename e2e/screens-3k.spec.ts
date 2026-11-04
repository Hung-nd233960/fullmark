import { copyFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Page, test } from "@playwright/test";
import { root, type Served, serveProcess } from "./helpers";

/**
 * Screenshots of slice 3k for the owner, to compare with the Review boards (docs/mockup/images/Review*.png): the form
 * with a few verdicts, a Fix with its reasons and note, Finish held back, the Finish dialog, the saved card, and the
 * same in Vietnamese and in dark. Not part of `npm run check`: run with
 * FULLMARK_SCREENS=1 npx playwright test e2e/screens-3k.spec.ts --project=chromium. They land in docs/screens/3k/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");

const folder = join(root, "docs", "screens", "3k");
mkdirSync(folder, { recursive: true });

const served: Served[] = [];
test.afterEach(() => {
  for (const s of served.splice(0)) s.child.kill("SIGKILL");
});

async function open(page: Page, source: string, scheme: "light" | "dark" = "light"): Promise<Served> {
  const dir = mkdtempSync(join(tmpdir(), "fm-screens-"));
  mkdirSync(join(dir, ".git"));
  copyFileSync(join(root, source), join(dir, "quiz.md"));
  const server = await serveProcess(dir, ["review", "quiz.md"]);
  served.push(server);
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(server.url);
  await page.locator("[data-quiz]").waitFor();
  return server;
}

const current = (page: Page) => page.locator("article[data-current=true]");
const toTop = (page: Page) =>
  page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const el of document.querySelectorAll("*")) if (el.scrollTop > 0) el.scrollTop = 0;
  });
const shot = async (page: Page, name: string) => {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(folder, `${name}.png`) });
};

/** Judges the first questions by keys, leaving the current one on the last. */
async function judgeSome(page: Page): Promise<void> {
  await page.keyboard.press("1");
  await page.keyboard.press("n");
  await page.keyboard.press("2");
  await current(page).locator("[data-reason=key-wrong]").click();
  await page.keyboard.press("n");
  await page.keyboard.press("1");
  await page.keyboard.press("n");
  await page.keyboard.press("3");
  await current(page).locator("[data-reason=duplicate]").click();
  await page.keyboard.press("n");
}

for (const scheme of ["light", "dark"] as const) {
  test(`Review: the form with some verdicts, ${scheme}`, async ({ page }) => {
    await open(page, "examples/rust/quiz.md", scheme);
    await judgeSome(page);
    await toTop(page);
    await shot(page, `review-${scheme}`);
  });
}

test("Review: a Fix with its reasons and a note", async ({ page }) => {
  await open(page, "examples/rust/quiz.md");
  await page.keyboard.press("1");
  await page.keyboard.press("n");
  await page.keyboard.press("2");
  await current(page).locator("[data-reason=other]").click();
  await current(page).locator("textarea").fill("The explanation says E0382 but the example shows E0499.");
  await current(page).scrollIntoViewIfNeeded();
  await current(page).locator("[data-pick=fix]").scrollIntoViewIfNeeded();
  await shot(page, "review-fix");
});

test("Review: Finish held back, a fix with no reason and Other with no note", async ({ page }) => {
  await open(page, "examples/rust/quiz.md");
  await page.keyboard.press("2");
  await page.keyboard.press("n");
  await page.keyboard.press("2");
  await current(page).locator("[data-reason=other]").click();
  await page.locator("[data-action=finish]").click();
  await shot(page, "review-held");
});

test("ReviewFinish: the Finish dialog, and the saved card", async ({ page }) => {
  await open(page, "examples/rust/quiz.md");
  await judgeSome(page);
  await page.locator("[data-action=finish]").click();
  await page.locator("dialog[data-review-dialog]").waitFor();
  await shot(page, "review-dialog");
  await page.locator("[data-action=mark-keep]").click();
  await page.locator("[data-review-saved]").waitFor();
  await toTop(page);
  await shot(page, "review-saved");
});

test("ReviewVi: the form in Vietnamese, and its saved card", async ({ page }) => {
  await open(page, "test/fixtures/page/types-vi.md");
  await judgeSome(page);
  await toTop(page);
  await shot(page, "review-vi");
  await page.locator("[data-action=keep-rest]").click();
  await page.locator("dialog[data-review-dialog]").waitFor();
  await shot(page, "review-vi-dialog");
  await page.locator("[data-action=mark-keep]").click();
  await page.locator("[data-review-saved]").waitFor();
  await toTop(page);
  await shot(page, "review-vi-saved");
});
