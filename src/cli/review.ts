import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { languagesUsed, loadHighlighter } from "../build/highlight";
import { buildReviewForm } from "../build/review-form";
import { katexTools, lazyParseTex } from "../build/tex";
import { FONT_CHOICES, type FontsChoice } from "../core/fonts";
import type { Quiz } from "../core/ir";
import { reviewCounts, shortDate } from "../core/review/counts";
import { merge, serialiseReview } from "../core/review/merge";
import { type Judged, judgedProblems, REASONS, VERDICTS } from "../core/review/reasons";
import type { Review } from "../core/review/schema";
import { reviewTarget } from "../core/review/target";
import { type ServerOutcome, type SubmitRead, startServer } from "../serve/server";
import { writeFileAtomic } from "./atomic";
import { runtimeFolder, systemOpen } from "./build";
import { checkFile, describeOutcome, issueJson } from "./check";
import { loadConfig, realMachine } from "./config";
import { EXIT, type ExitCode } from "./exit-codes";
import { fail } from "./fail";
import { loadQuiz } from "./load";
import { readFailure, shownPath } from "./paths";
import { loadReview } from "./review-file";
import type { ServeIo } from "./serve";

export type ReviewOptions = {
  out: string | null;
  since: string | null;
  /** seconds, as given; null: 1800 */
  timeout: string | null;
  open: boolean;
  /** as given; null: a free port */
  port: string | null;
  json: boolean;
  profile: string | null;
  config: string | null;
  version: string;
};

const defaultInterrupt = (handler: () => void): (() => void) => {
  process.once("SIGINT", handler);
  return () => {
    process.off("SIGINT", handler);
  };
};

const wholeNumber = (text: string, min: number): number | null =>
  /^\d+$/.test(text) && Number(text) >= min ? Number(text) : null;

const pad = (n: number): string => String(n).padStart(2, "0");

/** `2026-10-28T14:05:09+07:00`: the time of Finish as the local clock reads it, with its offset (review-v2). */
export function localIso(d: Date): string {
  const offset = -d.getTimezoneOffset();
  const sign = offset < 0 ? "-" : "+";
  const hours = pad(Math.floor(Math.abs(offset) / 60));
  const minutes = pad(Math.abs(offset) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${hours}:${minutes}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * What the form's submit body must hold (COMMANDS.md, `quiz review`): this quiz and this version of it, and one
 * verdict for every question, each a complete one. The problems are listed in plain words (HTTP 400).
 */
export function submitReader(
  quizId: string,
  hash: string,
  types: ReadonlyMap<string, string>,
): (body: unknown) => SubmitRead<Record<string, Judged>> {
  const knownReason = (r: unknown): boolean => typeof r === "string" && (REASONS as readonly string[]).includes(r);
  return (body) => {
    if (!isRecord(body)) return "the body is not a review";
    if (body.quizId !== quizId) return `this server reviews the quiz "${quizId}", not "${String(body.quizId)}"`;
    if (body.quizHash !== hash) return "this form is of another version of the quiz: reload the page";
    if (!isRecord(body.judged)) return "the review has no verdicts";
    const given = body.judged;
    const problems: string[] = [];
    const judged: Record<string, Judged> = {};
    for (const [id, raw] of Object.entries(given)) {
      const type = types.get(id);
      if (type === undefined) {
        problems.push(`the quiz has no question with the id "${id}"`);
        continue;
      }
      if (!isRecord(raw)) {
        problems.push(`${id}: the verdict is not an object`);
        continue;
      }
      const { verdict, reasons, note, assumed } = raw;
      if (!(VERDICTS as readonly unknown[]).includes(verdict)) {
        problems.push(`${id}: the verdict is not keep, fix or drop`);
        continue;
      }
      if (!Array.isArray(reasons) || !reasons.every(knownReason)) {
        problems.push(`${id}: the reasons are not a list of known reasons`);
        continue;
      }
      if (typeof note !== "string") {
        problems.push(`${id}: the note is not text`);
        continue;
      }
      if (assumed !== undefined && assumed !== true) {
        problems.push(`${id}: assumed is only true or absent`);
        continue;
      }
      const entry = { verdict, reasons, note, ...(assumed === true ? { assumed: true as const } : {}) } as Judged;
      for (const p of judgedProblems(entry, type)) problems.push(`${id}: ${p}`);
      judged[id] = entry;
    }
    for (const id of types.keys()) if (!(id in given)) problems.push(`${id}: no verdict`);
    if (problems.length > 0) return problems.slice(0, 6).join("; ");
    return { quizId, value: judged };
  };
}

/** The questions a `--since` run asks: new ones (no entry) and changed ones (an entry for another hash), in source order. */
export function askedIds(quiz: Quiz, review: Review): string[] {
  const out: string[] = [];
  for (const s of quiz.sections)
    for (const q of s.questions) if (review.questions[q.id]?.hash !== q.hash) out.push(q.id);
  return out;
}

/**
 * `quiz review FILE` (COMMANDS.md): checks the quiz as `serve` does, serves the review form on 127.0.0.1 and waits for
 * one Finish, which is merged into `--out` and written atomically. With `--json` the first line is `listening` and the
 * second the outcome.
 */
export async function runReview(file: string, opts: ReviewOptions, io: ServeIo): Promise<ExitCode> {
  if (/\.html?$/i.test(file)) {
    fail(io, opts.json, "review takes the quiz source, not a built page");
    return EXIT.usage;
  }
  // --since merges into its own review, so another --out cannot be meant (G59)
  if (opts.since !== null && opts.out !== null && resolve(io.cwd, opts.out) !== resolve(io.cwd, opts.since)) {
    fail(io, opts.json, "--since merges into its own review: leave out --out");
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
  // a survey has no key to judge, so nothing else about it matters (G54)
  if (result.loaded.frontMatter.kind === "survey") {
    fail(io, opts.json, "a survey has no answer key to review");
    return EXIT.usage;
  }
  if (result.status === "failed" || result.loaded.quiz === null) {
    // a quiz whose only errors are questions without an id: a verdict follows its question by id, so say what to run
    const errors = result.issues.filter((i) => i.level === "error");
    const unnamed = errors.filter((i) => i.rule === "question.id-missing");
    if (unnamed.length > 0 && unnamed.length === errors.length) {
      const who = unnamed.length === 1 ? "a question has" : `${unnamed.length} questions have`;
      const lines = unnamed.map((i) => i.line).join(", ");
      fail(
        io,
        opts.json,
        `${who} no id (line${unnamed.length > 1 ? "s" : ""} ${lines}); run \`quiz ids ${file}\` first: a verdict follows its question by id`,
      );
      return EXIT.problems;
    }
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

  const source = resolve(io.cwd, file);
  const given = opts.since ?? opts.out;
  const target = given === null ? join(dirname(source), "review.json") : resolve(io.cwd, given);
  const shown = shownPath(target, io.cwd);
  // the review as it stands, read as `check --review` reads it: a file it would refuse is refused here, unchanged
  const readOld = (): { review: Review | null } | { message: string; problems: string[] } => {
    if (!existsSync(target)) {
      if (opts.since !== null) {
        return { message: "--since needs an existing review; run quiz review FILE first", problems: [] };
      }
      return { review: null };
    }
    const got = loadReview(given ?? shown, loaded, io.cwd);
    return "review" in got ? { review: got.review } : got;
  };
  const old = readOld();
  if ("message" in old) {
    if (opts.json) {
      io.out(
        JSON.stringify({
          status: "error",
          message: old.message,
          ...(old.problems.length > 0 ? { problems: old.problems } : {}),
        }),
      );
    }
    const refusal = { status: "error" as const, file, message: old.message, problems: old.problems };
    for (const line of describeOutcome(refusal, false, false)) io.err(line);
    return EXIT.usage;
  }

  // with --since, only the questions with no entry for their current version are asked (G44); none: nothing to serve
  if (opts.since !== null && old.review !== null) {
    const asked = askedIds(quiz, old.review);
    if (asked.length === 0) {
      const line = `nothing new or changed since your review of ${shortDate(old.review.reviewedAt)}`;
      if (opts.json) {
        io.out(JSON.stringify({ status: "unchanged", review: shown }));
        io.err(line);
      } else io.out(line);
      return EXIT.done;
    }
  }

  const folder = io.runtimeDir ?? runtimeFolder();
  const read = (name: string): string | null => {
    try {
      return readFileSync(join(folder, name), "utf8");
    } catch {
      return null;
    }
  };
  const script = read("review.js");
  const pageCss = read("page.css");
  const reviewCss = read("review.css");
  if (script === null || pageCss === null || reviewCss === null) {
    fail(io, opts.json, "the page runtime is missing next to the program: run `npm run build`");
    return EXIT.usage;
  }

  const machine = io.machine ?? { ...realMachine(), cwd: io.cwd };
  const machineFonts = loadConfig(machine, dirname(source), opts.config).layers.user?.fonts ?? null;
  const fonts: FontsChoice = machineFonts !== null && FONT_CHOICES.includes(machineFonts) ? machineFonts : "quiz";
  const clock = io.now ?? (() => new Date());
  const highlight = await loadHighlighter(languagesUsed(quiz, loaded.sheets));
  // what the target needs of the quiz: the blocks as hashed, which parse hands over on request
  const blocks = new Map<string, string>();
  loadQuiz(source, { parseTex: io.parseTex ?? lazyParseTex(), blocks });
  const page = buildReviewForm({
    quiz,
    hash,
    assets: loaded.assets,
    review: old.review,
    ...(opts.since !== null && old.review !== null ? { since: { asked: askedIds(quiz, old.review), blocks } } : {}),
    out: shown,
    check: `quiz check ${file} --review ${shown}`,
    script,
    css: pageCss,
    reviewCss,
    builtAt: clock().toISOString(),
    version: opts.version,
    math: katexTools(),
    highlight,
    fonts,
  });

  const types = new Map<string, string>();
  for (const s of quiz.sections) for (const q of s.questions) types.set(q.id, q.type);
  const quizId = quiz.frontMatter.id;
  const taken: { counts?: ReturnType<typeof reviewCounts> } = {};

  let server: Awaited<ReturnType<typeof startServer<Record<string, Judged>>>>;
  try {
    server = await startServer<Record<string, Judged>>({
      pages: { "": page },
      quizIds: { [quizId]: hash },
      predicate: (accepted) => accepted.has(quizId),
      timeoutMs: timeout * 1000,
      port,
      readSubmit: submitReader(quizId, hash, types),
      ...(io.setTimer ? { setTimer: io.setTimer } : {}),
      async onSubmit(_id, judged) {
        // merged into the file as it is now, which may have changed since the form opened
        const now = readOld();
        if ("message" in now) return now.message;
        const review = merge(now.review, judged, reviewTarget(quiz, hash, blocks, localIso(clock())));
        await writeFileAtomic(target, Buffer.from(serialiseReview(review), "utf8"));
        taken.counts = reviewCounts(quiz, review);
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
  io.err(`reviewing ${shownPath(source, io.cwd)} at ${server.url}`);
  io.err("waiting for Finish (Ctrl+C to stop)");
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
      const c = taken.counts;
      const keep = c?.keep ?? 0;
      const fix = c?.fix ?? 0;
      const drop = c?.drop ?? 0;
      if (opts.json) {
        io.out(JSON.stringify({ status: "written", review: shown, keep, fix, drop }));
      } else {
        const assumed = c?.assumed ?? 0;
        const kept = `${keep} keep${assumed > 0 ? ` (${assumed} not looked at)` : ""}`;
        io.out(`${shown} written: ${kept}, ${fix} fix, ${drop} drop`);
        io.out(`next: quiz check ${file} --review ${shown}`);
      }
      return EXIT.done;
    }
    case "timeout":
      if (opts.json) io.out(JSON.stringify({ status: "timeout" }));
      io.err(`timed out after ${timeout} seconds without a Finish; nothing was written`);
      return EXIT.usage;
    case "interrupted":
      if (opts.json) io.out(JSON.stringify({ status: "interrupted" }));
      io.err("stopped; nothing was written");
      return EXIT.usage;
    case "error":
      fail(io, opts.json, `cannot write the review: ${outcome.message}`, { file: shown });
      return EXIT.usage;
  }
}
