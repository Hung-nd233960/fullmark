import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { licencesFor } from "../../src/build/licences";
import { NOTICE_PACKAGES } from "../../src/build/notices-data";
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
      "Noble Hashes",
      "Preact Signals",
      "Preact Signals Core",
      "Preact",
      "Zod",
    ]);
    expect(licencesFor({ fonts: [], maths: false }).texts.map((t) => t.licence)).toEqual(["MIT", "MIT"]);
  });
  it("KaTeX only with maths", () => {
    expect(names({ fonts: [], maths: true })).toContain("KaTeX");
    expect(names({ fonts: [], maths: false })).not.toContain("KaTeX");
  });
  it("a font's notice only when it is embedded, and the OFL text once, with the first", () => {
    const some = licencesFor({ fonts: ["serif"], maths: false });
    expect(some.notices.map((n) => n.name)).toContain("Source Serif 4");
    expect(some.notices.map((n) => n.name)).not.toContain("Lexend");
    expect(some.texts.filter((t) => t.licence === "OFL-1.1")).toHaveLength(1);
    const all = licencesFor({ fonts: ["sans", "serif", "readable"], maths: false });
    expect(all.notices.filter((n) => n.licence === "OFL-1.1")).toHaveLength(3);
    expect(all.texts.filter((t) => t.licence === "OFL-1.1")).toHaveLength(1);
    expect(all.texts.find((t) => t.licence === "OFL-1.1")?.body).toMatch(/^SIL OPEN FONT LICENSE Version 1\.1/);
  });
  it("each notice has a version, a licence and a copyright line; no licence text is listed twice", () => {
    const l = licencesFor({ fonts: ["sans"], maths: true });
    for (const n of l.notices) {
      expect(n.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(n.licence).toMatch(/^(MIT|OFL-1\.1)$/);
      expect(n.copyright).toMatch(/Copyright|©/);
    }
    expect(new Set(l.texts.map((t) => t.body)).size).toBe(l.texts.length);
  });
  it("the registry's font packages are in the notices, at the installed version", () => {
    for (const id of ["sans", "serif", "readable"] as const) {
      const pkg = FONT_REGISTRY[id].package ?? "";
      const installed = JSON.parse(readFileSync(join(root, "node_modules", pkg, "package.json"), "utf8")) as {
        version: string;
      };
      expect(NOTICE_PACKAGES.find((p) => p.name === pkg)?.version).toBe(installed.version);
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
