import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { parseResults } from "../src/core/attempt";
import {
  expectGolden,
  maskLines,
  noViolations,
  root,
  run,
  type Served,
  serveProcess,
  shown,
  submitAttempt,
} from "./helpers";

/**
 * `quiz serve` as a subprocess (STEP3.md, "Rules for every slice"): started with `--json`, its `listening` line read,
 * the page driven by Playwright or a POST sent, then the exit code, the second line and the written file checked.
 */
function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), "fm-serve-"));
  mkdirSync(join(dir, ".git"));
  copyFileSync(join(root, "test/fixtures/page/map.md"), join(dir, "quiz.md"));
  return dir;
}

async function answerTwo(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 940 });
  await page.getByRole("button", { name: /^Start$/ }).click();
  await page.getByLabel(/right m1$/).check();
  await page.getByLabel(/wrong m2$/).check();
}

const served: Served[] = [];
test.afterEach(() => {
  for (const s of served.splice(0)) s.child.kill("SIGKILL");
});
async function serve(dir: string, ...args: string[]): Promise<Served> {
  const s = await serveProcess(dir, ["serve", "quiz.md", ...args]);
  served.push(s);
  return s;
}

test("Submit on the served page writes the results, prints the two lines, and grades as the page showed", async ({
  page,
}) => {
  const dir = folder();
  const server = await serve(dir, "--out", "results.json");
  expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_-]{43}\/$/);
  await page.goto(server.url);
  await answerTwo(page);
  await submitAttempt(page);
  const sent = page.locator("[data-sent]");
  await expect(sent).toHaveText("Sent");
  await expect(page.getByRole("button", { name: "Download results" })).toHaveCount(0);
  const onPage = await shown(page);
  const end = await server.end();
  expect(end.code).toBe(0);
  expectGolden("serve-submitted", maskLines(end.lines, dir));

  const text = readFileSync(join(dir, "results.json"), "utf8");
  const read = parseResults(text);
  expect(read.ok).toBe(true);
  expect(text.endsWith("\n")).toBe(true);
  // the file grades, with the CLI, to the score the page showed and the server printed
  const graded = JSON.parse(run(dir, "grade", "results.json", "--quiz", "quiz.md", "--json").split("\n")[0] ?? "");
  const second = end.lines[1] as { score: { earned: number; points: number } };
  expect(graded.score).toEqual(second.score);
  expect(onPage.earned).toBe(second.score.earned);
  expect(onPage.points).toBe(second.score.points);
  // nothing but the results file (no temporary file) was left beside the quiz
  expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
});

test("the default results name is <quiz-id>-results-<time>.json beside the source", async ({ page }) => {
  const dir = folder();
  const server = await serve(dir);
  await page.goto(server.url);
  await answerTwo(page);
  await submitAttempt(page);
  const end = await server.end();
  expect(end.code).toBe(0);
  const name = (end.lines[1] as { results: string }).results;
  expect(name).toMatch(/^map-results-\d{8}-\d{6}\.json$/);
  expect(existsSync(join(dir, name))).toBe(true);
});

test("the server refuses a wrong token, Host and Origin, and still takes the good submit", async ({ page }) => {
  const dir = folder();
  const server = await serve(dir, "--out", "results.json");
  const wrong = server.url.replace(/\/[A-Za-z0-9_-]{43}\/$/, "/nope/");
  expect((await fetch(wrong)).status).toBe(403);
  // `fetch` may not set Host, so this one goes through node:http
  const hostStatus = await new Promise<number>((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port: server.port,
        path: new URL(server.url).pathname,
        headers: { Host: "evil.example" },
        agent: false,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.on("error", reject);
    req.end();
  });
  expect(hostStatus).toBe(403);
  const post = (origin: string | null, body: unknown, url = server.url) =>
    fetch(`${url}submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(origin === null ? {} : { Origin: origin }) },
      body: JSON.stringify(body),
    });
  expect((await post("http://evil.example", {})).status).toBe(403);
  // a 400 for an attempt that is not one, and the server keeps waiting
  expect((await post(`http://127.0.0.1:${server.port}`, { quizId: "map", attempt: {} })).status).toBe(400);
  expect((await post(`http://127.0.0.1:${server.port}`, { quizId: "other", attempt: {} })).status).toBe(400);
  await page.goto(server.url);
  await answerTwo(page);
  await submitAttempt(page);
  await expect(page.locator("[data-sent]")).toBeVisible();
  expect((await server.end()).code).toBe(0);
  expect(existsSync(join(dir, "results.json"))).toBe(true);
});

test("when the server has gone, the page says it could not save and the results can still be downloaded", async ({
  page,
}) => {
  const dir = folder();
  const server = await serve(dir, "--out", "results.json");
  await page.goto(server.url);
  await answerTwo(page);
  server.child.kill("SIGKILL");
  await server.end();
  await submitAttempt(page);
  const failed = page.locator("[data-send-failed]");
  await expect(failed).toContainText("Could not save the results");
  await expect(failed).toHaveAttribute("role", "alert");
  await expect(page.getByRole("button", { name: "Download results" })).toBeVisible();
  expect(existsSync(join(dir, "results.json"))).toBe(false);
});

test("the served page has no axe violations, before Start and with the message shown", async ({ page }) => {
  const dir = folder();
  const server = await serve(dir, "--out", "results.json");
  await page.goto(server.url);
  await noViolations(page);
  await answerTwo(page);
  await submitAttempt(page);
  await expect(page.locator("[data-sent]")).toBeVisible();
  await noViolations(page);
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await noViolations(page);
  }
  await server.end();
});

test("the served page makes no request but its own, and has no console errors", async ({ page }) => {
  const dir = folder();
  const server = await serve(dir, "--out", "results.json");
  const problems: string[] = [];
  const outside: string[] = [];
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(m.text());
  });
  page.on("request", (r) => {
    if (!r.url().startsWith(server.url) && !/^(data|blob):/.test(r.url())) outside.push(r.url());
  });
  await page.goto(server.url);
  await answerTwo(page);
  await submitAttempt(page);
  await expect(page.locator("[data-sent]")).toBeVisible();
  expect(problems).toEqual([]);
  expect(outside).toEqual([]);
  await server.end();
});

// Windows has no SIGINT for a child process, so Ctrl+C is tested on Linux and macOS only
test("Ctrl+C prints {status: interrupted}, exits 2 and writes nothing", async () => {
  test.skip(process.platform === "win32", "a child process cannot be sent SIGINT on Windows");
  const dir = folder();
  const server = await serve(dir, "--out", "results.json");
  server.child.kill("SIGINT");
  const end = await server.end();
  expect(end.code).toBe(2);
  expectGolden("serve-interrupted", maskLines(end.lines, dir));
  expect(existsSync(join(dir, "results.json"))).toBe(false);
  expect(readdirSync(dir).filter((f) => f.startsWith("map-results") || f.endsWith(".tmp"))).toEqual([]);
});

test("a quiz with errors serves nothing and exits 1; a built page is refused with 2", () => {
  const dir = folder();
  writeFileSync(join(dir, "bad.md"), "## no type\n\n- [ ] a\n");
  writeFileSync(join(dir, "page.html"), "<p>built</p>");
  const cli = join(root, "dist", "cli.js");
  const bad = spawnSync(process.execPath, [cli, "serve", "bad.md", "--json"], { cwd: dir, encoding: "utf8" });
  expect(bad.status).toBe(1);
  expect(JSON.parse(bad.stdout.split("\n")[0] ?? "").status).toBe("failed");
  const html = spawnSync(process.execPath, [cli, "serve", "page.html"], { cwd: dir, encoding: "utf8" });
  expect(html.status).toBe(2);
  expect(html.stderr).toContain("use its Export button");
});

test("a Vietnamese page says so in Vietnamese when the server has gone", async ({ page }) => {
  const dir = folder();
  copyFileSync(join(root, "test/fixtures/page/chrome-vi.md"), join(dir, "quiz.md"));
  const server = await serve(dir, "--out", "results.json");
  await page.goto(server.url);
  await page.getByRole("button", { name: /^Bắt đầu$/ }).click();
  server.child.kill("SIGKILL");
  await server.end();
  await submitAttempt(page);
  await expect(page.locator("[data-send-failed]")).toContainText("Không lưu được kết quả");
});

test("the address without its trailing slash is redirected, and a submit from it is taken", async ({ page }) => {
  const dir = folder();
  const server = await serve(dir, "--out", "results.json");
  await page.goto(server.url.slice(0, -1));
  expect(page.url()).toBe(server.url);
  await answerTwo(page);
  await submitAttempt(page);
  await expect(page.locator("[data-sent]")).toHaveText("Sent");
  expect((await server.end()).code).toBe(0);
  expect(existsSync(join(dir, "results.json"))).toBe(true);
});

test("the Submit dialog says where the answers go, and a page from `build` does not", async ({ page }) => {
  const dir = folder();
  const server = await serve(dir, "--out", "results.json");
  await page.goto(server.url);
  await page.getByRole("button", { name: /^Start$/ }).click();
  await page.locator(".fm-topbar [data-action=submit]").click();
  await expect(page.locator("dialog[data-submit-dialog] [data-served-line]")).toHaveText(
    "Your answers will be sent to fullmark.",
  );
  await noViolations(page);
  server.child.kill("SIGKILL");
  await server.end();
  run(dir, "build", "quiz.md", "--built-at", "2026-10-28T10:00:00+07:00");
  await page.goto(`file:///${join(dir, "quiz.html").replaceAll("\\", "/")}`);
  await page.getByRole("button", { name: /^Start$/ }).click();
  await page.locator(".fm-topbar [data-action=submit]").click();
  await expect(page.locator("dialog[data-submit-dialog]")).toBeVisible();
  await expect(page.locator("[data-served-line]")).toHaveCount(0);
});

test("--section serves one part with no picker; its results grade, with quiz grade, to the page's score", async ({
  page,
}) => {
  const dir = folder();
  const server = await serve(dir, "--out", "results.json", "--section", "SIGNALS");
  await page.goto(server.url);
  await page.setViewportSize({ width: 1280, height: 940 });
  await expect(page.locator(".fm-parts")).toHaveCount(0);
  await expect(page.locator("[data-fact=questions] .fm-tile-value")).toHaveText("6");
  await page.getByRole("button", { name: /^Start$/ }).click();
  await expect(page.locator(".fm-question")).toHaveCount(6);
  await page.getByLabel(/right m1$/).check();
  await page.getByLabel(/wrong m2$/).check();
  await submitAttempt(page);
  await expect(page.locator("[data-sent]")).toHaveText("Sent");
  const onPage = await shown(page);
  expect((await server.end()).code).toBe(0);
  const read = parseResults(readFileSync(join(dir, "results.json"), "utf8"));
  expect(read.ok && read.results.plan).toMatchObject({ source: "section", section: "sig" });
  const graded = JSON.parse(run(dir, "grade", "results.json", "--quiz", "quiz.md", "--json").split("\n")[0] ?? "");
  expect(graded.score.earned).toBe(onPage.earned);
  expect(graded.score.points).toBe(onPage.points);
  expect(onPage.points).toBe(6);
});

test("an unknown --section serves nothing and exits 2, listing the valid ones", () => {
  const dir = folder();
  const cli = join(root, "dist", "cli.js");
  const bad = spawnSync(process.execPath, [cli, "serve", "quiz.md", "--section", "nope", "--json"], {
    cwd: dir,
    encoding: "utf8",
  });
  expect(bad.status).toBe(2);
  expect(JSON.parse(bad.stdout).message).toBe(
    'unknown section "nope"; the sections are: sig (Signals), fourier (Fourier transform), sampling (Sampling)',
  );
});

test("--focus ticks Focus mode on the start screen", async ({ page }) => {
  const dir = folder();
  const withFocus = await serve(dir, "--out", "a.json", "--focus");
  await page.goto(withFocus.url);
  await expect(page.locator("[data-focus-box]")).toBeChecked();
  withFocus.child.kill("SIGKILL");
  await withFocus.end();
  const without = await serve(dir, "--out", "b.json");
  await page.goto(without.url);
  await expect(page.locator("[data-focus-box]")).not.toBeChecked();
});

/** The progress file's answers, once the server has written them (its writes are once a second at most). */
const kept = (file: string, question: string) => async () => {
  try {
    return JSON.parse(readFileSync(file, "utf8")).state.answers[question] ?? null;
  } catch {
    return "not yet";
  }
};
const progressPosted = (page: Page) => page.waitForResponse((r) => r.url().endsWith("/progress") && r.status() === 204);

test("--autosave: answer, kill the server, start it again with the file, resume, Submit; the file is gone after", async ({
  page,
}) => {
  const dir = folder();
  const file = join(dir, "progress.json");
  const first = await serve(dir, "--out", "results.json", "--autosave", "progress.json");
  await page.goto(first.url);
  await page.setViewportSize({ width: 1280, height: 940 });
  // the start screen says the attempt is kept in a file, not in the browser
  await expect(page.locator("[data-rule=saved]")).toContainText("In a file on this computer");
  await page.getByRole("button", { name: /^Start$/ }).click();
  await page.getByLabel(/right m1$/).check();
  await progressPosted(page);
  await expect.poll(kept(file, "m1")).toEqual({ choice: 0 });
  expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ format: "fullmark-results", phase: "answering" });
  // the browser's storage holds no copy: the file is the only one
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
  first.child.kill("SIGKILL");
  await first.end();

  const second = await serve(dir, "--out", "results.json", "--autosave", "progress.json");
  await page.goto(second.url);
  await page.setViewportSize({ width: 1280, height: 940 });
  await expect(page.locator("[data-resume]")).toContainText("1 of 18 answered");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel(/right m1$/)).toBeChecked();
  await page.getByLabel(/wrong m2$/).check();
  await submitAttempt(page);
  await expect(page.locator("[data-sent]")).toHaveText("Sent");
  const onPage = await shown(page);
  const end = await second.end();
  expect(end.code).toBe(0);
  expect(existsSync(file)).toBe(false);
  expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  const graded = JSON.parse(run(dir, "grade", "results.json", "--quiz", "quiz.md", "--json").split("\n")[0] ?? "");
  expect(graded.score.earned).toBe(onPage.earned);
  expect(graded.score.points).toBe(onPage.points);
});

test("--autosave keeps the last answer on Ctrl+C, and --section keeps the section's plan on resume", async ({
  page,
}) => {
  test.skip(process.platform === "win32", "a child process cannot be sent SIGINT on Windows");
  const dir = folder();
  const file = join(dir, "progress.json");
  const first = await serve(dir, "--out", "results.json", "--autosave", "progress.json", "--section", "sig");
  await page.goto(first.url);
  await page.getByRole("button", { name: /^Start$/ }).click();
  await page.getByLabel(/right m1$/).check();
  await progressPosted(page);
  first.child.kill("SIGINT");
  const end = await first.end();
  expect(end.code).toBe(2);
  expect(end.lines[1]).toEqual({ status: "interrupted" });
  expect(await kept(file, "m1")()).toEqual({ choice: 0 });
  expect(JSON.parse(readFileSync(file, "utf8")).plan).toMatchObject({ source: "section", section: "sig" });
  expect(existsSync(join(dir, "results.json"))).toBe(false);

  const second = await serve(dir, "--out", "results.json", "--autosave", "progress.json", "--section", "sig");
  await page.goto(second.url);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel(/right m1$/)).toBeChecked();
  await expect(page.locator(".fm-question")).toHaveCount(6);
  second.child.kill("SIGKILL");
  await second.end();
});

test("--autosave refuses a file of another version with exit 1, naming it, and leaves the file alone", async ({
  page,
}) => {
  const dir = folder();
  const file = join(dir, "progress.json");
  const first = await serve(dir, "--out", "results.json", "--autosave", "progress.json");
  await page.goto(first.url);
  await page.getByRole("button", { name: /^Start$/ }).click();
  await page.getByLabel(/right m1$/).check();
  await progressPosted(page);
  await expect.poll(kept(file, "m1")).toEqual({ choice: 0 });
  first.child.kill("SIGKILL");
  await first.end();
  const before = readFileSync(file, "utf8");
  // the quiz is edited: it is another version now
  writeFileSync(
    join(dir, "quiz.md"),
    `${readFileSync(join(dir, "quiz.md"), "utf8")}\n## One more? {type=single id=m99}\n\n- [x] a\n- [ ] b\n`,
  );
  const cli = join(root, "dist", "cli.js");
  const other = spawnSync(process.execPath, [cli, "serve", "quiz.md", "--autosave", "progress.json", "--json"], {
    cwd: dir,
    encoding: "utf8",
  });
  expect(other.status).toBe(1);
  const line = JSON.parse(other.stdout.split("\n")[0] ?? "");
  expect(line.status).toBe("error");
  expect(line.message).toMatch(/taken on version [0-9a-f]{4} of the quiz; the quiz now is version [0-9a-f]{4}/);
  expect(readFileSync(file, "utf8")).toBe(before);
});
