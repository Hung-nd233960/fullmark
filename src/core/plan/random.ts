import { sha256Hex } from "../hash";

/**
 * A seeded random generator of our own (mulberry32, started from the SHA-256 of the seed), so that a seed gives the
 * same draw on every machine and in the page. `Math.random()` is never used in `core`.
 */
export function random(seed: string): () => number {
  let a = Number.parseInt(sha256Hex(seed).slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A copy of `items` in a seeded random order (Fisher-Yates). */
export function shuffled<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}
