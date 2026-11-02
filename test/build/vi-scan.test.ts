import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runBuild } from "../../src/cli/build";
import { base } from "../helpers/build";
import { capture } from "../helpers/cli";
import { catalogStrings, leaksIn, own, visibleText } from "../helpers/vi-scan";

/**
 * The `vi` scan (STEP2.md, slice 2i): a page built with `--ui-lang vi` shows no English chrome. For every example
 * and page fixture, no string of the `en` page catalog that differs from its `vi` entry appears in the page's
 * visible text, unless the author's own files (the quiz and its sheets) hold it: those may be English.
 */
const root = resolve(import.meta.dirname, "..", "..");
const work = mkdtempSync(join(tmpdir(), "fullmark-vi-scan-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const sources: { name: string; dir: string; file: string }[] = [
  ...readdirSync(join(root, "examples")).map((n) => ({
    name: `example ${n}`,
    dir: join(root, "examples", n),
    file: "quiz.md",
  })),
  ...readdirSync(join(root, "test", "fixtures", "page"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ name: `fixture ${f}`, dir: join(root, "test", "fixtures", "page"), file: f })),
];

describe("the vi scan", () => {
  it("has strings to look for", () => {
    expect(catalogStrings.length).toBeGreaterThan(100);
  });
  it("sees English chrome: the same scan finds it in an English page", async () => {
    const dir = join(work, "english");
    mkdirSync(join(dir, ".git"), { recursive: true });
    cpSync(join(root, "examples", "exam"), dir, { recursive: true });
    const c = capture(dir);
    expect(await runBuild(["quiz.md"], { ...base, uiLang: "en", output: "page.html" }, c.io)).toBe(0);
    expect(leaksIn(visibleText(readFileSync(join(dir, "page.html"), "utf8")), "").length).toBeGreaterThan(3);
  });
  for (const [i, s] of sources.entries()) {
    it(s.name, async () => {
      // copy so that assets and sheets resolve and nothing is written into the repository
      const dir = join(work, String(i));
      mkdirSync(dir, { recursive: true });
      cpSync(s.dir, dir, { recursive: true });
      mkdirSync(join(dir, ".git"), { recursive: true });
      const c = capture(dir);
      expect(await runBuild([s.file], { ...base, uiLang: "vi", output: "page.html" }, c.io), c.out.join("\n")).toBe(0);
      const text = visibleText(readFileSync(join(dir, "page.html"), "utf8"));
      const mine = own(dir);
      const leaks = leaksIn(text, mine);
      expect(leaks, `${s.name}: English chrome in a vi page`).toEqual([]);
    });
  }
});
