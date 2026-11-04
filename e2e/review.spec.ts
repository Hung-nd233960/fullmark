import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { expectGolden, noViolations, root, type Served, serveProcess, watch } from "./helpers";

/**
 * `quiz review` as a subprocess (STEP3.md, slice 3k, "Done when"): the form driven by Playwright through the keys and
 * the mouse, Finish, then the file on disk read back by `quiz check --review`. Ctrl+C is Linux and macOS only (Windows
 * has no SIGINT for a child), as in e2e/serve.spec.ts.
 */
const cli = join(root, "dist", "cli.js");

function folder(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), "fm-review-"));
  mkdirSync(join(dir, ".git"));
  copyFileSync(join(root, source), join(dir, "quiz.md"));
  return dir;
}
const RUST = "examples/rust/quiz.md";
const TYPES = "test/fixtures/page/types.md";
const TYPES_VI = "test/fixtures/page/types-vi.md";

const served: Served[] = [];
test.afterEach(() => {
  for (const s of served.splice(0)) s.child.kill("SIGKILL");
});
async function review(dir: string, ...args: string[]): Promise<Served> {
  const s = await serveProcess(dir, ["review", "quiz.md", ...args]);
  served.push(s);
  return s;
}

/** The form open, with scrolling that does not animate, so a key after `N` acts on the question it moved to. */
async function open(page: Page, server: Served, size = { width: 1280, height: 940 }): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(size);
  await page.goto(server.url);
  await page.locator("[data-quiz]").waitFor();
}

const current = (page: Page) => page.locator("article[data-current=true]");
const card = (page: Page, id: string) => page.locator(`article[data-qid="${id}"]`);
const finish = (page: Page) => page.locator("[data-action=finish]");

/** Judges the current question by keys, then `N` to the next one not judged. */
async function byKeys(page: Page, plan: readonly ("keep" | "fix" | "drop")[]): Promise<void> {
  for (const verdict of plan) {
    await page.keyboard.press(verdict === "keep" ? "1" : verdict === "fix" ? "2" : "3");
    if (verdict === "fix") await current(page).locator("[data-reason=unclear]").click();
    if (verdict === "drop") await current(page).locator("[data-reason=duplicate]").click();
    await page.keyboard.press("n");
  }
}

const readJson = (dir: string, name = "review.json") => JSON.parse(readFileSync(join(dir, name), "utf8"));
/** The written file with the time of Finish masked, as the golden holds it. */
const masked = (dir: string): string => {
  const review = readJson(dir);
  review.reviewedAt = "<time>";
  return `${JSON.stringify(review, null, 2)}\n`;
};
const check = (dir: string, ...args: string[]) =>
  spawnSync(process.execPath, [cli, "check", "quiz.md", "--review", "review.json", ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });

test("judging every question by keys and pressing Finish writes review.json, which quiz check --review reads back", async ({
  page,
}) => {
  const dir = folder(RUST);
  const server = await review(dir);
  const seen = watch(page);
  await open(page, server);
  await expect(page.locator("[data-seg=judged]")).toContainText("Judged 0 of 10");
  expect(await page.locator("article[data-qid]").count()).toBe(10);
  await byKeys(page, ["keep", "keep", "fix", "keep", "keep", "drop", "keep", "keep", "keep", "keep"]);
  await expect(page.locator("[data-seg=judged]")).toContainText("Judged 10 of 10");
  await expect(page.locator("[data-seg=counts]")).toContainText("8 keep · 1 fix · 1 drop");
  await finish(page).click();
  const saved = page.locator("[data-review-saved]");
  await expect(saved).toContainText("Review saved");
  await expect(saved).toContainText("review.json: 8 keep, 1 fix, 1 drop.");
  await expect(saved).toContainText("quiz check quiz.md --review review.json");
  const end = await server.end();
  expect(end.code).toBe(0);
  expect(end.lines[1]).toEqual({ status: "written", review: "review.json", keep: 8, fix: 1, drop: 1 });
  expectGolden("review-written", masked(dir));
  expect(seen.problems).toEqual([]);
  expect(seen.requests.filter((u) => !u.startsWith(new URL(server.url).origin))).toEqual([]);
  // the file is read back by check --review: it fails until the fix is changed and the drop is gone
  const read = check(dir);
  expect(read.status).toBe(1);
  expect(read.stdout).toContain("review.fix");
  expect(read.stdout).toContain("review.drop");
  expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
});

test("judging by mouse: the verdict buttons and the reasons on every card, then Finish", async ({ page }) => {
  const dir = folder(TYPES);
  const server = await review(dir);
  await open(page, server);
  const ids = await page
    .locator("article[data-qid]")
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.qid));
  expect(ids).toHaveLength(16);
  // keep all but the first two: a fix with two reasons, and a drop
  for (const [i, id] of ids.entries()) {
    const c = card(page, id as string);
    await c.scrollIntoViewIfNeeded();
    if (i === 0) {
      await c.locator("[data-pick=fix]").click();
      await c.locator("[data-reason=key-wrong]").click();
      await c.locator("[data-reason=other]").click();
      await c.locator("textarea").fill("the key says blue but the picture is grey");
    } else if (i === 1) {
      await c.locator("[data-pick=drop]").click();
      await c.locator("[data-reason=too-easy]").click();
    } else {
      await c.locator("[data-pick=keep]").click();
    }
    await expect(c.locator("[data-pick][aria-pressed=true]")).toHaveCount(1);
  }
  await finish(page).click();
  await expect(page.locator("[data-review-saved]")).toContainText("14 keep, 1 fix, 1 drop");
  expect((await server.end()).code).toBe(0);
  const written = readJson(dir);
  expect(Object.keys(written.questions)).toHaveLength(16);
  expect(written.questions[ids[0] as string]).toMatchObject({
    verdict: "fix",
    reasons: ["key-wrong", "other"],
    note: "the key says blue but the picture is grey",
  });
  expect(written.questions[ids[0] as string].source).toContain("Pick the colour of the sky");
  expect(written.questions[ids[1] as string]).toMatchObject({ verdict: "drop", reasons: ["too-easy"] });
  expect(written.questions[ids[2] as string]).not.toHaveProperty("source");
  expectGolden("review-types", masked(dir));
});

test("a verdict chosen again is cleared, and choosing another clears the reasons and keeps the note", async ({
  page,
}) => {
  const dir = folder(RUST);
  const server = await review(dir);
  await open(page, server);
  const c = card(page, "move-then-use");
  await c.locator("[data-pick=fix]").click();
  await c.locator("[data-reason=unclear]").click();
  await c.locator("textarea").fill("hmm");
  await c.locator("[data-pick=drop]").click();
  await expect(c.locator("[data-reason][aria-pressed=true]")).toHaveCount(0);
  await expect(c.locator("textarea")).toHaveValue("hmm");
  await c.locator("[data-pick=drop]").click();
  await expect(c.locator("[data-pick][aria-pressed=true]")).toHaveCount(0);
  await expect(c.locator("[data-reasons]")).toHaveCount(0);
  await expect(page.locator("[data-seg=judged]")).toContainText("Judged 0 of 10");
});

test("Fix with no reason, and Other with no note, hold Finish back and say why", async ({ page }) => {
  const dir = folder(RUST);
  const server = await review(dir);
  await open(page, server);
  await page.keyboard.press("1");
  const first = card(page, "move-then-use");
  await expect(first.locator("[data-error=reason]")).toHaveCount(0);
  await page.keyboard.press("2");
  await expect(first.locator("[data-error=reason]")).toHaveText("Pick at least one reason.");
  await finish(page).click();
  const held = page.locator("[data-notice=held]");
  await expect(held).toContainText("1 question needs a reason or a note");
  await expect(first.locator("[data-reasons]")).toHaveAttribute("data-held", "true");
  // a reason: Other, which needs a note
  await first.locator("[data-reason=other]").click();
  await expect(first.locator("textarea")).toHaveAttribute("aria-invalid", "true");
  await expect(first.locator("[data-error=note]")).toHaveText("Say what is wrong: a note is required with Other.");
  await expect(held).toContainText("1 question needs");
  await first.locator("textarea").fill("the explanation contradicts the key");
  await expect(first.locator("textarea")).not.toHaveAttribute("aria-invalid", "true");
  await expect(held).toHaveCount(0);
  // nothing was written, and the server still waits: the dialog for the other nine now opens
  expect(existsSync(join(dir, "review.json"))).toBe(false);
  await finish(page).click();
  await expect(page.locator("dialog[data-review-dialog=finish]")).toBeVisible();
  expect(existsSync(join(dir, "review.json"))).toBe(false);
});

test("Finish with questions not judged asks first: Go back to question K, or Mark them Keep and finish (assumed)", async ({
  page,
}) => {
  const dir = folder(RUST);
  const server = await review(dir);
  await open(page, server);
  await byKeys(page, ["keep", "keep", "keep"]);
  await finish(page).click();
  const dialog = page.locator("dialog[data-review-dialog=finish]");
  await expect(dialog.getByRole("heading")).toHaveText("7 questions not judged");
  await expect(dialog).toContainText("written as Keep, marked as not looked at");
  await expect(dialog.locator("[data-action=dialog-back]")).toHaveText("Go back to question 4");
  await dialog.locator("[data-action=dialog-back]").click();
  await expect(dialog).toHaveCount(0);
  await expect(current(page)).toHaveAttribute("data-qid", "borrowing-rule");
  expect(existsSync(join(dir, "review.json"))).toBe(false);
  await finish(page).click();
  await page.locator("[data-action=mark-keep]").click();
  await expect(page.locator("[data-review-saved]")).toContainText(
    "review.json: 10 keep (7 not looked at), 0 fix, 0 drop.",
  );
  const end = await server.end();
  expect(end.code).toBe(0);
  expect(end.lines[1]).toEqual({ status: "written", review: "review.json", keep: 10, fix: 0, drop: 0 });
  const written = readJson(dir);
  const assumed = Object.entries(written.questions).filter(([, e]) => (e as { assumed?: true }).assumed === true);
  expect(assumed).toHaveLength(7);
  expect(written.questions["move-then-use"]).not.toHaveProperty("assumed");
});

test("Keep the rest asks with Cancel and Mark them Keep and finish, and writes every question assumed", async ({
  page,
}) => {
  const dir = folder(RUST);
  const server = await review(dir);
  await open(page, server);
  await page.keyboard.press("2");
  await current(page).locator("[data-reason=unclear]").click();
  await page.locator("[data-action=keep-rest]").click();
  const dialog = page.locator("dialog[data-review-dialog=rest]");
  await expect(dialog.getByRole("heading")).toHaveText("9 questions not judged");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(existsSync(join(dir, "review.json"))).toBe(false);
  await page.locator("[data-action=keep-rest]").click();
  await page.locator("[data-action=mark-keep]").click();
  await expect(page.locator("[data-review-saved]")).toContainText(
    "review.json: 9 keep (9 not looked at), 1 fix, 0 drop.",
  );
  expect((await server.end()).code).toBe(0);
  expectGolden("review-keep-rest", masked(dir));
});

test("a second run opens with the first run's verdicts, counted as judged, and writes them back unchanged (G53)", async ({
  page,
}) => {
  const dir = folder(RUST);
  const first = await review(dir);
  await open(page, first);
  await byKeys(page, ["keep", "fix", "keep", "keep", "keep", "drop", "keep", "keep", "keep", "keep"]);
  await finish(page).click();
  await expect(page.locator("[data-review-saved]")).toBeVisible();
  expect((await first.end()).code).toBe(0);
  const before = readJson(dir);

  const second = await review(dir);
  await open(page, second);
  await expect(page.locator("[data-seg=judged]")).toContainText("Judged 10 of 10");
  await expect(page.locator("[data-seg=counts]")).toContainText("8 keep · 1 fix · 1 drop");
  await expect(card(page, "which-compile").locator("[data-pick=fix][aria-pressed=true]")).toHaveCount(1);
  await expect(card(page, "which-compile").locator("[data-reason=unclear][aria-pressed=true]")).toHaveCount(1);
  await expect(page.locator("[data-cell=which-compile]")).toHaveAttribute("data-verdict", "fix");
  // a change of mind, on one question only
  await card(page, "vec-pop").locator("[data-pick=drop]").click();
  await card(page, "vec-pop").locator("[data-reason=too-easy]").click();
  await finish(page).click();
  await expect(page.locator("[data-review-saved]")).toBeVisible();
  expect((await second.end()).code).toBe(0);
  const after = readJson(dir);
  for (const id of Object.keys(before.questions)) {
    if (id === "vec-pop") continue;
    expect(after.questions[id], id).toEqual(before.questions[id]);
  }
  expect(after.questions["vec-pop"]).toMatchObject({ verdict: "drop", reasons: ["too-easy"] });
});

test("a question changed since the review starts not judged, and the unchanged ones keep their verdicts (G53)", async ({
  page,
}) => {
  const dir = folder(RUST);
  const first = await review(dir);
  await open(page, first);
  await byKeys(page, ["keep", "keep", "keep", "keep", "keep", "keep", "keep", "keep", "keep", "keep"]);
  await finish(page).click();
  expect((await first.end()).code).toBe(0);
  const source = readFileSync(join(dir, "quiz.md"), "utf8").replace(
    "What does `v.pop()` return",
    "What does `v.pop()` give back",
  );
  writeFileSync(join(dir, "quiz.md"), source);
  const second = await review(dir);
  await open(page, second);
  await expect(page.locator("[data-seg=judged]")).toContainText("Judged 9 of 10");
  await expect(card(page, "vec-pop").locator("[data-pick][aria-pressed=true]")).toHaveCount(0);
  // the second part holds the changed question: three of its four are judged
  await expect(page.locator("[data-part-head]").nth(1)).toContainText("3/4");
});

test("the form is in Vietnamese for a quiz with ui_lang vi (ReviewVi board), and has no axe violations", async ({
  page,
}) => {
  const dir = folder(TYPES_VI);
  const server = await review(dir);
  await open(page, server);
  await expect(page.locator(".fm-review-label")).toHaveText("Rà soát");
  await expect(page.locator("[data-action=finish]")).toHaveText("Hoàn tất");
  await expect(page.locator("[data-action=keep-rest]")).toHaveText("Giữ các câu còn lại");
  await expect(page.locator("[data-seg=judged]")).toContainText("Đã xét 0 / 16");
  await page.keyboard.press("2");
  await expect(page.locator("article[data-current=true] [data-error=reason]")).toHaveText("Chọn ít nhất một lý do.");
  await expect(page.locator("article[data-current=true] .fm-verdict-label").first()).toHaveText("Đánh giá của bạn");
  await noViolations(page);
  await page.locator("[data-action=keep-rest]").click();
  await expect(page.locator("[data-notice=held]")).toContainText("câu cần có lý do");
});

for (const scheme of ["light", "dark"] as const) {
  test(`every question type in its key state, and no axe violations: ${scheme}`, async ({ page }) => {
    const dir = folder(TYPES);
    const server = await review(dir);
    const seen = watch(page);
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, server);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    if (scheme === "dark") await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    // fix a question so the reasons and the error line are on the page too
    await page.keyboard.press("2");
    await noViolations(page);
    // every type has its key on the card: the page's own marks, and nothing to answer (what is there is disabled)
    expect(await page.locator("article input:not([disabled]), article select:not([disabled])").count()).toBe(0);
    await expect(card(page, "s1").locator(".fm-choice[data-correct=true]")).toHaveCount(1);
    await expect(card(page, "n1").locator(".fm-key-shown")).toContainText("Accepted answer");
    await expect(card(page, "h1").locator(".fm-key-shown")).toContainText("Accepted answer");
    await expect(card(page, "b1").locator(".fm-key-blanks li")).toHaveCount(4);
    await expect(card(page, "f1").locator(".fm-field")).not.toHaveCount(0);
    await expect(card(page, "o1").locator(".fm-key-order li")).not.toHaveCount(0);
    await expect(card(page, "g1").locator(".fm-key-pairs li").first()).toContainText("→");
    await expect(card(page, "e1").locator(".fm-key-rubric")).toBeVisible();
    await expect(card(page, "k1").locator(".fm-sample, .fm-key-rubric").first()).toBeVisible();
    expect(seen.problems).toEqual([]);
  });
}

test("the sidebar: the verdict map follows the verdicts, a cell goes to its question, Q and Esc close it", async ({
  page,
}) => {
  const dir = folder(RUST);
  const server = await review(dir);
  await open(page, server);
  await expect(page.locator("[data-review-side]")).toBeVisible();
  await expect(page.locator(".fm-legend-review")).toContainText("keep");
  await expect(page.locator(".fm-keys")).toContainText("next not judged");
  await page.keyboard.press("1");
  await expect(page.locator("[data-cell=move-then-use]")).toHaveAttribute("data-verdict", "keep");
  await expect(page.locator("[data-cell=move-then-use]")).toHaveAttribute("data-current", "true");
  await page.locator("[data-cell=which-compile]").click();
  await expect(current(page)).toHaveAttribute("data-qid", "which-compile");
  await page.keyboard.press("2");
  await expect(page.locator("[data-cell=which-compile]")).toHaveAttribute("data-verdict", "fix");
  await page.keyboard.press("q");
  await expect(page.locator("[data-review-side]")).toHaveCount(0);
  await page.keyboard.press("q");
  await expect(page.locator("[data-review-side]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-review-side]")).toHaveCount(0);
  await expect(page.locator("[data-action=sidebar]")).toBeFocused();
});

test("text size and Appearance are the page's own, and the look of the quiz is the start", async ({ page }) => {
  const dir = folder(TYPES);
  const server = await review(dir);
  await open(page, server);
  await page.locator("[data-action=larger]").click();
  await expect(page.locator("html")).toHaveAttribute("data-size", "19");
  await page.locator("[data-action=appearance]").click();
  await expect(page.locator("[data-look-menu]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-look-menu]")).toHaveCount(0);
});

test("a submit the server does not take is shown, and the form stays open", async ({ page }) => {
  const dir = folder(RUST);
  const server = await review(dir);
  await open(page, server);
  // the review file becomes one check --review would refuse while the form is open
  writeFileSync(join(dir, "review.json"), "{not json");
  await page.locator("[data-action=keep-rest]").click();
  await page.locator("[data-action=mark-keep]").click();
  await expect(page.locator("[data-problem]")).toContainText("review.json is not a usable review");
  await expect(page.locator("[data-review-saved]")).toHaveCount(0);
  expect(readFileSync(join(dir, "review.json"), "utf8")).toBe("{not json");
  // mended: the same Finish goes through
  rmSync(join(dir, "review.json"), { force: true });
  await page.locator("[data-action=keep-rest]").click();
  await expect(page.locator("[data-review-saved]")).toBeVisible({ timeout: 10_000 });
  expect((await server.end()).code).toBe(0);
});

// Windows has no SIGINT for a child process, so Ctrl+C is tested on Linux and macOS only
test("Ctrl+C prints {status: interrupted}, exits 2 and leaves an existing review byte for byte", async ({ page }) => {
  test.skip(process.platform === "win32", "a child process cannot be sent SIGINT on Windows");
  const dir = folder(RUST);
  const first = await review(dir);
  await open(page, first);
  await page.locator("[data-action=keep-rest]").click();
  await page.locator("[data-action=mark-keep]").click();
  await expect(page.locator("[data-review-saved]")).toBeVisible();
  await first.end();
  const bytes = readFileSync(join(dir, "review.json"));
  const second = await review(dir);
  second.child.kill("SIGINT");
  const end = await second.end();
  expect(end.code).toBe(2);
  expect(end.lines[1]).toEqual({ status: "interrupted" });
  expect(readFileSync(join(dir, "review.json")).equals(bytes)).toBe(true);
});
