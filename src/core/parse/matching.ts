import type { Text } from "../ir";
import { itemText } from "./lists";
import type { ListItem } from "./outline";
import type { Reporter } from "./report";

export type Matching = {
  pairs: { line: number; left: string; right: string }[];
  distractors: Text[];
};

/**
 * Splits a matching item at its first `::`. `left :: right` is a pair, `:: right` a distractor. Returns null
 * when there is no `::` or nothing after it.
 */
export function splitPair(text: string): { left: string; right: string } | null {
  const at = text.indexOf("::");
  if (at < 0) return null;
  const right = text.slice(at + 2).trim();
  if (right === "") return null;
  return { left: text.slice(0, at).trim(), right };
}

/** The pairs of a `matching` question: at least two, every right-hand item used once. */
export function parseMatching(
  lines: readonly string[],
  items: readonly ListItem[] | null,
  headingLine: number,
  r: Reporter,
): Matching {
  const out: Matching = { pairs: [], distractors: [] };
  const rights = new Set<string>();
  // Items that were meant as pairs count even when malformed, so one bad item is not also "too few pairs".
  let attempted = 0;
  for (const item of items ?? []) {
    const t = itemText(lines, item);
    const parts = splitPair(t.text);
    if (!t.text.trimStart().startsWith("::")) attempted++;
    if (!parts) {
      const missing = !t.text.includes("::");
      r.error(
        "matching.pairs",
        t.line,
        missing ? "a matching item needs `::` between its two sides" : "a matching item needs text after `::`",
        "write left :: right, or :: right for a distractor",
      );
      continue;
    }
    if (rights.has(parts.right)) {
      r.error(
        "matching.pairs",
        t.line,
        `the right-hand item "${parts.right}" is used twice`,
        "make the right-hand items distinct",
      );
    }
    rights.add(parts.right);
    if (parts.left === "") out.distractors.push({ line: t.line, text: parts.right });
    else out.pairs.push({ line: t.line, left: parts.left, right: parts.right });
  }
  if (attempted < 2) {
    r.error(
      "matching.pairs",
      headingLine,
      "a matching question needs at least two pairs",
      "write - left :: right for each pair",
    );
  }
  return out;
}
