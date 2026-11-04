// Builds the page runtime beside the CLI bundle: dist/page.js (one minified IIFE) and dist/page.css (the page's styles
// in a fixed order). `quiz build` reads both when it runs, so CLI startup does not grow with them.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { PAGE_BUNDLE, RELOAD_BUNDLE, REVIEW_BUNDLE, SERVE_BUNDLE } from "./bundles.mjs";
import { minifyCss } from "./minify-css.mjs";

const root = resolve(import.meta.dirname, "..");

await build({
  ...PAGE_BUNDLE,
  entryPoints: [join(root, "src/page/main.tsx")],
  outfile: join(root, "dist/page.js"),
  logLevel: "warning",
});

// The server module for served pages (`quiz serve`): read by src/serve/ only, so `quiz build` never reads it.
await build({
  ...SERVE_BUNDLE,
  entryPoints: [join(root, "src/serve/module.ts")],
  outfile: join(root, "dist/serve.js"),
  logLevel: "warning",
});

// The reload code of `build --watch --serve`: read by src/serve/ only, and added to the served copy alone.
await build({
  ...RELOAD_BUNDLE,
  entryPoints: [join(root, "src/serve/reload.ts")],
  outfile: join(root, "dist/reload.js"),
  logLevel: "warning",
});

// The review form of `quiz review`: its code and the styles it adds to the page's own (dist/page.css comes first).
await build({
  ...REVIEW_BUNDLE,
  entryPoints: [join(root, "src/review/main.tsx")],
  outfile: join(root, "dist/review.js"),
  logLevel: "warning",
});
writeFileSync(
  join(root, "dist/review.css"),
  `${minifyCss(readFileSync(join(root, "src/review/review.css"), "utf8"))}
`,
);

const styles = join(root, "src/page/styles");
const css = readdirSync(styles)
  .filter((f) => f.endsWith(".css") && f !== "paper.css")
  .sort()
  .map((f) => readFileSync(join(styles, f), "utf8"))
  .join("\n");
const small = minifyCss(css);
writeFileSync(join(root, "dist/page.css"), `${small}\n`);

// The printed paper's styles are their own file: `quiz build --print` reads it, and the page never carries it.
writeFileSync(join(root, "dist/paper.css"), `${minifyCss(readFileSync(join(styles, "paper.css"), "utf8"))}\n`);
