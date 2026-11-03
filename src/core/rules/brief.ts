import { z } from "zod";
import type { Question, Quiz } from "../ir";
import type { Finding, QualityRule } from "./types";

/** The question types that can show each kind of question in the brief's `mix` (from 0.x). */
export const MIX_TYPES: Record<string, readonly Question["type"][]> = {
  recall: ["single", "multi", "truefalse", "short", "blanks", "matching"],
  understanding: ["single", "multi", "ordering", "matching", "essay", "short"],
  calculation: ["numeric", "fields"],
  code: ["code"],
  essay: ["essay"],
};

/** The files that make a kind of material plausible in `content/` (from 0.x). */
export const KIND_EXTENSIONS: Record<string, readonly string[]> = {
  "lecture-slides": [".pdf", ".pptx", ".ppt", ".odp", ".key"],
  textbook: [".pdf", ".epub", ".djvu", ".docx"],
  notes: [".md", ".txt", ".docx", ".pdf", ".pptx", ".rtf", ".odt"],
  "past-exams": [".pdf", ".docx", ".doc", ".md", ".txt", ".png", ".jpg", ".jpeg"],
  "lab-manual": [".pdf", ".docx", ".doc", ".md"],
};

const KIND_NAMES: Record<string, string> = {
  "lecture-slides": "lecture slides",
  textbook: "a textbook chapter",
  notes: "notes",
  "past-exams": "past exams",
  "lab-manual": "a lab manual",
};

const ELSEWHERE = "put the files in content/, or say where they are in brief.yaml (content.elsewhere)";

const questionsOf = (quiz: Quiz): Question[] => quiz.sections.flatMap((s) => s.questions);
const extensionOf = (path: string): string => {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(dot).toLowerCase();
};

const BRIEF_EXAMPLE = "(a brief.yaml beside the quiz; see the rule's message)";

type RuleSpec = Omit<QualityRule, "kind" | "options"> & { options?: z.ZodObject };
const rule = (spec: RuleSpec): QualityRule => ({ kind: "quality", options: z.object({}).strict(), ...spec });

/** The rules that hold a quiz against the `brief.yaml` beside it. All do nothing without one. */
export const BRIEF_RULES: QualityRule[] = [
  rule({
    id: "brief.count",
    level: "warning",
    summary: "the number of questions is far from the brief's",
    why: "The brief records how long the quiz was meant to be; a quiz far off it was probably cut short or padded.",
    example: `${BRIEF_EXAMPLE} count: 20, with a quiz of 5 questions`,
    fix: "add or remove questions, or change count in brief.yaml if the user agreed",
    options: z.object({ tolerance: z.number().min(0).max(1).default(0.2) }).strict(),
    run(quiz, ctx, o) {
      const brief = ctx.brief;
      if (!brief) return [];
      const tolerance = Number(o.tolerance);
      const n = questionsOf(quiz).length;
      if (Math.abs(n - brief.count) <= tolerance * brief.count + 1e-9) return [];
      const lo = Math.ceil(Math.round(brief.count * (1 - tolerance) * 1e9) / 1e9);
      const hi = Math.floor(Math.round(brief.count * (1 + tolerance) * 1e9) / 1e9);
      return [
        {
          line: 1,
          message: `the brief asks for ${brief.count} questions (within ${Math.round(tolerance * 100)}%: ${lo} to ${hi}), but the quiz has ${n}`,
          fix: "add or remove questions, or change count in brief.yaml if the user agreed",
        },
      ];
    },
  }),
  rule({
    id: "brief.mix",
    level: "warning",
    summary: "the quiz has no question of a kind the brief asks for",
    why: "The brief's mix says which kinds of question the learner wants (recall, calculation, code...).",
    example: `${BRIEF_EXAMPLE} mix: [calculation], with a quiz of single-choice questions only`,
    fix: "add questions of that kind, or change mix in brief.yaml if the user agreed",
    run(quiz, ctx) {
      const brief = ctx.brief;
      if (!brief || brief.purpose === "survey") return [];
      const types = new Set(
        questionsOf(quiz)
          .filter((q) => q.graded)
          .map((q) => q.type),
      );
      const out: Finding[] = [];
      for (const kind of brief.mix) {
        const wanted = MIX_TYPES[kind] ?? [];
        if (!wanted.some((t) => types.has(t))) {
          out.push({
            line: 1,
            message: `the brief asks for ${kind} questions, but the quiz has none (${wanted.join(", ")})`,
            fix: "add questions of that kind, or change mix in brief.yaml if the user agreed",
          });
        }
      }
      return out;
    },
  }),
  rule({
    id: "brief.content-kinds",
    level: "warning",
    summary: "content/ holds no file of a kind of material the brief names",
    why: "The brief says what the quiz is built from; an empty content/ means the source was never supplied.",
    example: `${BRIEF_EXAMPLE} content.kinds: [textbook], with an empty content/ folder`,
    fix: ELSEWHERE,
    run(_quiz, ctx) {
      const brief = ctx.brief;
      const files = ctx.contentFiles;
      if (!brief || files === null || brief.content.elsewhere.trim() !== "") return [];
      const extensions = new Set(files.map(extensionOf));
      const out: Finding[] = [];
      for (const kind of brief.content.kinds) {
        const wanted = KIND_EXTENSIONS[kind];
        if (wanted && !wanted.some((e) => extensions.has(e))) {
          out.push({
            line: 1,
            message: `the brief says the quiz is built from ${KIND_NAMES[kind]}, but content/ has no ${wanted.join(" ")} file`,
            fix: ELSEWHERE,
          });
        }
      }
      if (brief.content.kinds.length === 0 && files.length === 0) {
        out.push({ line: 1, message: "the brief ticks no kind of material and content/ is empty", fix: ELSEWHERE });
      }
      return out;
    },
  }),
  rule({
    id: "brief.past-exams",
    level: "warning",
    summary: "the brief says the quiz mirrors past exams, but no question names its source",
    why: "A quiz built from past exams should point back to them, so the learner can find the original.",
    example: `${BRIEF_EXAMPLE} content.kinds: [past-exams], with no source="..." on any question`,
    fix: 'add source="exam-2025.pdf, question 3" to the questions taken from past exams',
    run(quiz, ctx) {
      const brief = ctx.brief;
      if (!brief || !brief.content.kinds.includes("past-exams")) return [];
      if (questionsOf(quiz).some((q) => q.source !== null)) return [];
      return [
        {
          line: 1,
          message: "the brief says the quiz mirrors past exams, but no question has a source",
          fix: 'add source="exam-2025.pdf, question 3" to the questions taken from past exams',
        },
      ];
    },
  }),
  rule({
    id: "brief.mode",
    level: "warning",
    summary: "the quiz's feedback, time limit or look does not fit the brief's mode",
    why: "The brief's mode says how the learner will sit the quiz: each-question wants instant feedback, timed-exam a time limit and a locked look.",
    example: `${BRIEF_EXAMPLE} mode: timed-exam, with no time_limit and look: free in the front matter`,
    fix: "set the front matter keys the mode expects, or change mode in brief.yaml if the user agreed",
    run(quiz, ctx) {
      const brief = ctx.brief;
      if (!brief) return [];
      const fm = quiz.frontMatter;
      const at = (key: string) => fm.keyLines[key] ?? 1;
      const out: Finding[] = [];
      if (brief.mode === "each-question" && fm.feedback !== "instant") {
        out.push({
          line: at("feedback"),
          message: "the brief's mode is each-question, which expects `feedback: instant`",
          fix: "set feedback: instant, or change mode in brief.yaml if the user agreed",
        });
      }
      if (brief.mode === "timed-exam") {
        if (fm.timeLimit === null) {
          out.push({
            line: at("time_limit"),
            message: "the brief's mode is timed-exam, which expects a `time_limit`",
            fix: "set time_limit (for example 45m), or change mode in brief.yaml if the user agreed",
          });
        }
        if (fm.look !== "locked") {
          out.push({
            line: at("look"),
            message: "the brief's mode is timed-exam, which expects `look: locked`",
            fix: "set look: locked, or change mode in brief.yaml if the user agreed",
          });
        }
      }
      return out;
    },
  }),
  rule({
    id: "brief.generated-by",
    level: "warning",
    summary: "a quiz written from a brief does not say which model wrote it",
    why: "An agent-written quiz must name the agent and model in generated_by, so a reader knows what to trust.",
    example: `${BRIEF_EXAMPLE} with no generated_by in the quiz's front matter`,
    fix: "add generated_by: <the exact model id> to the front matter (a hand-written quiz leaves it out and has no brief)",
    run(quiz, ctx) {
      if (!ctx.brief || quiz.frontMatter.generatedBy !== null) return [];
      return [
        {
          line: 1,
          message: "the quiz has a brief but no generated_by in its front matter",
          fix: "add generated_by: <the exact model id> to the front matter",
        },
      ];
    },
  }),
  rule({
    id: "brief.invalid",
    level: "warning",
    summary: "brief.yaml cannot be read, so the quiz was not held against it",
    why: "A brief with a bad value or an unknown key cannot be compared with the quiz.",
    example: `${BRIEF_EXAMPLE} count: many`,
    fix: "fix brief.yaml: it is written by `quiz brief`, which can write it again",
    run: () => [],
  }),
  rule({
    id: "brief.no-history",
    level: "warning",
    summary: "the brief asks for weak topics, but quiz brief reads no history to find them",
    why: "focus_tags stays empty when `quiz brief` writes the file, so the agent has to pick the weak topics itself.",
    example: `${BRIEF_EXAMPLE} quiz brief --weak-topics yes`,
    fix: "pick the weak topics from the learner's reports, or use the library's brief (step 4), which fills them from stats",
    // given by `quiz brief --weak-topics yes`, never by `check`
    run: () => [],
  }),
  rule({
    id: "brief.vague",
    level: "warning",
    summary: "a text answer in the brief is shorter than its question asks for",
    why: "A one-word scope does not say what the quiz covers, so the agent has to guess; the question file gives each text answer a minimum and an example.",
    example: `${BRIEF_EXAMPLE} quiz brief --scope signals`,
    fix: "ask the user again, with the example from the question file, and write the brief again",
    // given by `quiz brief` through flags (a form asks again instead), never by `check`
    run: () => [],
  }),
];
