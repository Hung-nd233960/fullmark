import { z } from "zod";
import type { Question, Quiz } from "../ir";
import { file } from "./example";
import type { Finding, QualityRule, RuleContext } from "./types";

/** The question types a computer grades by itself, and so can have a key and an explanation worth checking. */
const AUTO_TYPES: readonly Question["type"][] = [
  "single",
  "multi",
  "truefalse",
  "numeric",
  "short",
  "blanks",
  "fields",
  "ordering",
  "matching",
];

const norm = (md: string): string => md.toLowerCase().split(/\s+/).filter(Boolean).join(" ");
const words = (md: string): number => (md.match(/[\p{L}\p{N}_]+/gu) ?? []).length;

function* questions(quiz: Quiz): Generator<Question> {
  for (const s of quiz.sections) yield* s.questions;
}

/** Graded `single` and `multi` questions: where the choice rules look. */
function* gradedChoices(quiz: Quiz) {
  for (const q of questions(quiz)) {
    if (q.graded && (q.type === "single" || q.type === "multi") && q.choices.length >= 2) yield q;
  }
}

const NONE_ABOVE = /^\s*(all|none|both|neither)\s+of\s+(the\s+)?(above|these|those)\b/i;

/** The languages the page can highlight. A guess at the common ones; extend it when a quiz needs another. */
export const KNOWN_LANGUAGES = [
  "bash",
  "c",
  "cpp",
  "csharp",
  "css",
  "go",
  "haskell",
  "html",
  "java",
  "javascript",
  "json",
  "julia",
  "kotlin",
  "latex",
  "lua",
  "matlab",
  "ocaml",
  "perl",
  "php",
  "powershell",
  "python",
  "r",
  "ruby",
  "rust",
  "scala",
  "sql",
  "swift",
  "toml",
  "typescript",
  "typst",
  "verilog",
  "vhdl",
  "xml",
  "yaml",
  "zig",
];

type RuleSpec = Omit<QualityRule, "kind" | "options"> & { options?: z.ZodObject };

function rule(spec: RuleSpec): QualityRule {
  return { kind: "quality", options: z.object({}).strict(), ...spec };
}

/** Eight single-choice questions whose right answer is always the first choice. */
const SKEWED = Array.from(
  { length: 8 },
  (_, i) => `## Question ${i + 1}? {type=single id=q${i + 1}}\n\n- [x] right\n- [ ] wrong\n- [ ] also wrong`,
).join("\n\n");

const FIX_EXPLANATION = "say why the answer is right and what the wrong ones get wrong";

export const QUALITY_RULES: QualityRule[] = [
  rule({
    id: "choice.duplicate",
    level: "warning",
    summary: "two choices of a question say the same thing",
    why: "A repeated choice wastes a slot and, when one copy is right, makes the question unfair or trivial.",
    example: file("## Pick one. {type=single id=q}\n\n- [x] Paris\n- [ ] Paris\n- [ ] Rome"),
    fix: "rewrite or remove the repeated choice",
    run(quiz) {
      const out: Finding[] = [];
      for (const q of gradedChoices(quiz)) {
        const seen = new Map<string, number>();
        for (const c of q.choices) {
          const key = norm(c.text);
          const first = seen.get(key);
          if (first === undefined) seen.set(key, c.line);
          else {
            out.push({
              line: c.line,
              message: `this choice repeats the one on line ${first}`,
              fix: "rewrite or remove the repeated choice",
            });
          }
        }
      }
      return out;
    },
  }),
  rule({
    id: "choice.all-none-above",
    level: "warning",
    summary: "a choice reads 'all of the above' or 'none of the above'",
    why: "Such choices break when choices are shuffled and let learners guess without knowing the answer.",
    example: file("## Pick one. {type=single id=q}\n\n- [ ] Paris\n- [ ] Rome\n- [x] All of the above"),
    fix: "rewrite the options so that each one stands alone",
    run(quiz) {
      const out: Finding[] = [];
      for (const q of gradedChoices(quiz)) {
        for (const c of q.choices) {
          if (NONE_ABOVE.test(c.text)) {
            out.push({
              line: c.line,
              message: "an 'all/none of the above' choice breaks when choices are shuffled and lets learners guess",
              fix: "rewrite the options so that each one stands alone",
            });
          }
        }
      }
      return out;
    },
  }),
  rule({
    id: "choice.correct-longest",
    level: "warning",
    summary: "the right choice is much longer than every wrong one",
    why: "A learner can pick the longest choice without knowing the answer.",
    example: file(
      "## Why is energy conserved? {type=single id=q}\n\n- [x] Because the total energy of a closed and isolated system stays constant\n- [ ] Luck\n- [ ] Chance",
    ),
    fix: "shorten the right choice, or lengthen the wrong ones to match",
    options: z
      .object({ "min-length": z.number().positive().default(40), ratio: z.number().positive().default(1.8) })
      .strict(),
    run(quiz, _ctx, o) {
      const minLength = Number(o["min-length"]);
      const ratio = Number(o.ratio);
      const out: Finding[] = [];
      for (const q of gradedChoices(quiz)) {
        if (q.type !== "single") continue;
        const right = q.choices.filter((c) => c.correct);
        const wrong = q.choices.filter((c) => !c.correct);
        const one = right[0];
        if (right.length !== 1 || !one || wrong.length < 2) continue;
        const longest = Math.max(...wrong.map((c) => c.text.length));
        if (one.text.length > minLength && one.text.length > ratio * longest) {
          out.push({
            line: one.line,
            message: "the right choice is much longer than every wrong one, which gives it away",
            fix: "shorten the right choice, or lengthen the wrong ones to match",
          });
        }
      }
      return out;
    },
  }),
  rule({
    id: "choice.in-stem",
    level: "warning",
    summary: "the question text already contains the right choice",
    why: "If the question repeats the answer, it tests reading, not knowing.",
    example: file(
      "## Is the capital of France Paris or Rome, which one? {type=single id=q}\n\n- [x] Paris or Rome, which one\n- [ ] Berlin",
    ),
    fix: "reword the question so that it does not contain the answer",
    options: z.object({ "min-length": z.number().int().positive().default(12) }).strict(),
    run(quiz, _ctx, o) {
      const minLength = Number(o["min-length"]);
      const out: Finding[] = [];
      for (const q of gradedChoices(quiz)) {
        if (q.type !== "single") continue;
        const right = q.choices.filter((c) => c.correct);
        const one = right[0];
        if (right.length !== 1 || !one) continue;
        const key = norm(one.text);
        if (key.length >= minLength && norm(q.prompt).includes(key)) {
          out.push({
            line: one.line,
            message: "the question text already contains the right choice",
            fix: "reword the question so that it does not contain the answer",
          });
        }
      }
      return out;
    },
  }),
  rule({
    id: "explanation.short",
    level: "warning",
    summary: "an explanation is too short to teach anything",
    why: "An explanation should say why the answer is right and what the wrong ones get wrong.",
    example: file("## Pick one. {type=single id=q}\n\n- [x] a\n- [ ] b\n\n::: explanation\nBecause.\n:::"),
    fix: FIX_EXPLANATION,
    options: z.object({ "min-words": z.number().int().positive().default(4) }).strict(),
    run(quiz, _ctx, o) {
      const minWords = Number(o["min-words"]);
      const out: Finding[] = [];
      for (const q of questions(quiz)) {
        if (!q.graded || !AUTO_TYPES.includes(q.type) || !q.explanation) continue;
        if (words(q.explanation.text) < minWords) {
          out.push({
            line: q.explanation.line - 1,
            message: `the explanation has fewer than ${minWords} words`,
            fix: FIX_EXPLANATION,
          });
        }
      }
      return out;
    },
  }),
  rule({
    id: "explanation.missing",
    level: "off",
    summary: "a graded question has no explanation",
    why: "Feedback is how a learner learns from a wrong answer.",
    example: file("## Pick one. {type=single id=q}\n\n- [x] a\n- [ ] b"),
    fix: "add a ::: explanation container below the answer",
    run(quiz) {
      const out: Finding[] = [];
      for (const q of questions(quiz)) {
        if (q.graded && AUTO_TYPES.includes(q.type) && !q.explanation) {
          out.push({
            line: q.line,
            message: "the question has no explanation",
            fix: "add a ::: explanation container below the answer",
          });
        }
      }
      return out;
    },
  }),
  rule({
    id: "question.untagged",
    level: "off",
    summary: "a question has no tags",
    why: "Tags drive `stats` and `--missed`: an untagged question is invisible there.",
    example: file("## Pick one. {type=single id=q}\n\n- [x] a\n- [ ] b"),
    fix: "add tags=topic to the heading",
    run(quiz) {
      const out: Finding[] = [];
      for (const q of questions(quiz)) {
        if (q.tags.length === 0) {
          out.push({ line: q.line, message: "the question has no tags", fix: "add tags=topic to the heading" });
        }
      }
      return out;
    },
  }),
  rule({
    id: "quiz.no-time-limit",
    level: "off",
    summary: "the quiz has no time limit",
    why: "A mock exam without a time limit does not practise working to time.",
    example: file("## Pick one. {type=single id=q}\n\n- [x] a\n- [ ] b"),
    fix: "add time_limit: 45m to the front matter",
    run(quiz) {
      return quiz.frontMatter.timeLimit === null
        ? [{ line: 1, message: "the quiz has no time_limit", fix: "add time_limit: 45m to the front matter" }]
        : [];
    },
  }),
  rule({
    id: "answers.position-skew",
    level: "warning",
    summary: "too many single-choice answers sit in the same position",
    why: "When the right answer is mostly option A, a learner learns to pick A.",
    example: file(SKEWED),
    fix: "vary the position of the right answer, or set shuffle_choices: true",
    options: z
      .object({
        "max-share": z.number().gt(0).max(1).default(0.5),
        "min-questions": z.number().int().positive().default(8),
      })
      .strict(),
    run(quiz, _ctx, o) {
      if (quiz.frontMatter.shuffleChoices) return [];
      const singles = [...questions(quiz)].filter(
        (q) => q.type === "single" && q.graded && q.choices.length >= 3 && q.shuffle !== true,
      );
      if (singles.length < Number(o["min-questions"])) return [];
      const counts = new Map<number, number>();
      for (const q of singles) {
        if (q.type !== "single") continue;
        const at = q.choices.findIndex((c) => c.correct);
        counts.set(at, (counts.get(at) ?? 0) + 1);
      }
      let place = -1;
      let n = 0;
      for (const [at, k] of [...counts].sort((a, b) => a[0] - b[0])) {
        if (k > n) {
          place = at;
          n = k;
        }
      }
      if (n / singles.length > Number(o["max-share"]) + 1e-9) {
        return [
          {
            line: 1,
            message: `${n} of ${singles.length} single-choice answers are option ${String.fromCharCode(65 + place)}`,
            fix: "vary the position of the right answer, or set shuffle_choices: true in the front matter",
          },
        ];
      }
      return [];
    },
  }),
  rule({
    id: "code.unknown-language",
    level: "warning",
    summary: "a code question names a language fullmark does not know",
    why: "The page highlights the starter and the sample answer by language; an unknown name (often a typo) gets none.",
    example: file("## Write it. {type=code id=q}\n\n```answer\nlanguage: pythn\n```"),
    fix: `use one of: ${KNOWN_LANGUAGES.join(", ")}`,
    run(quiz) {
      const out: Finding[] = [];
      for (const q of questions(quiz)) {
        if (q.type === "code" && q.language !== "" && !KNOWN_LANGUAGES.includes(q.language.toLowerCase())) {
          out.push({
            line: q.line,
            message: `unknown language \`${q.language}\``,
            fix: `use one of: ${KNOWN_LANGUAGES.join(", ")}`,
          });
        }
      }
      return out;
    },
  }),
  rule({
    id: "question.points-ignored",
    level: "warning",
    summary: "points= on an ungraded question, which is ignored",
    why: "An ungraded question carries no score, so a points value is dead text that suggests otherwise.",
    example: file("## Pick one. {type=single id=q graded=false points=3}\n\n- [ ] a\n- [ ] b"),
    fix: "remove points",
    run(quiz) {
      const out: Finding[] = [];
      for (const q of questions(quiz)) {
        if (!q.graded && q.pointsGiven) {
          out.push({ line: q.line, message: "`points` on an ungraded question is ignored", fix: "remove points" });
        }
      }
      return out;
    },
  }),
  rule({
    id: "rubric.missing",
    level: "warning",
    summary: "a graded essay or code question has no rubric",
    why: "Without a rubric every grader invents their own criteria, and the marks cannot be compared.",
    example: file("## Discuss it. {type=essay id=q points=4}"),
    fix: "add a rubric: list of criteria to the answer block",
    run(quiz) {
      const out: Finding[] = [];
      for (const q of questions(quiz)) {
        if (q.graded && (q.type === "essay" || q.type === "code") && !q.rubric) {
          out.push({ line: q.line, message: "the question has no rubric", fix: "add a `rubric:` to the answer block" });
        }
      }
      return out;
    },
  }),
  rule({
    id: "rubric.thin",
    level: "warning",
    summary: "a rubric has too few criteria to grade from",
    why: "One or two criteria leave most of the mark to impression; a grader needs something to check each point against.",
    example: file("## Discuss it. {type=essay id=q}\n\n```answer\nrubric:\n  - Defines it\n```"),
    fix: "split the rubric into at least three things a grader can check",
    options: z.object({ min: z.number().int().positive().default(3) }).strict(),
    run(quiz, _ctx, o) {
      const min = Number(o.min);
      const out: Finding[] = [];
      for (const q of questions(quiz)) {
        if (!q.graded || (q.type !== "essay" && q.type !== "code") || !q.rubric || q.rubric.preset !== null) continue;
        if (q.rubric.criteria.length < min) {
          out.push({
            line: q.rubric.line,
            message: `the rubric has ${q.rubric.criteria.length} ${q.rubric.criteria.length === 1 ? "criterion" : "criteria"}; at least ${min} are expected`,
            fix: "split the rubric into more things a grader can check",
          });
        }
      }
      return out;
    },
  }),
  rule({
    id: "rubric.points-in-text",
    level: "warning",
    summary: "a holistic rubric bullet carries points, which nothing adds up",
    why: "In a holistic rubric the grader gives one mark; a '(1 pts)' in a bullet reads like a share of it but is ignored.",
    example: file(
      "## Discuss it. {type=essay id=q points=2}\n\n```answer\nrubric:\n  - Defines it (1 pts)\n  - Uses it (1 pts)\n  - Gives an example\n```",
    ),
    fix: "add `mode: additive` so the points count, or remove them from the text",
    run(quiz) {
      const out: Finding[] = [];
      for (const q of questions(quiz)) {
        if (!q.graded || (q.type !== "essay" && q.type !== "code") || q.rubric?.mode !== "holistic") continue;
        for (const c of q.rubric.criteria) {
          if (c.points !== null) {
            out.push({
              line: c.line,
              message: `\`${c.id}\` names ${c.points} pts, but a holistic rubric does not add points up`,
              fix: "add `mode: additive` so the points count, or remove them from the text",
            });
          }
        }
      }
      return out;
    },
  }),
];

export type { RuleContext };
