import { describe, expect, it } from "vitest";
import { fontBytes } from "../../src/build/fonts";
import { EMBEDDABLE, FONT_REGISTRY, type FontFile, SUBSETS } from "../../src/core/fonts";
import { woff2CodePoints } from "../helpers/woff2";

/**
 * Every embedded font has a glyph for every Vietnamese letter with every tone, read from the font files' `cmap`
 * (TECHNICAL_DESIGN.md, section 8, "Fonts (v1)" and section 9, "Stacked diacritics").
 */

const BASES = ["a", "ă", "â", "e", "ê", "i", "o", "ô", "ơ", "u", "ư", "y"];
const TONES = ["", "̀", "̉", "̃", "́", "̣"]; // bare, grave, hook above, tilde, acute, dot below

/** Every Vietnamese letter as NFC code points: 12 bases x 6 tones, both cases, and đ Đ. */
const LETTERS: string[] = [
  ...BASES.flatMap((b) => TONES.flatMap((t) => [(b + t).normalize("NFC"), (b.toUpperCase() + t).normalize("NFC")])),
  "đ",
  "Đ",
];

const point = (letter: string): number => {
  if ([...letter].length !== 1) throw new Error(`${letter} is not one NFC code point`);
  return letter.codePointAt(0) as number;
};

/** A CSS `unicode-range` as a test of one code point. */
function inRange(range: string): (cp: number) => boolean {
  const spans = range.split(",").map((part) => {
    const [from, to] = part.trim().slice(2).split("-");
    return [Number.parseInt(from as string, 16), Number.parseInt((to ?? from) as string, 16)] as const;
  });
  return (cp) => spans.some(([a, b]) => cp >= a && cp <= b);
}

const cmaps = new Map<string, Set<number>>();
const cmapOf = (file: FontFile): Set<number> => {
  let c = cmaps.get(file.path);
  if (c === undefined) {
    c = woff2CodePoints(fontBytes(file.path));
    cmaps.set(file.path, c);
  }
  return c;
};

describe("the letter list", () => {
  it("is 12 bases x 6 tones x 2 cases + đ Đ = 146 distinct NFC code points", () => {
    expect(LETTERS).toHaveLength(146);
    expect(new Set(LETTERS).size).toBe(146);
  });
});

for (const id of EMBEDDABLE) {
  const entry = FONT_REGISTRY[id];
  describe(`${entry.family}: Vietnamese glyphs`, () => {
    for (const style of ["normal", "italic"] as const) {
      const files = entry.files.filter((f) => f.style === style);
      if (files.length === 0) continue;

      it(`${style}: every letter has a glyph in the union of its subsets`, () => {
        const union = new Set(files.flatMap((f) => [...cmapOf(f)]));
        const missing = LETTERS.filter((l) => !union.has(point(l)));
        expect(missing, `${entry.family} ${style} lacks ${missing.join(" ")}`).toEqual([]);
      });

      it(`${style}: every letter is in the unicode-range of a file whose cmap has it`, () => {
        for (const letter of LETTERS) {
          const cp = point(letter);
          const served = files.some((f) => cmapOf(f).has(cp) && inRange(f.range)(cp));
          expect(served, `${letter} (U+${cp.toString(16).toUpperCase()}) in ${entry.family} ${style}`).toBe(true);
        }
      });

      it(`${style}: the three subsets are all present, and the ranges do not claim a glyph the file lacks in Vietnamese`, () => {
        expect([...new Set(files.map((f) => f.subset))].sort()).toEqual([...SUBSETS].sort());
        const vi = files.find((f) => f.subset === "vietnamese") as FontFile;
        const inside = inRange(vi.range);
        for (const letter of LETTERS) {
          const cp = point(letter);
          if (inside(cp)) {
            // a letter the Vietnamese range claims must be in that file, or the browser would show a fallback glyph
            expect(cmapOf(vi).has(cp), `${letter} is in the vietnamese range of ${vi.path} but not its cmap`).toBe(
              true,
            );
          }
        }
      });
    }

    it("each file's name says what the registry says (the path, the subset)", () => {
      for (const f of entry.files) expect(f.path).toContain(`-${f.subset}-`);
    });
  });
}
