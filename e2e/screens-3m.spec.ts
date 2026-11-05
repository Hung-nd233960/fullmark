import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { root, type Served, serveProcess } from "./helpers";

/**
 * Screenshots of slice 3m for the owner, to compare with the Review, ReviewSince and ReviewPhone boards
 * (docs/mockup/images/): `quiz review` on a copy of the materials fixture (three sheets, three parts, twelve
 * questions), with the stacked Questions & materials sidebar, with `--since`, in Vietnamese, and at 390 px. Not part of
 * `npm run check`: run with FULLMARK_SCREENS=1 npx playwright test e2e/screens-3m.spec.ts --project=chromium. They land
 * in docs/screens/3m/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");

const folder = join(root, "docs", "screens", "3m");
mkdirSync(folder, { recursive: true });

const served: Served[] = [];
test.afterEach(() => {
  for (const s of served.splice(0)) s.child.kill("SIGKILL");
});

const card = (page: Page, id: string) => page.locator(`article[data-qid="${id}"]`);
const DESKTOP = { width: 1280, height: 940 };
const PHONE = { width: 390, height: 844 };

/** A scratch copy of the materials fixture with its sheets; `vi` makes the quiz's `ui_lang` Vietnamese. */
function materials(vi = false): string {
  const dir = mkdtempSync(join(tmpdir(), "fm-screens-"));
  mkdirSync(join(dir, ".git"));
  copyFileSync(join(root, "test/fixtures/page/materials.md"), join(dir, "quiz.md"));
  cpSync(join(root, "test/fixtures/page/materials"), join(dir, "materials"), { recursive: true });
  if (vi) {
    const text = readFileSync(join(dir, "quiz.md"), "utf8").replace("id: materials\n", "id: materials\nui_lang: vi\n");
    writeFileSync(join(dir, "quiz.md"), text);
  }
  return dir;
}

async function start(
  page: Page,
  dir: string,
  size: { width: number; height: number },
  scheme: "light" | "dark" = "light",
  ...args: string[]
): Promise<Served> {
  const server = await serveProcess(dir, ["review", "quiz.md", ...args]);
  served.push(server);
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  await page.setViewportSize(size);
  await page.goto(server.url);
  await page.locator("[data-quiz]").waitFor();
  return server;
}

/** A few verdicts, so the rings and the counts show: part 2 half judged with a fix and a drop, part 1 judged. */
async function judge(page: Page): Promise<void> {
  for (const id of ["m1", "m2", "m3", "m4", "m5"]) await card(page, id).locator("[data-pick=keep]").click();
  await card(page, "m6").locator("[data-pick=fix]").click();
  await card(page, "m6").locator("[data-reason=unclear]").click();
  await card(page, "m7").locator("[data-pick=drop]").click();
  await card(page, "m7").locator("[data-reason=duplicate]").click();
  await card(page, "m6").scrollIntoViewIfNeeded();
}

const shot = async (page: Page, name: string) => {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(folder, `${name}.png`) });
};

for (const scheme of ["light", "dark"] as const) {
  test(`Review: the stacked Questions & materials sidebar, ${scheme}`, async ({ page }) => {
    await start(page, materials(), DESKTOP, scheme);
    await judge(page);
    await page.locator("[data-part-tab=fourier]").click();
    await shot(page, `review-materials-${scheme}`);
  });
}

test("Review: the stacked sidebar in Vietnamese", async ({ page }) => {
  await start(page, materials(true), DESKTOP);
  await judge(page);
  await page.locator("[data-part-tab=fourier]").click();
  await shot(page, "review-materials-vi");
});

test("ReviewSince: --since in the stacked sidebar, and a part with nothing asked again", async ({ page }) => {
  const dir = materials();
  const first = await serveProcess(dir, ["review", "quiz.md"]);
  served.push(first);
  await page.setViewportSize(DESKTOP);
  await page.goto(first.url);
  await page.locator("[data-quiz]").waitFor();
  await card(page, "m6").locator("[data-pick=fix]").click();
  await card(page, "m6").locator("[data-reason=unclear]").click();
  await card(page, "m6").locator("textarea").fill("Does not say which transform pair.");
  await card(page, "m10").locator("[data-pick=keep]").click();
  await page.locator("[data-action=keep-rest]").click();
  await page.locator("[data-action=mark-keep]").click();
  await expect(page.locator("[data-review-saved]")).toBeVisible();
  await first.end();
  let text = readFileSync(join(dir, "quiz.md"), "utf8");
  for (const [from, to] of [
    ["Question m6?", "Question m6, for the Fourier pair of a rectangular pulse?"],
    ["Question m10?", "Question m10, sampled at twice the rate?"],
  ] as const) {
    expect(text).toContain(from);
    text = text.replace(from, to);
  }
  writeFileSync(join(dir, "quiz.md"), text);
  await start(page, dir, DESKTOP, "light", "--since", "review.json");
  await page.locator("[data-part-tab=fourier]").click();
  await shot(page, "since-materials");
  await page.locator("[data-part-tab=sig]").click();
  await shot(page, "since-nothing-asked");
});

test("ReviewPhone: the form at 390 px, with and without a reason picked", async ({ page }) => {
  await start(page, materials(), PHONE);
  await card(page, "m1").locator("[data-pick=fix]").click();
  await shot(page, "phone-fix");
  await card(page, "m1").locator("[data-reason=key-wrong]").click();
  await card(page, "m1").locator("textarea").fill("The key says A but B is also right.");
  await shot(page, "phone-fix-reason");
});

test("ReviewPhone: the sidebar on the whole screen, Questions and Materials", async ({ page }) => {
  await start(page, materials(), PHONE);
  await page.locator("[data-action=keep-rest]").click();
  await page.locator("[data-action=dialog-back]").click();
  await card(page, "m1").locator("[data-pick=keep]").click();
  await page.locator("[data-action=sidebar]").click();
  await shot(page, "phone-sidebar-questions");
  await page.getByRole("tab", { name: "Materials" }).click();
  await shot(page, "phone-sidebar-materials");
});

test("ReviewPhone: in Vietnamese", async ({ page }) => {
  await start(page, materials(true), PHONE);
  await card(page, "m1").locator("[data-pick=fix]").click();
  await shot(page, "phone-vi");
});
