/**
 * Exact decimal arithmetic for rubrics (TECHNICAL_DESIGN.md, section 6). Marks and bands are decimals such as 0.25
 * and 6.5, and a float cannot be trusted to round them: (6 + 6.5 + 6.5 + 6) / 4 is exactly 6.25, but 0.35 / 0.1 is
 * 3.4999999999999996. So every number is scaled to an integer (BigInt) by a power of ten, and the sums, means and
 * roundings are done on the integers. The same inputs give the same answer on every machine.
 */

/** How many decimals a number is written with (`0.25` is 2, `1e-7` is 7), up to 9. */
export function decimalsOf(x: number): number {
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(Math.abs(x)));
  if (!m) return 0;
  return Math.min(9, Math.max(0, (m[2]?.length ?? 0) - Number(m[3] ?? 0)));
}

/** The largest number of decimals among these numbers. */
export const decimalsAmong = (...xs: number[]): number => xs.reduce((d, x) => Math.max(d, decimalsOf(x)), 0);

/** `x` as an integer count of `10^-d`. Only exact when `d` covers the decimals of `x`. */
export const scaled = (x: number, d: number): bigint => BigInt(Math.round(x * 10 ** d));

/** An integer count of `10^-d` as a number: the double nearest to that decimal. */
export const unscaled = (n: bigint, d: number): number => Number(n) / 10 ** d;

/** Whether `value` is a whole number of `step`s, counted from `from` (default 0). `step` must be above 0. */
export function isMultiple(value: number, step: number, from = 0): boolean {
  if (!(step > 0) || !Number.isFinite(value)) return false;
  const d = decimalsAmong(value, step, from);
  return (scaled(value, d) - scaled(from, d)) % scaled(step, d) === 0n;
}

/** Floor division and half-up division of integers where the denominator is positive. */
const floorDiv = (n: bigint, d: bigint): bigint => (n >= 0n ? n / d : -((-n + d - 1n) / d));
const halfUp = (n: bigint, d: bigint): bigint => floorDiv(2n * n + d, 2n * d);

/** The sum of marks that are multiples of `step`: exact, a number with no float noise. */
export function sumMarks(marks: readonly number[]): number {
  const d = decimalsAmong(...marks);
  return unscaled(
    marks.reduce((sum, m) => sum + scaled(m, d), 0n),
    d,
  );
}

export type RoundRule = "nearest-step" | "down" | "ielts";
export type Scale = { min: number; max: number; step: number };

/**
 * The overall band of a banded rubric: the weighted mean of the bands, rounded by the rule.
 *
 * - `nearest-step`: to the nearest step of the scale (counted from `scale.min`), a tie going up.
 * - `down`: down to the step below.
 * - `ielts`: to the nearest half band, a tie going up, so .25 becomes .5 and .75 the next whole band.
 *
 * The result is never above `scale.max` or below `scale.min`.
 */
export function overallBand(
  bands: readonly number[],
  weights: readonly number[],
  scale: Scale,
  round: RoundRule,
): number {
  const d = decimalsAmong(scale.min, scale.max, scale.step, 0.5, ...bands);
  const dw = decimalsAmong(...weights);
  const w = weights.map((x) => scaled(x, dw));
  const b = bands.map((x) => scaled(x, d));
  const num = w.reduce((sum, wi, i) => sum + wi * (b[i] ?? 0n), 0n);
  const den = w.reduce((sum, wi) => sum + wi, 0n);
  const unit = round === "ielts" ? scaled(0.5, d) : scaled(scale.step, d);
  const origin = round === "ielts" ? 0n : scaled(scale.min, d);
  const above = num - origin * den; // the mean's distance from the origin, times `den`
  const steps = round === "down" ? floorDiv(above, den * unit) : halfUp(above, den * unit);
  const band = origin + steps * unit;
  const low = scaled(scale.min, d);
  const high = scaled(scale.max, d);
  let clamped = band;
  if (clamped < low) clamped = low;
  if (clamped > high) clamped = high;
  return unscaled(clamped, d);
}

/** `points × band / scale.max`, to two decimals, halves up (TECHNICAL_DESIGN.md, section 6). */
export function bandPoints(points: number, band: number, scaleMax: number): number {
  if (!(scaleMax > 0)) return points;
  const d = decimalsAmong(points, band, scaleMax);
  const hundredths = halfUp(100n * scaled(points, d) * scaled(band, d), scaled(scaleMax, d) * 10n ** BigInt(d));
  return Number(hundredths) / 100;
}
