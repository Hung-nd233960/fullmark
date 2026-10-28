import { isAbsolute, relative, resolve } from "node:path";

/**
 * How every command prints a path (a proposal for COMMANDS.md, which does not say): relative to the working
 * directory when the path lies under it, else absolute, and always with `/`, also on Windows.
 */
export function shownPath(path: string, cwd: string): string {
  const full = resolve(cwd, path);
  const rel = relative(cwd, full);
  const text = rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) ? rel : full;
  return text.replaceAll("\\", "/");
}
