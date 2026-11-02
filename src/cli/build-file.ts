import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { type BuildEntry, parseBuildFile } from "../core/config/build-file";
import type { ConfigError } from "../core/config/types";
import type { BuildOptions } from "./build";
import { expandInputs, type InputError } from "./files";
import { readFailure, shownPath } from "./paths";

/**
 * Planning `quiz build --build-file BUILD [FILE...]` (COMMANDS.md, "Build file"): the build file's entries become the
 * same list of files that `build FILE...` works through, each with the options of its entry, and every page they
 * would write is worked out first, so that a clash is found before anything is built.
 */

/** One page to build: a source, the options that apply to it (a command-line flag over its entry over the defaults) and where it goes. */
export type Job = {
  /** as shown: relative under the working directory, else absolute */
  file: string;
  abs: string;
  opts: BuildOptions;
  /** the page's full path */
  target: string;
};
export type PlanItem = { job: Job } | { error: InputError };

export type Plan =
  | { ok: true; items: PlanItem[] }
  | { ok: false; message: string; file?: string; errors?: ConfigError[]; details: string[] };

const keyOf = (path: string): string => (process.platform === "win32" ? path.toLowerCase() : path);

export function planBuildFile(buildFile: string, fileArgs: readonly string[], opts: BuildOptions, cwd: string): Plan {
  const path = resolve(cwd, buildFile);
  const shown = shownPath(path, cwd);
  const refuse = (message: string, details: string[] = []): Plan => ({ ok: false, message, details });
  let text: string;
  try {
    text = readFileSync(path, "utf8").replace(/^﻿/, "");
  } catch (error) {
    return refuse(`${shown}: cannot read the build file: ${readFailure(error)}`);
  }
  const parsed = parseBuildFile(text, shown);
  if (parsed.errors.length > 0) {
    const details = parsed.errors.flatMap((e) => [
      `${e.file}:${e.line}: ${e.message}`,
      ...(e.fix ? [`    fix: ${e.fix}`] : []),
    ]);
    return { ok: false, message: "the build file has errors", file: shown, errors: parsed.errors, details };
  }
  const dir = dirname(path);

  // `-o DIR` beats every entry's `out`; in a build file `out` is always a folder
  const folderProblem = (folder: string, name: string, at: string): string | null => {
    if (/\.html?$/i.test(name)) return `${at}${name} looks like a page, and a build file needs a folder`;
    if (existsSync(folder) && !statSync(folder).isDirectory()) {
      return `${at}${name} is a file, and a build file needs a folder`;
    }
    return null;
  };
  if (opts.output !== null) {
    const problem = folderProblem(resolve(cwd, opts.output), opts.output, "-o ");
    if (problem !== null) return refuse(problem);
  }

  const jobs: { job: Job; entry: BuildEntry }[] = [];
  const items: PlanItem[] = [];
  const checkedOut = new Set<string>();
  for (const entry of parsed.entries) {
    const folder =
      opts.output !== null ? resolve(cwd, opts.output) : entry.out !== null ? resolve(dir, entry.out) : null;
    if (opts.output === null && entry.out !== null && !checkedOut.has(`${entry.outLine}`)) {
      checkedOut.add(`${entry.outLine}`);
      const problem = folderProblem(resolve(dir, entry.out), entry.out, `${shown}:${entry.outLine}: out `);
      if (problem !== null) return refuse(problem);
    }
    const entryOpts: BuildOptions = {
      ...opts,
      output: null,
      profile: opts.profile ?? entry.profile,
      config: opts.config ?? (entry.config === null ? null : resolve(dir, entry.config)),
      strict: opts.strict || entry.strict === true,
      fonts: opts.fonts ?? entry.fonts,
      uiLang: opts.uiLang ?? entry.uiLang,
      builtAt: opts.builtAt ?? entry.builtAt,
    };
    for (const item of expandInputs(entry.files, dir).items) {
      if ("error" in item) {
        items.push({ error: { input: shownPath(resolve(dir, item.error.input), cwd), message: item.error.message } });
        continue;
      }
      const abs = resolve(dir, item.file);
      const name = `${basename(abs, extname(abs))}.html`;
      const job: Job = {
        file: shownPath(abs, cwd),
        abs,
        opts: entryOpts,
        target: join(folder ?? dirname(abs), name),
      };
      jobs.push({ job, entry });
      items.push({ job });
    }
  }

  // every page any entry would write, before anything is built
  const written = new Map<string, { line: number; file: string }>();
  for (const { job, entry } of jobs) {
    const key = keyOf(job.target);
    const other = written.get(key);
    if (other !== undefined) {
      const where =
        other.line === entry.line
          ? `the entry at ${shown}:${entry.line} would write`
          : `the entries at ${shown}:${other.line} and ${shown}:${entry.line} would both write`;
      const twice = other.line === entry.line ? " twice" : "";
      return refuse(`${where} ${shownPath(job.target, cwd)}${twice} (from ${other.file} and ${job.file})`, [
        "fix: give each entry its own out",
      ]);
    }
    written.set(key, { line: entry.line, file: job.file });
  }

  if (fileArgs.length === 0) return { ok: true, items };

  // FILEs build only the entries' files that match them
  const wanted = expandInputs(fileArgs, cwd);
  const known = new Set(jobs.map((j) => keyOf(j.job.abs)));
  const problems: string[] = wanted.errors.map((e) => `${e.input}: ${e.message}`);
  for (const file of wanted.files) {
    if (!known.has(keyOf(resolve(cwd, file)))) problems.push(`${file} is in no entry of ${shown}`);
  }
  if (problems.length > 0) return refuse(problems[0] ?? "", problems.slice(1));
  const chosen = new Set(wanted.files.map((f) => keyOf(resolve(cwd, f))));
  return { ok: true, items: items.filter((i) => "job" in i && chosen.has(keyOf(i.job.abs))) };
}
