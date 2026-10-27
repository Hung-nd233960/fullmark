/**
 * The one number reader: an integer, a decimal, `1e-3` or a fraction `1/3` (QUIZ_SYNTAX.md, numeric).
 * Source files always use a decimal point; a learner's answer in a `lang: vi` quiz may use a decimal comma.
 * Thousands separators are never accepted. Returns null when the text is not a number.
 */
export function readNumber(text: string, options: { decimalComma?: boolean } = {}): number | null {
  let s = text.trim();
  if (options.decimalComma && !s.includes(".") && /^[+-]?\d+,\d+(?:[eE][+-]?\d+)?$/.test(s)) s = s.replace(",", ".");
  const fraction = /^([+-]?\d+)\/(\d+)$/.exec(s);
  if (fraction) {
    const bottom = Number(fraction[2]);
    return bottom === 0 ? null : Number(fraction[1]) / bottom;
  }
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** True when the text is written as a fraction, which matches within rounding (QUIZ_SYNTAX.md, numeric). */
export function isFraction(text: string): boolean {
  return /^[+-]?\d+\/\d+$/.test(text.trim());
}

/** A duration such as `90s`, `45m` or `1h30m`, in seconds; null when it is not one or is zero. */
export function readDuration(text: string): number | null {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text.trim());
  if (!m || (m[1] === undefined && m[2] === undefined && m[3] === undefined)) return null;
  const seconds = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return seconds > 0 ? seconds : null;
}
