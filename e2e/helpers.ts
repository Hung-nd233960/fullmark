import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";
import { quizHash } from "../src/core/hash";
import { resultsHash } from "../src/core/rubric/grades";

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

/** Like `buildIn`, for a fixture with lines added to its front matter (`theme: paper`, `look: locked`). */
export function buildWith(
  source: string,
  name: string,
  extra: string[],
  flags: string[] = [],
): { dir: string; url: string } {
  const text = readFileSync(join(root, source), "utf8").replace(/^---\n/, `---\n${extra.join("\n")}\n`);
  const dir = mkdtempSync(join(tmpdir(), "fm-e2e-"));
  execFileSync(process.execPath, ["-e", `require("fs").mkdirSync(${JSON.stringify(join(dir, ".git"))})`]);
  writeFileSync(join(dir, name), text);
  run(dir, "build", name, "--built-at", "2026-10-28T10:00:00+07:00", ...flags);
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
  exportLabel = "Download results",
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

export async function noViolations(page: Page, skip: string[] = []): Promise<void> {
  const result = await new AxeBuilder({ page }).disableRules(skip).analyze();
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

/** Like `buildIn`, for a quiz that has a folder (images, sheets): the whole folder is copied. */
export function buildFolder(sourceDir: string, name = "quiz.md"): { dir: string; url: string } {
  const dir = mkdtempSync(join(tmpdir(), "fm-e2e-"));
  execFileSync(process.execPath, ["-e", `require("fs").mkdirSync(${JSON.stringify(join(dir, ".git"))})`]);
  cpSync(join(root, sourceDir), dir, { recursive: true });
  run(dir, "build", name, "--built-at", "2026-10-28T10:00:00+07:00");
  return { dir, url: `file:///${join(dir, name.replace(/\.md$/, ".html")).replaceAll("\\", "/")}` };
}

/**
 * Submit as a learner does (TECHNICAL_DESIGN.md, section 8, row "Submit asks first"): press Submit in the bar, then
 * Submit in the dialog. A touch page taps. Specs never click the bar's Submit and expect results directly.
 */
export async function submitAttempt(page: Page): Promise<void> {
  const touch = await page.evaluate(() => "ontouchstart" in window);
  const press = (target: Locator) => (touch ? target.tap() : target.click());
  await press(page.locator(".fm-topbar [data-action=submit]"));
  await press(page.locator("dialog[data-submit-dialog] [data-action=confirm-submit]"));
}

const FIXTURE = join(root, "test", "fixtures", "replay");

/**
 * The replay of the `essay` fixture (a quiz of one single, essays of each rubric mode and a code question, with its
 * results and grades files) built with `extra` front matter lines; the lines change the quiz's hash, so the results
 * and grades files are re-keyed to it. Returns the page's `file://` URL.
 */
export function replayOf(extra: string[], name: string): string {
  const dir = mkdtempSync(join(tmpdir(), "fm-panels-"));
  mkdirSync(join(dir, ".git"));
  const source = readFileSync(join(FIXTURE, "essay.md"), "utf8").replace(/^---\n/, `---\n${extra.join("\n")}\n`);
  writeFileSync(join(dir, "essay.md"), source);
  const results = JSON.parse(readFileSync(join(FIXTURE, "essay-results.json"), "utf8"));
  results.quizHash = quizHash(source, []);
  writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(results, null, 2)}\n`);
  const grades = JSON.parse(readFileSync(join(FIXTURE, "essay-results-grades.json"), "utf8"));
  grades.results_hash = resultsHash(results);
  writeFileSync(join(dir, `${name}-grades.json`), JSON.stringify(grades));
  run(dir, "replay", `${name}.json`, "--quiz", "essay.md", "--no-open", "--built-at", "2026-10-28T10:00:00+07:00");
  return `file:///${join(dir, `${name}-replay.html`).replaceAll("\\", "/")}`;
}

// -- the one-shot server ---------------------------------------------------------------------------------------------

export type ServedEnd = {
  code: number | null;
  signal: NodeJS.Signals | null;
  lines: Record<string, unknown>[];
  stderr: string;
};

/** A `quiz serve --json` subprocess: its `listening` line read, the rest collected until it exits. */
export type Served = {
  url: string;
  port: number;
  pid: number;
  child: ChildProcess;
  /** the first line, as `listening` printed it */
  listening: Record<string, unknown>;
  /** every JSON line printed so far, the `listening` line first */
  lines(): Record<string, unknown>[];
  /** what the process has written to stderr so far */
  errText(): string;
  /** waits (bounded) until a line printed so far satisfies `pred`; fails with what was printed */
  waitLine(pred: (line: Record<string, unknown>) => boolean, ms?: number): Promise<Record<string, unknown>>;
  /** waits for the process to end: its exit code and every JSON line it printed (the `listening` line first) */
  end(): Promise<ServedEnd>;
};

/**
 * Starts `quiz serve QUIZ --json ...args` in `dir` and waits for its `listening` line. Every served command's contract
 * test uses this (STEP3.md, "Rules for every slice"): drive the page or the form, or POST, then read `end()`.
 */
export async function serveProcess(dir: string, args: string[]): Promise<Served> {
  const child = spawn(process.execPath, [cli, ...args, "--json"], {
    cwd: dir,
    env: { ...process.env, FORCE_COLOR: undefined, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  let stderr = "";
  child.stderr?.on("data", (c: Buffer) => {
    stderr += c.toString("utf8");
  });
  const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  const parse = (): Record<string, unknown>[] =>
    out
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  const listening = await new Promise<Record<string, unknown>>((resolve, reject) => {
    child.stdout?.on("data", (c: Buffer) => {
      out += c.toString("utf8");
      const first = out.split("\n")[0];
      if (out.includes("\n") && first) resolve(JSON.parse(first) as Record<string, unknown>);
    });
    ended.then(() => reject(new Error(`serve ended before it listened:\n${out}\n${stderr}`)));
  });
  return {
    url: String(listening.url),
    port: Number(listening.port),
    pid: Number(listening.pid),
    child,
    listening,
    lines: parse,
    errText: () => stderr,
    async waitLine(pred, ms = 10_000) {
      const deadline = Date.now() + ms;
      for (;;) {
        const found = parse().find(pred);
        if (found) return found;
        if (Date.now() > deadline) throw new Error(`no such line in ${ms} ms:\n${out}\n${stderr}`);
        await new Promise((done) => setTimeout(done, 25));
      }
    },
    async end() {
      const result = await ended;
      return { ...result, lines: parse(), stderr };
    },
  };
}

/** The JSON lines of a served command with what changes between runs masked, as the golden files hold them. */
export function maskLines(lines: Record<string, unknown>[], dir: string): string {
  const mask = (line: Record<string, unknown>) =>
    JSON.stringify(line, (key, value) =>
      key === "url"
        ? "<url>"
        : key === "port"
          ? 0
          : key === "pid"
            ? 0
            : key === "bytes" && typeof value === "number"
              ? 0
              : typeof value === "string"
                ? value.replaceAll(dir, "<dir>")
                : value,
    );
  return `${lines.map(mask).join("\n")}\n`;
}

/** Compares masked lines with `e2e/golden/<name>.jsonl`; `FULLMARK_GOLDEN_UPDATE=1` rewrites the file. */
export function expectGolden(name: string, text: string): void {
  const file = join(root, "e2e", "golden", `${name}.jsonl`);
  if (process.env.FULLMARK_GOLDEN_UPDATE === "1") {
    mkdirSync(join(root, "e2e", "golden"), { recursive: true });
    writeFileSync(file, text);
    return;
  }
  expect(text).toBe(readFileSync(file, "utf8"));
}
