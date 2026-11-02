import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { buildFolder, root, run } from "./helpers";

/**
 * Screenshots of slice 2i4: the Information & Licences popup on each tab, light and dark, on a desktop and on a phone.
 * The Information tab now shows the 4-character version, the theme and the look. The page is the calculus example (maths and, with `--fonts all`, every font) so the Information tab has its longest
 * list. Not part of `npm run check`: run with FULLMARK_SCREENS=1 npx playwright test e2e/screens-2i4.spec.ts
 * --project=chromium. They land in docs/screens/2i4/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");
test.describe.configure({ mode: "serial" });

const dir = join(root, "docs", "screens", "2i4");
mkdirSync(dir, { recursive: true });
const out = (name: string) => join(dir, `${name}.png`);

const sizes = [
  { name: "desktop", width: 1280, height: 940 },
  { name: "phone", width: 390, height: 844 },
];

async function shot(
  page: Page,
  theme: string,
  size: (typeof sizes)[number],
  tab: "Information" | "Licences",
  n: number,
) {
  await page.setViewportSize({ width: size.width, height: size.height });
  const built = buildFolder("examples/calculus");
  const file = join(built.dir, "quiz.md");
  writeFileSync(file, readFileSync(file, "utf8").replace(/^---\n/, `---\ntheme: ${theme}\nlook: locked\n`));
  run(built.dir, "build", "quiz.md", "--built-at", "2026-10-28T10:00:00+07:00", "--fonts", "all");
  await page.goto(built.url);
  await page.locator("[data-action=licences]").click();
  await expect(page.locator("dialog#fm-licences")).toBeVisible();
  if (tab === "Licences") await page.getByRole("tab", { name: "Licences" }).click();
  await page.screenshot({ path: out(`${n}-${tab.toLowerCase()}-${theme}-${size.name}`) });
}

let n = 0;
for (const tab of ["Information", "Licences"] as const) {
  for (const theme of ["light", "dark"]) {
    for (const size of sizes) {
      n += 1;
      const at = n;
      test(`${tab} tab, ${theme}, ${size.name}`, async ({ page }) => shot(page, theme, size, tab, at));
    }
  }
}
