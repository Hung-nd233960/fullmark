export const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * TEST-ONLY. Ids from a seeded generator (mulberry32 over the seed's characters), so the golden files of `quiz ids`
 * are stable. It is switched on by the environment variable `FULLMARK_TEST_SEED`, which only `main.ts` reads; the
 * ids it makes are predictable, so it is never to be used for a real quiz.
 */
export function seededIds(seed: string): (used: ReadonlySet<string>) => string {
  let state = 0x811c9dc5;
  for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0), 0x01000193) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return (used) => {
    for (;;) {
      let id = "q-";
      for (let i = 0; i < 6; i++) id += ALPHABET[Math.floor(next() * ALPHABET.length)];
      if (!used.has(id)) return id;
    }
  };
}
