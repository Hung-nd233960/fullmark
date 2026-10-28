import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { ParseTex } from "../core/parse/tex";

/** The part of KaTeX that fullmark uses. */
export type Katex = {
  renderToString(tex: string, options: Record<string, unknown>): string;
};

const nodeRequire = createRequire(import.meta.url);

/** KaTeX, loaded on first use from `node_modules` (it is external to the bundle, and ships a CommonJS build). */
export const loadKatex = (): Katex => nodeRequire("katex") as Katex;

/**
 * A `ParseTex` over KaTeX that loads KaTeX on the first span it is asked about, so a quiz without maths never loads
 * it. A span that parses gives null; one that does not gives KaTeX's message without its "KaTeX parse error:" prefix.
 */
export function lazyParseTex(load: () => Katex = loadKatex): ParseTex {
  let katex: Katex | undefined;
  return (tex, display) => {
    katex ??= load();
    try {
      katex.renderToString(tex, { displayMode: display, throwOnError: true, output: "htmlAndMathml" });
      return null;
    } catch (error) {
      // `rawMessage` has no context excerpt (KaTeX underlines it with combining characters, which print badly)
      const e = error as Error & { rawMessage?: string; position?: number };
      const message = e.rawMessage ?? e.message.replace(/^KaTeX parse error:\s*/, "");
      return e.position === undefined ? message : `${message} at position ${e.position + 1}`;
    }
  };
}

/**
 * The maths of one page. KaTeX writes `style="…"` on many elements, and the page's CSP allows no style attributes, so
 * each distinct style becomes a class (`fm-s0`, `fm-s1`, … in order of first use) and the rules go into the page's
 * KaTeX stylesheet. `!important` gives the class the standing an inline style had.
 */
export type MathSession = {
  render(tex: string, display: boolean): string;
  /** KaTeX's stylesheet, its fonts, and the rules for the styles used so far */
  css(): string;
};

/** The maths a build renders: one session per page. */
export type MathTools = { start(): MathSession };

const OPEN_TAG = /<[a-zA-Z][^>]*?\sstyle="[^"]*"[^>]*>/g;

/** KaTeX as the build uses it, loaded on the first span and not before. `check` has already parsed every span. */
export function katexTools(load: () => Katex = loadKatex): MathTools {
  let katex: Katex | undefined;
  return {
    start() {
      const classes = new Map<string, string>();
      const classOf = (style: string): string => {
        let name = classes.get(style);
        if (name === undefined) {
          name = `fm-s${classes.size}`;
          classes.set(style, name);
        }
        return name;
      };
      return {
        render(tex, display) {
          katex ??= load();
          const html = katex.renderToString(tex, { displayMode: display, throwOnError: true, output: "htmlAndMathml" });
          return html.replace(OPEN_TAG, (tag) => {
            const name = classOf(/\sstyle="([^"]*)"/.exec(tag)?.[1] ?? "");
            const bare = tag.replace(/\sstyle="[^"]*"/, "");
            return /\sclass="/.test(bare)
              ? bare.replace(/\sclass="([^"]*)"/, (_m, c: string) => ` class="${c} ${name}"`)
              : bare.replace(/^<([a-zA-Z][^\s>/]*)/, `<$1 class="${name}"`);
          });
        },
        css() {
          const rules = [...classes].map(([style, name]) => {
            const declarations = style
              .split(";")
              .map((d) => d.trim())
              .filter((d) => d !== "")
              .map((d) => `${d} !important`);
            return `.katex .${name}{${declarations.join(";")}}`;
          });
          return `${katexCss()}\n${rules.join("\n")}`;
        },
      };
    },
  };
}

/**
 * KaTeX's stylesheet with its fonts as WOFF2 `data:` URIs, and no other source: every browser that opens a page
 * reads WOFF2, and the `woff` and `ttf` copies would only make the page three times larger.
 */
export function katexCss(): string {
  const dist = dirname(nodeRequire.resolve("katex"));
  const css = readFileSync(join(dist, "katex.min.css"), "utf8");
  const sources =
    /src:url\((fonts\/[^)]+\.woff2)\) format\("woff2"\),url\([^)]+\) format\("woff"\),url\([^)]+\) format\("truetype"\)/g;
  const out = css.replace(sources, (_m, path: string) => {
    const bytes = readFileSync(join(dist, path));
    return `src:url(data:font/woff2;base64,${bytes.toString("base64")}) format("woff2")`;
  });
  if (out.includes("fonts/")) throw new Error("KaTeX's stylesheet has a font source this build does not know");
  return out;
}
