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
      // the classes of the maths rendered so far: they decide which of KaTeX's fonts the page embeds
      const used = new Set<string>();
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
          classesOf(html, used);
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
          return `${katexCss(used)}\n${rules.join("\n")}`;
        },
      };
    },
  };
}

/** The distinct class lists of the elements in some HTML, each as a sorted, space-joined string. */
export function classesOf(html: string, into: Set<string> = new Set()): Set<string> {
  for (const m of html.matchAll(/\sclass="([^"]*)"/g)) {
    const names = (m[1] ?? "").split(/\s+/).filter((name) => name !== "");
    if (names.length > 0) into.add([...new Set(names)].sort().join(" "));
  }
  return into;
}

/** One font face of KaTeX: its family, weight and style, as the `@font-face` rule and the style rules name them. */
const faceKey = (family: string, weight: string, style: string): string => `${family}|${weight}|${style}`;
const unquote = (family: string): string => family.replace(/["']/g, "");
const weightOf = (value: string): string => (value === "bold" ? "700" : value === "normal" ? "400" : value);

/**
 * The font faces the maths of a page uses, from the class lists of the elements its HTML carries. Each style rule of KaTeX's stylesheet that
 * names a `KaTeX_*` family counts when one of its selectors is met by the page's elements; the rule's own weight and
 * style are kept, and where it states none the face is normal or, when a rule that only sets bold or italic (`\textbf`, `\textit`) is
 * used too, bold or italic as well (they nest). The page's root, `.katex`, is always set in Main. A face is kept only if the stylesheet
 * declares it.
 */
function usedFaces(rules: string, elements: ReadonlySet<string>): Set<string> {
  const lists = [...elements].map((e) => new Set(e.split(" ")));
  // a compound selector (`.delimsizing.size3`) is met when one element carries all its classes
  const met = (compound: string): boolean => {
    const names = (compound.match(/\.[A-Za-z][\w-]*/g) ?? []).map((c) => c.slice(1)).filter((c) => c !== "katex");
    return names.length === 0 || lists.some((list) => names.every((n) => list.has(n)));
  };
  const matched: { families: string[]; weight: string | null; style: string | null }[] = [];
  for (const m of rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selectors = "", body = ""] = m;
    const used = selectors.split(",").some((selector) => selector.split(/[\s>+~]+/).every(met));
    if (!used) continue;
    const family = /font-family:([^;]+)/.exec(body)?.[1];
    const weight = /font-weight:([^;]+)/.exec(body)?.[1];
    const style = /font-style:([^;]+)/.exec(body)?.[1];
    matched.push({
      families: (family?.split(",").map((f) => unquote(f.trim())) ?? []).filter((f) => f.startsWith("KaTeX_")),
      weight: weight === undefined ? null : weightOf(weight.trim()),
      style: style === undefined ? null : style.trim(),
    });
  }
  const bold = matched.some((r) => r.families.length === 0 && r.weight === "700");
  const italic = matched.some((r) => r.families.length === 0 && r.style === "italic");
  const faces = new Set<string>();
  const add = (family: string, weight: string | null, style: string | null): void => {
    for (const w of weight === null ? ["400", ...(bold ? ["700"] : [])] : [weight])
      for (const st of style === null ? ["normal", ...(italic ? ["italic"] : [])] : [style])
        faces.add(faceKey(family, w, st));
  };
  add("KaTeX_Main", null, null);
  for (const r of matched) for (const family of r.families) add(family, r.weight, r.style);
  return faces;
}

/**
 * KaTeX's stylesheet with its fonts as WOFF2 `data:` URIs, and no other source: every browser that opens a page
 * reads WOFF2, and the `woff` and `ttf` copies would only make the page three times larger. Only the `@font-face`
 * rules for the faces the page's maths uses are kept (`elements`: the class lists of its rendered maths), so a page that
 * never sets `\mathcal` does not carry Caligraphic.
 */
export function katexCss(elements: ReadonlySet<string>): string {
  const dist = dirname(nodeRequire.resolve("katex"));
  const css = readFileSync(join(dist, "katex.min.css"), "utf8");
  const faceRule = /@font-face\{[^}]*\}/g;
  const wanted = usedFaces(css.replace(faceRule, ""), elements);
  const sources =
    /src:url\((fonts\/[^)]+\.woff2)\) format\("woff2"\),url\([^)]+\) format\("woff"\),url\([^)]+\) format\("truetype"\)/g;
  const out = css.replace(faceRule, (rule) => {
    const family = unquote(/font-family:([^;]+)/.exec(rule)?.[1] ?? "");
    const style = /font-style:([^;]+)/.exec(rule)?.[1] ?? "normal";
    const weight = /font-weight:([^;]+)/.exec(rule)?.[1] ?? "400";
    if (!wanted.has(faceKey(family, weightOf(weight), style))) return "";
    return rule.replace(sources, (_m, path: string) => {
      const bytes = readFileSync(join(dist, path));
      return `src:url(data:font/woff2;base64,${bytes.toString("base64")}) format("woff2")`;
    });
  });
  if (out.includes("fonts/")) throw new Error("KaTeX's stylesheet has a font source this build does not know");
  return out;
}
