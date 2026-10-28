import { defineConfig } from "tsup";

export default defineConfig({
  // `cli` turns on the compile cache and loads `main`, the CLI itself
  entry: { cli: "src/cli/bin.ts", main: "src/cli/main.ts" },
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  // the page code is TSX: Preact's JSX runtime (the CLI renders the same components to HTML)
  esbuildOptions(options) {
    options.jsx = "automatic";
    options.jsxImportSource = "preact";
  },
  // one file: a command imported lazily stays inside the bundle, and only starts up when the command is used
  splitting: false,
  // `yaml` is CommonJS and calls require("process"); the bundle is ESM, so give those calls a require.
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire as __fullmarkCreateRequire } from "node:module";\nconst require = __fullmarkCreateRequire(import.meta.url);',
  },
  // The CLI is one file: dependencies are bundled in, except KaTeX and Shiki, which stay in node_modules and load only
  // when a quiz uses them (a bundled copy would be parsed at every start).
  noExternal: [/^(?!katex$|shiki(\/|$)|@shikijs\/).*/],
  external: ["katex", /^shiki(\/|$)/, /^@shikijs\//],
});
