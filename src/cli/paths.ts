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

/** Why a file could not be read, in plain words: the operating system's own message carries a path of its own. */
export function readFailure(error: unknown): string {
  const code = (error as { code?: string }).code;
  if (code === "ENOENT") return "no such file";
  if (code === "EISDIR") return "is a folder, not a file";
  if (code === "EACCES" || code === "EPERM") return "permission denied";
  return (error as Error).message;
}
