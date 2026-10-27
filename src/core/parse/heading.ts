import { type AttrPair, findTrailingBlock, parseAttributes } from "./attributes";

export type HeadingBlock =
  | { ok: true; pairs: AttrPair[]; start: number; end: number; inner: [number, number] }
  | { ok: false; reason: string; start: number; end: number; inner: [number, number] };

/** A `#` heading line taken apart. Offsets are positions in the line. */
export type HeadingParts = {
  level: number;
  /** the heading text, without the `#`s and without the attribute block */
  text: string;
  /** the `{…}` block at the end of the line, if there is one */
  block: HeadingBlock | null;
};

/** Takes apart an ATX heading line; null when the line is not one. */
export function analyseHeading(line: string): HeadingParts | null {
  const m = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/.exec(line);
  if (!m) return null;
  const rest = m[2] ?? "";
  const offset = line.length - rest.length;
  const found = findTrailingBlock(rest);
  if (!found) return { level: m[1]?.length ?? 1, text: rest.trim(), block: null };
  const inner: [number, number] = [found.inner[0] + offset, found.inner[1] + offset];
  const parsed = parseAttributes(line, inner[0], inner[1]);
  const where = { start: found.start + offset, end: found.end + offset, inner };
  return {
    level: m[1]?.length ?? 1,
    text: found.before.trim(),
    block: parsed.ok ? { ok: true, pairs: parsed.pairs, ...where } : { ok: false, reason: parsed.reason, ...where },
  };
}

/** The heading line with the `id` pair removed, for the question hash: the pair and one space beside it go. */
export function withoutId(line: string, block: HeadingBlock | null): string {
  if (!block?.ok) return line;
  const pair = block.pairs.find((p) => p.name === "id");
  if (!pair) return line;
  let { start, end } = pair;
  if (start > block.inner[0] && /\s/.test(line[start - 1] ?? "")) start--;
  else if (/\s/.test(line[end] ?? "") && end < block.inner[1]) end++;
  return line.slice(0, start) + line.slice(end);
}
