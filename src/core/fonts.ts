import type { FONTS } from "./ir";

/**
 * The font registry (TECHNICAL_DESIGN.md, section 8, "Fonts (v1)"): one entry per `font`, with its stack, its files, its
 * size adjustment and its notice. Pure data and pure functions; the CLI reads the files and passes their bytes in.
 */

export type FontId = (typeof FONTS)[number];
/** `--fonts`: which fonts a page embeds (and so offers). */
export const FONT_CHOICES = ["quiz", "all", "none"] as const;
export type FontsChoice = (typeof FONT_CHOICES)[number];

/** The OS stack: made for screens, zero bytes, full Vietnamese coverage. */
export const SYSTEM_STACK = '"Segoe UI",system-ui,-apple-system,Roboto,"Noto Sans",sans-serif';

const RANGE = {
  latin:
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  "latin-ext":
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
  vietnamese:
    "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB",
} as const;
/** Source Serif 4's Latin-extended subset reaches U+20C4. */
const SERIF_LATIN_EXT = RANGE["latin-ext"].replace("U+20AD-20C0", "U+20AD-20C4");

export type Subset = keyof typeof RANGE;
export const SUBSETS: readonly Subset[] = ["latin", "latin-ext", "vietnamese"];

/** One `@font-face`: a WOFF2 file of an npm package, for one subset, style and weight (or weight range). */
export type FontFile = {
  /** the path inside the npm package, such as `@fontsource/be-vietnam-pro/files/…woff2`; also the stored-once key */
  path: string;
  subset: Subset;
  style: "normal" | "italic";
  /** a CSS `font-weight`: one weight for a static file, a range for a variable one */
  weight: string;
  range: string;
};

export type FontEntry = {
  id: FontId;
  /** the family name, also the pill's text */
  family: string | null;
  /** the value of `--font` */
  stack: string;
  /** `size-adjust` in percent, so this font's x-height matches the system font's (0.5 em); `null`: none */
  sizeAdjust: number | null;
  files: readonly FontFile[];
  /** the npm package the files come from: its notice is in src/build/notices-data.ts, made by `npm run notices` */
  package: string | null;
};

const staticFiles = (pkg: string, weights: readonly string[]): FontFile[] =>
  weights.flatMap((weight) =>
    (["normal", "italic"] as const).flatMap((style) =>
      SUBSETS.map((subset) => ({
        path: `${pkg}/files/be-vietnam-pro-${subset}-${weight}-${style}.woff2`,
        subset,
        style,
        weight,
        range: RANGE[subset],
      })),
    ),
  );

const variableFiles = (
  pkg: string,
  name: string,
  weight: string,
  styles: readonly ("normal" | "italic")[],
  ext: string,
) =>
  styles.flatMap((style) =>
    SUBSETS.map((subset) => ({
      path: `${pkg}/files/${name}-${subset}-wght-${style}.woff2`,
      subset,
      style,
      weight,
      range: subset === "latin-ext" ? ext : RANGE[subset],
    })),
  );

const stackOf = (family: string): string => `"${family}",${SYSTEM_STACK}`;

export const FONT_REGISTRY: Readonly<Record<FontId, FontEntry>> = {
  system: { id: "system", family: null, stack: SYSTEM_STACK, sizeAdjust: null, files: [], package: null },
  sans: {
    id: "sans",
    family: "Be Vietnam Pro",
    stack: stackOf("Be Vietnam Pro"),
    sizeAdjust: 94.3,
    files: staticFiles("@fontsource/be-vietnam-pro", ["400", "700"]),
    package: "@fontsource/be-vietnam-pro",
  },
  serif: {
    id: "serif",
    family: "Source Serif 4",
    stack: stackOf("Source Serif 4"),
    sizeAdjust: 105.3,
    files: variableFiles(
      "@fontsource-variable/source-serif-4",
      "source-serif-4",
      "200 900",
      ["normal", "italic"],
      SERIF_LATIN_EXT,
    ),
    package: "@fontsource-variable/source-serif-4",
  },
  readable: {
    id: "readable",
    family: "Lexend",
    stack: stackOf("Lexend"),
    sizeAdjust: 95.2,
    files: variableFiles("@fontsource-variable/lexend", "lexend", "100 900", ["normal"], RANGE["latin-ext"]),
    package: "@fontsource-variable/lexend",
  },
};

/** The embeddable fonts, in the order the menu shows them. */
export const EMBEDDABLE: readonly FontId[] = ["sans", "serif", "readable"];

/** The fonts a page embeds for a quiz's font and the `--fonts` choice (section 8, "Which fonts a page carries"). */
export function embeddedFonts(choice: FontsChoice, quizFont: FontId): FontId[] {
  if (choice === "none") return [];
  if (choice === "all") return [...EMBEDDABLE];
  return quizFont === "system" ? [] : [quizFont];
}

/** The fonts the Appearance menu offers: `system` first, then what is embedded. */
export function offeredFonts(choice: FontsChoice, quizFont: FontId): FontId[] {
  return ["system", ...embeddedFonts(choice, quizFont)];
}

/** Every font file a set of fonts uses, each once (a file is stored once on a page). */
export function filesOf(fonts: readonly FontId[]): FontFile[] {
  const seen = new Set<string>();
  const out: FontFile[] = [];
  for (const id of fonts) {
    for (const file of FONT_REGISTRY[id].files) {
      const key = `${file.path}|${file.weight}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(file);
    }
  }
  return out;
}

/**
 * The `@font-face` rules of the embedded fonts. `dataUri` turns a file's package path into its `data:` URI; each file is
 * asked for once per file, however many rules use it.
 */
export function fontFaceCss(fonts: readonly FontId[], dataUri: (path: string) => string): string {
  const uris = new Map<string, string>();
  const rules: string[] = [];
  for (const id of fonts) {
    const entry = FONT_REGISTRY[id];
    for (const file of entry.files) {
      let uri = uris.get(file.path);
      if (uri === undefined) {
        uri = dataUri(file.path);
        uris.set(file.path, uri);
      }
      const adjust = entry.sizeAdjust === null ? "" : `size-adjust:${entry.sizeAdjust}%;`;
      rules.push(
        `@font-face{font-family:"${entry.family}";font-style:${file.style};font-weight:${file.weight};font-display:block;${adjust}src:url(${uri}) format("woff2");unicode-range:${file.range}}`,
      );
    }
  }
  return rules.join("");
}

/** A rule per offered font that sets `--font` on the root: the Appearance menu's choice is `data-font` on `<html>`. */
export function fontRulesCss(offered: readonly FontId[]): string {
  return offered.map((id) => `:root[data-font="${id}"]{--font:${FONT_REGISTRY[id].stack}}`).join("");
}
