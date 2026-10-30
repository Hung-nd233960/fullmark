import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { licencesFor } from "../../src/build/licences";
import { type BuildQuiz, buildPage, type PageOptions } from "../../src/build/page";
import { loadQuiz } from "../../src/cli/load";
import { FONT_REGISTRY, type FontId } from "../../src/core/fonts";

const root = resolve(import.meta.dirname, "..", "..");
const options: PageOptions = {
  runtime: readFileSync(join(root, "dist", "page.js"), "utf8"),
  css: readFileSync(join(root, "dist", "page.css"), "utf8"),
  builtAt: "2026-10-28T10:00:00+07:00",
  version: "1.0.0-test",
};
const names = (o: { fonts: FontId[]; maths: boolean }) => licencesFor(o).notices.map((n) => n.name);

describe("which notices a page gets", () => {
  it("the runtime's packages always, nothing else without maths or fonts", () => {
    expect(names({ fonts: [], maths: false })).toEqual([
      "Preact",
      "Preact Signals",
      "Preact Signals Core",
      "Noble Hashes",
      "Zod",
    ]);
    expect(licencesFor({ fonts: [], maths: false }).ofl).toBeNull();
  });
  it("KaTeX only with maths", () => {
    expect(names({ fonts: [], maths: true })).toContain("KaTeX");
    expect(names({ fonts: [], maths: false })).not.toContain("KaTeX");
  });
  it("a font's notice only when it is embedded, and the OFL text with the first", () => {
    const some = licencesFor({ fonts: ["serif"], maths: false });
    expect(some.notices.map((n) => n.name)).toContain("Source Serif 4");
    expect(some.notices.map((n) => n.name)).not.toContain("Lexend");
    expect(some.ofl).toMatch(/^SIL OPEN FONT LICENSE Version 1\.1/);
    const all = licencesFor({ fonts: ["sans", "serif", "readable"], maths: false });
    expect(all.notices.filter((n) => n.licence === "OFL-1.1")).toHaveLength(3);
    expect(all.ofl?.match(/SIL OPEN FONT LICENSE Version 1\.1/g)).toHaveLength(1);
  });
  it("each notice has a version, a licence and a copyright line; the MIT text is there once", () => {
    const l = licencesFor({ fonts: ["sans"], maths: true });
    for (const n of l.notices) {
      expect(n.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(n.licence).toMatch(/^(MIT|OFL-1\.1)$/);
      expect(n.copyright).toMatch(/Copyright|©/);
    }
    expect(l.mit.match(/Permission is hereby granted/g)).toHaveLength(1);
  });
  it("the registry's font versions are the installed packages' versions", () => {
    for (const id of ["sans", "serif", "readable"] as const) {
      const entry = FONT_REGISTRY[id];
      const pkg = entry.files[0]?.path.split("/").slice(0, 2).join("/") ?? "";
      const installed = JSON.parse(readFileSync(join(root, "node_modules", pkg, "package.json"), "utf8")) as {
        version: string;
      };
      expect(entry.notice?.version).toBe(installed.version);
    }
  });
});

function quizOf(file: string, font: FontId = "system"): BuildQuiz {
  const loaded = loadQuiz(join(root, file));
  if (loaded.quiz === null || loaded.hash === null) throw new Error("does not load");
  return {
    quiz: { ...loaded.quiz, frontMatter: { ...loaded.quiz.frontMatter, font } },
    hash: loaded.hash,
    assets: loaded.assets,
    sheets: loaded.sheets,
  };
}

describe("the page", () => {
  const dialogOf = (html: string) => /<dialog id="fm-licences"[\s\S]*?<\/dialog>/.exec(html)?.[0] ?? "";
  it("carries the popup in its HTML, and no HTML comment of notices", () => {
    const html = buildPage([quizOf("test/fixtures/page/singles.md")], options);
    const dialog = dialogOf(html);
    expect(dialog).toContain("Preact");
    expect(dialog).toContain("Permission is hereby granted");
    expect(dialog).not.toContain("KaTeX");
    expect(dialog).not.toContain("SIL OPEN FONT");
    expect(html).toContain('data-action="licences"');
    expect(html).not.toMatch(/<!--[^>]*Licen[cs]e/);
  });
  it("lists a font only when it is embedded", () => {
    const quiz = quizOf("test/fixtures/page/singles.md", "readable");
    expect(dialogOf(buildPage([quiz], { ...options, fonts: "quiz" }))).toContain("Lexend");
    expect(dialogOf(buildPage([quiz], { ...options, fonts: "none" }))).not.toContain("Lexend");
    const all = dialogOf(buildPage([quiz], { ...options, fonts: "all" }));
    expect(all).toContain("Be Vietnam Pro");
    expect(all).toContain("SIL OPEN FONT LICENSE");
  });
  it("is in the page's language", () => {
    const vi = buildPage([quizOf("examples/medical/quiz.md")], options);
    expect(vi).toContain('data-action="licences"');
  });
});
