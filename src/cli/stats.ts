import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { answerProblem, attemptOf, parseResults } from "../core/attempt";
import { en, vi } from "../core/i18n";
import type { Quiz } from "../core/ir";
import { buildReport, REPORT_FORMAT, REPORT_VERSION, type Report } from "../core/report";
import { renderStats, type StatsInput, type StatsNames, summarise, titleOf } from "../core/stats";
import { EXIT, type ExitCode } from "./exit-codes";
import { fail } from "./fail";
import { expandInputs } from "./files";
import type { Io } from "./ids";
import { loadQuiz } from "./load";
import { readFailure, shownPath } from "./paths";

export type StatsOptions = { quiz: string | null; json: boolean };

type Problem = { file: string; message: string };

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** Whether a parsed report has the parts `stats` reads; the message says what is missing, or null. */
function reportProblem(r: Record<string, unknown>): string | null {
  const quiz = r.quiz;
  const attempt = r.attempt;
  if (!isObject(quiz) || typeof quiz.id !== "string" || typeof quiz.hash !== "string" || typeof quiz.title !== "string")
    return "not a valid report: its quiz is missing";
  if (!isObject(attempt) || typeof attempt.source !== "string") return "not a valid report: its attempt is missing";
  if (!Array.isArray(r.questions) || !Array.isArray(r.open)) return "not a valid report: its questions are missing";
  if (r.questions.some((q) => !isObject(q) || typeof q.hash !== "string" || typeof q.id !== "string"))
    return "this report has no question hashes (it was made by an earlier build): make it again with `quiz grade --json`";
  return null;
}

const short = (hash: string): string => hash.slice(0, 8);

/** A results file graded on the spot against `--quiz`'s version, as `grade` would; or the problem with it. */
function gradeResults(text: string, quiz: Quiz, hash: string, quizFile: string, file: string): Report | Problem {
  const read = parseResults(text);
  if (!read.ok) return { file, message: read.message };
  const attempt = attemptOf(read.results);
  if (attempt.quizHash !== hash) {
    return {
      file,
      message:
        `a results file taken on version ${short(attempt.quizHash)}, but ${quizFile} is version ${short(hash)}; ` +
        "grade it with that version first: `quiz grade FILE --quiz OLD.md --json`",
    };
  }
  const byId = new Map<string, Quiz["sections"][number]["questions"][number]>();
  for (const s of quiz.sections) for (const q of s.questions) byId.set(q.id, q);
  for (const id of attempt.plan.questions) {
    const q = byId.get(id);
    const problem = q ? answerProblem(q.type, attempt.state.answers[id]) : null;
    if (problem) return { file, message: `answers that do not fit their questions (${id}: ${problem})` };
  }
  const m = (quiz.frontMatter.uiLang === "vi" ? vi : en).report;
  return buildReport({ quiz, quizHash: hash, attempt }, m);
}

/**
 * `quiz stats FILE... [--quiz QUIZ]` (COMMANDS.md): progress across several attempts at one quiz, from reports of any
 * version and from results files of `--quiz`'s version. Exit 0 done, 1 a file it cannot use (another version's
 * results, or neither a report nor results), 2 different quizzes, fewer than two files or an I/O error.
 */
export function runStats(patterns: readonly string[], opts: StatsOptions, io: Io): ExitCode {
  const inputs = expandInputs(patterns, io.cwd);
  if (inputs.errors.length > 0) {
    for (const e of inputs.errors) fail(io, opts.json, e.message, { file: e.input });
    return EXIT.usage;
  }
  if (inputs.files.length < 2) {
    fail(io, opts.json, "stats compares attempts: give two or more reports or results files");
    return EXIT.usage;
  }

  let quiz: Quiz | null = null;
  let quizHash: string | null = null;
  let names: StatsNames | null = null;
  const quizFile = opts.quiz === null ? "" : shownPath(opts.quiz, io.cwd);
  if (opts.quiz !== null) {
    let loaded: ReturnType<typeof loadQuiz>;
    try {
      loaded = loadQuiz(resolve(io.cwd, opts.quiz));
    } catch (error) {
      fail(io, opts.json, `cannot read the quiz: ${readFailure(error)}`, { file: quizFile });
      return EXIT.usage;
    }
    if (loaded.quiz === null || loaded.hash === null) {
      fail(
        io,
        opts.json,
        "the quiz has errors, so it cannot name or grade anything; run `quiz check` on it",
        { file: quizFile },
        loaded.issues.filter((x) => x.level === "error").map((i) => `  ${i.line}: ${i.rule}: ${i.message}`),
      );
      return EXIT.problems;
    }
    quiz = loaded.quiz;
    quizHash = loaded.hash;
    const questions = new Map<string, { title: string; tags: readonly string[] }>();
    for (const s of quiz.sections)
      for (const q of s.questions) questions.set(q.id, { title: titleOf(q.prompt), tags: q.tags });
    names = { title: quiz.frontMatter.title, questions };
  }

  const reports: StatsInput[] = [];
  const problems: Problem[] = [];
  for (const raw of inputs.files) {
    const file = shownPath(raw, io.cwd);
    let text: string;
    try {
      text = readFileSync(resolve(io.cwd, raw)).toString("utf8").replace(/^﻿/, "");
    } catch (error) {
      fail(io, opts.json, `cannot read the file: ${readFailure(error)}`, { file });
      return EXIT.usage;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      problems.push({ file, message: "neither a report nor a results file: it is not valid JSON" });
      continue;
    }
    const format = isObject(json) ? json.format : undefined;
    if (format === REPORT_FORMAT && isObject(json)) {
      if (json.version !== REPORT_VERSION) {
        problems.push({
          file,
          message: `unsupported report version ${String(json.version)}: stats reads version ${REPORT_VERSION}`,
        });
        continue;
      }
      const problem = reportProblem(json);
      if (problem) problems.push({ file, message: problem });
      else reports.push({ file, report: json as unknown as Report });
    } else if (format === "fullmark-results") {
      if (quiz === null || quizHash === null) {
        problems.push({
          file,
          message:
            "a results file is graded against its quiz: give it with --quiz FILE, or grade it first with `quiz grade --json`",
        });
        continue;
      }
      const r = gradeResults(text, quiz, quizHash, quizFile, file);
      if ("format" in r) reports.push({ file, report: r });
      else problems.push(r);
    } else {
      problems.push({ file, message: "neither a report (`quiz grade --json`) nor a results file" });
    }
  }

  // different quizzes first: they are a usage error whatever else is wrong with the files
  const ids = new Map<string, string[]>();
  for (const { file, report } of reports) ids.set(report.quiz.id, [...(ids.get(report.quiz.id) ?? []), file]);
  if (quiz !== null && reports.length > 0 && !ids.has(quiz.frontMatter.id)) ids.set(quiz.frontMatter.id, [quizFile]);
  if (ids.size > 1) {
    const lines = [...ids].map(([id, files]) => `  ${id}: ${files.join(", ")}`);
    fail(io, opts.json, "these files belong to different quizzes; stats compares attempts at one quiz", {}, lines);
    return EXIT.usage;
  }
  if (problems.length > 0) {
    if (opts.json) {
      io.out(JSON.stringify({ status: "failed", message: "files stats cannot use", problems }));
    }
    for (const p of problems) io.err(`${p.file}: ${p.message}`);
    return EXIT.problems;
  }

  const summary = summarise(reports, names);
  if (opts.json) io.out(JSON.stringify(summary));
  else for (const line of renderStats(summary)) io.out(line);
  return EXIT.done;
}
