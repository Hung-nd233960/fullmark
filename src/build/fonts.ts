import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const nodeRequire = createRequire(import.meta.url);

/** The package a font file belongs to: `@fontsource/be-vietnam-pro/files/x.woff2` is in `@fontsource/be-vietnam-pro`. */
const packageOf = (path: string): string => path.split("/").slice(0, 2).join("/");

/** The bytes of a registry font file, read from its npm package (pinned in package.json). */
export function fontBytes(path: string): Buffer {
  const root = dirname(nodeRequire.resolve(`${packageOf(path)}/package.json`));
  return readFileSync(join(root, path.split("/").slice(2).join("/")));
}

/** A registry font file as a `data:` URI. */
export const fontDataUri = (path: string): string => `data:font/woff2;base64,${fontBytes(path).toString("base64")}`;
