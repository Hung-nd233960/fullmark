import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { expectGolden, maskLines, noViolations, run, type Served, serveProcess } from "./helpers";

/**
 * `quiz build --watch --serve` as a subprocess (STEP3.md, 3j): started with `--json`, its `listening` line read, the page
 * opened in Chromium, the quiz edited on disk, and the page seen to reload; a saved error leaves the page as it was; Ctrl+C
 * (SIGINT) exits 0. Windows has no SIGINT for a child process, so the Ctrl+C steps skip there by name.
 */
const quizText = (title: string, question: string): string =>
  ["---", `title: ${title}`, "---", "", `## ${question} {type=single id=q1}`, "", "- [x] Yes", "- [ ] No", ""].join(
    "\n",
  );

const TIME = "2026-10-28T10:00:00+07:00";
const served: Served[] = [];
const dirs: string[] = [];
test.afterEach(() => {
  for (const s of served.splice(0)) s.child.kill("SIGKILL");
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "fm-watch-"));
  mkdirSync(join(dir, ".git"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  dirs.push(dir);
  return dir;
}

async function watching(dir: string, files: string[], ...extra: string[]): Promise<Served> {
  const s = await serveProcess(dir, ["build", ...files, "--watch", "--serve", "--built-at", TIME, ...extra]);
  served.push(s);
  return s;
}

const built = (line: Record<string, unknown>): boolean => line.status === "built" || line.status === "failed";
const count = (s: Served, status: string): number => s.lines().filter((l) => l.status === status).length;

test("a saved edit reloads the page, a saved error leaves it as it was, the fix reloads it, Ctrl+C exits 0", async ({
  page,
}) => {
  test.skip(process.platform === "win32", "Windows has no SIGINT for a child process");
  const dir = folder({ "quiz.md": quizText("First title", "Question") });
  const server = await watching(dir, ["quiz.md"]);
  expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_-]{43}\/$/);
  await server.waitLine(built);
  expect(count(server, "built")).toBe(1);
  // the page on disk is what `build` writes
  const onDisk = readFileSync(join(dir, "quiz.html"), "utf8");
  run(dir, "build", "quiz.md", "-o", "plain.html", "--built-at", TIME);
  expect(readFileSync(join(dir, "plain.html"), "utf8")).toBe(onDisk);
  expect(onDisk).not.toContain("EventSource");

  await page.goto(server.url);
  await expect(page.getByRole("heading", { name: "First title" })).toBeVisible();
  expect(await page.locator("script:not([type])").count()).toBe(2);
  let navigations = 0;
  page.on("framenavigated", () => navigations++);

  // an edit: the page reloads, within a second or so of the save, and shows the change
  writeFileSync(join(dir, "quiz.md"), quizText("Second title", "Question"));
  await expect(page.getByRole("heading", { name: "Second title" })).toBeVisible({ timeout: 5000 });
  await server.waitLine((l) => built(l) && count(server, "built") === 2);
  const second = readFileSync(join(dir, "quiz.html"), "utf8");
  expect(second).toContain("Second title");
  const reloads = navigations;

  // an error: the terminal says so, the file and the page are as they were, and the page does not reload
  writeFileSync(join(dir, "quiz.md"), `${quizText("Broken title", "Question")}\n:::\n`);
  await server.waitLine((l) => l.status === "failed");
  await expect.poll(() => server.errText(), { timeout: 5000 }).toContain("kept the last good page");
  expect(server.errText()).toMatch(/quiz\.md:\d+: error/);
  expect(readFileSync(join(dir, "quiz.html"), "utf8")).toBe(second);
  await page.waitForTimeout(500);
  expect(navigations).toBe(reloads);
  await expect(page.getByRole("heading", { name: "Second title" })).toBeVisible();
  const served1 = await (await page.request.get(server.url)).text();
  expect(served1).toContain("Second title");

  // the fix reloads it
  writeFileSync(join(dir, "quiz.md"), quizText("Third title", "Question"));
  await expect(page.getByRole("heading", { name: "Third title" })).toBeVisible({ timeout: 5000 });

  // Ctrl+C: exit 0 and the last line says so
  server.child.kill("SIGINT");
  const end = await server.end();
  expect(end.code).toBe(0);
  expect(end.lines.at(-1)).toEqual({ status: "stopped" });
  expect(end.lines.map((l) => l.status)).toEqual(["listening", "built", "built", "failed", "built", "stopped"]);
  expectGolden("build-watch-serve", maskLines(end.lines, dir));
});

test("with two files, the index lists both pages, and an edit reloads the page that is open", async ({ page }) => {
  test.skip(process.platform === "win32", "Windows has no SIGINT for a child process");
  const dir = folder({
    "a.md": quizText("Alpha quiz", "Question"),
    "b.md": quizText("Beta quiz", "Question"),
  });
  const server = await watching(dir, ["a.md", "b.md"]);
  await server.waitLine((l) => built(l) && l.file === "b.md");
  await page.goto(server.url);
  await expect(page.getByRole("heading", { name: "Quizzes being built" })).toBeVisible();
  const links = page.getByRole("link");
  await expect(links).toHaveText(["Alpha quiz", "Beta quiz"]);
  await expect(page.getByText("a.md")).toBeVisible();
  await expect(page.getByText("last build failed")).toHaveCount(0);
  // both themes pass axe
  await page.emulateMedia({ colorScheme: "light" });
  await noViolations(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await noViolations(page);
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: "light" });
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(dark);

  // open Beta; a save of Alpha does not reload it, a save of Beta does
  await links.nth(1).click();
  await expect(page.getByRole("heading", { name: "Beta quiz" })).toBeVisible();
  expect(new URL(page.url()).pathname).toMatch(/\/b\.html$/);
  let navigations = 0;
  page.on("framenavigated", () => navigations++);
  writeFileSync(join(dir, "a.md"), quizText("Alpha changed", "Question"));
  await server.waitLine((l) => built(l) && l.file === "a.md" && count(server, "built") === 3);
  await page.waitForTimeout(500);
  expect(navigations).toBe(0);
  writeFileSync(join(dir, "b.md"), quizText("Beta changed", "Question"));
  await expect(page.getByRole("heading", { name: "Beta changed" })).toBeVisible({ timeout: 5000 });

  server.child.kill("SIGINT");
  const end = await server.end();
  expect(end.code).toBe(0);
  expect(end.lines.map((l) => `${l.status} ${l.file ?? ""}`.trim())).toEqual([
    "listening",
    "built a.md",
    "built b.md",
    "built a.md",
    "built b.md",
    "stopped",
  ]);
  expectGolden("build-watch-serve-two", maskLines(end.lines, dir));
});

test("a failed rebuild is noted on the index at its next load, and the page keeps its last good copy", async ({
  page,
}) => {
  test.skip(process.platform === "win32", "Windows has no SIGINT for a child process");
  const dir = folder({
    "a.md": quizText("Alpha quiz", "Question"),
    "b.md": quizText("Beta quiz", "Question"),
  });
  const server = await watching(dir, ["a.md", "b.md"]);
  await server.waitLine((l) => built(l) && l.file === "b.md");
  writeFileSync(join(dir, "b.md"), `${quizText("Beta broken", "Question")}\n:::\n`);
  await server.waitLine((l) => l.status === "failed" && l.file === "b.md");
  await page.goto(server.url);
  await expect(page.getByText("last build failed: see the terminal")).toBeVisible();
  // its last good page is still served
  await page.getByRole("link", { name: "Beta quiz" }).click();
  await expect(page.getByRole("heading", { name: "Beta quiz" })).toBeVisible();
  server.child.kill("SIGINT");
  expect((await server.end()).code).toBe(0);
});

test("a port in use, and a wrong token, host or path", async ({ request }) => {
  const dir = folder({ "quiz.md": quizText("First title", "Question") });
  const server = await watching(dir, ["quiz.md"]);
  const base = new URL(server.url);
  expect((await request.get(`${base.origin}/`)).status()).toBe(403);
  expect((await request.get(`${base.origin}/wrong/`)).status()).toBe(403);
  expect((await request.get(`${server.url}nope`)).status()).toBe(404);
  expect((await request.post(`${server.url}submit`, { data: "{}" })).status()).toBe(404);
  // the same port again: exit 2, and nothing else started
  const again = await serveProcess(dir, ["build", "quiz.md", "--watch", "--serve", "--port", String(server.port)]);
  served.push(again);
  expect(again.listening).toMatchObject({ status: "error" });
  expect(String(again.listening.message)).toContain("the port is in use");
  expect((await again.end()).code).toBe(2);
});
