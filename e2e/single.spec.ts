import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
const cli = join(root, "dist", "cli.js");

const run = (cwd: string, ...args: string[]): string =>
  execFileSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: undefined, NO_COLOR: "1" },
  });

let dir: string;
let pageUrl: string;

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "fm-e2e-"));
  // a `.git` folder stops the search for fullmark.toml here
  execFileSync(process.execPath, ["-e", `require("fs").mkdirSync(${JSON.stringify(join(dir, ".git"))})`]);
  copyFileSync(join(root, "test", "fixtures", "page", "singles.md"), join(dir, "singles.md"));
  run(dir, "build", "singles.md", "--built-at", "2026-10-28T10:00:00+07:00");
  pageUrl = `file:///${join(dir, "singles.html").replaceAll("\\", "/")}`;
});

type Shown = { id: string; status: string }[];

async function shown(page: Page): Promise<{ results: Shown; earned: number; points: number }> {
  const results = await page
    .locator(".fm-result")
    .evaluateAll((els) =>
      els.map((el) => ({ id: el.getAttribute("data-qid") ?? "", status: el.getAttribute("data-status") ?? "" })),
    );
  const total = page.locator(".fm-total");
  return {
    results,
    earned: Number(await total.getAttribute("data-earned")),
    points: Number(await total.getAttribute("data-points")),
  };
}

test("answers, submits and exports a score that quiz grade reproduces", async ({ page, context }) => {
  const requests: string[] = [];
  const problems: string[] = [];
  let blocked = 0;
  await context.route(/^https?:/, (route) => {
    blocked++;
    return route.abort();
  });
  page.on("request", (r) => {
    if (!/^(file|data|blob):/.test(r.url())) requests.push(r.url());
  });
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(m.text());
  });

  await page.goto(pageUrl);
  await expect(page.locator(".fm-start")).toBeVisible();
  await expect(page.locator(".fm-question").first()).toBeHidden();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator(".fm-question")).toHaveCount(4);

  // right
  await page.getByLabel("Seven, which has no divisors but one and itself").check();
  // wrong
  await page.getByLabel("Lyon").check();
  // right, with an {input}
  await page.getByLabel("Carbon dioxide").check();
  await page.getByPlaceholder("Where does it come from?").fill("From the air");
  // the fourth is left empty

  await page.getByRole("button", { name: "Submit" }).click();
  const onPage = await shown(page);
  expect(onPage.results).toEqual([
    { id: "prime", status: "correct" },
    { id: "capital", status: "incorrect" },
    { id: "gas", status: "correct" },
    { id: "sky", status: "unanswered" },
  ]);
  expect(onPage.earned).toBe(2);
  expect(onPage.points).toBe(5);
  await expect(page.getByText("Seven has no divisors except one")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export results" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^singles-results-\d{8}-\d{6}\.json$/);
  const resultsPath = join(dir, file.suggestedFilename());
  await file.saveAs(resultsPath);

  // the same score from the CLI, for the file the page exported
  const out = JSON.parse(
    run(dir, "grade", file.suggestedFilename(), "--quiz", "singles.md", "--json").split("\n")[0] ?? "",
  );
  const report = JSON.parse(readFileSync(join(dir, out.report ?? out.reports?.[0] ?? ""), "utf8"));
  expect(report.score.earned).toBe(onPage.earned);
  expect(report.score.points).toBe(onPage.points);
  const cliStatus = Object.fromEntries(
    (report.questions as { id: string; status: string }[]).map((q) => [q.id, q.status]),
  );
  for (const r of onPage.results) expect(cliStatus[r.id]).toBe(r.status);

  expect(problems).toEqual([]);
  expect(requests).toEqual([]);
  expect(blocked).toBe(0);
});

test("Submit and Export are not on the page before their phase", async ({ page }) => {
  await page.goto(pageUrl);
  await expect(page.getByRole("button", { name: "Submit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export results" })).toHaveCount(0);
});
