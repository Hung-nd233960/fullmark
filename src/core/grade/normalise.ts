/**
 * The one text normaliser of the grader (TECHNICAL_DESIGN.md, section 2): a byte-order mark and zero-width no-break
 * spaces go, the text becomes NFC, runs of white space (any script's) become one space, the ends are trimmed, and
 * case is folded unless `caseSensitive`. Case folding is `toLowerCase()`, which never depends on the locale, and
 * covers `Đ`. The page and `quiz grade` both come through here, so they cannot disagree.
 */
export function normalise(text: string, caseSensitive = false): string {
  const t = text.replaceAll("﻿", "").normalize("NFC").replace(/\s+/gu, " ").trim();
  return caseSensitive ? t : t.toLowerCase();
}

/** The words of an essay: runs of non-white-space. (A Vietnamese syllable is a word, as it is in a word counter.) */
export function countWords(text: string): number {
  const t = text.replaceAll("﻿", "").trim();
  return t === "" ? 0 : t.split(/\s+/u).length;
}
