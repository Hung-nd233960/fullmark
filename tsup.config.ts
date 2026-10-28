import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli/main.ts" },
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  // one file: a command imported lazily stays inside the bundle, and only starts up when the command is used
  splitting: false,
  // `yaml` is CommonJS and calls require("process"); the bundle is ESM, so give those calls a require.
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire as __fullmarkCreateRequire } from "node:module";\nconst require = __fullmarkCreateRequire(import.meta.url);',
  },
  // The CLI is one file: dependencies are bundled in.
  noExternal: [/.*/],
});
