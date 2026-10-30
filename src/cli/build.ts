import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { languagesUsed, loadHighlighter } from "../build/highlight";
import { buildPage } from "../build/page";
import { katexTools } from "../build/tex";
import { FONT_CHOICES, FONT_REGISTRY, type FontsChoice } from "../core/fonts";
import type { Issue } from "../core/issue";
import { type WriteError, writeFileAtomic } from "./atomic";
import { type CheckIo, checkFile, describeOutcome, humanIssue } from "./check";
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

/** `quiz build FILE` (COMMANDS.md): checks the quiz as `check` does, then writes one page; nothing on errors. */
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
  if (inputs.files.length + inputs.errors.length > 1) {
    fail(io, false, "building several files is not available yet: give one quiz file");
    return EXIT.usage;
  }
  const bad = inputs.errors[0];
  if (bad) {
    fail(io, false, bad.message, { file: bad.input });
    return EXIT.usage;
  }
  const file = inputs.files[0];
  if (file === undefined) {
    fail(io, false, "nothing to work on: give a quiz file");
    return EXIT.usage;
  }

  const result = checkFile(file, { ...opts, review: null, json: false, plain: true }, io);
  if (result.status === "error") {
    for (const line of describeOutcome(result, false, false)) io.err(line);
    return EXIT.usage;
  }
  if (result.status === "failed" || result.loaded.quiz === null) {
    // nothing is written; the issues are printed as `check` prints them
    for (const line of describeOutcome(result, false, false)) io.out(line);
    return EXIT.problems;
  }
  for (const issue of result.issues) for (const line of humanIssue(issue, false)) io.out(line);

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
    for (const line of humanIssue(issue, false)) io.out(line);
    if (opts.strict) return EXIT.problems;
  }

  const folder = io.runtimeDir ?? runtimeFolder();
  let runtime: string;
  let css: string;
  try {
    runtime = readFileSync(join(folder, "page.js"), "utf8");
    css = readFileSync(join(folder, "page.css"), "utf8");
  } catch {
    fail(io, false, "the page runtime is missing next to the program: run `npm run build`", { file });
    return EXIT.usage;
  }

  // Shiki loads only if the quiz or a sheet has a fence of a known language; KaTeX only when a span is rendered
  const highlight = await loadHighlighter(languagesUsed(result.loaded.quiz, result.loaded.sheets));
  const builtAt = opts.builtAt ?? (io.now?.() ?? new Date()).toISOString();
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
      runtime,
      css,
      builtAt,
      version: opts.version,
      math: katexTools(),
      highlight,
      fonts,
    },
  );

  const source = resolve(io.cwd, file);
  const target =
    opts.output !== null
      ? resolve(io.cwd, opts.output)
      : join(dirname(source), `${basename(source, extname(source))}.html`);
  try {
    await writeFileAtomic(target, new TextEncoder().encode(html));
  } catch (error) {
    const e = error as WriteError;
    fail(io, false, `cannot write the file: ${e.message}`, { file: shownPath(e.file ?? target, io.cwd) });
    return EXIT.usage;
  }
  io.out(`${shownPath(source, io.cwd)}: wrote ${shownPath(target, io.cwd)}`);
  return EXIT.done;
}
