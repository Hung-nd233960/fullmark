import { scalarText } from "../yaml-view";
import type { AnswerEnv } from "./env";
import { checkKeys, type MapSource, mapSource } from "./source";

export type ScaleAnswer = { min: number; max: number; labels: { line: number; value: number; text: string }[] };

const INT = /^-?\d+$/;

export function parseScale(src: MapSource, env: AnswerEnv): ScaleAnswer {
  const { r } = env;
  checkKeys(src, ["min", "max", "labels"], "answer", r);
  const int = (key: string, fallback: number): { value: number; line: number } => {
    const e = src.get(key);
    if (!e) return { value: fallback, line: env.headingLine };
    const text = scalarText(e.value);
    if (text === null || !INT.test(text)) {
      r.error("syntax.value", e.line, `\`${key}\` must be a whole number`);
      return { value: fallback, line: e.line };
    }
    return { value: Number(text), line: e.line };
  };
  const min = int("min", 1);
  const max = int("max", 5);
  const width = max.value - min.value;
  if (width < 1 || width > 10) {
    r.error(
      "scale.range",
      max.line,
      `the scale runs from ${min.value} to ${max.value}: max - min must be from 1 to 10`,
    );
  }
  const labels: ScaleAnswer["labels"] = [];
  const entry = src.get("labels");
  if (entry) {
    const map = mapSource(src.root, entry.value);
    if (!map) {
      r.error("syntax.value", entry.line, "`labels` must be a mapping such as 1: Not at all");
    } else {
      for (const e of map.entries) {
        const text = scalarText(e.value);
        if (!INT.test(e.key) || text === null) {
          r.error("syntax.value", e.line, "a label is a whole number and its text, such as 1: Not at all");
          continue;
        }
        const value = Number(e.key);
        if (value < min.value || value > max.value) {
          r.error("scale.range", e.line, `the label ${value} is outside the scale (${min.value} to ${max.value})`);
        }
        env.math?.(text, e.line);
        labels.push({ line: e.line, value, text });
      }
    }
  }
  return { min: min.value, max: max.value, labels };
}
