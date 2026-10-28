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
