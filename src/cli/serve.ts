import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { languagesUsed, loadHighlighter } from "../build/highlight";
import { buildPage } from "../build/page";
import { katexTools } from "../build/tex";
import { answerProblem } from "../core/attempt";
import { FONT_CHOICES, type FontsChoice } from "../core/fonts";
import { en, vi } from "../core/i18n";
import type { Quiz } from "../core/ir";
import { buildReport } from "../core/report";
import { readServeModule } from "../serve/module-file";
import { type ServerOutcome, startServer } from "../serve/server";
import { writeFileAtomic } from "./atomic";
import { type BuildIo, runtimeFolder, systemOpen } from "./build";
import { checkFile, describeOutcome, issueJson } from "./check";
import { loadConfig, realMachine } from "./config";
import { EXIT, type ExitCode } from "./exit-codes";
import { fail } from "./fail";
import { readFailure, shownPath } from "./paths";

export type ServeOptions = {
  out: string | null;
  /** seconds, as given; null: 1800 */
  timeout: string | null;
  open: boolean;
  /** as given; null: a free port */
  port: string | null;
  json: boolean;
  profile: string | null;
  config: string | null;
  fonts: string | null;
  /** options that arrive with slice 3b; any of them set is "not available yet" */
  later: string[];
  version: string;
};

/** What `serve` needs beyond `build`: where Ctrl+C comes from and the timer, which tests control. */
export type ServeIo = BuildIo & {
  /** registers the Ctrl+C handler and returns the function that removes it; the default is `process.once("SIGINT")` */
  onInterrupt?: (handler: () => void) => () => void;
  setTimer?: (fire: () => void, ms: number) => () => void;
};

const pad = (n: number): string => String(n).padStart(2, "0");

/** `YYYYMMDD-HHMMSS` in local time: the page's export name, so the two kinds of file sort together. */
const localStamp = (d: Date): string =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const defaultInterrupt = (handler: () => void): (() => void) => {
  process.once("SIGINT", handler);
  return () => {
    process.off("SIGINT", handler);
  };
};

/** A whole number of at least `min`, written in digits only. */
const wholeNumber = (text: string, min: number): number | null =>
  /^\d+$/.test(text) && Number(text) >= min ? Number(text) : null;

/**
 * `quiz serve FILE` (COMMANDS.md): checks the quiz as `build` does, builds the page in memory with the server module
 * on it, serves it on 127.0.0.1 and waits for one valid submit, which is written atomically to `--out` and graded with
 * the shared grader. With `--json` the first line is `listening` and the second the outcome.
 */
export async function runServe(file: string, opts: ServeOptions, io: ServeIo): Promise<ExitCode> {
  if (opts.later.length > 0) {
    fail(
      io,
      opts.json,
      `${opts.later.map((o) => `--${o}`).join(", ")} is not available yet: it arrives in a later release`,
    );
    return EXIT.usage;
  }
  if (/\.html?$/i.test(file)) {
    fail(io, opts.json, "serve takes the quiz source; to collect results from a built page, use its Export button");
    return EXIT.usage;
  }
  const timeout = opts.timeout === null ? 1800 : wholeNumber(opts.timeout, 0);
  if (timeout === null) {
    fail(io, opts.json, `--timeout ${opts.timeout} is not a number of seconds (0 waits forever)`);
    return EXIT.usage;
  }
  const port = opts.port === null ? 0 : wholeNumber(opts.port, 1);
  if (port === null || port > 65535) {
    fail(io, opts.json, `--port ${opts.port} is not a port number (1 to 65535)`);
    return EXIT.usage;
  }
  if (opts.fonts !== null && !(FONT_CHOICES as readonly string[]).includes(opts.fonts)) {
    fail(io, opts.json, `--fonts ${opts.fonts} is not one of quiz, all, none`);
    return EXIT.usage;
  }

  // checked as `build` checks: the same file, the same profile and config; errors stop here, nothing is served
  const result = checkFile(
    file,
    { profile: opts.profile, config: opts.config, strict: false, review: null, json: false, plain: true },
    io,
  );
  if (result.status === "error") {
    if (opts.json) {
      io.out(
        JSON.stringify({
          status: "error",
          message: result.message,
          ...(result.configErrors ? { errors: result.configErrors } : {}),
        }),
      );
    }
    for (const line of describeOutcome(result, false, false)) io.err(line);
    return EXIT.usage;
  }
  if (result.status === "failed" || result.loaded.quiz === null) {
    if (opts.json) {
      io.out(
        JSON.stringify({
          status: "failed",
          errors: result.issues.filter((i) => i.level === "error").map(issueJson),
          warnings: result.issues.filter((i) => i.level === "warning").map(issueJson),
        }),
      );
      for (const line of describeOutcome(result, false, false)) io.err(line);
    } else {
      for (const line of describeOutcome(result, false, false)) io.out(line);
    }
    return EXIT.problems;
  }
  const loaded = result.loaded;
  const quiz = loaded.quiz as Quiz;
  const hash = loaded.hash ?? "";
  for (const issue of result.issues) {
    if (issue.level === "warning") io.err(`${issue.file}:${issue.line}: warning ${issue.rule}: ${issue.message}`);
  }

  const folder = io.runtimeDir ?? runtimeFolder();
  const serveModule = readServeModule(folder);
  const runtime = (() => {
    try {
      return {
        runtime: readFileSync(join(folder, "page.js"), "utf8"),
        css: readFileSync(join(folder, "page.css"), "utf8"),
      };
    } catch {
      return null;
    }
  })();
  if (runtime === null || serveModule === null) {
    fail(io, opts.json, "the page runtime is missing next to the program: run `npm run build`");
    return EXIT.usage;
  }

  const machine = io.machine ?? { ...realMachine(), cwd: io.cwd };
  const machineFonts = loadConfig(machine, dirname(resolve(io.cwd, file)), opts.config).layers.user?.fonts ?? null;
  const fonts: FontsChoice = (opts.fonts as FontsChoice | null) ?? machineFonts ?? "quiz";
  const clock = io.now ?? (() => new Date());
  const highlight = await loadHighlighter(languagesUsed(quiz, loaded.sheets));
  const page = buildPage([{ quiz, hash, assets: loaded.assets, sheets: loaded.sheets }], {
    runtime: runtime.runtime,
    css: runtime.css,
    builtAt: clock().toISOString(),
    version: opts.version,
    math: katexTools(),
    highlight,
    fonts,
    given: {
      profile: opts.profile,
      fonts: opts.fonts === null && machineFonts === null ? null : fonts,
      uiLang: null,
      strict: false,
    },
    serveModule,
  });

  const quizId = quiz.frontMatter.id;
  const questions = new Map<string, Quiz["sections"][number]["questions"][number]>();
  for (const s of quiz.sections) for (const q of s.questions) questions.set(q.id, q);
  const source = resolve(io.cwd, file);
  const target =
    opts.out === null
      ? join(dirname(source), `${quizId}-results-${localStamp(clock())}.json`)
      : resolve(io.cwd, opts.out);
  const taken: { score?: ReturnType<typeof buildReport>["score"] } = {};

  let server: Awaited<ReturnType<typeof startServer>>;
  try {
    server = await startServer({
      pages: { "": page },
      quizIds: { [quizId]: hash },
      predicate: (accepted) => accepted.has(quizId),
      timeoutMs: timeout * 1000,
      port,
      ...(io.setTimer ? { setTimer: io.setTimer } : {}),
      async onSubmit(_id, results) {
        // an attempt that does not fit this quiz is refused (400), as a results file is by `quiz grade`
        const attempt = { quizHash: results.quizHash, plan: results.plan, state: results.state, phase: results.phase };
        const shape: string[] = [];
        for (const id of attempt.plan.questions) {
          const q = questions.get(id);
          const problem = q ? answerProblem(q.type, attempt.state.answers[id]) : "no question with this id";
          if (problem) shape.push(`${id}: ${problem}`);
        }
        if (shape.length > 0) return `answers that do not fit their questions: ${shape.join("; ")}`;
        const m = (quiz.frontMatter.uiLang === "vi" ? vi : en).report;
        const report = buildReport({ quiz, quizHash: hash, attempt, applied: null }, m);
        await writeFileAtomic(target, Buffer.from(`${JSON.stringify(results, null, 2)}\n`, "utf8"));
        taken.score = report.score;
        return null;
      },
    });
  } catch (error) {
    const e = error as NodeJS.ErrnoException;
    fail(
      io,
      opts.json,
      `cannot start the server${port ? ` on port ${port}` : ""}: ${e.code === "EADDRINUSE" ? "the port is in use" : readFailure(error)}`,
    );
    return EXIT.usage;
  }

  const removeInterrupt = (io.onInterrupt ?? defaultInterrupt)(() => server.stop());
  if (opts.json) io.out(JSON.stringify({ status: "listening", url: server.url, port: server.port, pid: process.pid }));
  io.err(`serving ${shownPath(source, io.cwd)} at ${server.url}`);
  io.err("waiting for Submit (Ctrl+C to stop)");
  if (opts.open) {
    try {
      await (io.open ?? systemOpen)(server.url);
    } catch (error) {
      const e = error as { code?: string; message?: string };
      io.err(
        `warning: cannot open the page: ${e.code === "ENOENT" ? "the system's opener was not found" : (e.message ?? "unknown error")}`,
      );
    }
  }

  const outcome: ServerOutcome = await server.done;
  removeInterrupt();
  switch (outcome.status) {
    case "submitted": {
      const shown = shownPath(target, io.cwd);
      if (opts.json) io.out(JSON.stringify({ status: "submitted", results: shown, score: taken.score ?? null }));
      else io.out(`wrote ${shown}`);
      return EXIT.done;
    }
    case "timeout":
      if (opts.json) io.out(JSON.stringify({ status: "timeout" }));
      io.err(`timed out after ${timeout} seconds without a submit; nothing was written`);
      return EXIT.usage;
    case "interrupted":
      if (opts.json) io.out(JSON.stringify({ status: "interrupted" }));
      io.err("stopped; nothing was written");
      return EXIT.usage;
    case "error": {
      const e = outcome.message;
      fail(io, opts.json, `cannot write the results: ${e}`, { file: shownPath(target, io.cwd) });
      return EXIT.usage;
    }
  }
}
