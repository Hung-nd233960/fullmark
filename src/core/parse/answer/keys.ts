import type { NumberKey, TextKey } from "../../ir";
import { readNumber } from "../../number";
import { regexProblem } from "../../regex";
import type { Reporter } from "../report";
import { asSeq, scalarText } from "../yaml-view";
import type { MapSource } from "./source";

/** The keys that give a numeric answer (`numeric`, and a numeric field). */
export const NUMBER_KEYS = ["value", "values", "tolerance", "rel_tolerance", "unit"] as const;
/** The keys that give a text answer (`short`, and a text field). */
export const TEXT_KEYS = ["accept", "patterns"] as const;

/**
 * Reads `value` / `values`, the tolerances and `unit`. `where` is the line to report a missing key on, since
 * the problem then belongs to the whole question (or the whole field). Returns null when the key is unusable.
 */
export function readNumberKey(src: MapSource, r: Reporter, where: number): NumberKey | null {
  const value = src.get("value");
  const values = src.get("values");
  let ok = true;
  if (value && values) {
    r.error("numeric.value", Math.min(value.line, values.line), "give `value` or `values`, not both");
    ok = false;
  } else if (!value && !values) {
    r.error("numeric.value", where, "a numeric answer needs `value` or `values`", "add value: 1");
    ok = false;
  }
  const raw: string[] = [];
  const nums: number[] = [];
  const take = (text: string | null, line: number) => {
    const n = text === null ? null : readNumber(text);
    if (n === null || text === null) {
      r.error(
        "numeric.value",
        line,
        `${text === null ? "an empty value" : `"${text}"`} is not a number`,
        "write a number, a decimal point, 1e-3 or a fraction such as 1/3",
      );
      ok = false;
    } else {
      raw.push(text);
      nums.push(n);
    }
  };
  if (value) take(scalarText(value.value), value.line);
  if (values) {
    const seq = asSeq(values.value);
    if (!seq || seq.items.length === 0) {
      r.error("numeric.value", values.line, "`values` must be a list of numbers");
      ok = false;
    } else {
      for (const item of seq.items) take(scalarText(item as never), src.root.lineOf(item as never));
    }
  }
  const tol = src.get("tolerance");
  const rel = src.get("rel_tolerance");
  if (tol && rel) {
    r.error("numeric.value", Math.min(tol.line, rel.line), "give `tolerance` or `rel_tolerance`, not both");
    ok = false;
  }
  const readTol = (e: typeof tol) => {
    if (!e) return null;
    const text = scalarText(e.value);
    const n = text === null ? null : readNumber(text);
    if (n === null) {
      r.error("numeric.value", e.line, `\`${e.key}\` must be a number`);
      ok = false;
      return null;
    }
    if (n < 0) {
      r.error("numeric.value", e.line, `\`${e.key}\` cannot be negative`);
      ok = false;
      return null;
    }
    return n;
  };
  const tolerance = readTol(tol);
  const relTolerance = readTol(rel);
  const unit = src.get("unit");
  return ok
    ? { values: nums, raw, tolerance: tolerance ?? 0, relTolerance, unit: unit ? (scalarText(unit.value) ?? "") : "" }
    : null;
}

/** Reads `accept` and `patterns`, checking each pattern. */
export function readTextKey(src: MapSource, r: Reporter): TextKey {
  const strings = (key: string): { text: string; line: number }[] => {
    const e = src.get(key);
    if (!e) return [];
    const seq = asSeq(e.value);
    if (!seq) {
      r.error("syntax.value", e.line, `\`${key}\` must be a list of text`);
      return [];
    }
    const out: { text: string; line: number }[] = [];
    for (const item of seq.items) {
      const text = scalarText(item as never);
      const line = src.root.lineOf(item as never);
      if (text === null) r.error("syntax.value", line, `\`${key}\` must hold text only`);
      else out.push({ text, line });
    }
    return out;
  };
  const accept = strings("accept");
  const patterns = strings("patterns");
  for (const p of patterns) {
    const problem = regexProblem(p.text);
    if (problem) {
      r.error(
        "short.regex",
        p.line,
        `the pattern /${p.text}/ is not valid: ${problem}`,
        "patterns use JavaScript's u mode: no lookbehind, no inline flags",
      );
    }
  }
  return { accept: accept.map((a) => a.text), patterns: patterns.map((p) => p.text) };
}
