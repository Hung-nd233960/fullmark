// Copies the built-in templates into dist/templates/<name>/ (`quiz new NAME`, `quiz template list`). Each has one source:
// examples/<name>/ for calculus, rust, ielts, medical, exam and survey, and templates/blank/ for blank. A template is
// the one top-level .md and its assets/ and materials/ folders; nothing else in a source folder is shipped.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
export const BUILT_IN = {
  calculus: "examples/calculus",
  rust: "examples/rust",
  ielts: "examples/ielts",
  medical: "examples/medical",
  exam: "examples/exam",
  survey: "examples/survey",
  blank: "templates/blank",
};

/** The files of a template's source folder that ship, relative to it. */
export function templateEntries(folder) {
  return readdirSync(folder, { withFileTypes: true })
    .filter((e) => (e.isFile() && e.name.endsWith(".md")) || (e.isDirectory() && ["assets", "materials"].includes(e.name)))
    .map((e) => e.name);
}

if (import.meta.filename === process.argv[1]) {
  for (const [name, source] of Object.entries(BUILT_IN)) {
    const from = join(root, source);
    const to = join(root, "dist", "templates", name);
    mkdirSync(to, { recursive: true });
    for (const entry of templateEntries(from)) cpSync(join(from, entry), join(to, entry), { recursive: true });
    if (!existsSync(join(to, "quiz.md"))) throw new Error(`template ${name}: no quiz.md in ${source}`);
  }
}
