import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads `dist/serve.js`, the browser half of the one-shot server. Only code under `src/serve/` and the commands that
 * serve call this; `quiz build` never reads the file, so a shared page cannot pick the module up (foundation 9).
 * Null when it is missing next to the program.
 */
export function readServeModule(folder: string): string | null {
  try {
    return readFileSync(join(folder, "serve.js"), "utf8");
  } catch {
    return null;
  }
}

/** Reads `dist/reload.js`, the reload code of `build --watch --serve`; null when it is missing next to the program. */
export function readReloadModule(folder: string): string | null {
  try {
    return readFileSync(join(folder, "reload.js"), "utf8");
  } catch {
    return null;
  }
}
