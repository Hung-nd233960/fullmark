import type { Rubric } from "../../ir";
import { checkRubric } from "../../rubric/check";
import { boolValue, scalarText } from "../yaml-view";
import type { AnswerEnv } from "./env";
import { parseRubric } from "./rubric";
import type { MapSource } from "./source";

export type OpenParts = { rubric: Rubric | null; sampleAnswer: string | null; showRubric: boolean };

/** The parts `essay` and `code` share: `rubric`, `sample_answer` and `show_rubric`. */
export function parseOpenParts(src: MapSource, env: AnswerEnv): OpenParts {
  const { r } = env;
  const out: OpenParts = { rubric: null, sampleAnswer: null, showRubric: true };
  const rubric = src.get("rubric");
  if (rubric) {
    if (env.graded) {
      out.rubric = parseRubric(src.root, rubric, r);
      if (out.rubric) checkRubric(out.rubric, env.points, r);
    } else {
      r.error(
        "question.ungraded-key",
        rubric.line,
        "an ungraded question takes no `rubric`",
        "remove the rubric, or make the question graded",
      );
    }
  }
  const sample = src.get("sample_answer");
  if (sample) {
    const t = scalarText(sample.value);
    if (t === null) r.error("syntax.value", sample.line, "`sample_answer` must be text");
    else out.sampleAnswer = t.replace(/\s+$/, "");
  }
  const show = src.get("show_rubric");
  if (show) {
    const b = boolValue(show.value);
    if (b === null) r.error("syntax.value", show.line, "`show_rubric` must be true or false");
    else out.showRubric = b;
  }
  return out;
}
