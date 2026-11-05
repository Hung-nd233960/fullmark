import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { root, type Served, serveProcess } from "./helpers";

/**
 * Screenshots of slice 3l for the owner, to compare with the ReviewSince board (docs/mockup/images/ReviewSince.png):
 * `quiz review --since` on a copy of the calculus quiz after a first review (one Fix, one Keep) and three changes (the
 * Fix question edited, the Keep question edited, one question added), in light, dark and Vietnamese. The board shows
 * the stacked Questions & materials sidebar, which is 3m's: here the plain Questions sidebar. Not part of
 * `npm run check`: run with FULLMARK_SCREENS=1 npx playwright test e2e/screens-3l.spec.ts --project=chromium. They land
 * in docs/screens/3l/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");

const folder = join(root, "docs", "screens", "3l");
mkdirSync(folder, { recursive: true });

const served: Served[] = [];
test.afterEach(() => {
  for (const s of served.splice(0)) s.child.kill("SIGKILL");
});

const card = (page: Page, id: string) => page.locator(`article[data-qid="${id}"]`);

/** A first review in a scratch folder, then the quiz edited; returns the folder. */
async function prepared(page: Page, source: string, fix: string, keep: string, edits: [string, string][]) {
  const dir = mkdtempSync(join(tmpdir(), "fm-screens-"));
  mkdirSync(join(dir, ".git"));
  copyFileSync(join(root, source), join(dir, "quiz.md"));
  const assets = join(root, source, "..", "assets");
  if (existsSync(assets)) cpSync(assets, join(dir, "assets"), { recursive: true });
  const first = await serveProcess(dir, ["review", "quiz.md"]);
  served.push(first);
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(first.url);
  await page.locator("[data-quiz]").waitFor();
  await card(page, fix).locator("[data-pick=fix]").click();
  await card(page, fix).locator("[data-reason=unclear]").click();
  await card(page, fix).locator("textarea").fill("Accept 54 or 54.0: the question does not say how to write it.");
  await card(page, keep).locator("[data-pick=keep]").click();
  await page.locator("[data-action=keep-rest]").click();
  await page.locator("[data-action=mark-keep]").click();
  await expect(page.locator("[data-review-saved]")).toBeVisible();
  await first.end();
  let text = readFileSync(join(dir, "quiz.md"), "utf8");
  for (const [from, to] of edits) {
    expect(text).toContain(from);
    text = text.replace(from, to);
  }
  writeFileSync(join(dir, "quiz.md"), text);
  return dir;
}

async function openSince(page: Page, dir: string, scheme: "light" | "dark"): Promise<void> {
  const server = await serveProcess(dir, ["review", "quiz.md", "--since", "review.json"]);
  served.push(server);
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.goto(server.url);
  await page.locator("[data-quiz]").waitFor();
}

const toTop = (page: Page) =>
  page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const el of document.querySelectorAll("*")) if (el.scrollTop > 0) el.scrollTop = 0;
  });
const shot = async (page: Page, name: string) => {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(folder, `${name}.png`) });
};

const CALCULUS_EDITS: [string, string][] = [
  ["Evaluate $f'(1)$.", "Evaluate $f'(1)$ exactly, as an integer."],
  ["- [x] $x^2$\n- [ ] $\\dfrac{x^3}{3}$", "- [x] $x^2$\n- [ ] $\\dfrac{x^3}{4}$"],
];
const NEW_QUESTION =
  "\n## Is the derivative of a constant zero? {type=truefalse tags=derivatives id=constant-rule}\n\n```answer\nvalue: true\n```\n";

for (const scheme of ["light", "dark"] as const) {
  test(`ReviewSince: --since on the calculus quiz, ${scheme}`, async ({ page }) => {
    const dir = await prepared(page, "examples/calculus/quiz.md", "chain-rule-value", "ftc-derivative", CALCULUS_EDITS);
    writeFileSync(join(dir, "quiz.md"), `${readFileSync(join(dir, "quiz.md"), "utf8")}${NEW_QUESTION}`);
    await openSince(page, dir, scheme);
    await toTop(page);
    await shot(page, `since-${scheme}`);
    // the kept question that changed: the line in place of a diff, and the new question after it
    await card(page, "ftc-derivative").scrollIntoViewIfNeeded();
    await shot(page, `since-kept-${scheme}`);
  });
}

test("ReviewSince: --since in Vietnamese", async ({ page }) => {
  const dir = await prepared(page, "test/fixtures/page/types-vi.md", "s1", "m1", [
    ["## Pick the colour of the sky.", "## Pick the colour of the clear sky."],
  ]);
  await openSince(page, dir, "light");
  await toTop(page);
  await shot(page, "since-vi");
});
