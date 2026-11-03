import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseQuestions, type QuestionFile } from "../core/brief/questions";

/** `brief/questions.yaml` beside the bundle, or `src/brief/questions.yaml` when run from the sources (tests). */
export function questionFilePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const shipped = join(here, "brief", "questions.yaml");
  return existsSync(shipped) ? shipped : resolve(here, "..", "brief", "questions.yaml");
}

/** The brief questions, read at run time. Only `quiz brief` calls this: `check` never does. */
export function loadQuestions(): QuestionFile {
  return parseQuestions(readFileSync(questionFilePath(), "utf8"));
}
