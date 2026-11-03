import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { root, run } from "./helpers";

/**
 * The 300-question budget (TECHNICAL_DESIGN.md, section 7, "Budgets"): a 300-question quiz with images is interactive
 * within 1 s. The quiz is made here, never committed: 300 questions across every type, an image on every tenth. The time
 * runs from the start of the navigation to the first question accepting a click (the Start button, then a choice that
 * stays chosen). Over the limit, it is measured once more before the test fails, as the startup budget is. The number
 * is printed with the machine it ran on.
 */
const LIMIT_MS = 1000;
const COUNT = 300;
const IMAGE_EVERY = 10;

/** One question of each type, numbered `n`; every type the page offers, in turn. */
const KINDS: ((n: number) => string)[] = [
  (n) => `## Pick the prime number, question ${n}. {type=single id=q${n}}\n\n- [ ] Four\n- [x] Seven\n- [ ] Nine\n`,
  (n) => `## Which are even, question ${n}? {type=multi id=q${n} points=2}\n\n- [x] Two\n- [ ] Three\n- [x] Four\n`,
  (n) => `## The sky is green, question ${n}. {type=truefalse id=q${n}}\n\n\`\`\`answer\nvalue: false\n\`\`\`\n`,
  (n) => `## What is ${n} plus one, question ${n}? {type=numeric id=q${n}}\n\n\`\`\`answer\nvalue: ${n + 1}\n\`\`\`\n`,
  (n) =>
    `## Name the colour of grass, question ${n}. {type=short id=q${n}}\n\n\`\`\`answer\naccept: ["green"]\n\`\`\`\n`,
  (n) => `## The [[sun]] rises in the [[east]], question ${n}. {type=blanks id=q${n} points=2}\n`,
  (n) =>
    `## Pulse and name, question ${n} {type=fields id=q${n} points=2}\n\n\`\`\`answer\nfields:\n  - label: "Pulse"\n    value: 60\n    tolerance: 1\n  - label: "Name"\n    accept: ["pat"]\n\`\`\`\n`,
  (n) =>
    `## How sure are you, question ${n}? {type=scale id=q${n}}\n\n\`\`\`answer\nmin: 1\nmax: 5\nlabels:\n  1: Not at all\n  5: Very sure\n\`\`\`\n`,
  (n) =>
    `## Put the steps in order, question ${n}. {type=ordering id=q${n} points=3}\n\n1. Parse\n2. Check\n3. Render\n`,
  (n) =>
    `## Match each tool, question ${n}. {type=matching id=q${n} points=2}\n\n- lint :: finds style problems\n- test :: runs the checks\n`,
  (n) =>
    `## Explain caching, question ${n}. {type=essay id=q${n} points=2}\n\n\`\`\`answer\nmin_words: 3\nrubric:\n  mode: additive\n  criteria:\n    - Names the cost saved (1 pts)\n    - Names the risk (1 pts)\n\`\`\`\n`,
  (n) =>
    `## Write a function, question ${n}. {type=code id=q${n} points=2}\n\n\`\`\`answer\nlanguage: rust\nstarter: |\n  fn f() {}\nrubric:\n  - Works\n  - Is clear\n\`\`\`\n`,
];

/** The quiz source: the first question is a `single`, so the first click has a choice to land on. */
function bigQuiz(count = COUNT): string {
  const parts = ["---", "title: Three hundred questions", "id: big", "---", "", "# Everything", ""];
  for (let n = 1; n <= count; n++) {
    let q = (KINDS[(n - 1) % KINDS.length] as (n: number) => string)(n);
    if (n % IMAGE_EVERY === 0) q = q.replace("\n", "\n\n![A cubic curve](cubic.png)\n");
    parts.push(q);
  }
  return parts.join("\n");
}

test("a 300-question quiz with images is interactive within the budget", async ({ browser }, info) => {
  test.setTimeout(120_000);
  const dir = mkdtempSync(join(tmpdir(), "fm-budget-"));
  execFileSync(process.execPath, ["-e", `require("fs").mkdirSync(${JSON.stringify(join(dir, ".git"))})`]);
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(root, "examples", "calculus", "assets", "cubic.png"), join(dir, "cubic.png"));
  writeFileSync(join(dir, "big.md"), bigQuiz());
  run(dir, "build", "big.md", "--built-at", "2026-10-28T10:00:00+07:00");
  const url = `file:///${join(dir, "big.html").replaceAll("\\", "/")}`;

  /**
   * From the start of the navigation until the first choice stays chosen. Each round is a fresh browser context: in
   * one context the second round would find the first round's saved attempt and offer Continue, not Start.
   */
  const measure = async (): Promise<number> => {
    const context = await browser.newContext();
    const fresh = await context.newPage();
    // what the page said, so that a page that never starts says why
    const said: string[] = [];
    fresh.on("pageerror", (e) => said.push(`pageerror: ${e.message}`));
    fresh.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") said.push(`console.${m.type()}: ${m.text()}`);
    });
    try {
      const start = performance.now();
      await fresh.goto(url, { waitUntil: "commit" });
      // a click before the page is interactive does nothing: click again until the question shows, for 30 s at most
      const first = fresh.locator(".fm-question").first();
      while (!(await first.isVisible())) {
        if (performance.now() - start > 30_000) {
          const start = await fresh.getByRole("button", { name: "Start", exact: true }).count();
          throw new Error(
            `no question showed within 30 s (Start buttons on the page: ${start}); the page said:\n${said.join("\n") || "(nothing)"}`,
          );
        }
        await fresh
          .getByRole("button", { name: "Start", exact: true })
          .click({ timeout: 2000 })
          .catch(() => undefined);
      }
      const choice = first.getByRole("radio").first();
      await choice.check({ timeout: 5000 });
      const took = performance.now() - start;
      // the fixture is what it says it is (checked after the clock stopped)
      await expect(fresh.locator(".fm-question")).toHaveCount(COUNT);
      await expect(fresh.locator(".fm-question img")).toHaveCount(COUNT / IMAGE_EVERY);
      return took;
    } finally {
      await context.close();
    }
  };

  const times: number[] = [];
  for (let round = 0; round < 2; round++) {
    times.push(await measure());
    console.log(
      `budget: 300 questions: ${times.at(-1)?.toFixed(0)} ms (limit ${LIMIT_MS} ms), ${info.project.name} ${browser.version()}, ${process.platform} ${process.arch}`,
    );
    if ((times.at(-1) ?? Number.POSITIVE_INFINITY) < LIMIT_MS) break;
  }
  expect(Math.min(...times)).toBeLessThan(LIMIT_MS);
});
