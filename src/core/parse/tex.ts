/**
 * Maths spans as the parser finds them (a `math_inline` or `math_block` token holds the span with its `$` signs).
 * The TeX itself is parsed by KaTeX, which `core` never imports: a caller injects a `ParseTex`.
 */
export type ParseTex = (tex: string, display: boolean) => string | null;

/** The TeX between the dollar signs of a span's token content, and whether it is display maths. */
export function mathParts(content: string): { tex: string; display: boolean } {
  const text = content.trim();
  if (text.startsWith("$$")) {
    const inner = text.slice(2);
    return { tex: (inner.endsWith("$$") ? inner.slice(0, -2) : inner).trim(), display: true };
  }
  return { tex: text.slice(1, text.endsWith("$") ? -1 : undefined), display: false };
}
