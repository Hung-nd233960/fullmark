import { defineConfig } from "tsup";
import { CLI_BUNDLE, CLI_EXTERNAL_PATTERNS, JSX } from "./scripts/bundles.mjs";

// The options the CLI and the page runtime are bundled with live in scripts/bundles.mjs, which scripts/notices.mjs
// imports too, so the notices are made from the bundles that ship.
export default defineConfig({
  // `cli` turns on the compile cache and loads `main`, the CLI itself
  entry: { cli: "src/cli/bin.ts", main: "src/cli/main.ts" },
  format: [CLI_BUNDLE.format],
  target: CLI_BUNDLE.target,
  platform: CLI_BUNDLE.platform,
  clean: true,
  esbuildOptions(options) {
    options.jsx = JSX.jsx;
    options.jsxImportSource = JSX.jsxImportSource;
  },
  // chunks: a command imported lazily is its own chunk, so `check` never loads the page builder (test/cli-graph.test.ts)
  splitting: CLI_BUNDLE.splitting,
  banner: CLI_BUNDLE.banner,
  // The CLI is one file: dependencies are bundled in, except KaTeX and Shiki, which stay in node_modules.
  noExternal: [/^(?!katex$|shiki(\/|$)|@shikijs\/).*/],
  external: ["katex", ...CLI_EXTERNAL_PATTERNS],
});
