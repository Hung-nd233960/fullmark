import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import pc from "picocolors";
import { lazyParseTex } from "../build/tex";
import {
  chooseProfile,
  type ProfileChoice,
  type ResolvedProfile,
  resolveProfile,
  unknownProfileFix,
  unknownProfileMessage,
} from "../core/config/resolve";
import type { ConfigError } from "../core/config/types";
import type { Brief } from "../core/ir";
import type { Issue } from "../core/issue";
import type { ParseTex } from "../core/parse/tex";
import { readBrief } from "../core/rules/brief-read";
import { runChecks } from "../core/rules/check";
import { type LoadedConfig, loadConfig, type Machine, realMachine } from "./config";
import { EXIT, type ExitCode } from "./exit-codes";
import { fail } from "./fail";
import { expandInputs } from "./files";
import type { Io } from "./ids";
import { type LoadedQuiz, loadQuiz } from "./load";
import { readFailure, shownPath } from "./paths";

export type CheckOptions = {
  profile: string | null;
  config: string | null;
  strict: boolean;
  review: string | null;
  json: boolean;
  plain: boolean;
};

/** An `Io` plus what the config commands read from the machine; both default to the real ones. */
export type CheckIo = Io & { machine?: Machine; parseTex?: ParseTex };

type Counts = { errors: number; warnings: number };

export type FileOutcome =
  | {
      status: "ok" | "failed";
      file: string;
      profile: string;
      config: string[];
      errors: number;
      warnings: number;
      issues: Issue[];
      ignored: { rule: string; line: number; because: string }[];
      /** the first line of human output */
      header: string;
      /** the quiz as loaded, for the commands that go on to use it (`build`) */
      loaded: LoadedQuiz;
    }
  | { status: "error"; file: string; message: string; configErrors?: ConfigError[] };

/** Files under `dir/content`, relative and with `/`, `README.md` left out; null when there is no such folder. */
export function listContent(dir: string): string[] | null {
  const root = join(dir, "content");
  if (!existsSync(root) || !statSync(root).isDirectory()) return null;
  const out: string[] = [];
  const walk = (folder: string, prefix: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(folder, entry.name), rel);
      else if (rel !== "README.md") out.push(rel);
    }
  };
  walk(root, "");
  return out;
}

/** `profile exam (fullmark.toml:4, built-in) from the quiz; config: fullmark.toml`. */
export function describeProfile(profile: ResolvedProfile, choice: ProfileChoice | null, files: string[]): string {
  const origins = [...new Set(profile.chain.map((c) => c.origin))].join(", ");
  const from = choice ? ` from ${choice.from}` : "";
  return `profile ${profile.name} (${origins})${from}; config: ${files.length > 0 ? files.join(", ") : "none"}`;
}

/** Checks one file. Never throws for a problem in the file or the config: those are outcomes. */
export function checkFile(file: string, opts: CheckOptions, io: CheckIo): FileOutcome {
  const machine = io.machine ?? { ...realMachine(), cwd: io.cwd };
  const path = resolve(io.cwd, file);
  let loaded: ReturnType<typeof loadQuiz>;
  try {
    loaded = loadQuiz(path, { parseTex: io.parseTex ?? lazyParseTex() });
  } catch (error) {
    return { status: "error", file, message: `cannot read the file: ${readFailure(error)}` };
  }
  const dir = dirname(path);
  const config: LoadedConfig = loadConfig(machine, dir, opts.config);
  if (config.errors.length > 0) {
    return { status: "error", file, message: "the config has errors", configErrors: config.errors };
  }

  // the brief beside the quiz
  const briefPath = join(dir, "brief.yaml");
  let brief: Brief | null = null;
  let briefIssues: Issue[] = [];
  let briefText = "";
  if (existsSync(briefPath)) {
    try {
      briefText = readFileSync(briefPath, "utf8").replace(/^﻿/, "");
      const read = readBrief(briefText, shownPath(briefPath, io.cwd));
      brief = read.brief;
      briefIssues = read.issues;
    } catch (error) {
      return { status: "error", file, message: `cannot read brief.yaml: ${(error as Error).message}` };
    }
  }

  // the profile
  const issues = [...loaded.issues];
  let choice = chooseProfile({ cli: opts.profile, frontMatter: loaded.frontMatter, brief, layers: config.layers });
  if (choice.from === "brief.yaml" && !resolveProfile(choice.name, config.layers).profile) {
    const line = briefText.split(/\r?\n/).findIndex((l) => /^profile\s*:/.test(l)) + 1;
    briefIssues = [
      ...briefIssues,
      {
        rule: "brief.invalid",
        level: "warning",
        file: shownPath(briefPath, io.cwd),
        line: Math.max(line, 1),
        message: `brief.yaml names the profile \`${choice.name}\`, which does not exist, so the next choice was used`,
        fix: unknownProfileFix(choice.name, config.layers),
      },
    ];
    choice = chooseProfile({ cli: null, frontMatter: loaded.frontMatter, brief: null, layers: config.layers });
  }
  let resolved = resolveProfile(choice.name, config.layers);
  if (!resolved.profile && resolved.errors.length === 0) {
    const fix = unknownProfileFix(choice.name, config.layers);
    if (choice.from === "the quiz") {
      issues.push({
        rule: "profile.unknown",
        level: "error",
        file,
        line: choice.line ?? 1,
        message: `unknown profile \`${choice.name}\``,
        fix,
      });
      choice = { name: "default", from: "the default", line: null };
      resolved = resolveProfile("default", config.layers);
    } else if (choice.from === "[check] profile") {
      const shown = config.files.find((f) => f.endsWith("fullmark.toml")) ?? "fullmark.toml";
      return {
        status: "error",
        file,
        message: "the config has errors",
        configErrors: [{ file: shown, line: choice.line ?? 1, message: `unknown profile \`${choice.name}\``, fix }],
      };
    } else {
      return { status: "error", file, message: unknownProfileMessage(choice.name, config.layers) };
    }
  }
  if (!resolved.profile)
    return { status: "error", file, message: "the config has errors", configErrors: resolved.errors };

  // the quiz's issues carry the name the user gave; a sheet's carry its own path, beside the quiz as it was named
  const folder = dir.split(sep).join("/");
  const shownFile = (f: string): string => {
    if (f === loaded.file) return file;
    if (!f.startsWith(`${folder}/`)) return f;
    const near = dirname(file).split(sep).join("/");
    return near === "." ? f.slice(folder.length + 1) : `${near}/${f.slice(folder.length + 1)}`;
  };

  const failOn = opts.strict ? "warning" : config.failOn;
  const contentFiles = brief ? listContent(dir) : null;
  const result = runChecks({
    quiz: loaded.quiz,
    issues: issues.map((i) => ({ ...i, file: shownFile(i.file) })),
    file,
    profile: resolved.profile,
    brief,
    briefIssues,
    contentFiles,
  });
  const counts: Counts = {
    errors: result.issues.filter((i) => i.level === "error").length,
    warnings: result.issues.filter((i) => i.level === "warning").length,
  };
  const failed = counts.errors > 0 || (failOn === "warning" && counts.warnings > 0);
  return {
    status: failed ? "failed" : "ok",
    file,
    profile: resolved.profile.name,
    config: config.files,
    ...counts,
    issues: result.issues,
    ignored: result.ignored,
    header: describeProfile(resolved.profile, choice, config.files),
    loaded,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function humanIssue(i: Issue, color: boolean): string[] {
  const paint = !color ? (s: string) => s : i.level === "error" ? pc.red : i.level === "warning" ? pc.yellow : pc.cyan;
  const lines = [`${i.file}:${i.line}: ${paint(i.level)} ${i.rule}: ${i.message}`];
  if (i.fix) lines.push(`    fix: ${i.fix}`);
  return lines;
}

export function describeOutcome(r: FileOutcome, several: boolean, color: boolean): string[] {
  if (r.status === "error") {
    const out = [`${r.file}: ${r.message}`];
    for (const e of r.configErrors ?? []) {
      out.push(`${e.file}:${e.line}: ${e.message}`);
      if (e.fix) out.push(`    fix: ${e.fix}`);
    }
    return out;
  }
  const out: string[] = [];
  out.push(several ? `${r.file}: ${r.header}` : r.header);
  for (const i of r.issues) out.push(...humanIssue(i, color));
  const parts = [plural(r.errors, "error"), plural(r.warnings, "warning")];
  const ignored = r.ignored.length > 0 ? `, ${r.ignored.length} ignored` : "";
  const summary = `${r.file}: ${parts.join(", ")}${ignored}`;
  out.push(r.status === "ok" ? (color ? pc.green(summary) : summary) : color ? pc.red(summary) : summary);
  return out;
}

function worst(a: ExitCode, b: ExitCode): ExitCode {
  const rank = (c: ExitCode) => (c === EXIT.usage ? 2 : c === EXIT.problems ? 1 : 0);
  return rank(b) > rank(a) ? b : a;
}

/** `quiz check FILE...` (COMMANDS.md). Every input is attempted; the exit code is the worst one. */
export function runCheck(patterns: readonly string[], opts: CheckOptions, io: CheckIo): ExitCode {
  const inputs = expandInputs(patterns, io.cwd);
  const several = inputs.files.length + inputs.errors.length > 1;
  const color = !opts.plain && !opts.json && io.tty && !("NO_COLOR" in (io.machine?.env ?? process.env));
  let exit: ExitCode = EXIT.done;
  let ok = 0;
  let failed = 0;

  if (opts.review !== null) {
    fail(
      io,
      opts.json,
      "quiz check --review is not available yet: it needs the review.json that `quiz review` writes, which arrives with that command",
    );
    return EXIT.usage;
  }
  if (inputs.files.length === 0 && inputs.errors.length === 0) {
    fail(io, opts.json, "nothing to work on: give at least one quiz file");
    return EXIT.usage;
  }

  const emit = (r: FileOutcome) => {
    if (opts.json) {
      if (r.status === "error") {
        io.out(
          JSON.stringify({
            status: "error",
            file: r.file,
            message: r.message,
            ...(r.configErrors ? { errors: r.configErrors } : {}),
          }),
        );
        for (const line of describeOutcome(r, several, false)) io.err(line);
      } else {
        const { header: _header, ...rest } = r;
        io.out(
          JSON.stringify({
            status: rest.status,
            file: rest.file,
            profile: rest.profile,
            config: rest.config,
            errors: rest.errors,
            warnings: rest.warnings,
            issues: rest.issues.map(({ rule, level, file, line, message, fix }) => ({
              rule,
              level,
              file,
              line,
              message,
              fix: fix ?? null,
            })),
            ignored: rest.ignored,
          }),
        );
      }
    } else for (const line of describeOutcome(r, several, color)) (r.status === "error" ? io.err : io.out)(line);
  };

  const progress = !opts.json && !opts.plain && io.tty && inputs.files.length > 1;
  let n = 0;
  // one after another, in the order given (COMMANDS.md, "Several files"): an unusable input fails in its place
  for (const item of inputs.items) {
    if ("error" in item) {
      emit({ status: "error", file: item.error.input, message: item.error.message });
      failed++;
      exit = worst(exit, EXIT.usage);
      continue;
    }
    const file = item.file;
    n++;
    if (progress) io.errRaw(`\r[${n}/${inputs.files.length}] ${file}`);
    const result = checkFile(file, opts, io);
    if (progress) io.errRaw("\r\u001b[K");
    emit(result);
    if (result.status === "error") {
      failed++;
      exit = worst(exit, EXIT.usage);
    } else if (result.status === "failed") {
      failed++;
      exit = worst(exit, EXIT.problems);
    } else ok++;
  }
  if (several) {
    if (opts.json) io.out(JSON.stringify({ status: "done", ok, failed }));
    else io.out(`${ok} done, ${failed} failed`);
  }
  return exit;
}
