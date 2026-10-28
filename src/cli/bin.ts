import * as nodeModule from "node:module";

/**
 * The file `quiz` runs. It turns on Node's compile cache (TECHNICAL_DESIGN.md, section 7, "Budgets") and only then loads
 * the CLI (`main.js`, next to it), so the cache covers the CLI's own code and not just what loads after it. The
 * function is missing on some Node 22 minors and a failure to cache costs nothing, so both are ignored.
 */
try {
  (nodeModule as { enableCompileCache?: () => unknown }).enableCompileCache?.();
} catch {
  // no cache: startup is slower, nothing else changes
}
await import(new URL("./main.js", import.meta.url).href);
