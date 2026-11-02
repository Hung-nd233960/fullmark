import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { ReplayData } from "../build/page";
import { answerProblem, attemptOf, parseResults } from "../core/attempt";
import type { Quiz } from "../core/ir";
import { type AppliedGrades, applyGrades, type GradesFile, parseGrades } from "../core/rubric/grades";
import { EXIT } from "./exit-codes";
import type { Io } from "./ids";
import type { LoadedQuiz } from "./load";
import { readFailure, shownPath } from "./paths";

/** What `quiz replay` adds to a build (COMMANDS.md, `quiz replay`): the quiz the attempts were taken on, and the grades. */
export type ReplayOptions = {
  /** `--quiz FILE`, as given */
  quiz: string;
  /** the quiz, loaded once; its `quiz` and `hash` are not null */
  loaded: LoadedQuiz;
  /** `--grades GRADES`, read and parsed (one results file only); null: each results file's own `-grades.json`, if any */
  grades: { shown: string; file: GradesFile } | null;
  /** `--open` (yes), `--no-open` (no), or neither: open for one file, nothing for several */
  open: "yes" | "no" | "default";
};

export type ReplayRead =
  | { ok: true; replay: ReplayData; warnings: string[] }
  /** `exit`: 1 for content that is wrong, 2 for a file that cannot be read */
  | { ok: false; exit: typeof EXIT.problems | typeof EXIT.usage; message: string; problems: string[] };

const short = (hash: string): string => hash.slice(0, 4);

/** `RESULTS` without `.json`, then `-grades.json`: the name `quiz grade --json` writes beside the results file. */
export const gradesBeside = (results: string): string =>
  join(dirname(results), `${basename(results).replace(/\.json$/i, "")}-grades.json`);

/**
 * Reads one results file for a replay and checks it as `quiz grade` does: the file, the version it was taken on, the
 * shape of its answers and the grades, if there are any. Nothing is written; every problem is returned.
 */
export function readReplay(file: string, options: ReplayOptions, io: Io): ReplayRead {
  const problem = (message: string, problems = [message]): ReplayRead => ({
    ok: false,
    exit: EXIT.problems,
    message,
    problems,
  });
  const path = resolve(io.cwd, file);
  let text: string;
  try {
    text = readFileSync(path).toString("utf8");
  } catch (error) {
    return {
      ok: false,
      exit: EXIT.usage,
      message: `cannot read the file: ${readFailure(error)}`,
      problems: [`cannot read the file: ${readFailure(error)}`],
    };
  }
  const read = parseResults(text);
  if (!read.ok) return problem(read.message);
  const attempt = attemptOf(read.results);
  const quiz = options.loaded.quiz as Quiz;
  const hash = options.loaded.hash as string;
  if (attempt.quizHash !== hash) {
    return problem(
      `the attempt was taken on version ${short(attempt.quizHash)}, but ${options.quiz} is version ${short(hash)}: replay it with the quiz as it was then`,
    );
  }
  const byId = new Map<string, Quiz["sections"][number]["questions"][number]>();
  for (const s of quiz.sections) for (const q of s.questions) byId.set(q.id, q);
  const shape: string[] = [];
  for (const id of attempt.plan.questions) {
    const q = byId.get(id);
    const found = q ? answerProblem(q.type, attempt.state.answers[id]) : `no question with this id in ${options.quiz}`;
    if (found) shape.push(`${id}: ${found}`);
  }
  if (shape.length > 0) return problem("answers that do not fit their questions", shape);

  const warnings: string[] = [];
  if (attempt.phase !== "submitted") {
    warnings.push(`the attempt was never submitted (phase ${attempt.phase}); the page shows it as submitted`);
  }
  let applied: AppliedGrades | null = null;
  const beside = gradesBeside(path);
  let source: { shown: string; file: GradesFile } | null = options.grades;
  if (source === null && existsSync(beside) && statSync(beside).isFile()) {
    let gradesText: string;
    try {
      gradesText = readFileSync(beside).toString("utf8");
    } catch (error) {
      const message = `cannot read the grades file ${shownPath(beside, io.cwd)}: ${readFailure(error)}`;
      return { ok: false, exit: EXIT.usage, message, problems: [message] };
    }
    const parsed = parseGrades(gradesText);
    if (!parsed.ok) return problem(`${shownPath(beside, io.cwd)}: ${parsed.message}`);
    source = { shown: shownPath(beside, io.cwd), file: parsed.file };
  }
  if (source !== null) {
    applied = applyGrades(quiz, attempt, read.json, source.file);
    if (applied.problems.length > 0) return problem(`invalid grades in ${source.shown}`, applied.problems);
    warnings.push(...applied.warnings);
  }
  return { ok: true, replay: { results: text, name: basename(path), attempt, applied }, warnings };
}
