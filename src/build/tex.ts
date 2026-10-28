import { createRequire } from "node:module";
import type { ParseTex } from "../core/parse/tex";

/** The part of KaTeX that fullmark uses. */
export type Katex = {
  renderToString(tex: string, options: Record<string, unknown>): string;
};

/** KaTeX, loaded on first use from `node_modules` (it is external to the bundle, and ships a CommonJS build). */
export const loadKatex = (): Katex => createRequire(import.meta.url)("katex") as Katex;

/**
 * A `ParseTex` over KaTeX that loads KaTeX on the first span it is asked about, so a quiz without maths never loads
 * it. A span that parses gives null; one that does not gives KaTeX's message without its "KaTeX parse error:" prefix.
 */
export function lazyParseTex(load: () => Katex = loadKatex): ParseTex {
  let katex: Katex | undefined;
  return (tex, display) => {
    katex ??= load();
    try {
      katex.renderToString(tex, { displayMode: display, throwOnError: true, output: "htmlAndMathml" });
      return null;
    } catch (error) {
      // `rawMessage` has no context excerpt (KaTeX underlines it with combining characters, which print badly)
      const e = error as Error & { rawMessage?: string; position?: number };
      const message = e.rawMessage ?? e.message.replace(/^KaTeX parse error:\s*/, "");
      return e.position === undefined ? message : `${message} at position ${e.position + 1}`;
    }
  };
}
