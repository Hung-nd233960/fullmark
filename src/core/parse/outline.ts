import type { Token } from "markdown-it";
import { findFrontMatter, splitLines } from "./lines";
import { createMarkdown } from "./markdown";

/**
 * The block structure of a quiz file, found with markdown-it and its line maps: the top-level blocks in order, the
 * raw HTML and images anywhere, and the text pieces in which blanks and `{input}` are looked for. Lines are
 * 0-based here; the parser turns them into the 1-based lines of issues.
 */
export type ListItem = { start: number; end: number; marker: string };

export type Unit =
  | { kind: "heading"; level: number; start: number; end: number }
  | { kind: "container"; name: string; start: number; end: number; closed: boolean; nested: boolean }
  | { kind: "fence"; info: string; start: number; end: number; content: string }
  | { kind: "list"; ordered: boolean; start: number; end: number; items: ListItem[] }
  | { kind: "stray-closer"; start: number; end: number }
  | { kind: "other"; start: number; end: number };

/** A piece of text with the line it starts on, for blanks and `{input}`. `code` is fenced code, `math` display maths. */
export type Chunk = { text: string; line: number; mode: "markdown" | "code" | "math" };

export type Outline = {
  lines: string[];
  /** index of the first line after the front matter (0 when there is none) */
  bodyStart: number;
  frontMatter: { close: number } | "none" | "unclosed";
  units: Unit[];
  rawHtml: { line: number; tag: string }[];
  images: { src: string; line: number }[];
  chunks: Chunk[];
};

const CLOSER = /^ {0,3}:{3,}[ \t]*$/;

export function outline(text: string): Outline {
  const lines = splitLines(text);
  const frontMatter = findFrontMatter(lines);
  const bodyStart = typeof frontMatter === "object" ? frontMatter.close + 1 : 0;
  // The front matter is blanked, not cut, so that markdown-it's line numbers are the file's.
  const body = lines.map((l, i) => (i < bodyStart ? "" : l)).join("\n");
  const tokens = createMarkdown().parse(body, {});
  const out: Outline = { lines, bodyStart, frontMatter, units: [], rawHtml: [], images: [], chunks: [] };

  type Entry = { phantom: boolean; unitStart: number | null };
  const stack: Entry[] = [];
  const realDepth = () => stack.filter((e) => !e.phantom).length;
  let containerDepth = 0;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as Token;
    collect(t, out);
    if (t.nesting === 1) {
      const isContainer = t.type === "container_q_open";
      const [start, end] = t.map ?? [0, 0];
      const closed = isContainer && CLOSER.test(lines[end] ?? "") && end < lines.length;
      const atTop = realDepth() === 0;
      if (isContainer && !closed) {
        // An unclosed container swallows what follows it up to the end of its parent. We do not let it hide the
        // headings and lists that follow: it is a unit of its own, and its tokens count as top-level ones.
        stack.push({ phantom: true, unitStart: null });
        out.units.push({
          kind: "container",
          name: t.info.trim(),
          start,
          end,
          closed: false,
          nested: containerDepth > 0,
        });
        continue;
      }
      if (isContainer) containerDepth++;
      stack.push({ phantom: false, unitStart: atTop ? i : null });
    } else if (t.nesting === -1) {
      const entry = stack.pop();
      if (!entry || entry.phantom) continue;
      if (t.type === "container_q_close") containerDepth--;
      if (entry.unitStart !== null) addUnit(out, tokens, entry.unitStart, i, lines);
    } else if (realDepth() === 0) {
      addUnit(out, tokens, i, i, lines);
    }
  }
  return out;
}

/** Records raw HTML, images and text pieces from a token, wherever it sits. */
function collect(t: Token, out: Outline): void {
  const start = t.map?.[0] ?? 0;
  if (t.type === "html_block") {
    out.rawHtml.push({ line: start, tag: tagName(t.content) });
  } else if (t.type === "inline") {
    out.chunks.push({ text: t.content, line: start, mode: "markdown" });
    let line = start;
    for (const child of t.children ?? []) {
      if (child.type === "softbreak" || child.type === "hardbreak") line++;
      else if (child.type === "html_inline") out.rawHtml.push({ line, tag: tagName(child.content) });
      else if (child.type === "image") out.images.push({ src: decodeSrc(String(child.attrGet("src") ?? "")), line });
    }
  } else if (t.type === "fence" || t.type === "code_block") {
    out.chunks.push({ text: t.content, line: start + (t.type === "fence" ? 1 : 0), mode: "code" });
  } else if (t.type === "math_block") {
    out.chunks.push({ text: t.content, line: start, mode: "math" });
  }
}

function decodeSrc(src: string): string {
  try {
    return decodeURI(src);
  } catch {
    return src;
  }
}

function tagName(html: string): string {
  const m = /^\s*<(\/?[A-Za-z][A-Za-z0-9-]*|!--)/.exec(html);
  return m ? `<${m[1]}${m[1] === "!--" ? " …-->" : ">"}` : html.trim().slice(0, 20);
}

function addUnit(out: Outline, tokens: Token[], from: number, to: number, lines: string[]): void {
  const t = tokens[from] as Token;
  const [start, end] = t.map ?? [0, 0];
  switch (t.type) {
    case "heading_open":
      // Setext headings (underlined) are not `#` headings: they stay text.
      if (t.markup.startsWith("#")) out.units.push({ kind: "heading", level: Number(t.tag.slice(1)), start, end });
      else out.units.push({ kind: "other", start, end });
      break;
    case "container_q_open":
      out.units.push({ kind: "container", name: t.info.trim(), start, end, closed: true, nested: false });
      break;
    case "fence":
      out.units.push({ kind: "fence", info: t.info.trim(), start, end, content: t.content });
      break;
    case "bullet_list_open":
    case "ordered_list_open": {
      const items: ListItem[] = [];
      for (let k = from + 1; k < to; k++) {
        const item = tokens[k] as Token;
        if (item.type === "list_item_open" && item.level === t.level + 1 && item.map) {
          items.push({ start: item.map[0], end: item.map[1], marker: item.markup });
        }
      }
      out.units.push({ kind: "list", ordered: t.type === "ordered_list_open", start, end, items });
      break;
    }
    case "paragraph_open":
      if (CLOSER.test(lines[start] ?? "") && end === start + 1) out.units.push({ kind: "stray-closer", start, end });
      else out.units.push({ kind: "other", start, end });
      break;
    default:
      out.units.push({ kind: "other", start, end });
  }
}
