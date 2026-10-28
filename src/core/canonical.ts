import { sha256Hex } from "./hash";

/**
 * Canonical JSON (TECHNICAL_DESIGN.md, section 6): keys sorted at every level by code unit, no white space, arrays
 * in order, strings and numbers as `JSON.stringify` writes them. A key whose value is `undefined` is left out, as in
 * JSON itself. The one function behind `rubric_hash` and `results_hash`, so reformatting a file never changes them.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** SHA-256, lower-case hex, of the canonical JSON of a value. */
export function canonicalHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
