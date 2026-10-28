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
];
