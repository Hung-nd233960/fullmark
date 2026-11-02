import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { languagesUsed, loadHighlighter } from "../build/highlight";
import { buildPage } from "../build/page";
import { katexTools } from "../build/tex";
import { FONT_CHOICES, FONT_REGISTRY, type FontsChoice } from "../core/fonts";
import type { Issue } from "../core/issue";
import { type WriteError, writeFileAtomic } from "./atomic";
import {
  batchSummary,
  type CheckIo,
  checkFile,
  clearProgress,
  describeOutcome,
  humanIssue,
  showProgress,
  worst,
} from "./check";
import { loadConfig, realMachine } from "./config";
import { EXIT, type ExitCode } from "./exit-codes";
import { fail } from "./fail";
import { expandInputs } from "./files";
import { shownPath } from "./paths";

export type BuildOptions = {
  profile: string | null;
  config: string | null;
  strict: boolean;
  output: string | null;
  builtAt: string | null;
  /** `--fonts`; null: `fonts` in the machine config, else `quiz` */
  fonts: string | null;
  /** `--plain`: no colours and no progress line */
  plain: boolean;
  /** the options that arrive with later slices; any of them set is "not available yet" */
  later: string[];
  version: string;
};

/** An `Io` plus where the page runtime is and what time it is, which tests control; the defaults are the real ones. */
export type BuildIo = CheckIo & { runtimeDir?: string; now?: () => Date };

const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)?$/;

/** `dist/`: `page.js` and `page.css` sit beside `cli.js`. Run from the sources (tests), they are in `<repo>/dist`. */
function runtimeFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return existsSync(join(here, "page.js")) ? here : resolve(here, "..", "..", "dist");
}

/** What one file came to: its exit code and the lines it prints, in order. */
type FileResult = {
  file: string;
  exit: ExitCode;
  out: string[];
  err: string[];
};

type RunContext = { opts: BuildOptions; io: BuildIo; several: boolean; builtAt: string; runtime: () => Runtime | null };
type Runtime = { runtime: string; css: string };

/** Where a file's page goes: `-o` (a file for one input, a folder for several), else beside the source. */
function targetOf(file: string, opts: BuildOptions, io: BuildIo, several: boolean): string {
  const source = resolve(io.cwd, file);
  const name = `${basename(source, extname(source))}.html`;
  if (opts.output === null) return join(dirname(source), name);
  return several ? join(resolve(io.cwd, opts.output), name) : resolve(io.cwd, opts.output);
}

/** One file, checked and built exactly as alone (COMMANDS.md, "Several files"). Nothing is printed here. */
async function buildOne(file: string, c: RunContext): Promise<FileResult> {
  const { opts, io } = c;
  const done = (exit: ExitCode, out: string[] = [], err: string[] = []): FileResult => ({ file, exit, out, err });
  const result = checkFile(file, { ...opts, review: null, json: false, plain: true }, io);
  if (result.status === "error") return done(EXIT.usage, [], describeOutcome(result, false, false));
  if (result.status === "failed" || result.loaded.quiz === null) {
    // nothing is written; the issues are printed as `check` prints them
    return done(EXIT.problems, describeOutcome(result, c.several, false));
  }
  const out: string[] = [];
  for (const issue of result.issues) out.push(...humanIssue(issue, false));

  // `--fonts`, else the machine config's `fonts`, else the quiz's own font
  const machine = io.machine ?? { ...realMachine(), cwd: io.cwd };
  const fonts: FontsChoice =
    (opts.fonts as FontsChoice | null) ??
    loadConfig(machine, dirname(resolve(io.cwd, file)), opts.config).layers.user?.fonts ??
    "quiz";
  const front = result.loaded.quiz.frontMatter;
  if (fonts === "none" && front.look === "locked" && front.font !== "system") {
    const family = FONT_REGISTRY[front.font].family;
    const issue: Issue = {
      rule: "build.font-not-embedded",
      level: opts.strict ? "error" : "warning",
      file,
      line: 1,
      message: `the quiz is locked to the font ${family}, which this page does not embed: the system font will stand in unless ${family} is installed`,
      fix: "build without `--fonts none`, or give the quiz `font: system`",
    };
    out.push(...humanIssue(issue, false));
    if (opts.strict) return done(EXIT.problems, out);
  }

  const runtime = c.runtime();
  if (runtime === null) {
    return done(EXIT.usage, [], [`${file}: the page runtime is missing next to the program: run \`npm run build\``]);
  }

  // Shiki loads only if the quiz or a sheet has a fence of a known language; KaTeX only when a span is rendered
  const highlight = await loadHighlighter(languagesUsed(result.loaded.quiz, result.loaded.sheets));
  const html = buildPage(
    [
      {
        quiz: result.loaded.quiz,
        hash: result.loaded.hash ?? "",
        assets: result.loaded.assets,
        sheets: result.loaded.sheets,
      },
    ],
    {
      runtime: runtime.runtime,
      css: runtime.css,
      builtAt: c.builtAt,
      version: opts.version,
      math: katexTools(),
      highlight,
      fonts,
    },
  );

  const source = resolve(io.cwd, file);
  const target = targetOf(file, opts, io, c.several);
  try {
    await writeFileAtomic(target, new TextEncoder().encode(html));
  } catch (error) {
    const e = error as WriteError;
    return done(EXIT.usage, [], [`${shownPath(e.file ?? target, io.cwd)}: cannot write the file: ${e.message}`]);
  }
  out.push(`${shownPath(source, io.cwd)}: wrote ${shownPath(target, io.cwd)}`);
  return done(EXIT.done, out);
}

/** `quiz build FILE...` (COMMANDS.md): each file is checked as `check` does, then written as one page; nothing on errors. */
export async function runBuild(patterns: readonly string[], opts: BuildOptions, io: BuildIo): Promise<ExitCode> {
  if (opts.later.length > 0) {
    fail(
      io,
      false,
      `${opts.later.map((o) => `--${o}`).join(", ")} is not available yet: it arrives in a later release`,
    );
    return EXIT.usage;
  }
  if (opts.builtAt !== null && !ISO.test(opts.builtAt)) {
    fail(io, false, `--built-at ${opts.builtAt} is not an ISO date and time, such as 2026-10-24T09:00:00+07:00`);
    return EXIT.usage;
  }
  if (opts.fonts !== null && !(FONT_CHOICES as readonly string[]).includes(opts.fonts)) {
    fail(io, false, `--fonts ${opts.fonts} is not one of quiz, all, none`);
    return EXIT.usage;
  }
  const inputs = expandInputs(patterns, io.cwd);
  if (inputs.files.length === 0 && inputs.errors.length === 0) {
    fail(io, false, "nothing to work on: give a quiz file");
    return EXIT.usage;
  }
  const several = inputs.files.length + inputs.errors.length > 1;
  if (several && opts.output !== null) {
    // before anything is built: a file in the way, or two pages with one name
    const folder = resolve(io.cwd, opts.output);
    if (existsSync(folder) && !statSync(folder).isDirectory()) {
      fail(io, false, `-o ${opts.output} is a file, and building several files needs a folder`);
      return EXIT.usage;
    }
    const names = new Map<string, string>();
    for (const file of inputs.files) {
      const name = basename(targetOf(file, opts, io, true));
      const key = process.platform === "win32" ? name.toLowerCase() : name;
      const other = names.get(key);
      if (other !== undefined) {
        fail(io, false, `${other} and ${file} would both be written to ${shownPath(join(folder, name), io.cwd)}`);
        return EXIT.usage;
      }
      names.set(key, file);
    }
  }

  // the runtime is read once per run, when the first file needs it
  let loaded: Runtime | null | undefined;
  const runtime = (): Runtime | null => {
    if (loaded !== undefined) return loaded;
    const folder = io.runtimeDir ?? runtimeFolder();
    try {
      loaded = {
        runtime: readFileSync(join(folder, "page.js"), "utf8"),
        css: readFileSync(join(folder, "page.css"), "utf8"),
      };
    } catch {
      loaded = null;
    }
    return loaded;
  };
  const context: RunContext = {
    opts,
    io,
    several,
    builtAt: opts.builtAt ?? (io.now?.() ?? new Date()).toISOString(),
    runtime,
  };

  const progress = !opts.plain && io.tty && inputs.files.length > 1;
  let exit: ExitCode = EXIT.done;
  let ok = 0;
  let failed = 0;
  let n = 0;
  // one after another, in the order given: an unusable input fails in its place
  for (const item of inputs.items) {
    if ("error" in item) {
      fail(io, false, item.error.message, { file: item.error.input });
      failed++;
      exit = worst(exit, EXIT.usage);
      continue;
    }
    n++;
    if (progress) showProgress(io, n, inputs.files.length, item.file);
    const r = await buildOne(item.file, context);
    if (progress) clearProgress(io);
    for (const line of r.out) io.out(line);
    for (const line of r.err) io.err(line);
    if (r.exit === EXIT.done) ok++;
    else failed++;
    exit = worst(exit, r.exit);
  }
  if (several) io.out(batchSummary(ok, failed));
  return exit;
}
