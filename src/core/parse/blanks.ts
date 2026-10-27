import { readNumber } from "../number";
import { findSpans, lineAt, spanAt } from "./spans";

export type TextBlank = { kind: "text"; answers: string[] };
/** `raw` is the number as written, since a fraction matches within rounding. */
export type NumericBlank = { kind: "numeric"; value: number; raw: string; tolerance: number };
export type BlankBody = TextBlank | NumericBlank;
export type Blank = BlankBody & { line: number };

export type BlankProblem = { rule: "blanks.in-math" | "blanks.syntax"; line: number; message: string };

/** The blanks of a piece of text, and what is wrong with the `[[` it holds. */
export type BlankScan = { blanks: Blank[]; problems: BlankProblem[] };

/** Parses what is between `[[` and `]]`: `a|b` for text, `=0.5±0.01` (or `+-`) for a number. */
export function parseBlankBody(body: string): BlankBody | string {
  if (body.startsWith("=")) {
    const m = /^=\s*(\S+?)\s*(?:(?:±|\+-)\s*(\S+))?\s*$/.exec(body);
    if (!m) return `"[[${body}]]" is not a numeric blank: write [[=0.5]] or [[=0.5±0.01]]`;
    const raw = m[1] ?? "";
    const value = readNumber(raw);
    if (value === null) return `"${raw}" is not a number`;
    let tolerance = 0;
    if (m[2] !== undefined) {
      const t = readNumber(m[2]);
      if (t === null || t < 0) return `"${m[2]}" is not a tolerance (a number, 0 or more)`;
      tolerance = t;
    }
    return { kind: "numeric", value, raw, tolerance };
  }
  const answers = body.split("|").map((a) => a.trim());
  if (answers.some((a) => a === "")) return "a text blank has an empty answer";
  return { kind: "text", answers };
}

/**
 * Finds `[[…]]` in text. Code spans are skipped; a blank inside maths is a problem. In `code` mode (a fenced block)
 * nothing is skipped; in `math` mode (a display-maths block) every `[[` is a problem. `firstLine` is the line of
 * the text's first character.
 */
export function scanBlanks(
  text: string,
  firstLine: number,
  mode: "markdown" | "code" | "math" = "markdown",
): BlankScan {
  const spans = mode === "markdown" ? findSpans(text) : [];
  const out: BlankScan = { blanks: [], problems: [] };
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("[[", i);
    if (open < 0) break;
    const span = spanAt(spans, open);
    const line = lineAt(text, open, firstLine);
    if (mode === "math" || span?.kind === "math") {
      out.problems.push({ rule: "blanks.in-math", line, message: "a blank cannot be inside maths" });
      i = span ? span.end : open + 2;
      continue;
    }
    if (span?.kind === "code") {
      i = span.end;
      continue;
    }
    const close = text.indexOf("]]", open + 2);
    if (close < 0) {
      out.problems.push({ rule: "blanks.syntax", line, message: 'a blank opened with "[[" is never closed with "]]"' });
      break;
    }
    const parsed = parseBlankBody(text.slice(open + 2, close));
    if (typeof parsed === "string") out.problems.push({ rule: "blanks.syntax", line, message: parsed });
    else out.blanks.push({ ...parsed, line });
    i = close + 2;
  }
  return out;
}
