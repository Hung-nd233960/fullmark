import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Machine, realMachine, userConfigPath } from "./config";
import type { Io } from "./ids";

/**
 * The templates `quiz new` starts from (COMMANDS.md, `quiz template`): the built-in ones shipped in `dist/templates/`,
 * and the user's own in a `templates/` folder next to `config.toml`.
 */

/** The built-in templates, in the order `template list` shows them. Their sources are in `scripts/build-templates.mjs`. */
export const BUILT_IN = ["calculus", "rust", "ielts", "medical", "exam", "survey", "blank"] as const;

export type TemplateInfo = {
  name: string;
  source: "built-in" | "user";
  /** the user template's folder; null for a built-in one, which lives inside the package */
  path: string | null;
  /** a user template whose name is a built-in one: `new` uses the built-in */
  ignored: boolean;
  /** why a user folder cannot be used (COMMANDS.md, `template list`); null for a usable template */
  invalid: string | null;
};

/** A template read from its folder: the quiz file and the files that go with it, relative to the folder. */
export type TemplateFiles = {
  md: { name: string; bytes: Buffer };
  files: { path: string; bytes: Buffer }[];
};

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const machineOf = (io: Io & { machine?: Machine }): Machine =>
  io.machine ?? { ...realMachine(), cwd: io.cwd, home: homedir() };

/** `<config folder>/templates`: next to `config.toml`, wherever `FULLMARK_CONFIG` puts it. */
export const userTemplatesFolder = (m: Machine): string => join(dirname(userConfigPath(m).path), "templates");

/** `dist/templates`: beside the bundle, or in the repository's `dist` when run from the sources (tests). */
export function builtInFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return existsSync(join(here, "templates")) ? join(here, "templates") : resolve(here, "..", "..", "dist", "templates");
}

const isDir = (p: string): boolean => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/** The `.md` files at the top of a folder, sorted. */
const quizFiles = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
    .map((e) => e.name)
    .sort(compare);

/** Every template: the built-in ones, then the user's by name. A user folder is usable when it holds one `.md`. */
export function listTemplates(m: Machine): TemplateInfo[] {
  const out: TemplateInfo[] = BUILT_IN.map((name) => ({
    name,
    source: "built-in",
    path: null,
    ignored: false,
    invalid: null,
  }));
  const folder = userTemplatesFolder(m);
  if (!isDir(folder)) return out;
  const names = readdirSync(folder, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort(compare);
  for (const name of names) {
    const mds = quizFiles(join(folder, name));
    out.push({
      name,
      source: "user",
      path: join(folder, name),
      ignored: (BUILT_IN as readonly string[]).includes(name),
      invalid:
        mds.length === 1
          ? null
          : mds.length === 0
            ? "no quiz .md at the top of the folder"
            : `${mds.length} .md files at the top of the folder (${mds.join(", ")}); a template has exactly one`,
    });
  }
  return out;
}

/** The template a name means: a built-in one first (the user's of that name is ignored), else the user's. */
export function findTemplate(m: Machine, name: string): { info: TemplateInfo; ignoredUser: boolean } | null {
  const all = listTemplates(m);
  const builtIn = all.find((t) => t.name === name && t.source === "built-in");
  if (builtIn) return { info: builtIn, ignoredUser: all.some((t) => t.name === name && t.source === "user") };
  const user = all.find((t) => t.name === name && t.source === "user" && t.invalid === null);
  return user ? { info: user, ignoredUser: false } : null;
}

/** Reads a template's folder: its quiz file, and everything in `assets/` and `materials/`. */
export function readTemplate(info: TemplateInfo): TemplateFiles {
  const folder = info.path ?? join(builtInFolder(), info.name);
  const [name] = quizFiles(folder);
  if (name === undefined) throw new Error(`the template "${info.name}" has no quiz .md`);
  const files: TemplateFiles["files"] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name))) {
      const rel = `${prefix}/${e.name}`;
      if (e.isDirectory()) walk(join(dir, e.name), rel);
      else if (e.isFile()) files.push({ path: rel, bytes: readFileSync(join(dir, e.name)) });
    }
  };
  for (const part of ["assets", "materials"]) if (isDir(join(folder, part))) walk(join(folder, part), part);
  return { md: { name, bytes: readFileSync(join(folder, name)) }, files };
}

/** The base name of a quiz file, as the template's name is made from it. */
export const stem = (file: string): string => basename(file).replace(/\.[^.]*$/, "");
