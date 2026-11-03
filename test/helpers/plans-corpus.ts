import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "../../src/core/parse";
import { planFor } from "../../src/core/plan";

const root = resolve(import.meta.dirname, "..", "..");

/** Every quiz the repository holds that parses clean, as [label, text]. */
function corpus(): [string, string][] {
  const out: [string, string][] = [];
  const add = (dir: string, name: string) => {
    if (name.endsWith(".md")) out.push([`${dir}/${name}`, readFileSync(join(root, dir, name), "utf8")]);
  };
  for (const d of ["examples", "templates"])
    for (const n of readdirSync(join(root, d)))
      if (existsSync(join(root, d, n, "quiz.md"))) add(`${d}/${n}`, "quiz.md");
  for (const n of readdirSync(join(root, "test/fixtures/valid"))) add("test/fixtures/valid", n);
  add("test/fixtures/paper", "exam.md");
  return out;
}

/** The plans of every quiz in the corpus with `shuffle_questions` forced on, two seeds, three sources. */
export function plansOfCorpus(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [label, text] of corpus()) {
    const forced = /^shuffle_questions:/m.test(text) ? text : text.replace(/^---\n/, "---\nshuffle_questions: true\n");
    const quiz = parse(forced, label).quiz;
    if (!quiz) continue;
    for (const seed of ["k", "mn42"]) {
      out[`${label} full ${seed}`] = planFor(quiz, { source: "full", seed, quizHash: "0".repeat(64) });
      out[`${label} bank ${seed}`] = planFor(quiz, { source: "bank", seed, quizHash: "0".repeat(64) });
      for (const s of quiz.sections)
        if (s.title !== null && s.id !== "")
          out[`${label} section ${s.id} ${seed}`] = planFor(quiz, {
            source: "section",
            section: s.id,
            seed,
            quizHash: "0".repeat(64),
          });
    }
  }
  return out;
}
