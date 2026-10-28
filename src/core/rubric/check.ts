import type { Rubric } from "../ir";
import type { Reporter } from "../parse/report";
import { isMultiple, sumMarks } from "./arith";
import { DEFAULT_STEP } from "./model";

/**
 * The `rubric.*` rules (QUIZ_SYNTAX.md section 8a): whether a parsed rubric is consistent with its question.
 * Each problem is reported on the line of the offending item: the criterion, the `scale:` line, or the rubric.
 * A problem that makes the mode unknowable ends the check, so one mistake gives one issue.
 */
export function checkRubric(rubric: Rubric, points: number, r: Reporter): void {
  const seen = new Set<string>();
  for (const c of rubric.criteria) {
    if (seen.has(c.id)) {
      r.error("rubric.duplicate-id", c.line, `two criteria share the id \`${c.id}\``, "give each criterion its own id");
    }
    seen.add(c.id);
  }

  if (rubric.preset !== null) {
    if (rubric.mode !== null || rubric.step !== null || rubric.scale !== null || rubric.round !== null) {
      r.error(
        "syntax.value",
        rubric.line,
        "a `preset` brings its own criteria, scale and rounding",
        "remove the other keys, or drop the preset and write the rubric out",
      );
    } else if (rubric.criteria.length > 0) {
      r.error("syntax.value", rubric.line, "a `preset` brings its own criteria", "remove `criteria`");
    }
    return;
  }

  const hasBandKeys = rubric.scale !== null || rubric.scaleLine !== null || rubric.round !== null;
  const hasWeights = rubric.criteria.some((c) => c.weight !== null);
  const hasPoints = rubric.criteria.some((c) => c.points !== null);
  if (rubric.mode === null) {
    if (hasPoints || hasBandKeys || hasWeights) {
      r.error(
        "rubric.mode-missing",
        rubric.line,
        "this rubric has points, weights or a scale but no `mode`",
        "declare `mode: additive` (points that add up) or `mode: banded` (bands with a scale)",
      );
    }
    return;
  }

  if (rubric.mode !== "banded") {
    if (hasBandKeys) {
      r.error(
        "syntax.value",
        rubric.scaleLine ?? rubric.line,
        `\`scale\` and \`round\` belong to a banded rubric, not a ${rubric.mode} one`,
        "set `mode: banded`, or remove them",
      );
    }
    for (const c of rubric.criteria) {
      if (c.weight !== null) {
        r.error("syntax.value", c.line, "`weight` belongs to a banded rubric", "set `mode: banded`, or remove it");
      }
    }
  }

  if (rubric.mode === "holistic") {
    if (rubric.step !== null && !(rubric.step > 0)) {
      r.error("rubric.step", rubric.line, "`step` must be above 0", "use a step such as 0.5");
    }
    return;
  }

  if (rubric.mode === "additive") {
    const step = rubric.step ?? DEFAULT_STEP;
    if (!(step > 0)) r.error("rubric.step", rubric.line, "`step` must be above 0", "use a step such as 0.5");
    if (rubric.criteria.length === 0) {
      r.error("rubric.sum", rubric.line, "an additive rubric needs criteria with points", "list the criteria");
      return;
    }
    let complete = true;
    for (const c of rubric.criteria) {
      if (c.points === null || !(c.points > 0)) {
        complete = false;
        r.error(
          "rubric.sum",
          c.line,
          `criterion \`${c.id}\` needs points above 0`,
          "write (1 pts) after the text, or add `points:`",
        );
      } else if (step > 0 && !isMultiple(c.points, step)) {
        r.error(
          "rubric.step",
          c.line,
          `\`${c.id}\` is worth ${c.points}, which is not a multiple of the step ${step}`,
          "use a maximum that is a multiple of the step, or set a finer `step`",
        );
      }
    }
    if (complete) {
      const total = sumMarks(rubric.criteria.map((c) => c.points ?? 0));
      if (total !== sumMarks([points])) {
        r.error(
          "rubric.sum",
          rubric.line,
          `the criteria add up to ${total}, but the question is worth ${points}`,
          "make the criteria's points add up to the question's points",
        );
      }
    }
    return;
  }

  // banded
  if (rubric.scale === null) {
    if (rubric.scaleLine === null) {
      r.error(
        "rubric.scale",
        rubric.line,
        "a banded rubric needs a `scale` (min, max and step)",
        "add scale: {min: 0, max: 9, step: 0.5}, or use a preset",
      );
    }
  } else {
    const { min, max, step } = rubric.scale;
    const line = rubric.scaleLine ?? rubric.line;
    if (!(step > 0)) r.error("rubric.scale", line, "the scale's `step` must be above 0", "use a step such as 0.5");
    else if (!(max > min)) r.error("rubric.scale", line, "the scale's `max` must be above its `min`", "swap them");
    else if (!isMultiple(max, step, min)) {
      r.error(
        "rubric.scale",
        line,
        `the step ${step} does not divide the width of the scale (${min} to ${max})`,
        "choose a step that divides the width of the scale",
      );
    }
  }
  if (rubric.criteria.length === 0) {
    r.error("rubric.weights", rubric.line, "a banded rubric needs criteria", "list the criteria to band");
  }
  for (const c of rubric.criteria) {
    if (c.weight !== null && !(c.weight > 0)) {
      r.error(
        "rubric.weights",
        c.line,
        `the weight of \`${c.id}\` must be above 0`,
        "give every weight as a number above 0",
      );
    }
  }
}
