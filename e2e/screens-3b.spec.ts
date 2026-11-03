import { copyFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Page, test } from "@playwright/test";
import { root, type Served, serveProcess, submitAttempt } from "./helpers";

/**
 * Screenshots of slice 3b for the owner: the Submit dialog's new line on a served page, and the results card with
 * **Sent** in place of Download results (English and Vietnamese), and the card when the server has gone. Not part of
 * `npm run check`: run with FULLMARK_SCREENS=1 npx playwright test e2e/screens-3b.spec.ts --project=chromium. They
 * land in docs/screens/3b/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");

const folder = join(root, "docs", "screens", "3b");
mkdirSync(folder, { recursive: true });

const served: Served[] = [];
test.afterEach(() => {
  for (const s of served.splice(0)) s.child.kill("SIGKILL");
});

/** The results card sits above the first question: scroll everything back to the top so the card is whole. */
const toTop = (page: Page) =>
  page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const el of document.querySelectorAll("*")) if (el.scrollTop > 0) el.scrollTop = 0;
  });

async function open(page: Page, fixture: string): Promise<Served> {
  const dir = mkdtempSync(join(tmpdir(), "fm-screens-"));
  mkdirSync(join(dir, ".git"));
  copyFileSync(join(root, "test/fixtures/page", fixture), join(dir, "quiz.md"));
  const server = await serveProcess(dir, ["serve", "quiz.md", "--out", "results.json"]);
  served.push(server);
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(server.url);
  await page.locator("[data-action=start]").click();
  await page.locator("input[type=radio]").first().check();
  return server;
}

for (const [lang, fixture] of [
  ["en", "map.md"],
  ["vi", "chrome-vi.md"],
] as const) {
  test(`the Submit dialog on a served page: ${lang}`, async ({ page }) => {
    await open(page, fixture);
    await page.locator(".fm-topbar [data-action=submit]").click();
    await page.locator("dialog[data-submit-dialog]").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(folder, `submit-dialog-${lang}.png`) });
  });

  test(`Sent on the results card: ${lang}`, async ({ page }) => {
    await open(page, fixture);
    await submitAttempt(page);
    await page.locator("[data-sent]").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await toTop(page);
    await page.screenshot({ path: join(folder, `sent-${lang}.png`) });
  });
}

test("the results card when the server has gone: could not save, Download results kept", async ({ page }) => {
  const server = await open(page, "map.md");
  server.child.kill("SIGKILL");
  await server.end();
  await submitAttempt(page);
  await page.locator("[data-send-failed]").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await toTop(page);
  await page.screenshot({ path: join(folder, "send-failed-en.png") });
});
