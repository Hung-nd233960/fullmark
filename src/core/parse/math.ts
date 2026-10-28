import { createMarkdown } from "./markdown";
import type { Reporter } from "./report";
import { mathParts, type ParseTex } from "./tex";

/** Raises `math.syntax` for each maths span that `parseTex` rejects. `offset` turns outline lines into issue lines. */
export function mathIssues(
  maths: readonly { content: string; line: number }[],
  offset: number,
  parseTex: ParseTex,
  r: Reporter,
): void {
  for (const m of maths) {
    const { tex, display } = mathParts(m.content);
    const problem = parseTex(tex, display);
    if (problem !== null) {
      r.error(
        "math.syntax",
        m.line + offset,
        `the maths does not parse: ${problem}`,
        "check the TeX between the `$` signs",
      );
    }
  }
}

let reader: ReturnType<typeof createMarkdown> | undefined;

/**
 * Checks the maths spans of one string that the page renders as Markdown but that sits outside the quiz's text: a
 * value in an `answer` block (a field or scale label, a rubric criterion, a `sample_answer`). Each bad span is
 * reported at `line`, the line of its key.
 */
export function stringMathIssues(text: string, line: number, parseTex: ParseTex, r: Reporter): void {
  if (!text.includes("$")) return;
  reader ??= createMarkdown();
  const spans: { content: string; line: number }[] = [];
  for (const token of reader.parse(text, {})) {
    if (token.type === "math_block") spans.push({ content: token.content, line: 0 });
    for (const child of token.children ?? []) {
      if (child.type === "math_inline") spans.push({ content: child.content, line: 0 });
    }
  }
  mathIssues(spans, line, parseTex, r);
}
