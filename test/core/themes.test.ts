import { describe, expect, it } from "vitest";
import {
  CODE_ROLES,
  codeColours,
  contrast,
  SETS,
  shownTheme,
  TEXT_RATIO,
  THEME_NAMES,
  type ThemeName,
  type TokenName,
  type Tokens,
  themeCss,
  WASHES,
  washOf,
} from "../../src/core/themes";

const TEXT: TokenName[] = ["text", "muted", "accent", "ok", "bad", "warn", "info", "flag", "hint", "orange"];
const SURFACES: TokenName[] = ["bg", "surface", "card", "sunken"];
const ICONS: TokenName[] = ["muted", "accent", "ok", "bad", "warn", "info", "flag", "hint", "orange"];

/** Every pair that fails, as "theme: a on b = ratio" */
function failures(name: ThemeName): string[] {
  const t: Tokens = SETS[name].tokens;
  const theme = SETS[name];
  const bad: string[] = [];
  const check = (a: string, b: string, bLabel: string, aLabel: string, need: number): void => {
    const r = contrast(a, b);
    if (r < need) bad.push(`${name}: ${aLabel} on ${bLabel} = ${r.toFixed(2)} (needs ${need})`);
  };
  for (const text of TEXT) {
    for (const s of SURFACES) check(t[text], t[s], s, text, TEXT_RATIO);
    for (const w of Object.keys(WASHES) as (keyof typeof WASHES)[])
      check(t[text], washOf(theme, w), w, text, TEXT_RATIO);
  }
  check(t["on-accent"], t.accent, "accent", "on-accent", TEXT_RATIO);
  for (const s of ["card", "bg"] as const) {
    check(t["line-strong"], t[s], s, "line-strong", 3);
    for (const icon of ICONS) check(t[icon], t[s], s, icon, 3);
  }
  const code = codeColours(t);
  for (const [key, value] of Object.entries(code)) {
    if (key === "background") continue;
    check(value, code.background as string, "code background", `code ${key}`, TEXT_RATIO);
  }
  return bad;
}

describe("the contrast of every theme (WCAG AA)", () => {
  for (const name of THEME_NAMES) {
    it(`${name}: text, borders, icons and code colours`, () => {
      expect(failures(name)).toEqual([]);
    });
  }
});

describe("the code colours", () => {
  it("take their roles from the tokens, and move only toward the text colour", () => {
    const light = SETS.light.tokens;
    const code = codeColours(light);
    expect(code.foreground).toBe(light.text);
    expect(code.background).toBe(light.sunken);
    expect(Object.keys(CODE_ROLES).every((r) => `token-${r}` in code)).toBe(true);
    // the string colour is `ok` where `ok` is already legible on the code background
    expect(code["token-string"]).toBe(light.ok);
  });
});

describe("the token CSS", () => {
  it("carries five sets and writes the quiz's theme as the plain :root rule", () => {
    for (const name of THEME_NAMES) expect(themeCss(name).match(/:root\[data-theme="/g)?.length).toBe(5);
    expect(themeCss("paper")).toContain(':root,:root[data-theme="paper"]{');
    expect(themeCss("auto")).toContain(':root,:root[data-theme="light"]{');
    expect(themeCss("dark")).not.toContain(':root,:root[data-theme="light"]');
    expect(themeCss("oled")).toContain("color-scheme:dark");
  });

  it("derives the washes from the tokens", () => {
    expect(themeCss("light")).toContain("--ok-wash:color-mix(in srgb,var(--ok) 13%,var(--card))");
  });

  it("gives each theme its own wash percentages", () => {
    const css = themeCss("light");
    expect(css).toContain(`--ok-wash:color-mix(in srgb,var(--ok) ${SETS.dark.wash["ok-wash"]}%,var(--card))`);
    expect(css).toContain(`--info-wash:color-mix(in srgb,var(--info) ${SETS.oled.wash["info-wash"]}%,var(--card))`);
  });

  it("is the same for the same theme", () => {
    expect(themeCss("white")).toBe(themeCss("white"));
  });
});

describe("which theme is shown", () => {
  const device = (dark: boolean, more: boolean) => ({ dark, more });
  it("follows the device for auto", () => {
    expect(shownTheme("auto", device(false, false))).toBe("light");
    expect(shownTheme("auto", device(true, false))).toBe("dark");
  });
  it("keeps a named theme whatever the device", () => {
    expect(shownTheme("paper", device(true, false))).toBe("paper");
  });
  it("turns light and paper into white and dark into oled under high contrast", () => {
    expect(shownTheme("light", device(false, true))).toBe("white");
    expect(shownTheme("paper", device(false, true))).toBe("white");
    expect(shownTheme("dark", device(false, true))).toBe("oled");
    expect(shownTheme("auto", device(true, true))).toBe("oled");
    expect(shownTheme("oled", device(false, true))).toBe("oled");
    expect(shownTheme("white", device(false, true))).toBe("white");
  });
});
