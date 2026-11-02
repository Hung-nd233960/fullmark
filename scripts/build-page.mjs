// Builds the page runtime beside the CLI bundle: dist/page.js (one minified IIFE) and dist/page.css (the page's styles
// in a fixed order). `quiz build` reads both when it runs, so CLI startup does not grow with them.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { PAGE_BUNDLE } from "./bundles.mjs";
import { minifyCss } from "./minify-css.mjs";

const root = resolve(import.meta.dirname, "..");

await build({
  ...PAGE_BUNDLE,
  entryPoints: [join(root, "src/page/main.tsx")],
  outfile: join(root, "dist/page.js"),
  logLevel: "warning",
});

const styles = join(root, "src/page/styles");
const css = readdirSync(styles)
  .filter((f) => f.endsWith(".css"))
  .sort()
  .map((f) => readFileSync(join(styles, f), "utf8"))
  .join("\n");
const small = minifyCss(css);
writeFileSync(join(root, "dist/page.css"), `${small}\n`);
