import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { root, run } from "./helpers";

/**
 * KaTeX fonts by use (TECHNICAL_DESIGN.md, section 8): a page embeds only the faces its maths uses, and its maths looks
 * the same as with all of them. The page is built, then once more with KaTeX's whole stylesheet and every font, and the
 * two are shown side by side in pixels.
 */
const QUIZ = [
  "---",
  "title: Maths faces",
  "id: faces",
  "---",
  "",
  "## Set $\\mathcal{L}$ over $\\mathbb{R}$, with $\\mathbf{v}$ and $\\mathfrak{g}$ and $\\mathscr{A}$ and $\\mathtt{t}$ {type=single id=a}",
  "",
  "- [x] $\\left( \\sum_{i=1}^{n} \\frac{x_i}{\\sqrt{2}} \\right)$ and $\\textbf{bold}\\ \\textit{italic}$",
  "- [ ] $\\int_0^1 x^2\\,dx = \\frac{1}{3}$ and $\\mathsf{S}$",
  "",
].join("\n");

const dir = mkdtempSync(join(tmpdir(), "fm-katex-"));
execFileSync(process.execPath, ["-e", `require("fs").mkdirSync(${JSON.stringify(join(dir, ".git"))})`]);
writeFileSync(join(dir, "faces.md"), QUIZ);
run(dir, "build", "faces.md", "--built-at", "2026-10-28T10:00:00+07:00");
const pruned = readFileSync(join(dir, "faces.html"), "utf8");

/** KaTeX's stylesheet as the build wrote it before: every `@font-face`, WOFF2 only. */
function wholeStylesheet(): string {
  const dist = join(root, "node_modules", "katex", "dist");
  const sources =
    /src:url\((fonts\/[^)]+\.woff2)\) format\("woff2"\),url\([^)]+\) format\("woff"\),url\([^)]+\) format\("truetype"\)/g;
  return readFileSync(join(dist, "katex.min.css"), "utf8").replace(
    sources,
    (_m, path: string) =>
      `src:url(data:font/woff2;base64,${readFileSync(join(dist, path)).toString("base64")}) format("woff2")`,
  );
}

test("the maths looks the same with only the fonts it uses, and the page is smaller", async ({ browser }) => {
  const rules = /<style id="fm-katex">([\s\S]*?)<\/style>/.exec(pruned)?.[1] ?? "";
  const styles = rules.slice(rules.indexOf("\n") + 1);
  const whole = pruned
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "")
    .replace(rules, `${wholeStylesheet()}\n${styles}`);
  writeFileSync(join(dir, "whole.html"), whole);
  expect((pruned.match(/@font-face/g) ?? []).length).toBeLessThan((whole.match(/@font-face/g) ?? []).length);
  expect(pruned.length).toBeLessThan(whole.length);

  const shoot = async (file: string): Promise<Buffer> => {
    // a fresh context: the two pages share a quiz id, and so a saved attempt
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`file:///${join(dir, file).replaceAll("\\", "/")}`);
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.locator(".fm-question")).toHaveCount(1);
    await page.evaluate(async () => {
      for (const f of [...document.fonts]) await f.load().catch(() => undefined);
      await document.fonts.ready;
    });
    const image = await page.locator(".fm-question").screenshot();
    await context.close();
    return image;
  };
  const a = await shoot("faces.html");
  const b = await shoot("whole.html");
  expect(a.equals(b)).toBe(true);
});
