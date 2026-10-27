/**
 * Where maths and code spans are in a piece of Markdown text, so that braces, `[[` and `{input}` inside them are
 * skipped (QUIZ_SYNTAX.md, "Where attributes start and end"). Works on a single paragraph or a single line.
 */
export type Span = { kind: "code" | "math"; start: number; end: number };

/** The end (exclusive) of a maths span that starts at `pos`, or -1 when `$` at `pos` does not open one. */
export function matchMath(text: string, pos: number): number {
  if (text[pos] !== "$") return -1;
  if (text[pos + 1] === "$") {
    // Display maths: up to the next unescaped `$$`.
    for (let j = pos + 2; j < text.length - 1; j++) {
      if (text[j] === "\\") j++;
      else if (text[j] === "$" && text[j + 1] === "$") return j + 2;
    }
    return -1;
  }
  // Inline maths: no space after the opening `$`, none before the closing one, and no digit straight after it,
  // so that "costs $5 and $6" stays text.
  const first = text[pos + 1];
  if (first === undefined || /\s/.test(first)) return -1;
  for (let j = pos + 1; j < text.length; j++) {
    const c = text[j];
    if (c === "\\") j++;
    else if (c === "$") {
      const before = text[j - 1] ?? "";
      const after = text[j + 1] ?? "";
      if (j > pos + 1 && !/\s/.test(before) && !/\d/.test(after)) return j + 1;
      return -1;
    }
  }
  return -1;
}

/** The end (exclusive) of a code span that starts at `pos`, or -1 when the backticks there do not open one. */
export function matchCodeSpan(text: string, pos: number): number {
  if (text[pos] !== "`") return -1;
  let n = 0;
  while (text[pos + n] === "`") n++;
  let j = pos + n;
  while (j < text.length) {
    if (text[j] !== "`") {
      j++;
      continue;
    }
    let m = 0;
    while (text[j + m] === "`") m++;
    if (m === n) return j + m;
    j += m;
  }
  return -1;
}

export function findSpans(text: string): Span[] {
  const spans: Span[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      i += 2;
    } else if (c === "`") {
      const end = matchCodeSpan(text, i);
      if (end > 0) {
        spans.push({ kind: "code", start: i, end });
        i = end;
      } else {
        while (text[i] === "`") i++;
      }
    } else if (c === "$") {
      const end = matchMath(text, i);
      if (end > 0) {
        spans.push({ kind: "math", start: i, end });
        i = end;
      } else {
        i += text[i + 1] === "$" ? 2 : 1;
      }
    } else {
      i++;
    }
  }
  return spans;
}

export function spanAt(spans: readonly Span[], pos: number): Span | undefined {
  return spans.find((s) => pos >= s.start && pos < s.end);
}

/** 1-based line of `offset` in `text`, given the line of its first character. */
export function lineAt(text: string, offset: number, firstLine: number): number {
  let line = firstLine;
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === "\n") line++;
  return line;
}
