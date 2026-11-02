import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { card, replayOf, root, run } from "./helpers";

/**
 * Screenshots of slice 2j3 for the owner: the explanation, the grader's feedback panel and the hint (to show it
 * unchanged), light and dark, desktop and phone; the graded replay on a phone. Not part of `npm run check`: run with
 * FULLMARK_SCREENS=1 npx playwright test e2e/screens-2j3.spec.ts --project=chromium. They land in docs/screens/2j3/.
 */
test.skip(!process.env.FULLMARK_SCREENS, "screenshots are made on request");

const out = (name: string) => join(root, "docs", "screens", "2j3", `${name}.png`);

const QUIZ = `---
title: Panels
id: panels
feedback: instant
---

## Which is the only even prime? {type=single id=p1}

- [ ] One
- [x] Two
- [ ] Three

::: hint
It is the smallest prime.
:::

::: explanation
Every other even number is divisible by two, so it has a second divisor.
:::
`;

function hintPage(): string {
  const dir = mkdtempSync(join(tmpdir(), "fm-screens-"));
  mkdirSync(join(dir, ".git"));
  writeFileSync(join(dir, "panels.md"), QUIZ);
  run(dir, "build", "panels.md", "--built-at", "2026-10-28T10:00:00+07:00");
  return `file:///${join(dir, "panels.html").replaceAll("\\", "/")}`;
}

async function openHint(page: Page, shot: string): Promise<void> {
  await page.goto(hintPage());
  await page.getByRole("button", { name: "Start" }).first().click();
  const q = card(page, "p1");
  await q.getByRole("button", { name: "Hint" }).click();
  await q.getByRole("radio").nth(1).check();
  await q.getByRole("button", { name: "Check" }).click();
  await expect(q.locator(".fm-explanation")).toBeVisible();
  await q.scrollIntoViewIfNeeded();
  await q.screenshot({ path: out(shot) });
}

const SIZES = [
  { name: "desktop", width: 1280, height: 940 },
  { name: "phone", width: 390, height: 844 },
] as const;

for (const size of SIZES) {
  for (const scheme of ["light", "dark"] as const) {
    test(`the hint and the explanation, ${size.name}, ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.emulateMedia({ colorScheme: scheme });
      await openHint(page, `hint-explanation-${size.name}-${scheme}`);
    });

    test(`the feedback panel and the table, ${size.name}, ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(replayOf([], `s-${size.name}-${scheme}`));
      const add = card(page, "add");
      await add.scrollIntoViewIfNeeded();
      await add.screenshot({ path: out(`graded-${size.name}-${scheme}`) });
    });
  }
}

test("the explanation on a replay, and the banded and holistic tables on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(replayOf([], "phone-all"));
  await card(page, "prime").screenshot({ path: out("explanation-replay-phone") });
  await card(page, "ielts").screenshot({ path: out("banded-phone") });
  await card(page, "holistic").screenshot({ path: out("holistic-phone") });
});
