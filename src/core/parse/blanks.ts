import { readNumber } from "../number";
import { createMarkdown } from "./markdown";
import { findSpans, lineAt, spanAt } from "./spans";

export type TextBlank = { kind: "text"; answers: string[] };
/** `raw` is the number as written, since a fraction matches within rounding. */
export type NumericBlank = { kind: "numeric"; value: number; raw: string; tolerance: number };
export type BlankBody = TextBlank | NumericBlank;
export type Blank = BlankBody & { line: number };

export type BlankProblem = { rule: "blanks.in-math" | "blanks.syntax"; line: number; message: string };

/** The blanks of a piece of text, and what is wrong with the `[[` it holds. */
export type BlankScan = {
  blanks: Blank[];
  /** for each blank, where its `[[` starts and its `]]` ends in the scanned text (end exclusive) */
  at: { start: number; end: number }[];
  problems: BlankProblem[];
};

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
  const out: BlankScan = { blanks: [], at: [], problems: [] };
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("[[", i);
    if (open < 0) break;
    if (mode === "markdown" && backslashesBefore(text, open) % 2 === 1) {
      // `\[[` is text: the first bracket is escaped
      i = open + 1;
      continue;
    }
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
    else {
      out.blanks.push({ ...parsed, line });
      out.at.push({ start: open, end: close + 2 });
    }
    i = close + 2;
  }
  return out;
}

function backslashesBefore(text: string, pos: number): number {
  let n = 0;
  while (pos - n > 0 && text[pos - n - 1] === "\\") n++;
  return n;
}

const MARK_OPEN = String.fromCharCode(0xe000);
const MARK_CLOSE = String.fromCharCode(0xe001);
const MARKER = new RegExp(`${MARK_OPEN}([0-9]+)${MARK_CLOSE}`, "g");

/** made once: building a markdown-it costs more than reading a line with it */
let linkMarkdown: ReturnType<typeof createMarkdown> | undefined;

/**
 * The indices of the scanned blanks that sit inside a link's text or an image's alt text. Each blank is swapped for a
 * marker, the text is read as inline Markdown, and a marker found under a link or in an image's alt text is a hit.
 */
export function blanksInLinkText(text: string, scan: BlankScan): number[] {
  if (scan.at.length === 0) return [];
  let marked = text;
  for (let i = scan.at.length - 1; i >= 0; i--) {
    const at = scan.at[i] as { start: number; end: number };
    marked = `${marked.slice(0, at.start)}${MARK_OPEN}${i}${MARK_CLOSE}${marked.slice(at.end)}`;
  }
  const hits = new Set<number>();
  const note = (s: string) => {
    for (const m of s.matchAll(MARKER)) hits.add(Number(m[1]));
  };
  const tokens = (linkMarkdown ??= createMarkdown()).parseInline(marked, {});
  let depth = 0;
  for (const child of tokens[0]?.children ?? []) {
    if (child.type === "link_open") depth++;
    else if (child.type === "link_close") depth--;
    else if (child.type === "image") note(child.content);
    else if (depth > 0) note(child.content);
  }
  return [...hits].sort((a, b) => a - b);
}
