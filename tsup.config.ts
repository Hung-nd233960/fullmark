import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli/main.ts" },
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
  // The CLI is one file: dependencies are bundled in.
  noExternal: [/.*/],
});
