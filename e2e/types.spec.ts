import { expect, type Locator, test } from "@playwright/test";
import { buildIn, card, expectGradeMatches, noViolations, watch } from "./helpers";

const types = buildIn("test/fixtures/page/types.md", "types.md");
const typesVi = buildIn("test/fixtures/page/types-vi.md", "types-vi.md");
/** The source indices of an ordering card's items, top to bottom. */
const sourcesOf = (list: Locator): Promise<number[]> =>
  list.locator(".fm-order-item").evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-source"))));

/** Moves an ordering card's items, with their up buttons, into this order of source indices. */
async function arrange(list: Locator, target: number[]): Promise<void> {
  // the question is answered whatever order the seed drew: if the page already shows the target, move one item down and back
  if ((await sourcesOf(list)).join() === target.join()) {
    await list.locator(".fm-order-item").nth(0).locator('[data-dir="down"]').click();
    await list.locator(".fm-order-item").nth(1).locator('[data-dir="up"]').click();
  }
  for (let place = 0; place < target.length; place++) {
    const now = await sourcesOf(list);
    for (let at = now.indexOf(target[place] as number); at > place; at--) {
      await list.locator(".fm-order-item").nth(at).locator('[data-dir="up"]').click();
    }
  }
  expect(await sourcesOf(list)).toEqual(target);
}

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
  await expect(page.locator(".fm-question")).toHaveCount(16);
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
  await arrange(card(page, "o1"), [0, 1, 2]); // right
  await arrange(card(page, "o2"), [1, 0, 2, 3]); // the last two are right: partly right
  const lefts = card(page, "g1").locator("select");
  await lefts.nth(0).selectOption({ label: "finds style problems" }); // right
  await lefts.nth(1).selectOption({ label: "packs the files" }); // wrong
  // the third stays at "—"
  await card(page, "e1").locator("textarea").fill("a cache saves work");
  await card(page, "k1").locator("textarea").fill("fn zqlargest() {}");

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
    o1: "correct",
    o2: "partial",
    g1: "partial",
    e1: "pending",
    k1: "pending",
  });
  await noViolations(page);

  // review: marks per blank and per field, the accepted answer when wrong, nothing for the ungraded ones
  await expect(card(page, "b1").locator("input.fm-blank").nth(1)).toHaveAttribute("data-result", "wrong");
  await expect(card(page, "b1").locator("input.fm-blank").nth(0)).toHaveAttribute("data-result", "correct");
  await expect(card(page, "b1").locator(".fm-blank-results")).toContainText("0.0481 ± 0.001");
  await expect(card(page, "b1").locator(".fm-blank-results")).toContainText("wibble");
  // an empty blank says so, and is not called incorrect; the hint follows the prompt
  await expect(card(page, "b1").locator(".fm-blank-results li").nth(3)).toContainText("No answer");
  await expect(card(page, "b1").locator(".fm-blank-results li").nth(3)).not.toContainText("Incorrect");
  await expect(card(page, "b1").locator(":scope > div:has(.fm-prompt) + .fm-hint")).toHaveCount(1);
  await expect(card(page, "f1").locator(".fm-field-mark")).toHaveCount(2);
  await expect(card(page, "f1")).toContainText("zq-field-name");
  await expect(card(page, "n2")).toContainText("3.14 ± 1%");
  await expect(card(page, "n1")).toContainText("7391.25 ± 0.5 m");
  await expect(card(page, "h2")).not.toContainText("zq-pat-");
  await expect(card(page, "h1")).toContainText("zq-accept-alpha");

  // ordering: each item marked, with its place when wrong; matching: each pair, with the right match when wrong
  await expect(card(page, "o1").locator(".fm-order-item[data-result=correct]")).toHaveCount(3);
  await expect(card(page, "o2").locator(".fm-order-item[data-result=wrong]")).toHaveCount(2);
  await expect(card(page, "o2").locator(".fm-order-item[data-result=wrong]").first()).toContainText("belongs at");
  await expect(card(page, "g1").locator(".fm-match[data-result=correct]")).toHaveCount(1);
  await expect(card(page, "g1").locator(".fm-match").nth(1)).toContainText("runs the checks");
  // essay and code wait for a grader and show the model answer; the boxes are read-only
  await expect(card(page, "e1")).toContainText("Waiting for a grader");
  await expect(card(page, "e1").locator(".fm-sample")).toContainText("zq-sample-essay");
  await expect(card(page, "k1").locator(".fm-sample pre")).toContainText("zqlargest");
  await expect(card(page, "k1").locator("textarea")).toHaveAttribute("readonly", "");

  expect(seen.problems).toEqual([]);
  expect(seen.requests).toEqual([]);
  expect(blocked).toBe(0);
});

test("ordering by keyboard: Enter on a button moves the item, the focus stays, the live region speaks", async ({
  page,
}) => {
  await page.goto(types.url);
  await page.getByRole("button", { name: "Start" }).click();
  const list = card(page, "o1");
  const before = await sourcesOf(list);
  expect(before).not.toEqual([0, 1, 2]);
  const first = list.locator(".fm-order-item").first();
  await expect(first.locator('[data-dir="up"]')).toBeDisabled();
  await first.locator('[data-dir="down"]').focus();
  await page.keyboard.press("Enter");
  expect(await sourcesOf(list)).toEqual([before[1], before[0], before[2]]);
  const focused = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return `${el?.closest("li")?.getAttribute("data-source")}:${el?.getAttribute("data-dir")}`;
    });
  await expect.poll(focused).toBe(`${before[0]}:down`);
  await expect(list.locator('[role="status"]')).toHaveText("Moved to position 2 of 3");
  await page.keyboard.press("Enter");
  // now last: its down button is disabled, so the focus moves to its up button
  expect(await sourcesOf(list)).toEqual([before[1], before[2], before[0]]);
  await expect.poll(focused).toBe(`${before[0]}:up`);
  await expect(list.locator('[role="status"]')).toHaveText("Moved to position 3 of 3");
  await expect(list.locator('[data-dir="down"]').first()).toHaveAccessibleName(/^Move down: zq-/);
  // the move is stored: after Submit the question is answered
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(list.locator(".fm-result")).not.toHaveAttribute("data-status", "unanswered");
});

test("the word count is live and never blocks Submit; clearing a code box does not bring the starter back", async ({
  page,
}) => {
  await page.goto(types.url);
  await page.getByRole("button", { name: "Start" }).click();
  const essay = card(page, "e1");
  await expect(essay.locator(".fm-count")).toHaveText("0 words, 3 to 6");
  await expect(essay.locator(".fm-rubric")).toContainText("Names the cost saved");
  await essay.locator("textarea").fill("one two three four five six seven eight");
  await expect(essay.locator(".fm-count")).toHaveText("8 words, 3 to 6 · over the maximum");
  const code = card(page, "k1").locator("textarea");
  await expect(code).toHaveValue(/todo!\(\)/);
  await expect(code).toHaveAttribute("spellcheck", "false");
  await code.fill("");
  await expect(code).toHaveValue("");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(card(page, "e1").locator(".fm-result")).toHaveAttribute("data-status", "pending");
  await expect(card(page, "k1").locator(".fm-result")).toHaveAttribute("data-status", "unanswered");
  // an untouched ordering and matching are unanswered
  await expect(card(page, "o1").locator(".fm-result")).toHaveAttribute("data-status", "unanswered");
  await expect(card(page, "g1").locator(".fm-result")).toHaveAttribute("data-status", "unanswered");
  // and say so: no item is marked, each shows where it belongs; no pair is called wrong
  await expect(card(page, "o1").locator(".fm-order-item[data-result]")).toHaveCount(0);
  await expect(card(page, "o1").locator(".fm-order-mark")).toHaveText([
    /belongs at [0-9]/,
    /belongs at [0-9]/,
    /belongs at [0-9]/,
  ]);
  await expect(card(page, "o1").locator(".fm-order-none")).toHaveCount(0);
  await expect(card(page, "o1")).toContainText("Not answered");
  await expect(card(page, "g1").locator(".fm-match-mark strong")).toHaveText(["No answer", "No answer", "No answer"]);
  await expect(card(page, "g1")).not.toContainText("Wrong");
});

test("a cleared code box offers Reset to starter, which puts the starter back and leaves the question unanswered", async ({
  page,
}) => {
  await page.goto(types.url);
  await page.getByRole("button", { name: "Start" }).click();
  const q = card(page, "k1");
  const code = q.locator("textarea");
  const reset = q.getByRole("button", { name: "Reset to starter" });
  await expect(reset).toHaveCount(0);
  await code.fill("fn x() {}");
  await expect(reset).toHaveCount(0);
  await code.fill("");
  await expect(reset).toBeVisible();
  await reset.click();
  await expect(code).toHaveValue(/todo![(][)]/);
  await expect(reset).toHaveCount(0);
  await expect.poll(() => code.evaluate((el) => el === document.activeElement)).toBe(true);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(q.locator(".fm-result")).toHaveAttribute("data-status", "unanswered");
  await expect(q.getByRole("button", { name: "Reset to starter" })).toHaveCount(0);
});

test("a vi quiz's export grades the same with quiz grade", async ({ page }) => {
  await page.goto(typesVi.url);
  await page.getByRole("button", { name: "Bắt đầu" }).click();
  await card(page, "s1").getByRole("radio").nth(1).check();
  await card(page, "n3").locator("input.fm-text").fill("2,5");
  await arrange(card(page, "o1"), [0, 2, 1]);
  await card(page, "g1").locator("select").nth(2).selectOption({ label: "packs the files" });
  await card(page, "e1").locator("textarea").fill("một hai ba");
  await page.getByRole("button", { name: "Nộp bài" }).click();
  await expect(page.locator(".fm-total")).toBeVisible();
  const results = await expectGradeMatches(page, typesVi.dir, "types-vi.md", "Tải kết quả về");
  const status = Object.fromEntries(results.map((r) => [r.id, r.status]));
  expect(status.n3).toBe("correct");
  expect(status.g1).toBe("partial");
  expect(status.e1).toBe("pending");
  await noViolations(page);
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
  // the bonus bank draws one of ci-a and ci-b with the seed drawn at Start
  await page.locator('article[data-qid="ci-a"], article[data-qid="ci-b"]').getByRole("radio").nth(0).check();
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

test("a hint is a button until opened; a typed answer after Submit shows only the two boxes", async ({ page }) => {
  await page.goto(types.url);
  await page.getByRole("button", { name: "Start" }).click();
  const q = card(page, "b1");
  const toggle = q.getByRole("button", { name: "Show hint" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(q.locator(".fm-hint-box")).toHaveCount(0);
  await toggle.click();
  await expect(q.getByRole("button", { name: "Hide hint" })).toHaveAttribute("aria-expanded", "true");
  await expect(q.locator(".fm-hint-box")).toBeVisible();
  await q.getByRole("button", { name: "Hide hint" }).click();
  await expect(q.locator(".fm-hint-box")).toHaveCount(0);

  await card(page, "n3").locator("input.fm-text").fill("2.5");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(card(page, "n3").locator("input.fm-text")).toHaveCount(0);
  await expect(card(page, "n3").locator(".fm-shown-box")).toHaveCount(2);
  await expect(card(page, "n3").locator(".fm-shown-box").first()).toContainText("2.5");
});
