import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const root = resolve(import.meta.dirname, "..");
const cli = join(root, "dist", "cli.js");

export const run = (cwd: string, ...args: string[]): string =>
  execFileSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: undefined, NO_COLOR: "1" },
  });

/** A folder with a `.git` (it stops the search for fullmark.toml), the quiz copied in, and the page built. */
export function buildIn(source: string, name: string): { dir: string; url: string } {
  const dir = mkdtempSync(join(tmpdir(), "fm-e2e-"));
  execFileSync(process.execPath, ["-e", `require("fs").mkdirSync(${JSON.stringify(join(dir, ".git"))})`]);
  copyFileSync(join(root, source), join(dir, name));
  run(dir, "build", name, "--built-at", "2026-10-28T10:00:00+07:00");
  return { dir, url: `file:///${join(dir, name.replace(/\.md$/, ".html")).replaceAll("\\", "/")}` };
}

export type Shown = { id: string; status: string; earned: number }[];

export async function shown(page: Page): Promise<{ results: Shown; earned: number; points: number }> {
  const results = await page.locator(".fm-result").evaluateAll((els) =>
    els.map((el) => ({
      id: el.getAttribute("data-qid") ?? "",
      status: el.getAttribute("data-status") ?? "",
      earned: Number(el.getAttribute("data-earned")),
    })),
  );
  const total = page.locator(".fm-total");
  return {
    results,
    earned: Number(await total.getAttribute("data-earned")),
    points: Number(await total.getAttribute("data-points")),
  };
}

/** Exports from the page, grades the file with the CLI, and checks status and points of every question. */
export async function expectGradeMatches(
  page: Page,
  dir: string,
  quizFile: string,
  exportLabel = "Export results",
): Promise<Shown> {
  const onPage = await shown(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: exportLabel }).click();
  const file = await download;
  await file.saveAs(join(dir, file.suggestedFilename()));
  const out = JSON.parse(
    run(dir, "grade", file.suggestedFilename(), "--quiz", quizFile, "--json").split("\n")[0] ?? "",
  );
  const report = JSON.parse(readFileSync(join(dir, out.report ?? out.reports?.[0] ?? ""), "utf8"));
  const cli = new Map(
    (report.questions as { id: string; status: string; earned: number | null }[]).map((q) => [q.id, q]),
  );
  for (const r of onPage.results) {
    expect(cli.get(r.id)?.status, `status of ${r.id}`).toBe(r.status);
    expect(cli.get(r.id)?.earned ?? 0, `points of ${r.id}`).toBeCloseTo(r.earned, 6);
  }
  expect(report.score.earned).toBeCloseTo(onPage.earned, 6);
  expect(report.score.points).toBeCloseTo(onPage.points, 6);
  return onPage.results;
}

export async function noViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 3) })),
  ).toEqual([]);
}

/** Collects what must stay empty on every page: errors, and requests that leave the file. */
export function watch(page: Page) {
  const problems: string[] = [];
  const requests: string[] = [];
  page.on("request", (r) => {
    if (!/^(file|data|blob):/.test(r.url())) requests.push(r.url());
  });
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(m.text());
  });
  return { problems, requests };
}

export const card = (page: Page, id: string) => page.locator(`article[data-qid="${id}"]`);
