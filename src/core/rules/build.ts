import { z } from "zod";
import type { QualityRule } from "./types";

/**
 * The rules that only `build` can judge, because they need the built page. They are registered now so that a
 * profile can already set their level and options; their check arrives with `build` in step 2, so `run` finds nothing.
 */
export const BUILD_RULES: QualityRule[] = [
  {
    kind: "quality",
    id: "materials.empty",
    level: "warning",
    summary: "a materials sheet with nothing after its heading (raised when `check` loads the sheet)",
    why: "An empty sheet adds a button to the page and shows the learner nothing.",
    example: "(a sheet that holds only its # heading)",
    fix: "write the sheet, or remove it from `materials:`",
    options: z.object({}).strict(),
    run: () => [],
  },
  {
    kind: "quality",
    id: "build.font-not-embedded",
    level: "warning",
    summary: "a locked look names a font the page does not embed (checked by `build`, from `--fonts none`)",
    why: "A `look: locked` quiz promises everyone the author's look, and with `--fonts none` the font is only used where it is installed; otherwise the system font stands in.",
    example: "(checked by `quiz build --fonts none`: a quiz with `look: locked` and `font: serif`)",
    fix: "build without `--fonts none`, or give the quiz `font: system`",
    options: z.object({}).strict(),
    run: () => [],
  },
  {
    kind: "quality",
    id: "build.size",
    level: "warning",
    summary: "the built page is large (checked by `build`, from step 2 of the order of work)",
    why: "A page embeds its images, fonts and maths, and a very large file is slow to open and to send. `quiz build` measures the page, which `check` cannot: this rule only holds the level and the limits, so that profiles can set them before `build` exists.",
    example: "(checked by `quiz build`: a quiz whose page is over 20 MB, with warn-mb at its default)",
    fix: "shrink or remove large images; at max-mb (100 by default) the build refuses regardless of the level",
    options: z
      .object({
        "warn-mb": z.number().positive().default(20),
        "max-mb": z.number().positive().default(100),
      })
      .strict(),
    run: () => [],
  },
  {
    kind: "quality",
    id: "build.answer-sheet-empty",
    level: "warning",
    summary: "the printed paper has no question for its answer sheet (checked by `build --print --answer-sheet`)",
    why: "The answer sheet is a grid for single-choice and true/false questions; a paper with none gets no grid, so `--answer-sheet` does nothing.",
    example: "(checked by `quiz build --print --answer-sheet`: a quiz of essays only)",
    fix: "leave out --answer-sheet, or add a single-choice or true/false question",
    options: z.object({}).strict(),
    run: () => [],
  },
];
