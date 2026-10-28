const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * The seed the page draws when the learner presses Start: 8 characters from `[a-z0-9]` (TECHNICAL_DESIGN.md, section 4,
 * "Seeds"). `bytes` gives random bytes; bytes that would favour some characters are skipped, so each is equally likely.
 */
export function drawSeed(bytes: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  let seed = "";
  while (seed.length < 8) {
    for (const b of bytes(16)) {
      if (b < 252 && seed.length < 8) seed += ALPHABET[b % 36];
    }
  }
  return seed;
}
