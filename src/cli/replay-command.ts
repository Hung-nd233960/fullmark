import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseGrades } from "../core/rubric/grades";
import { type BuildIo, type BuildOptions, runBuild } from "./build";
import { EXIT, type ExitCode } from "./exit-codes";
import { fail } from "./fail";
import { expandInputs } from "./files";
import { loadQuiz } from "./load";
import { readFailure, shownPath } from "./paths";
import type { ReplayOptions } from "./replay";

export type ReplayCommandOptions = {
  quiz: string | null;
  grades: string | null;
  output: string | null;
  builtAt: string | null;
  uiLang: string | null;
  fonts: string | null;
  plain: boolean;
  json: boolean;
  /** `--open` */
  open: boolean;
  /** `--no-open` */
  noOpen: boolean;
  version: string;
};

/**
 * `quiz replay RESULTS... --quiz FILE` (COMMANDS.md): each results file becomes a page already submitted. The job
 * loop is `build`'s own (globs, the worst exit, progress, the summary, `--json`); only what one file needs differs.
 */
export async function runReplay(
  patterns: readonly string[],
  opts: ReplayCommandOptions,
  io: BuildIo,
): Promise<ExitCode> {
  if (opts.quiz === null) {
    fail(io, opts.json, "give the quiz the attempt was taken on with --quiz FILE: the page is made from it");
    return EXIT.usage;
  }
  if (opts.open && opts.noOpen) {
    fail(io, opts.json, "--open and --no-open cannot be used together");
    return EXIT.usage;
  }
  const inputs = expandInputs(patterns, io.cwd);
  if (opts.grades !== null && inputs.files.length + inputs.errors.length > 1) {
    fail(io, opts.json, "--grades takes one results file: it grades one attempt");
    return EXIT.usage;
  }
  let loaded: ReturnType<typeof loadQuiz>;
  try {
    loaded = loadQuiz(resolve(io.cwd, opts.quiz));
  } catch (error) {
    fail(io, opts.json, `cannot read the quiz: ${readFailure(error)}`, { file: shownPath(opts.quiz, io.cwd) });
    return EXIT.usage;
  }
  if (loaded.quiz === null || loaded.hash === null) {
    // "does not parse": the attempt cannot be shown on a text that has no questions to show it against
    fail(
      io,
      opts.json,
      "the quiz has errors, so the attempt cannot be shown on it; run `quiz check` on it",
      { file: shownPath(opts.quiz, io.cwd) },
      loaded.issues.filter((x) => x.level === "error").map((i) => `  ${i.line}: ${i.rule}: ${i.message}`),
    );
    return EXIT.problems;
  }
  let grades: ReplayOptions["grades"] = null;
  if (opts.grades !== null) {
    const shown = shownPath(opts.grades, io.cwd);
    let text: string;
    try {
      text = readFileSync(resolve(io.cwd, opts.grades)).toString("utf8");
    } catch (error) {
      fail(io, opts.json, `cannot read the grades file: ${readFailure(error)}`, { file: shown });
      return EXIT.usage;
    }
    const read = parseGrades(text);
    if (!read.ok) {
      fail(io, opts.json, read.message, { file: shown });
      return EXIT.problems;
    }
    grades = { shown, file: read.file };
  }
  const replay: ReplayOptions = {
    quiz: shownPath(opts.quiz, io.cwd),
    loaded,
    grades,
    open: opts.open ? "yes" : opts.noOpen ? "no" : "default",
  };
  const build: BuildOptions = {
    profile: null,
    config: null,
    strict: false,
    output: opts.output,
    builtAt: opts.builtAt,
    uiLang: opts.uiLang,
    fonts: opts.fonts,
    plain: opts.plain,
    json: opts.json,
    buildFile: null,
    open: false,
    replay,
    later: [],
    version: opts.version,
  };
  return runBuild(patterns, build, io);
}
