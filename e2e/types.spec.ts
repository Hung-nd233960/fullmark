import { expect, test } from "@playwright/test";
import { buildIn, card, expectGradeMatches, noViolations, watch } from "./helpers";

const types = buildIn("test/fixtures/page/types.md", "types.md");
const typesVi = buildIn("test/fixtures/page/types-vi.md", "types-vi.md");
const exam = buildIn("examples/exam/quiz.md", "exam.md");

test("every simple type: status and points on the page equal quiz grade", async ({ page, context }) => {
  let blocked = 0;
  await context.route(/^https?:/, (route) => {
    blocked++;
    return route.abort();
  });
  const seen = watch(page);
  await page.goto(types.url);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator(".fm-question")).toHaveCount(11);
  await noViolations(page);

  await card(page, "s1").getByRole("radio").nth(1).check(); // right
  await card(page, "m1").getByRole("checkbox").nth(0).check(); // one of two right: partly right
  await card(page, "t1").getByRole("radio").nth(1).check(); // False: right
  await card(page, "n1").locator("input.fm-text").fill("7391.5"); // within the tolerance
  await card(page, "n2").locator("input.fm-text").fill("9"); // wrong
  await card(page, "n3").locator("input.fm-text").fill("5/2"); // right, as a fraction
  await card(page, "h1").locator("input.fm-text").fill("ZQ-ACCEPT-ALPHA"); // right, case aside
  // h2 stays empty
  const blanks = card(page, "b1").locator("input.fm-blank");
  await blanks.nth(0).fill("plorbax"); // right
  await blanks.nth(1).fill("0.05"); // wrong
  await blanks.nth(2).fill("quuxle"); // right
  // the fourth stays empty
  const fields = card(page, "f1").locator("input.fm-text");
  await fields.nth(0).fill("4242.5"); // right
  await fields.nth(1).fill("nope"); // wrong
  await fields.nth(2).fill("a note"); // not scored
  await card(page, "c1").getByRole("radio").nth(3).check();

  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".fm-total")).toBeVisible();
  const results = await expectGradeMatches(page, types.dir, "types.md");
  const status = Object.fromEntries(results.map((r) => [r.id, r.status]));
  expect(status).toEqual({
    s1: "correct",
    m1: "partial",
    t1: "correct",
    n1: "correct",
    n2: "incorrect",
    n3: "correct",
    h1: "correct",
    h2: "unanswered",
    b1: "partial",
    f1: "partial",
    c1: "ungraded",
  });
  await noViolations(page);

  // review: marks per blank and per field, the accepted answer when wrong, nothing for the ungraded ones
  await expect(card(page, "b1").locator("input.fm-blank").nth(1)).toHaveAttribute("data-result", "wrong");
  await expect(card(page, "b1").locator("input.fm-blank").nth(0)).toHaveAttribute("data-result", "correct");
  await expect(card(page, "b1").locator(".fm-blank-results")).toContainText("0.0481 ± 0.001");
  await expect(card(page, "b1").locator(".fm-blank-results")).toContainText("wibble");
  await expect(card(page, "f1").locator(".fm-field-mark")).toHaveCount(2);
  await expect(card(page, "f1")).toContainText("zq-field-name");
  await expect(card(page, "n2")).toContainText("3.14 ± 1%");
  await expect(card(page, "n1")).toContainText("7391.25 ± 0.5 m");
  await expect(card(page, "h2")).not.toContainText("zq-pat-");
  await expect(card(page, "h1")).toContainText("zq-accept-alpha");

  expect(seen.problems).toEqual([]);
  expect(seen.requests).toEqual([]);
  expect(blocked).toBe(0);
});

test("examples/exam, answered in part, grades the same", async ({ page }) => {
  const seen = watch(page);
  await page.goto(exam.url);
  await page.getByRole("button", { name: "Start" }).click();
  await card(page, "median").getByRole("radio").nth(1).check();
  await card(page, "normal").getByRole("checkbox").nth(0).check();
  await card(page, "pvalue").getByRole("radio").nth(1).check();
  await card(page, "mean").locator("input.fm-text").fill("6");
  await card(page, "sem").locator("input.fm-text").fill("2.005");
  const blanks = card(page, "sd-blanks").locator("input.fm-blank");
  await blanks.nth(0).fill("sd");
  await blanks.nth(1).fill("mean");
  await card(page, "ci-a").getByRole("radio").nth(0).check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expectGradeMatches(page, exam.dir, "exam.md");
  await noViolations(page);
  expect(seen.problems).toEqual([]);
});

test("the comma warning: shown in an en quiz, never in a vi one; 2,5 scores right in vi", async ({ page }) => {
  await page.goto(types.url);
  await page.getByRole("button", { name: "Start" }).click();
  const box = card(page, "n3").locator("input.fm-text");
  await box.fill("2,5");
  await expect(card(page, "n3").locator(".fm-warn")).toHaveText("Use a point for decimals: 2.5, not 2,5");
  await box.fill("2.5");
  await expect(card(page, "n3").locator(".fm-warn")).toHaveCount(0);
  await card(page, "b1").locator("input.fm-blank").nth(1).fill("0,05");
  await expect(card(page, "b1").locator(".fm-warn")).toContainText("Use a point");
  await card(page, "f1").locator("input.fm-text").nth(0).fill("1,5");
  await expect(card(page, "f1").locator(".fm-warn")).toHaveCount(1);
  await card(page, "f1").locator("input.fm-text").nth(1).fill("1,5");
  await expect(card(page, "f1").locator(".fm-warn")).toHaveCount(1);

  await page.goto(typesVi.url);
  await page.getByRole("button", { name: "Bắt đầu" }).click();
  const vi = card(page, "n3").locator("input.fm-text");
  await vi.fill("2,5");
  await expect(card(page, "n3").locator(".fm-warn")).toHaveCount(0);
  await expect(vi).toHaveValue("2,5");
  await page.getByRole("button", { name: "Nộp bài" }).click();
  await expect(card(page, "n3").locator(".fm-result")).toHaveAttribute("data-status", "correct");
});
