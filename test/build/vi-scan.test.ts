import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runBuild } from "../../src/cli/build";
import { runReplay } from "../../src/cli/replay-command";
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
afterAll(() => rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

const sources: { name: string; dir: string; file: string }[] = [
  ...readdirSync(join(root, "examples"))
    .filter((n) => existsSync(join(root, "examples", n, "quiz.md")))
    .map((n) => ({
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
    // one example built as a vi page, which loads KaTeX and Shiki for the largest ones: 5 s was crossed on a loaded run
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

  // a replay page (slice 2j2): the banner, the status segment, the criterion tables and the grader's line
  for (const graded of [true, false]) {
    it(`a replay page ${graded ? "with" : "without"} a grades file`, async () => {
      const dir = join(work, graded ? "replay-graded" : "replay-pending");
      mkdirSync(join(dir, ".git"), { recursive: true });
      cpSync(join(root, "test", "fixtures", "replay"), dir, { recursive: true });
      if (!graded) rmSync(join(dir, "essay-results-grades.json"));
      const c = capture(dir);
      const options = {
        quiz: "essay.md",
        grades: null,
        output: "page.html",
        builtAt: base.builtAt,
        uiLang: "vi",
        fonts: null,
        plain: true,
        json: false,
        open: false,
        noOpen: true,
        version: "1.0.0-test",
      };
      expect(await runReplay(["essay-results.json"], options, c.io), c.out.join("\n")).toBe(0);
      const text = visibleText(readFileSync(join(dir, "page.html"), "utf8"));
      expect(text).toContain("Xem lại");
      if (graded) {
        expect(text).toContain("Chấm bởi");
        expect(text).toContain("Tiêu chí");
      }
      // the grader's own words (notes, justification) are the author's, like the quiz: they may be English
      const words = graded ? readFileSync(join(dir, "essay-results-grades.json"), "utf8").toLowerCase() : "";
      expect(leaksIn(text, own(dir) + words), "English chrome in a vi replay page").toEqual([]);
    });
  }
});
