// The esbuild options of the two bundles fullmark ships, in one place: tsup.config.ts (the CLI), scripts/build-page.mjs
// (the page runtime) and scripts/notices.mjs (which reads the packages out of the same bundles, so the notices are made
// from what ships) all import them (TECHNICAL_DESIGN.md, section 3, "Licences").

/** The page code is TSX: Preact's JSX runtime (the CLI renders the same components to HTML). */
export const JSX = { jsx: "automatic", jsxImportSource: "preact" };

/** `yaml` is CommonJS and calls require("process"); the bundle is ESM, so give those calls a require. */
export const CLI_BANNER =
  '#!/usr/bin/env node\nimport { createRequire as __fullmarkCreateRequire } from "node:module";\nconst require = __fullmarkCreateRequire(import.meta.url);';

/**
 * Left in node_modules: KaTeX and Shiki load only when a quiz uses them (a bundled copy would be parsed at every start).
 * The same set twice, as tsup and esbuild each spell it.
 */
export const CLI_EXTERNAL_PATTERNS = [/^shiki(\/|$)/, /^@shikijs\//];
export const CLI_EXTERNAL = ["katex", "shiki", "shiki/*", "@shikijs/*"];

/** What the CLI bundle is, for tsup and for esbuild alike. `splitting`: a command imported lazily is its own chunk. */
export const CLI_BUNDLE = {
  format: "esm",
  target: "node22",
  platform: "node",
  splitting: true,
  banner: { js: CLI_BANNER },
  ...JSX,
};

/** The page runtime: one minified IIFE for the browser. */
export const PAGE_BUNDLE = {
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  legalComments: "none",
  ...JSX,
};

/**
 * The browser half of `src/serve/` (`dist/serve.js`): a second IIFE beside the page runtime, added only to a page built
 * in memory for serving (TECHNICAL_DESIGN.md, section 7, foundation 9). The forms of later slices are their own
 * entries in the same way.
 */
export const SERVE_BUNDLE = { ...PAGE_BUNDLE };

/**
 * The reload code (`dist/reload.js`): its own IIFE, which only the copy of a page that `build --watch --serve` serves
 * carries (G31). It shares nothing with `dist/serve.js`: a reloading page has no submit or autosave code.
 */
export const RELOAD_BUNDLE = { ...PAGE_BUNDLE };
