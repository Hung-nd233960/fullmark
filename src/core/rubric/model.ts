import { canonicalHash } from "../canonical";
import type { Rubric } from "../ir";
import type { RoundRule, Scale } from "./arith";
import { PRESETS } from "./presets";

/** The additive step when a rubric does not declare one (TECHNICAL_DESIGN.md, section 6). */
export const DEFAULT_STEP = 0.5;

/**
 * A rubric as grading sees it: the mode settled, a preset expanded, defaults applied. A question with no rubric is
 * a holistic one with no bullets: the grader gives one score from 0 to the question's points.
 */
export type ResolvedRubric =
  | {
      mode: "holistic";
      /** declared `step`, or null: then any score from 0 to the points will do */
      step: number | null;
      criteria: { id: string; text: string }[];
    }
  | { mode: "additive"; step: number; criteria: { id: string; text: string; max: number }[] }
  | {
      mode: "banded";
      scale: Scale;
      round: RoundRule;
      preset: string | null;
      criteria: { id: string; text: string; weight: number }[];
    };

export function resolveRubric(rubric: Rubric | null): ResolvedRubric {
  if (rubric === null) return { mode: "holistic", step: null, criteria: [] };
  if (rubric.preset !== null) {
    const p = PRESETS[rubric.preset];
    return { mode: "banded", scale: p.scale, round: p.round, preset: rubric.preset, criteria: [...p.criteria] };
  }
  const mode = rubric.mode ?? "holistic";
  if (mode === "additive") {
    return {
      mode,
      step: rubric.step ?? DEFAULT_STEP,
      criteria: rubric.criteria.map((c) => ({ id: c.id, text: c.text, max: c.points ?? 0 })),
    };
  }
  if (mode === "banded") {
    return {
      mode,
      scale: rubric.scale ?? { min: 0, max: 9, step: 0.5 },
      round: rubric.round ?? "nearest-step",
      preset: null,
      criteria: rubric.criteria.map((c) => ({ id: c.id, text: c.text, weight: c.weight ?? 1 })),
    };
  }
  return { mode, step: rubric.step, criteria: rubric.criteria.map((c) => ({ id: c.id, text: c.text })) };
}

/**
 * The `rubric_hash` of a grades file (TECHNICAL_DESIGN.md, section 6): SHA-256 over the canonical JSON of the parsed
 * rubric (mode, step, scale, round, preset, and each criterion's id, text, maximum and weight). YAML layout and
 * comments do not change it; a criterion's wording, points or weight does.
 */
export function rubricHash(r: ResolvedRubric): string {
  const preset = r.mode === "banded" ? r.preset : null;
  const criteria = r.criteria.map((c) => ({
    id: c.id,
    text: c.text,
    max: "max" in c ? c.max : null,
    weight: "weight" in c ? c.weight : null,
  }));
  return canonicalHash({
    mode: r.mode,
    step: "step" in r ? r.step : null,
    scale: r.mode === "banded" ? r.scale : null,
    round: r.mode === "banded" ? r.round : null,
    preset,
    criteria,
  });
}
