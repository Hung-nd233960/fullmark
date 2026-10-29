/**
 * The themes (TECHNICAL_DESIGN.md, section 8, "How it is built"): a theme is data, and this file is the only place
 * colour literals exist. Pure data and functions, so the build, the page and the tests all use it. The values are the
 * Quiz board's (docs/mockup/boards/Quiz.dc.html, the map `T`); the washes and the code colours are derived.
 */

export const THEME_NAMES = ["light", "dark", "oled", "white", "paper"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

/** What a quiz's `theme:` may be: a theme, or `auto` (light or dark, following the device). */
export type Choice = ThemeName | "auto";

export const TOKEN_NAMES = [
  "bg",
  "surface",
  "card",
  "sunken",
  "line",
  "line-strong",
  "text",
  "muted",
  "accent",
  "on-accent",
  "ok",
  "bad",
  "warn",
  "info",
  "flag",
  "hint",
  "orange",
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];
export type Tokens = Record<TokenName, string>;

export type Theme = {
  scheme: "light" | "dark";
  tokens: Tokens;
  /** a `box-shadow` value */
  shadow: string;
  /** the board's `edged`: the card's border is `line-strong` instead of `line` (OLED and white) */
  edged: boolean;
  /** the card's corner radius in px */
  radius: number;
};

export const SETS: Record<ThemeName, Theme> = {
  light: {
    scheme: "light",
    tokens: {
      bg: "#eceae5",
      surface: "#f4f3ef",
      card: "#fcfcfa",
      sunken: "#e4e2dc",
      line: "#d6d4cd",
      // board #8c8b83 is 2.85:1 on bg; this is the nearest that reaches 3:1
      "line-strong": "#88877f",
      text: "#2a2b31",
      muted: "#55554f",
      accent: "#46608a",
      "on-accent": "#fcfcfa",
      ok: "#3d6946",
      bad: "#963f3e",
      warn: "#725b1c",
      info: "#365b84",
      flag: "#b42a6f",
      hint: "#3b6884",
      orange: "#82521f",
    },
    shadow: "0 1px 2px rgb(40 38 30 / 6%), 0 2px 8px rgb(40 38 30 / 4%)",
    edged: false,
    radius: 12,
  },
  dark: {
    scheme: "dark",
    tokens: {
      bg: "#1b1d22",
      surface: "#262a31",
      card: "#2c3038",
      sunken: "#15171b",
      line: "#464c57",
      "line-strong": "#7b8394",
      text: "#d9dce2",
      muted: "#a9afba",
      // board #8fa8d4 reaches 4.39:1 on the ok wash; nearest passing value
      accent: "#92aad5",
      "on-accent": "#15171b",
      ok: "#92b99a",
      // board #d08a88 reaches 3.87:1 on the ok wash; nearest passing value
      bad: "#d29c9c",
      warn: "#cfb277",
      info: "#8fb0d6",
      // board #f27db5 reaches 4.22:1 on the ok wash; nearest passing value
      flag: "#ef89bb",
      hint: "#8dbad6",
      orange: "#d2a373",
    },
    shadow: "0 1px 3px rgb(0 0 0 / 35%)",
    edged: false,
    radius: 12,
  },
  oled: {
    scheme: "dark",
    tokens: {
      bg: "#000000",
      surface: "#0e0e10",
      card: "#0f0f11",
      sunken: "#18181b",
      line: "#303238",
      "line-strong": "#73767e",
      text: "#e0e0e0",
      muted: "#a3a5aa",
      accent: "#9fb2d4",
      "on-accent": "#000000",
      ok: "#9cc2a5",
      bad: "#d9a09d",
      warn: "#d3bf91",
      info: "#a0b8d6",
      flag: "#e3a3c2",
      hint: "#9fc0d4",
      orange: "#d8b08a",
    },
    shadow: "none",
    edged: true,
    radius: 12,
  },
  white: {
    scheme: "light",
    tokens: {
      bg: "#ffffff",
      surface: "#ffffff",
      card: "#ffffff",
      sunken: "#f2f2f2",
      line: "#c9c9c9",
      "line-strong": "#767676",
      text: "#1a1a1a",
      muted: "#575757",
      accent: "#1f4f8f",
      "on-accent": "#ffffff",
      ok: "#2f6f3a",
      bad: "#b02a26",
      warn: "#7f5d00",
      info: "#1f5f9e",
      flag: "#c2246c",
      hint: "#24678c",
      orange: "#9c520f",
    },
    shadow: "none",
    edged: true,
    radius: 4,
  },
  paper: {
    scheme: "light",
    tokens: {
      bg: "#f6f1e7",
      surface: "#efe8da",
      card: "#fbf8f1",
      sunken: "#ebe3d3",
      line: "#dcd2bf",
      "line-strong": "#8b806c",
      text: "#37302a",
      muted: "#665b4e",
      accent: "#4c6b65",
      "on-accent": "#fbf8f1",
      ok: "#426a44",
      bad: "#97463b",
      warn: "#755a17",
      info: "#426283",
      flag: "#a92f69",
      hint: "#3e687c",
      orange: "#85521f",
    },
    shadow: "0 1px 2px rgb(70 55 30 / 7%)",
    edged: false,
    radius: 12,
  },
};

/**
 * The share of the status colour in its wash: `color-mix(in srgb, var(--ok) 12%, var(--card))`. One number for every
 * wash of every theme; 12 brings the light theme closest to the board's listed washes (sum of channel differences 18
 * over the three washes, against 38 at 10 and 25 at 14).
 */
export const WASH_PERCENT = 12;

/** The three washes: the status colour that gives each its hue. */
export const WASHES = { "ok-wash": "ok", "bad-wash": "bad", "info-wash": "info" } as const;
export type WashName = keyof typeof WASHES;

// ---- colour arithmetic (sRGB, as CSS does it) ----

type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const toHex = (rgb: Rgb): string => `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

/** `color-mix(in srgb, a share%, b)`, rounded to the 8-bit channels a screen shows */
export function mix(a: string, share: number, b: string): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex(x.map((c, i) => Math.round((c * share) / 100 + (y[i] as number) * (1 - share / 100))) as Rgb);
}

/** WCAG relative luminance */
function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two colours, 1 to 21 */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** A wash as the CSS mixes it, for the contrast test */
export const washOf = (tokens: Tokens, wash: WashName): string => mix(tokens[WASHES[wash]], WASH_PERCENT, tokens.card);

// ---- code colours ----

/** Which token each role of highlighted code takes (design, "How it is built" 3). `link` is a gap in the design: `info`. */
export const CODE_ROLES = {
  comment: "muted",
  keyword: "accent",
  string: "ok",
  "string-expression": "ok",
  constant: "info",
  parameter: "warn",
  function: "flag",
  punctuation: "text",
  link: "info",
} as const;
export type CodeRole = keyof typeof CODE_ROLES;

/** AA for text */
export const TEXT_RATIO = 4.5;

/** Moves `color` toward `toward` in 5% steps until it reaches `ratio` on `ground` (0.x's `_legible()`). */
export function legible(color: string, toward: string, ground: string, ratio = TEXT_RATIO): string {
  for (let share = 0; share <= 100; share += 5) {
    const next = mix(toward, share, color);
    if (contrast(next, ground) >= ratio) return next;
  }
  return toward;
}

/** The `--fm-code-*` colours of a theme: the roles from its tokens, each nudged until it reads on the code background. */
export function codeColours(tokens: Tokens): Record<string, string> {
  const out: Record<string, string> = {
    foreground: tokens.text,
    background: tokens.sunken,
  };
  for (const [role, token] of Object.entries(CODE_ROLES)) {
    out[`token-${role}`] = legible(tokens[token], tokens.text, tokens.sunken);
  }
  return out;
}

// ---- the CSS ----

const setOf = (theme: Theme): string => {
  const t = theme.tokens;
  const parts = TOKEN_NAMES.map((n) => `--${n}:${t[n]}`);
  parts.push(`--shadow:${theme.shadow}`);
  parts.push(`--card-line:var(--${theme.edged ? "line-strong" : "line"})`);
  parts.push(`--card-radius:${theme.radius}px`);
  for (const [name, value] of Object.entries(codeColours(t))) parts.push(`--fm-code-${name}:${value}`);
  parts.push(`color-scheme:${theme.scheme}`);
  return parts.join(";");
};

/**
 * The token CSS a page carries: all five sets, each a rule on `:root[data-theme="<name>"]`. The set the quiz opens in
 * is also the plain `:root` rule (`auto` opens as `light`; the page switches it at once when the device is dark), so
 * no `data-theme` is needed for it. The washes are the same rule for every theme.
 */
export function themeCss(quiz: Choice): string {
  const first: ThemeName = quiz === "auto" ? "light" : quiz;
  const rules = THEME_NAMES.map((name) => {
    const selector = `:root[data-theme="${name}"]`;
    return `${name === first ? `:root,${selector}` : selector}{${setOf(SETS[name])}}`;
  });
  const washes = Object.entries(WASHES).map(
    ([wash, token]) => `--${wash}:color-mix(in srgb,var(--${token}) ${WASH_PERCENT}%,var(--card))`,
  );
  const common = `:root{${washes.join(";")};--font:"Segoe UI",system-ui,-apple-system,Roboto,"Noto Sans",sans-serif;--mono:"Cascadia Code",Consolas,Menlo,monospace}`;
  return `@layer tokens,base,components;@layer tokens{${common}${rules.join("")}}`;
}

// ---- which theme is shown ----

/** What the page shows: `auto` follows the device; high contrast turns `light` and `paper` into `white`, `dark` into `oled`. */
export function shownTheme(choice: Choice, device: { dark: boolean; more: boolean }): ThemeName {
  const base: ThemeName = choice === "auto" ? (device.dark ? "dark" : "light") : choice;
  if (!device.more) return base;
  if (base === "light" || base === "paper") return "white";
  if (base === "dark") return "oled";
  return base;
}

export const isChoice = (x: unknown): x is Choice => x === "auto" || (THEME_NAMES as readonly unknown[]).includes(x);
