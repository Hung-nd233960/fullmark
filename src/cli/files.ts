import { existsSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

/**
 * The inputs of a command that takes `FILE...` (COMMANDS.md, "Several files"): globs are expanded here, since
 * PowerShell does not expand them; matches are sorted with a fixed comparison; repeated names are dropped; a
 * folder is refused, so a README.md is never processed by accident.
 */
export type Inputs = {
  files: string[];
  /** inputs that cannot be used: a missing file, a folder, a glob with no match */
  errors: { input: string; message: string }[];
};

const GLOB_CHARS = /[*?[]/;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A glob segment (`*.md`, `q?.md`) as a regular expression. `*` and `?` never match a path separator. */
function segmentPattern(segment: string): RegExp {
  let source = "";
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i] ?? "";
    if (c === "*") source += "[^/\\\\]*";
    else if (c === "?") source += "[^/\\\\]";
    else if (c === "[") {
      const end = segment.indexOf("]", i + 1);
      if (end < 0) source += "\\[";
      else {
        source += `[${segment
          .slice(i + 1, end)
          .replace(/^!/, "^")
          .replaceAll("\\", "\\\\")}]`;
        i = end;
      }
    } else source += c.replace(/[.+^${}()|\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`, process.platform === "win32" ? "i" : "");
}

/** Expands a glob (with `/` or the platform separator) to the files it matches; `**` matches any folders. */
function expand(pattern: string, cwd: string): string[] {
  const parts = pattern.split(/[\\/]+/);
  const first = parts[0] ?? "";
  const absolute = isAbsolute(pattern);
  let bases: string[];
  let rest: string[];
  if (absolute && /^[A-Za-z]:$/.test(first)) {
    bases = [`${first}${sep}`];
    rest = parts.slice(1);
  } else if (absolute) {
    bases = [sep];
    rest = parts.slice(1);
  } else {
    bases = [cwd];
    rest = parts;
  }
  const out: string[] = [];
  const walk = (dir: string, segments: string[]): void => {
    const [head, ...tail] = segments;
    if (head === undefined) return;
    if (head === "**") {
      walk(dir, tail);
      for (const name of safeList(dir)) {
        const path = join(dir, name);
        if (isDirectory(path)) walk(path, segments);
      }
      return;
    }
    if (!GLOB_CHARS.test(head)) {
      const path = join(dir, head);
      if (tail.length === 0) {
        if (existsSync(path) && !isDirectory(path)) out.push(path);
      } else if (isDirectory(path)) walk(path, tail);
      return;
    }
    const re = segmentPattern(head);
    for (const name of safeList(dir).filter((n) => re.test(n))) {
      const path = join(dir, name);
      if (tail.length === 0) {
        if (!isDirectory(path)) out.push(path);
      } else if (isDirectory(path)) walk(path, tail);
    }
  };
  for (const base of bases) walk(base, rest);
  return out;
}

function safeList(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function expandInputs(patterns: readonly string[], cwd: string): Inputs {
  const files: string[] = [];
  const errors: Inputs["errors"] = [];
  const seen = new Set<string>();
  const add = (path: string, shown: string) => {
    const key = process.platform === "win32" ? resolve(cwd, path).toLowerCase() : resolve(cwd, path);
    if (seen.has(key)) return;
    seen.add(key);
    files.push(shown);
  };
  for (const input of patterns) {
    if (GLOB_CHARS.test(input)) {
      const matches = expand(input, cwd).sort(compare);
      if (matches.length === 0) errors.push({ input, message: "no file matches" });
      for (const m of matches) {
        // show the match the way the user wrote the pattern: relative to the folder they are in
        add(m, isAbsolute(input) ? m : m.slice(cwd.length + 1) || m);
      }
    } else if (!existsSync(resolve(cwd, input))) {
      errors.push({ input, message: "no such file" });
    } else if (isDirectory(resolve(cwd, input))) {
      errors.push({ input, message: "is a folder, not a quiz file" });
    } else {
      add(input, input);
    }
  }
  return { files, errors };
}
