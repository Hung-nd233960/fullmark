import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { answerProblem, attemptOf, parseResults } from "../core/attempt";
import { grade } from "../core/grade";
import { en, vi } from "../core/i18n";
import type { Quiz } from "../core/ir";
import { buildReport, type Report, renderMarkdown } from "../core/report";
import { type AppliedGrades, applyGrades, type GradesFile, gradesTemplate, parseGrades } from "../core/rubric/grades";
import { type WriteError, writeFileAtomic } from "./atomic";
import { EXIT, type ExitCode } from "./exit-codes";
import { fail } from "./fail";
import { expandInputs } from "./files";
import type { Io } from "./ids";
import { loadQuiz } from "./load";
import { readFailure, shownPath } from "./paths";

export type GradeOptions = {
  quiz: string | null;
  output: string | null;
  grades: string | null;
  json: boolean;
  web: boolean;
  name: string | null;
  plain: boolean;
};

type FileResult =
  | {
      status: "written";
      file: string;
      report: string;
      grades_template?: string;
      score: Report["score"];
      pending: number;
      warnings: string[];
    }
  | { status: "problems"; file: string; message: string; problems: string[] }
  | { status: "error"; file: string; message: string };

const NOT_YET = "is not available yet: the grading form arrives with a later release";

/** The exit code that is worse: usage (2) over problems (1) over done (0). */
function worst(a: ExitCode, b: ExitCode): ExitCode {
  const rank = (c: ExitCode) => (c === EXIT.usage ? 2 : c === EXIT.problems ? 1 : 0);
  return rank(b) > rank(a) ? b : a;
}

const stemOf = (results: string): string => basename(results).replace(/\.json$/i, "");

/** Where the report goes: beside the results by default, else `-o` (a file for one input, a folder for several). */
function reportPath(results: string, opts: GradeOptions, several: boolean, io: Io): string {
  const ext = opts.json ? "-report.json" : "-report.md";
  if (opts.output === null) return join(dirname(resolve(io.cwd, results)), `${stemOf(results)}${ext}`);
  const out = resolve(io.cwd, opts.output);
  return several ? join(out, `${stemOf(results)}${ext}`) : out;
}

const isFile = (path: string): boolean => existsSync(path) && !statSync(path).isDirectory();

const readText = (path: string): string => readFileSync(path).toString("utf8");

async function gradeOne(
  results: string,
  quiz: Quiz,
  quizHash: string,
  quizFile: string,
  gradesFile: GradesFile | null,
  opts: GradeOptions,
  several: boolean,
  io: Io,
): Promise<FileResult> {
  let text: string;
  try {
    text = readText(resolve(io.cwd, results));
  } catch (error) {
    return { status: "error", file: results, message: `cannot read the file: ${readFailure(error)}` };
  }
  const read = parseResults(text);
  if (!read.ok) return { status: "problems", file: results, message: read.message, problems: [read.message] };
  const attempt = attemptOf(read.results);
  if (attempt.quizHash !== quizHash) {
    const message = `hash mismatch: the attempt was taken on quiz ${attempt.quizHash}, but ${quizFile} is ${quizHash}`;
    return { status: "problems", file: results, message, problems: [message] };
  }
  const shape: string[] = [];
  const byId = new Map<string, Quiz["sections"][number]["questions"][number]>();
  for (const s of quiz.sections) for (const q of s.questions) byId.set(q.id, q);
  for (const id of attempt.plan.questions) {
    const q = byId.get(id);
    const problem = q ? answerProblem(q.type, attempt.state.answers[id]) : null;
    if (problem) shape.push(`${id}: ${problem}`);
  }
  if (shape.length > 0) {
    return { status: "problems", file: results, message: "answers that do not fit their questions", problems: shape };
  }

  let gradesApplied: AppliedGrades | null = null;
  if (gradesFile) {
    gradesApplied = applyGrades(quiz, attempt, read.json, gradesFile);
    if (gradesApplied.problems.length > 0) {
      return { status: "problems", file: results, message: "invalid grades", problems: gradesApplied.problems };
    }
  }

  const m = (quiz.frontMatter.uiLang === "vi" ? vi : en).report;
  const report = buildReport({ quiz, quizHash, attempt, applied: gradesApplied }, m);
  const target = reportPath(results, opts, several, io);
  const files: [string, string][] = [
    [target, opts.json ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report, m, quizFile)],
  ];
  let template: string | undefined;
  const warnings: string[] = [];
  if (opts.json && gradesFile === null) {
    const path = join(dirname(target), `${stemOf(results)}-grades.json`);
    // An existing grades file may hold a grader's work: it is never overwritten (COMMANDS.md, `quiz grade`).
    if (existsSync(path)) {
      warnings.push(
        `${shownPath(path, io.cwd)} already exists, so no grades template was written; delete it for a fresh template`,
      );
    } else {
      template = path;
      files.push([path, `${JSON.stringify(gradesTemplate(quiz, grade(quiz, attempt), read.json), null, 2)}\n`]);
    }
  }
  for (const [path, content] of files) {
    try {
      await writeFileAtomic(path, Buffer.from(content, "utf8"));
    } catch (error) {
      const message = `cannot write ${shownPath((error as WriteError).file ?? path, io.cwd)}: ${(error as Error).message}`;
      return { status: "error", file: results, message };
    }
  }
  warnings.push(...(gradesApplied?.warnings ?? []));
  if (attempt.phase !== "submitted")
    warnings.push(`the attempt was never submitted (phase ${attempt.phase}); graded as it stands`);
  return {
    status: "written",
    file: results,
    report: shownPath(target, io.cwd),
    ...(template ? { grades_template: shownPath(template, io.cwd) } : {}),
    score: report.score,
    pending: report.score?.pending ?? 0,
    warnings,
  };
}

/**
 * `quiz grade RESULTS... --quiz FILE` (COMMANDS.md). Re-grades each attempt with the shared grader and writes a
 * report; with `--json` also a grades template, and with `--grades` folds a filled-in file in. Every results file is
 * attempted; the exit code is the worst one. `--web` and `--name` are not available yet.
 */
export async function runGrade(patterns: readonly string[], opts: GradeOptions, io: Io): Promise<ExitCode> {
  if (opts.web) {
    fail(io, opts.json, `--web ${NOT_YET}`);
    return EXIT.usage;
  }
  if (opts.name !== null) {
    fail(io, opts.json, `--name ${NOT_YET} (it names the grader of --web)`);
    return EXIT.usage;
  }
  if (opts.quiz === null) {
    fail(
      io,
      opts.json,
      "give the quiz the attempt was taken on with --quiz FILE: the answer key and the rubrics are in it",
    );
    return EXIT.usage;
  }
  const inputs = expandInputs(patterns, io.cwd);
  const several = inputs.files.length + inputs.errors.length > 1;
  if (opts.grades !== null && several) {
    fail(io, opts.json, "--grades takes one results file: it grades one attempt");
    return EXIT.usage;
  }
  // -o names a folder when there are several inputs: a file in its place is refused before any input is handled
  if (opts.output !== null && several && isFile(resolve(io.cwd, opts.output))) {
    fail(
      io,
      opts.json,
      `-o names a folder when there are several results files, but ${shownPath(opts.output, io.cwd)} is a file`,
    );
    return EXIT.usage;
  }
  if (inputs.files.length === 0 && inputs.errors.length === 0) {
    fail(io, opts.json, "nothing to work on: give at least one results file");
    return EXIT.usage;
  }

  const emit = (r: FileResult) => {
    if (opts.json) {
      io.out(JSON.stringify(r));
      // the human text also goes to stderr: a failure's line, and every warning (COMMANDS.md, Common options)
      if (r.status === "error") io.err(`${r.file}: ${r.message}`);
      else if (r.status === "written") for (const w of r.warnings) io.err(`${r.file}: warning: ${w}`);
      return;
    }
    if (r.status === "written") {
      io.out(`${r.file}: wrote ${r.report}`);
      if (r.grades_template) io.out(`${r.file}: wrote the grades template ${r.grades_template}`);
      for (const w of r.warnings) io.err(`${r.file}: warning: ${w}`);
    } else if (r.status === "problems") {
      io.err(`${r.file}: ${r.problems.length === 1 ? r.problems[0] : r.message}`);
      if (r.problems.length > 1) for (const p of r.problems) io.err(`  ${p}`);
    } else io.err(`${r.file}: ${r.message}`);
  };

  const quizPath = resolve(io.cwd, opts.quiz);
  let loaded: ReturnType<typeof loadQuiz>;
  try {
    loaded = loadQuiz(quizPath);
  } catch (error) {
    const file = shownPath(opts.quiz, io.cwd);
    fail(io, opts.json, `cannot read the quiz: ${readFailure(error)}`, { file });
    return EXIT.usage;
  }
  if (loaded.quiz === null || loaded.hash === null) {
    fail(
      io,
      opts.json,
      "the quiz has errors, so it cannot grade anything; run `quiz check` on it",
      { file: shownPath(opts.quiz, io.cwd) },
      loaded.issues.filter((x) => x.level === "error").map((i) => `  ${i.line}: ${i.rule}: ${i.message}`),
    );
    return EXIT.problems;
  }

  let gradesFile: GradesFile | null = null;
  if (opts.grades !== null) {
    let gradesText: string;
    try {
      gradesText = readText(resolve(io.cwd, opts.grades));
    } catch (error) {
      fail(io, opts.json, `cannot read the grades file: ${readFailure(error)}`, {
        file: shownPath(opts.grades, io.cwd),
      });
      return EXIT.usage;
    }
    const read = parseGrades(gradesText);
    if (!read.ok) {
      fail(io, opts.json, read.message, { file: shownPath(opts.grades, io.cwd) });
      return EXIT.problems;
    }
    gradesFile = read.file;
  }

  let exit: ExitCode = EXIT.done;
  let ok = 0;
  let failed = 0;
  const progress = !opts.json && !opts.plain && io.tty && inputs.files.length > 1;
  let n = 0;
  // one after another, in the order given (COMMANDS.md, "Several files"): an unusable input is a failure in its place
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
    const result = await gradeOne(
      file,
      loaded.quiz,
      loaded.hash,
      shownPath(opts.quiz, io.cwd),
      gradesFile,
      opts,
      several,
      io,
    );
    if (progress) io.errRaw("\r\u001b[K");
    emit(result);
    if (result.status === "written") ok++;
    else {
      failed++;
      exit = worst(exit, result.status === "error" ? EXIT.usage : EXIT.problems);
    }
  }
  if (several) {
    if (opts.json) io.out(JSON.stringify({ status: "done", ok, failed }));
    else io.out(`${ok} done, ${failed} failed`);
  }
  return exit;
}
