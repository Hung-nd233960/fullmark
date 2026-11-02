import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { languagesUsed, loadHighlighter } from "../build/highlight";
import { buildPage } from "../build/page";
import { katexTools } from "../build/tex";
import { ISO_TIME } from "../core/config/build-file";
import type { ConfigError } from "../core/config/types";
import { FONT_CHOICES, FONT_REGISTRY, type FontsChoice } from "../core/fonts";
import type { Issue } from "../core/issue";
import { type WriteError, writeFileAtomic } from "./atomic";
import { type Job, type PlanItem, planBuildFile } from "./build-file";
import {
  batchSummary,
  type CheckIo,
  checkFile,
  clearProgress,
  describeOutcome,
  humanIssue,
  issueJson,
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
  /** `--ui-lang en|vi`: the page's language for this build, over the quiz's `ui_lang` */
  uiLang: string | null;
  /** `--fonts`; null: `fonts` in the machine config, else `quiz` */
  fonts: string | null;
  /** `--plain`: no colours and no progress line */
  plain: boolean;
  /** `--json`: one object per file on stdout, nothing else */
  json: boolean;
  /** `--build-file BUILD`: the entries of this file say what to build, with the `FILE`s as a filter */
  buildFile: string | null;
  /** `--open`: open the page after a single successful build */
  open: boolean;
  /** the options that arrive with later slices; any of them set is "not available yet" */
  later: string[];
  version: string;
};

/** An `Io` plus where the page runtime is and what time it is, which tests control; the defaults are the real ones. */
export type BuildIo = CheckIo & {
  runtimeDir?: string;
  now?: () => Date;
  /** opens a page with the system's opener, without waiting for it; rejects or throws when it cannot start */
  open?: (path: string) => void | Promise<void>;
};

/** The system's opener (COMMANDS.md, `--open`): `start` through `cmd` on Windows, `open` on macOS, else `xdg-open`. */
export function systemOpen(path: string): Promise<void> {
  const [command, args]: [string, string[]] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", '""', `"${path}"`]]
      : process.platform === "darwin"
        ? ["open", [path]]
        : ["xdg-open", [path]];
  return new Promise((done, fail) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsVerbatimArguments: true });
    child.once("error", fail);
    child.once("spawn", () => {
      child.unref();
      done();
    });
  });
}

/** `dist/`: `page.js` and `page.css` sit beside `cli.js`. Run from the sources (tests), they are in `<repo>/dist`. */
function runtimeFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return existsSync(join(here, "page.js")) ? here : resolve(here, "..", "..", "dist");
}

/** `21.4 MB`: one decimal, MB being 1,000,000 bytes. */
const megabytes = (bytes: number): string => `${(bytes / 1e6).toFixed(1)} MB`;

/** What one file came to: its exit code and the lines it prints, in order. */
type FileResult = {
  file: string;
  exit: ExitCode;
  /** `built`; `failed` for content that is wrong (check errors, `--strict`, a page over `max-mb`); `error` for I/O */
  status: "built" | "failed" | "error";
  /** every issue of the file, the check's and the build's */
  issues: Issue[];
  output: string | null;
  bytes: number | null;
  out: string[];
  err: string[];
  /** for `error`: what `--json` says, and which file it names when that is not the source */
  message?: string;
  errFile?: string;
  configErrors?: ConfigError[];
};

type RunContext = { io: BuildIo; several: boolean; builtAt: string; runtime: () => Runtime | null };
type Runtime = { runtime: string; css: string };

/** Where a file's page goes: `-o` (a file for one input, a folder for several), else beside the source. */
function targetOf(file: string, opts: BuildOptions, io: BuildIo, several: boolean): string {
  const source = resolve(io.cwd, file);
  const name = `${basename(source, extname(source))}.html`;
  if (opts.output === null) return join(dirname(source), name);
  return several ? join(resolve(io.cwd, opts.output), name) : resolve(io.cwd, opts.output);
}

/** A file's `--json` line: `check --json`'s issues, split into `errors` and `warnings`. */
function jsonLine(r: FileResult, several: boolean): Record<string, unknown> {
  const file = several ? { file: r.file } : {};
  if (r.status === "error") {
    return {
      status: "error",
      ...(r.errFile !== undefined ? { file: r.errFile } : file),
      message: r.message,
      ...(r.configErrors ? { errors: r.configErrors } : {}),
    };
  }
  return {
    status: r.status,
    ...file,
    output: r.output,
    bytes: r.bytes,
    errors: r.issues.filter((i) => i.level === "error").map(issueJson),
    warnings: r.issues.filter((i) => i.level === "warning").map(issueJson),
  };
}

/** One file, checked and built exactly as alone (COMMANDS.md, "Several files"). Nothing is printed here. */
async function buildOne(job: Job, c: RunContext): Promise<FileResult> {
  const { file, opts } = job;
  const { io } = c;
  const issues: Issue[] = [];
  const failedWith = (out: string[]): FileResult => ({
    file,
    exit: EXIT.problems,
    status: "failed",
    issues,
    output: null,
    bytes: null,
    out,
    err: [],
  });
  const errorWith = (message: string, err: string[], errFile?: string): FileResult => ({
    file,
    exit: EXIT.usage,
    status: "error",
    issues,
    output: null,
    bytes: null,
    out: [],
    err,
    message,
    ...(errFile === undefined ? {} : { errFile }),
  });
  const result = checkFile(file, { ...opts, review: null, json: false, plain: true }, io);
  if (result.status === "error") {
    return {
      ...errorWith(result.message, describeOutcome(result, false, false)),
      ...(result.configErrors ? { configErrors: result.configErrors } : {}),
    };
  }
  issues.push(...result.issues);
  if (result.status === "failed" || result.loaded.quiz === null) {
    // nothing is written; the issues are printed as `check` prints them
    return failedWith(describeOutcome(result, c.several, false));
  }
  const out: string[] = [];
  for (const issue of result.issues) out.push(...humanIssue(issue, false));

  // `--fonts`, else the machine config's `fonts`, else the quiz's own font
  const machine = io.machine ?? { ...realMachine(), cwd: io.cwd };
  const machineFonts = loadConfig(machine, dirname(resolve(io.cwd, file)), opts.config).layers.user?.fonts;
  const fonts: FontsChoice = (opts.fonts as FontsChoice | null) ?? machineFonts ?? "quiz";
  const fontsGiven = opts.fonts !== null || machineFonts !== undefined;
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
    issues.push(issue);
    if (opts.strict) return failedWith(out);
  }

  const runtime = c.runtime();
  if (runtime === null) {
    const message = "the page runtime is missing next to the program: run `npm run build`";
    return errorWith(message, [`${file}: ${message}`]);
  }

  // Shiki loads only if the quiz or a sheet has a fence of a known language; KaTeX only when a span is rendered
  const highlight = await loadHighlighter(languagesUsed(result.loaded.quiz, result.loaded.sheets));
  // `--ui-lang` changes the page's language only: the hash and the key's `lang` (grading) are the quiz's own
  const shown: "en" | "vi" | null = opts.uiLang === "vi" ? "vi" : opts.uiLang === "en" ? "en" : null;
  const page = new TextEncoder().encode(
    buildPage(
      [
        {
          quiz: result.loaded.quiz,
          ...(shown === null ? {} : { uiLang: shown }),
          hash: result.loaded.hash ?? "",
          assets: result.loaded.assets,
          sheets: result.loaded.sheets,
        },
      ],
      {
        runtime: runtime.runtime,
        css: runtime.css,
        builtAt: opts.builtAt ?? c.builtAt,
        version: opts.version,
        math: katexTools(),
        highlight,
        fonts,
        // the Information tab shows what was given, and a default as the default
        given: {
          profile: opts.profile,
          fonts: fontsGiven ? fonts : null,
          uiLang: shown,
          strict: opts.strict,
        },
      },
    ),
  );

  // the page's size, which `check` cannot know: `build.size` (warn-mb, max-mb; MB is 1,000,000 bytes)
  const sizeRule = result.resolved.rules.get("build.size");
  const warnMb = Number(sizeRule?.options["warn-mb"] ?? 20);
  const maxMb = Number(sizeRule?.options["max-mb"] ?? 100);
  const sized = (limit: string, level: Issue["level"], tail = ""): Issue => ({
    rule: "build.size",
    level,
    file,
    line: 1,
    message: `the page is ${megabytes(page.length)} (1 MB is 1,000,000 bytes), over ${limit}${tail}`,
    fix: "use smaller or fewer images, or build with `--fonts quiz` or `--fonts none`",
  });
  if (page.length > maxMb * 1e6) {
    const issue = sized(`max-mb ${maxMb} MB`, "error", ", so nothing was written");
    issues.push(issue);
    out.push(...humanIssue(issue, false));
    return failedWith(out);
  }
  if (page.length > warnMb * 1e6 && sizeRule !== undefined && sizeRule.level !== "off") {
    const level = opts.strict && sizeRule.level === "warning" ? "error" : sizeRule.level;
    const issue = sized(`warn-mb ${warnMb} MB`, level);
    issues.push(issue);
    out.push(...humanIssue(issue, false));
    if (level === "error") return failedWith(out);
  }

  const source = resolve(io.cwd, file);
  const target = job.target;
  try {
    await writeFileAtomic(target, page);
  } catch (error) {
    const e = error as WriteError;
    const shown = shownPath(e.file ?? target, io.cwd);
    return errorWith(`cannot write the file: ${e.message}`, [`${shown}: cannot write the file: ${e.message}`], shown);
  }
  const output = shownPath(target, io.cwd);
  out.push(`${shownPath(source, io.cwd)}: wrote ${output}`);
  return { file, exit: EXIT.done, status: "built", issues, output, bytes: page.length, out, err: [] };
}

/** `quiz build FILE...` (COMMANDS.md): each file is checked as `check` does, then written as one page; nothing on errors. */
export async function runBuild(patterns: readonly string[], opts: BuildOptions, io: BuildIo): Promise<ExitCode> {
  if (opts.later.length > 0) {
    fail(
      io,
      opts.json,
      `${opts.later.map((o) => `--${o}`).join(", ")} is not available yet: it arrives in a later release`,
    );
    return EXIT.usage;
  }
  if (opts.builtAt !== null && !ISO_TIME.test(opts.builtAt)) {
    fail(io, opts.json, `--built-at ${opts.builtAt} is not an ISO date and time, such as 2026-10-24T09:00:00+07:00`);
    return EXIT.usage;
  }
  if (opts.fonts !== null && !(FONT_CHOICES as readonly string[]).includes(opts.fonts)) {
    fail(io, opts.json, `--fonts ${opts.fonts} is not one of quiz, all, none`);
    return EXIT.usage;
  }
  if (opts.uiLang !== null && opts.uiLang !== "en" && opts.uiLang !== "vi") {
    fail(io, opts.json, `--ui-lang ${opts.uiLang} is not one of en, vi`);
    return EXIT.usage;
  }
  let items: PlanItem[];
  if (opts.buildFile !== null) {
    // the entries of the build file become the same list `build FILE...` works through
    const plan = planBuildFile(opts.buildFile, patterns, opts, io.cwd);
    if (!plan.ok) {
      fail(
        io,
        opts.json,
        plan.message,
        { ...(plan.file ? { file: plan.file } : {}), ...(plan.errors ? { errors: plan.errors } : {}) },
        plan.details,
      );
      return EXIT.usage;
    }
    items = plan.items;
  } else {
    const inputs = expandInputs(patterns, io.cwd);
    if (inputs.files.length === 0 && inputs.errors.length === 0) {
      fail(io, opts.json, "nothing to work on: give a quiz file");
      return EXIT.usage;
    }
    if (inputs.files.length + inputs.errors.length > 1 && opts.output !== null) {
      // before anything is built: a page's name, a file in the way, or two pages with one name
      if (/\.html?$/i.test(opts.output)) {
        fail(io, opts.json, `-o ${opts.output} looks like a page, and building several files needs a folder`);
        return EXIT.usage;
      }
      const folder = resolve(io.cwd, opts.output);
      if (existsSync(folder) && !statSync(folder).isDirectory()) {
        fail(io, opts.json, `-o ${opts.output} is a file, and building several files needs a folder`);
        return EXIT.usage;
      }
      const names = new Map<string, string>();
      for (const file of inputs.files) {
        const name = basename(targetOf(file, opts, io, true));
        const key = process.platform === "win32" ? name.toLowerCase() : name;
        const other = names.get(key);
        if (other !== undefined) {
          fail(io, opts.json, `${other} and ${file} would both be written to ${shownPath(join(folder, name), io.cwd)}`);
          return EXIT.usage;
        }
        names.set(key, file);
      }
    }
    const manyInputs = inputs.files.length + inputs.errors.length > 1;
    items = inputs.items.map((item) =>
      "error" in item
        ? item
        : {
            job: {
              file: item.file,
              abs: resolve(io.cwd, item.file),
              opts,
              target: targetOf(item.file, opts, io, manyInputs),
            },
          },
    );
  }
  const several = items.length > 1;
  const jobCount = items.filter((i) => "job" in i).length;

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
    io,
    several,
    builtAt: opts.builtAt ?? (io.now?.() ?? new Date()).toISOString(),
    runtime,
  };

  const progress = !opts.json && !opts.plain && io.tty && jobCount > 1;
  let exit: ExitCode = EXIT.done;
  let ok = 0;
  let failed = 0;
  let n = 0;
  let opened: string | null = null;
  // one after another, in the order given: an unusable input fails in its place
  for (const item of items) {
    if ("error" in item) {
      fail(io, opts.json, item.error.message, { file: item.error.input });
      failed++;
      exit = worst(exit, EXIT.usage);
      continue;
    }
    n++;
    if (progress) showProgress(io, n, jobCount, item.job.file);
    const r = await buildOne(item.job, context);
    if (progress) clearProgress(io);
    if (opts.json) {
      io.out(JSON.stringify(jsonLine(r, several)));
      for (const line of r.err) io.err(line);
    } else {
      for (const line of r.out) io.out(line);
      for (const line of r.err) io.err(line);
    }
    if (r.exit === EXIT.done) ok++;
    else failed++;
    exit = worst(exit, r.exit);
    if (r.status === "built" && r.output !== null) opened = resolve(io.cwd, r.output);
  }
  if (opts.open) {
    if (several) io.err(`--open opens one page; built ${ok}`);
    else if (opened !== null) {
      try {
        await (io.open ?? systemOpen)(opened);
      } catch (error) {
        const e = error as { code?: string; message?: string };
        io.err(
          `warning: cannot open the page: ${e.code === "ENOENT" ? "the system's opener was not found" : (e.message ?? "unknown error")}`,
        );
      }
    }
  }
  if (several) io.out(opts.json ? JSON.stringify({ status: "done", ok, failed }) : batchSummary(ok, failed));
  return exit;
}
