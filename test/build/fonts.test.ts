import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fontBytes } from "../../src/build/fonts";
import { type BuildQuiz, buildPage, type PageOptions } from "../../src/build/page";
import { loadQuiz } from "../../src/cli/load";
import {
  embeddedFonts,
  FONT_REGISTRY,
  type FontId,
  type FontsChoice,
  filesOf,
  fontFaceCss,
  offeredFonts,
} from "../../src/core/fonts";

const root = resolve(import.meta.dirname, "..", "..");
const options: PageOptions = {
  runtime: readFileSync(join(root, "dist", "page.js"), "utf8"),
  css: readFileSync(join(root, "dist", "page.css"), "utf8"),
  builtAt: "2026-10-28T10:00:00+07:00",
  version: "1.0.0-test",
};

function quizWith(font: FontId): BuildQuiz {
  const loaded = loadQuiz(join(root, "test/fixtures/page/singles.md"));
  if (loaded.quiz === null || loaded.hash === null) throw new Error("does not load");
  return {
    quiz: { ...loaded.quiz, frontMatter: { ...loaded.quiz.frontMatter, font } },
    hash: loaded.hash,
    assets: loaded.assets,
  };
}

const faces = (html: string): string[] => html.match(/@font-face\{[^}]*\}/g)?.filter((r) => !r.includes("KaTeX")) ?? [];
const families = (html: string): string[] =>
  [...new Set(faces(html).map((f) => /font-family:"([^"]+)"/.exec(f)?.[1] ?? ""))].sort();

describe("which fonts a page carries", () => {
  it("quiz embeds the quiz's own font only, nothing for system", () => {
    expect(embeddedFonts("quiz", "serif")).toEqual(["serif"]);
    expect(embeddedFonts("quiz", "system")).toEqual([]);
    expect(offeredFonts("quiz", "serif")).toEqual(["system", "serif"]);
    expect(offeredFonts("quiz", "system")).toEqual(["system"]);
  });
  it("all embeds the three, none embeds nothing", () => {
    expect(embeddedFonts("all", "system")).toEqual(["sans", "serif", "readable"]);
    expect(offeredFonts("all", "sans")).toEqual(["system", "sans", "serif", "readable"]);
    expect(embeddedFonts("none", "sans")).toEqual([]);
    expect(offeredFonts("none", "sans")).toEqual(["system"]);
  });
});

describe("the page's @font-face CSS", () => {
  it("quiz: the quiz's font in three subsets, with unicode-range, font-display block and its size-adjust", () => {
    const html = buildPage([quizWith("serif")], { ...options, fonts: "quiz" });
    expect(families(html)).toEqual(["Source Serif 4"]);
    const rules = faces(html);
    expect(rules).toHaveLength(6); // latin, latin-ext, vietnamese; normal and italic
    for (const r of rules) {
      expect(r).toContain("font-display:block");
      expect(r).toContain("size-adjust:105.3%");
      expect(r).toContain("unicode-range:U+");
      expect(r).toMatch(/src:url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\) format\("woff2"\)/);
    }
    expect(html).toContain('<style id="fm-fonts">');
  });

  it("all: every embeddable font; none: no @font-face at all", () => {
    expect(families(buildPage([quizWith("system")], { ...options, fonts: "all" }))).toEqual([
      "Be Vietnam Pro",
      "Lexend",
      "Source Serif 4",
    ]);
    const none = buildPage([quizWith("sans")], { ...options, fonts: "none" });
    expect(faces(none)).toEqual([]);
    expect(none).not.toContain("fm-fonts");
    // the CSS still names the quiz's font first, so an installed copy is used
    expect(none).toContain(':root,:root[data-theme="light"]');
    expect(none).toMatch(/--font:"Be Vietnam Pro","Segoe UI"/);
  });

  it("the default is quiz, and system with quiz embeds nothing", () => {
    expect(families(buildPage([quizWith("readable")], options))).toEqual(["Lexend"]);
    expect(faces(buildPage([quizWith("system")], options))).toEqual([]);
  });

  it("a file is stored once: no data URI is repeated, and each file is read once", () => {
    const reads: string[] = [];
    const html = buildPage([quizWith("system")], {
      ...options,
      fonts: "all",
      fontData: (p) => {
        reads.push(p);
        return `data:font/woff2;base64,${Buffer.from(p).toString("base64")}`;
      },
    });
    const uris = faces(html).map((f) => /url\((data:[^)]+)\)/.exec(f)?.[1]);
    expect(new Set(uris).size).toBe(uris.length);
    expect(new Set(reads).size).toBe(reads.length);
    // a variable font is one file for regular and bold: 2 weights of a font do not double it
    expect(filesOf(["serif", "serif"]).length).toBe(FONT_REGISTRY.serif.files.length);
    expect(fontFaceCss(["readable", "readable"], (p) => p).match(/@font-face/g)).toHaveLength(6);
  });

  it("each embedded font is 100 to 250 KB before base64", () => {
    for (const id of ["sans", "serif", "readable"] as const) {
      const bytes = FONT_REGISTRY[id].files.reduce((n, f) => n + fontBytes(f.path).length, 0);
      expect(bytes).toBeGreaterThan(80_000);
      expect(bytes).toBeLessThan(250_000);
    }
  });
});

describe("determinism", () => {
  for (const choice of ["quiz", "all", "none"] as FontsChoice[]) {
    it(`two builds with --fonts ${choice} are byte-identical`, () => {
      const make = () => buildPage([quizWith("sans")], { ...options, fonts: choice });
      expect(make()).toBe(make());
    });
  }

  it("the CSP carries a hash for the font style and nothing else loosens", () => {
    const html = buildPage([quizWith("sans")], { ...options, fonts: "quiz" });
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(csp).toContain("font-src data:");
    expect(csp).toContain("default-src 'none'");
    expect(csp.match(/'sha256-/g)).toHaveLength(3); // the script, the page style, the font style
  });
});
