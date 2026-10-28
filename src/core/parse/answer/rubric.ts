import type { Node } from "yaml";
import type { Rubric, RubricCriterion } from "../../ir";
import { readNumber } from "../../number";
import { slug } from "../../slug";
import type { Reporter } from "../report";
import { asMap, asSeq, type Entry, scalarText, type YamlRoot } from "../yaml-view";
import { checkKeys, mapSource } from "./source";

const MODES = ["holistic", "additive", "banded"] as const;
const ROUNDS = ["nearest-step", "down", "ielts"] as const;
const PRESETS = ["ielts-writing-task1", "ielts-writing-task2"] as const;

/** `Define it (1.5 pts)`: the shorthand is read strictly at the end of the bullet. */
const SHORTHAND = /^(.*?)\s*\((\d+(?:\.\d+)?)\s*pts?\)\s*$/s;

/**
 * Parses the structure of a rubric (TECHNICAL_DESIGN.md, section 6): a list of bullets, a mapping with a mode,
 * criteria, a scale and so on, or a preset. Only the shape is checked here (`syntax.value`, `syntax.unknown-key`);
 * the `rubric.*` rules about its consistency belong to the grading slice.
 */
export function parseRubric(root: YamlRoot, entry: Entry, r: Reporter): Rubric | null {
  const seq = asSeq(entry.value);
  if (seq) {
    return {
      line: entry.line,
      mode: "holistic",
      preset: null,
      step: null,
      scale: null,
      scaleLine: null,
      round: null,
      criteria: criteria(root, seq.items as (Node | null)[], r),
    };
  }
  const src = mapSource(root, entry.value);
  if (!src) {
    r.error("syntax.value", entry.line, "`rubric` must be a list of criteria or a mapping");
    return null;
  }
  checkKeys(src, ["mode", "step", "criteria", "preset", "scale", "round"], "rubric", r);
  const out: Rubric = {
    line: entry.line,
    mode: null,
    preset: null,
    step: null,
    scale: null,
    scaleLine: null,
    round: null,
    criteria: [],
  };
  const oneOf = <T extends string>(e: Entry | undefined, allowed: readonly T[]): T | null => {
    if (!e) return null;
    const v = scalarText(e.value);
    if (v !== null && (allowed as readonly string[]).includes(v)) return v as T;
    r.error("syntax.value", e.line, `\`${e.key}\` must be one of ${allowed.join(", ")}`);
    return null;
  };
  out.mode = oneOf(src.get("mode"), MODES);
  out.preset = oneOf(src.get("preset"), PRESETS);
  out.round = oneOf(src.get("round"), ROUNDS);
  const number = (e: Entry | undefined): number | null => {
    if (!e) return null;
    const n = readNumber(scalarText(e.value) ?? "");
    if (n === null) r.error("syntax.value", e.line, `\`${e.key}\` must be a number`);
    return n;
  };
  out.step = number(src.get("step"));
  const scale = src.get("scale");
  if (scale) {
    out.scaleLine = scale.line;
    const s = mapSource(root, scale.value);
    if (!s) {
      r.error("syntax.value", scale.line, "`scale` must be a mapping with min, max and step");
    } else {
      checkKeys(s, ["min", "max", "step"], "scale", r);
      const [min, max, step] = [number(s.get("min")), number(s.get("max")), number(s.get("step"))];
      if (min === null || max === null || step === null) {
        if (min !== null || max !== null || step !== null || s.entries.length === 0) {
          r.error("syntax.value", scale.line, "`scale` needs min, max and step, all numbers");
        }
      } else {
        out.scale = { min, max, step };
      }
    }
  }
  const crit = src.get("criteria");
  if (crit) {
    const list = asSeq(crit.value);
    if (!list) r.error("syntax.value", crit.line, "`criteria` must be a list");
    else out.criteria = criteria(root, list.items as (Node | null)[], r);
  }
  return out;
}

function criteria(root: YamlRoot, items: (Node | null)[], r: Reporter): RubricCriterion[] {
  const out: RubricCriterion[] = [];
  items.forEach((item, index) => {
    const line = root.lineOf(item);
    const own = scalarText(item);
    if (own !== null) {
      const m = SHORTHAND.exec(own);
      const text = (m ? (m[1] ?? "") : own).trim();
      out.push({
        line,
        id: slug(text) || `criterion-${index + 1}`,
        explicitId: false,
        text,
        points: m ? Number(m[2]) : null,
        weight: null,
      });
      return;
    }
    const src = mapSource(root, item);
    if (!src || !asMap(item)) {
      r.error("syntax.value", line, "a criterion is text, or a mapping with id, text, points and weight");
      return;
    }
    checkKeys(src, ["id", "text", "points", "weight"], "criterion", r);
    const textEntry = src.get("text");
    const text = scalarText(textEntry?.value ?? null);
    if (text === null) {
      r.error("syntax.value", line, "a criterion needs `text`");
      return;
    }
    const idEntry = src.get("id");
    const id = idEntry ? scalarText(idEntry.value) : null;
    const num = (e: Entry | undefined): number | null => {
      if (!e) return null;
      const n = readNumber(scalarText(e.value) ?? "");
      if (n === null) r.error("syntax.value", e.line, `\`${e.key}\` must be a number`);
      return n;
    };
    out.push({
      line,
      id: id ?? (slug(text) || `criterion-${index + 1}`),
      explicitId: id !== null,
      text: text.trim(),
      points: num(src.get("points")),
      weight: num(src.get("weight")),
    });
  });
  return out;
}
