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
  const sent = page.locator("[data-fm-serve=sent]");
  await expect(sent).toHaveText("Results sent. You can close this tab.");
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
  await expect(page.locator("[data-fm-serve=sent]")).toBeVisible();
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
  const failed = page.locator("[data-fm-serve=failed]");
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
  await expect(page.locator("[data-fm-serve=sent]")).toBeVisible();
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
  await expect(page.locator("[data-fm-serve=sent]")).toBeVisible();
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
  await expect(page.locator("[data-fm-serve=failed]")).toContainText("Không lưu được kết quả");
});
