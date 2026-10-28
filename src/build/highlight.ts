import { KNOWN_LANGUAGES } from "../core/rules/quality";

/** Code to HTML: the highlighted `<pre>`, or null when the language is not one the page highlights. */
export type Highlight = (code: string, lang: string) => string | null;

const PREFIX = "--fm-code-";
const TOKEN = new RegExp(`^var\\(${PREFIX}token-([a-z-]+)\\)$`);

const escapeHtml = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** The name a language goes by in a fence: its first word, lower-case. */
export const languageOf = (info: string): string => (info.trim().split(/\s+/)[0] ?? "").toLowerCase();

const isKnown = (lang: string): boolean => (KNOWN_LANGUAGES as readonly string[]).includes(lang);

/**
 * Shiki, loaded on demand: the fine-grained core with the JavaScript regex engine (no WASM) and only the grammars in
 * `languages`. With no known language it loads nothing and returns null, so a quiz without code never loads Shiki.
 *
 * The page's CSP allows no style attributes, so colours are classes: Shiki's CSS-variables theme gives each token
 * `var(--fm-code-token-keyword)` and the HTML holds `fm-tk-keyword`, which the page's CSS maps to that variable.
 * Plain text takes the colour of the block.
 */
export async function loadHighlighter(languages: Iterable<string>): Promise<Highlight | null> {
  const wanted = [...new Set([...languages].map((l) => l.toLowerCase()).filter(isKnown))].sort();
  if (wanted.length === 0) return null;
  const { createHighlighterCore, createCssVariablesTheme } = await import("shiki/core");
  const { createJavaScriptRegexEngine } = await import("shiki/engine/javascript");
  const theme = createCssVariablesTheme({
    name: "fullmark",
    variablePrefix: PREFIX,
    variableDefaults: {},
    fontStyle: false,
  });
  const langs = await Promise.all(wanted.map(async (name) => (await import(`@shikijs/langs/${name}`)).default));
  const highlighter = await createHighlighterCore({
    themes: [theme],
    langs,
    engine: createJavaScriptRegexEngine(),
  });
  return (code, lang) => {
    const name = lang.toLowerCase();
    if (!wanted.includes(name)) return null;
    const { tokens } = highlighter.codeToTokens(code.replace(/\n$/, ""), { lang: name, theme: "fullmark" });
    const lines = tokens.map((line) =>
      line
        .map((t) => {
          const kind = TOKEN.exec(t.color ?? "")?.[1];
          return kind === undefined
            ? escapeHtml(t.content)
            : `<span class="fm-tk-${kind}">${escapeHtml(t.content)}</span>`;
        })
        .join(""),
    );
    return `<pre class="fm-hl"><code class="language-${escapeHtml(name)}">${lines.join("\n")}\n</code></pre>\n`;
  };
}

const FENCE = /^[ \t]{0,3}(?:`{3,}|~{3,})[ \t]*([^\s`]+)/gm;

/**
 * The languages of the fenced code a quiz and its sheets hold, in any text of the IR, and of its `code` questions
 * (whose sample answers are shown as code). Only the known ones matter to `loadHighlighter`.
 */
export function languagesUsed(quiz: unknown, sheets: readonly { source: string }[] = []): Set<string> {
  const found = new Set<string>();
  const text = (s: string) => {
    for (const m of s.matchAll(FENCE)) found.add((m[1] ?? "").toLowerCase());
  };
  const walk = (value: unknown, key?: string): void => {
    if (typeof value === "string") {
      if (key === "language") found.add(value.toLowerCase());
      else text(value);
    } else if (Array.isArray(value)) for (const v of value) walk(v);
    else if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  walk(quiz);
  for (const s of sheets) text(s.source);
  return found;
}
