import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { en, vi } from "../../src/core/i18n";

/**
 * The comparison behind the `vi` scan (STEP2.md, slices 2i and 2i2), shared by `test/build/vi-scan.test.ts` (the page as
 * built) and `e2e/vi-scan.spec.ts` (the page as rendered, after Submit): no string of the `en` page catalog that
 * differs from its `vi` entry appears in the text, unless the author's own files hold it (they may be English).
 */
type Tree = { [key: string]: unknown };

/** The catalog's strings by key path, where the English and the Vietnamese differ (functions are not scanned). */
export function differing(a: Tree, b: Tree, path = ""): [string, string][] {
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

/** The `en` page strings that differ from `vi`. */
export const catalogStrings: [string, string][] = differing(en.page as unknown as Tree, vi.page as unknown as Tree);

const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** What a reader sees of the page's HTML: no scripts, styles, tags or attributes. */
export const visibleText = (html: string): string =>
  decode(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " "),
  );

/** The text of the author's own files (the quiz and its sheets), lower-cased. */
export const own = (dir: string): string => {
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

/** The catalog keys whose English string stands in `text` as a whole phrase and is not in the author's own files. */
export const leaksIn = (text: string, mine: string): string[] =>
  catalogStrings
    .filter(([, value]) =>
      new RegExp(`(?<![\\p{L}\\p{N}])${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u").test(
        text,
      ),
    )
    .filter(([, value]) => !mine.includes(value.toLowerCase()))
    .map(([key, value]) => `${key}: "${value}"`);
