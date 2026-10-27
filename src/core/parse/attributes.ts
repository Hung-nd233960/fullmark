import { findSpans, spanAt } from "./spans";

/** One `name=value` pair, or a bare name. Offsets are positions in the line the block was found in. */
export type AttrPair = {
  name: string;
  /** null for a bare name (`input`) */
  value: string | null;
  quoted: boolean;
  start: number;
  end: number;
};

export type AttrParse = { ok: true; pairs: AttrPair[] } | { ok: false; reason: string };

/** Parses what is inside `{…}` (QUIZ_SYNTAX.md, "Where attributes start and end", rule 4). */
export function parseAttributes(line: string, from: number, to: number): AttrParse {
  const pairs: AttrPair[] = [];
  let i = from;
  const space = () => {
    while (i < to && /\s/.test(line[i] ?? "")) i++;
  };
  space();
  while (i < to) {
    const start = i;
    const name = /^[A-Za-z][A-Za-z0-9_-]*/.exec(line.slice(i, to))?.[0];
    if (!name) return { ok: false, reason: `unexpected "${line[i]}" where a name should start` };
    i += name.length;
    if (line[i] !== "=") {
      if (i < to && !/\s/.test(line[i] ?? "")) return { ok: false, reason: `unexpected "${line[i]}" after "${name}"` };
      pairs.push({ name, value: null, quoted: false, start, end: i });
      space();
      continue;
    }
    i++;
    let value = "";
    let quoted = false;
    if (line[i] === '"') {
      quoted = true;
      i++;
      let closed = false;
      while (i < to) {
        const c = line[i] ?? "";
        if (c === "\\" && (line[i + 1] === '"' || line[i + 1] === "\\")) {
          value += line[i + 1];
          i += 2;
        } else if (c === '"') {
          closed = true;
          i++;
          break;
        } else {
          value += c;
          i++;
        }
      }
      if (!closed) return { ok: false, reason: `the quote opened after "${name}=" is never closed` };
      if (i < to && !/\s/.test(line[i] ?? "")) {
        return { ok: false, reason: `text right after the closing quote of "${name}"` };
      }
    } else {
      const m = /^[^\s={}"]*/.exec(line.slice(i, to));
      value = m?.[0] ?? "";
      i += value.length;
      if (value === "") return { ok: false, reason: `"${name}=" has no value` };
      if (i < to && !/\s/.test(line[i] ?? "")) {
        return {
          ok: false,
          reason: `"${name}=${value}" is followed by "${line[i]}": quote a value that holds = { } or "`,
        };
      }
    }
    pairs.push({ name, value, quoted, start, end: i });
    space();
  }
  return { ok: true, pairs };
}

/** A `{…}` block found at the end of a line: its offsets, the text before it, and where its content lies. */
export type TrailingBlock = {
  /** offset of `{` */
  start: number;
  /** offset of the closing `}` */
  end: number;
  /** offsets of what is between the braces */
  inner: [number, number];
  /** the line before the block, trailing space removed */
  before: string;
};

/**
 * Finds the block at the end of a heading line or a choice (QUIZ_SYNTAX.md, rule 1): the last unescaped `{` outside
 * maths and code, up to the `}` that ends the line. A quoted value may itself hold braces, so quotes are followed
 * inside a block. An image's `{width=…}`, straight after its `)`, is not a block. Returns null when the line does
 * not end with one.
 */
export function findTrailingBlock(line: string): TrailingBlock | null {
  const text = line.replace(/\s+$/, "");
  const spans = findSpans(text);
  let last: { start: number; end: number | null } | null = null;
  let i = 0;
  while (i < text.length) {
    const span = spanAt(spans, i);
    if (span) {
      i = span.end;
    } else if (text[i] === "\\") {
      i += 2;
    } else if (text[i] === "{" && !/!\[[^\]]*\]\([^)]*\)$/.test(text.slice(0, i))) {
      let j = i + 1;
      let quoted = false;
      let end: number | null = null;
      while (j < text.length) {
        const d = text[j];
        if (quoted && d === "\\") j++;
        else if (d === '"') quoted = !quoted;
        else if (!quoted && d === "}") {
          end = j;
          break;
        }
        j++;
      }
      last = { start: i, end };
      i = end === null ? text.length : end + 1;
    } else {
      i++;
    }
  }
  if (!last) return null;
  let end = last.end;
  if (end === null) {
    // An unterminated quote swallowed the closing brace: the block still ends the line if the line ends with `}`.
    if (!text.endsWith("}")) return null;
    end = text.length - 1;
  } else if (end !== text.length - 1) {
    return null;
  }
  return {
    start: last.start,
    end,
    inner: [last.start + 1, end],
    before: text.slice(0, last.start).replace(/\s+$/, ""),
  };
}
