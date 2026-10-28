import { readNumber } from "../../number";
import { scalarText } from "../yaml-view";
import type { AnswerEnv } from "./env";
import { type OpenParts, parseOpenParts } from "./open";
import { checkKeys, type MapSource } from "./source";

export type EssayAnswer = OpenParts & { minWords: number | null; maxWords: number | null };

export function parseEssay(src: MapSource, env: AnswerEnv): EssayAnswer {
  const { r } = env;
  checkKeys(src, ["min_words", "max_words", "rubric", "sample_answer", "show_rubric"], "answer", r);
  const words = (key: string): { value: number | null; line: number } => {
    const e = src.get(key);
    if (!e) return { value: null, line: env.headingLine };
    const n = readNumber(scalarText(e.value) ?? "");
    if (n === null || !Number.isInteger(n) || n < 0) {
      r.error("syntax.value", e.line, `\`${key}\` must be a whole number, 0 or more`);
      return { value: null, line: e.line };
    }
    return { value: n, line: e.line };
  };
  const min = words("min_words");
  const max = words("max_words");
  if (min.value !== null && max.value !== null && max.value !== 0 && min.value > max.value) {
    r.error("essay.words", min.line, `min_words (${min.value}) is above max_words (${max.value})`);
  }
  const sample = src.get("sample_answer");
  if (sample) env.math?.(scalarText(sample.value) ?? "", sample.line);
  return {
    minWords: min.value,
    maxWords: max.value === 0 ? null : max.value,
    ...parseOpenParts(src, env),
  };
}
