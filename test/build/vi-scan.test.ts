import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runBuild } from "../../src/cli/build";
import { en, vi } from "../../src/core/i18n";
import { base } from "../helpers/build";
import { capture } from "../helpers/cli";

/**
 * The `vi` scan (STEP2.md, slice 2i): a page built with `--ui-lang vi` shows no English chrome. For every example
 * and page fixture, no string of the `en` page catalog that differs from its `vi` entry appears in the page's
 * visible text, unless the author's own files (the quiz and its sheets) hold it: those may be English.
 */
const root = resolve(import.meta.dirname, "..", "..");
const work = mkdtempSync(join(tmpdir(), "fullmark-vi-scan-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

type Tree = { [key: string]: unknown };

/** The catalog's strings by key path, where the English and the Vietnamese differ (functions are not scanned). */
function differing(a: Tree, b: Tree, path = ""): [string, string][] {
  const out: [string, string][] = [];
  for (const [key, value] of Object.entries(a)) {
    const other = b[key];
    const here = path === "" ? key : `${path}.${key}`;
    if (typeof value === "string" && typeof other === "string") {
      if (value !== other && value.trim().length >= 2) out.push([here, value]);
    } else if (value !== null && typeof value === "object" && other !== null && typeof other === "object") {
      out.push(...differing(value as Tree, other as Tree, here));
    }
  }
  return out;
}

const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** What a reader sees of the page's HTML: no scripts, styles, tags or attributes. */
const visibleText = (html: string): string =>
  decode(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " "),
  );

const own = (dir: string): string => {
  let text = "";
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name.endsWith(".md") || e.name.endsWith(".yaml")) text += `\n${readFileSync(join(d, e.name), "utf8")}`;
    }
  };
  walk(dir);
  return text.toLowerCase();
};

const leaksIn = (text: string, mine: string): string[] =>
  strings
    .filter(([, value]) =>
      new RegExp(`(?<![\\p{L}\\p{N}])${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u").test(
        text,
      ),
    )
    .filter(([, value]) => !mine.includes(value.toLowerCase()))
    .map(([key, value]) => `${key}: "${value}"`);

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

const strings = differing(en.page as unknown as Tree, vi.page as unknown as Tree);

describe("the vi scan", () => {
  it("has strings to look for", () => {
    expect(strings.length).toBeGreaterThan(100);
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
