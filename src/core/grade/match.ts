import { isFraction, readNumber } from "../number";
import { normalise } from "./normalise";

/** What a numeric key accepts: the values, and how far a number may be from one of them. */
export type NumberTarget = {
  values: readonly number[];
  /** the values as written, since a fraction matches within rounding */
  raw: readonly string[];
  tolerance: number;
  relTolerance: number | null;
};

/**
 * Whether the learner's text is a number the key accepts. The text is read by the one number reader (`lang: vi`
 * reads a decimal comma); a number that does not parse is simply wrong. The comparison is inclusive, with a little
 * room for floating-point noise, and a value written as a fraction (`1/3`) also matches its decimal to 9 places.
 */
export function numberMatches(answer: string, key: NumberTarget, decimalComma: boolean): boolean {
  const x = readNumber(answer, { decimalComma });
  if (x === null) return false;
  return key.values.some((v, i) => {
    const slack = (isFraction(key.raw[i] ?? "") ? 1e-9 : 1e-12) * Math.max(1, Math.abs(v));
    const allowed = key.relTolerance !== null ? key.relTolerance * Math.abs(v) : key.tolerance;
    return Math.abs(x - v) <= allowed + slack;
  });
}

const compiled = new Map<string, RegExp | null>();

/** A pattern that must match the whole answer, in `u` mode (and `i` unless case matters); null if it is invalid. */
function pattern(source: string, caseSensitive: boolean): RegExp | null {
  const key = `${caseSensitive ? "s" : "i"}${source}`;
  let re = compiled.get(key);
  if (re === undefined) {
    try {
      re = new RegExp(`^(?:${source})$`, caseSensitive ? "u" : "iu");
    } catch {
      re = null;
    }
    compiled.set(key, re);
  }
  return re;
}

/** What a text key accepts: exact answers and full-match patterns. */
export type TextTarget = { accept: readonly string[]; patterns: readonly string[] };

/**
 * Whether the learner's text is one of the accepted answers (compared after `normalise`) or matches a pattern
 * (tried on the text with its spaces tidied but its case kept, so a case-sensitive pattern means what it says).
 */
export function textMatches(answer: string, key: TextTarget, caseSensitive: boolean): boolean {
  const folded = normalise(answer, caseSensitive);
  if (key.accept.some((a) => normalise(a, caseSensitive) === folded)) return true;
  const tidy = normalise(answer, true);
  return key.patterns.some((p) => pattern(p, caseSensitive)?.test(tidy) === true);
}
