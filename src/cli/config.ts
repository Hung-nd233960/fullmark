import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseConfig } from "../core/config/parse";
import { type Layers, validateLayers } from "../core/config/resolve";
import type { ConfigError, ConfigFileData } from "../core/config/types";

/** What the config commands need from the machine, so that tests can supply their own. */
export type Machine = {
  cwd: string;
  env: Record<string, string | undefined>;
  platform: string;
  home: string;
};

export function realMachine(): Machine {
  return { cwd: process.cwd(), env: process.env, platform: process.platform, home: homedir() };
}

/** `FULLMARK_CONFIG`, else `%APPDATA%\fullmark\config.toml` on Windows, else `~/.config/fullmark/config.toml`. */
export function userConfigPath(m: Machine): { path: string; explicit: boolean } {
  const given = m.env.FULLMARK_CONFIG;
  if (given) return { path: resolve(m.cwd, given), explicit: true };
  if (m.platform === "win32") {
    const appData = m.env.APPDATA ?? join(m.home, "AppData", "Roaming");
    return { path: join(appData, "fullmark", "config.toml"), explicit: false };
  }
  return { path: join(m.home, ".config", "fullmark", "config.toml"), explicit: false };
}

const isFile = (p: string): boolean => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

/**
 * The nearest `fullmark.toml`, looking up from `start` and stopping at a git root or a library root (a folder with a
 * `.git` or a `library.toml`): that folder is still looked in, and nothing above it.
 */
export function findProjectConfig(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, "fullmark.toml");
    if (isFile(candidate)) return candidate;
    if (existsSync(join(dir, ".git")) || isFile(join(dir, "library.toml"))) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** A path as the user would read it: relative to the folder they are in when it is below it, else absolute. */
export function displayPath(path: string, cwd: string): string {
  const rel = relative(cwd, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) ? rel : path;
}

export type LoadedConfig = {
  layers: Layers;
  /** the files read, as displayed in messages and in `--json`: the user config first, then fullmark.toml */
  files: string[];
  errors: ConfigError[];
  failOn: "error" | "warning";
};

type ReadResult = { data: ConfigFileData | null; errors: ConfigError[]; read: boolean };

function readConfig(path: string, shown: string, kind: "project" | "user", mustExist: boolean): ReadResult {
  if (!isFile(path)) {
    if (mustExist) {
      return {
        data: null,
        read: false,
        errors: [{ file: shown, line: 1, message: "the config file does not exist", fix: "check the path" }],
      };
    }
    return { data: null, errors: [], read: false };
  }
  let text: string;
  try {
    text = readFileSync(path, "utf8").replace(/^﻿/, "");
  } catch (error) {
    return {
      data: null,
      read: false,
      errors: [{ file: shown, line: 1, message: `cannot read the config file: ${(error as Error).message}` }],
    };
  }
  return { ...parseConfig(text, shown, kind), read: true };
}

/**
 * Reads the config layers for a quiz in `quizDir` (TECHNICAL_DESIGN.md, section 5): the user config, then the nearest
 * `fullmark.toml` or `override` (`--config`). Errors from both are returned together, each with file and line,
 * including the profile mistakes that only show when a profile is followed (`validateLayers`).
 */
export function loadConfig(m: Machine, quizDir: string, override: string | null): LoadedConfig {
  const files: string[] = [];
  const errors: ConfigError[] = [];

  const user = userConfigPath(m);
  const userRead = readConfig(user.path, user.path, "user", user.explicit);
  errors.push(...userRead.errors);
  if (userRead.read) files.push(user.path);

  let projectPath: string | null;
  let mustExist = false;
  if (override !== null) {
    projectPath = resolve(m.cwd, override);
    mustExist = true;
  } else projectPath = findProjectConfig(quizDir);
  let project: ConfigFileData | null = null;
  if (projectPath !== null) {
    const shown = displayPath(projectPath, m.cwd);
    const read = readConfig(projectPath, shown, "project", mustExist);
    errors.push(...read.errors);
    project = read.data;
    if (read.read) files.push(shown);
  }

  const layers: Layers = { user: userRead.data, project };
  if (errors.length === 0) errors.push(...validateLayers(layers));
  return { layers, files, errors, failOn: project?.check.failOn ?? "error" };
}
