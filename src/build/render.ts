import type { MarkdownIt as Md } from "markdown-it";
import { toBase64 } from "../core/keyblob";
import { scanBlanks } from "../core/parse/blanks";
import { createMarkdown } from "../core/parse/markdown";

const MARK_OPEN = String.fromCharCode(0xe000);
const MARK_CLOSE = String.fromCharCode(0xe001);
const MARKER = new RegExp(`${MARK_OPEN}([0-9]+)${MARK_CLOSE}`, "g");

/** A file the quiz refers to: its path relative to the quiz folder (`/` separators) and its bytes. */
export type Asset = { path: string; bytes: Uint8Array };

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
};

const extensionOf = (path: string): string => path.slice(path.lastIndexOf(".") + 1).toLowerCase();
const isAudio = (path: string): boolean => (MIME[extensionOf(path)] ?? "").startsWith("audio/");

/** `a/./b/../c` to `a/c`, as the loader keys the assets. */
function normalisePath(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/** The `data:` URI of an asset, or null when the quiz has no such file (the loader reports that as an error). */
export function dataUri(assets: readonly Asset[], path: string): string | null {
  const asset = assets.find((a) => a.path === normalisePath(decodeURI(path)));
  if (!asset) return null;
  return `data:${MIME[extensionOf(asset.path)] ?? "application/octet-stream"};base64,${toBase64(asset.bytes)}`;
}

/**
 * Markdown to HTML for the page (TECHNICAL_DESIGN.md, foundation 3): raw HTML is off, images and audio become `data:`
 * URIs, and an image's `{width=N}` sets its width. Maths stays as plain text until the maths slice.
 */
export function createRenderer(assets: readonly Asset[]): {
  block(source: string): string;
  inline(source: string): string;
  /** a `blanks` prompt with each `[[…]]` replaced by an `<input class="fm-blank">`; throws unless it finds `kinds.length` */
  blanks(source: string, kinds: readonly ("text" | "numeric")[], label: (n: number) => string): string;
} {
  const md: Md = createMarkdown();
  md.set({ html: false });
  const esc = md.utils.escapeHtml;
  md.renderer.rules.math_inline = (tokens, i) => `<span class="math">${esc(tokens[i]?.content ?? "")}</span>`;
  md.renderer.rules.math_block = (tokens, i) => `<div class="math">${esc(tokens[i]?.content ?? "")}</div>\n`;
  md.renderer.rules.image = (tokens, i, _options, _env, self) => {
    const token = tokens[i];
    if (!token) return "";
    const path = String(token.attrGet("src") ?? "");
    const src = dataUri(assets, path);
    const alt = esc(self.renderInlineAsText(token.children ?? [], md.options, {}));
    if (src === null) return `<span class="missing-asset">${alt}</span>`;
    if (isAudio(path)) return `<audio controls src="${src}" aria-label="${alt}"></audio>`;
    const width = token.meta?.width as string | undefined;
    return `<img src="${src}" alt="${alt}"${width ? ` width="${width}"` : ""}>`;
  };
  // `![alt](path){width=300}`: take the braces off the text that follows the image and keep the width on the image
  md.core.ruler.push("image_width", (state) => {
    for (const block of state.tokens) {
      const children = block.children ?? [];
      children.forEach((child, i) => {
        const next = children[i + 1];
        if (child.type !== "image" || next?.type !== "text") return;
        const m = /^\{width=(\d+)\}/.exec(next.content);
        if (!m) return;
        child.meta = { width: m[1] };
        next.content = next.content.slice(m[0].length);
      });
    }
    return true;
  });
  // A blank is cut from the prompt's paragraphs and fenced code with the parser's own `scanBlanks`, on the tokens the
  // parser sees (inline text and code), before the inline rule runs. A private-use marker stands in for it until the
  // HTML is made; the marker is then swapped for the input.
  md.core.ruler.before("inline", "cut_blanks", (state) => {
    const env = state.env as { cut?: { count: number } };
    if (!env.cut) return true;
    for (const t of state.tokens) {
      if (t.type !== "inline" && t.type !== "fence" && t.type !== "code_block") continue;
      const scan = scanBlanks(t.content, 1, t.type === "inline" ? "markdown" : "code");
      let text = t.content;
      for (let i = scan.at.length - 1; i >= 0; i--) {
        const at = scan.at[i] as { start: number; end: number };
        text = `${text.slice(0, at.start)}${MARK_OPEN}${env.cut.count + i}${MARK_CLOSE}${text.slice(at.end)}`;
      }
      env.cut.count += scan.at.length;
      t.content = text;
    }
    return true;
  });
  return {
    blanks(source, kinds, label) {
      const env = { cut: { count: 0 } };
      let html = md.render(source, env);
      let seen = 0;
      html = html.replace(MARKER, (_m, n: string) => {
        seen++;
        const k = Number(n);
        return `<input type="text" class="fm-blank" data-blank="${k}"${kinds[k] === "numeric" ? ' data-numeric="1"' : ""} autocomplete="off" spellcheck="false" aria-label="${md.utils.escapeHtml(label(k + 1))}">`;
      });
      if (env.cut.count !== kinds.length || seen !== kinds.length) {
        throw new Error(`a blanks prompt has ${env.cut.count} blanks in the page but the question has ${kinds.length}`);
      }
      return html;
    },
    block: (source) => md.render(source),
    inline: (source) => md.renderInline(source),
  };
}
