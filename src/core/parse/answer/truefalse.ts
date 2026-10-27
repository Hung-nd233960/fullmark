import { boolValue } from "../yaml-view";
import type { AnswerEnv } from "./env";
import { checkKeys, type MapSource } from "./source";

export function parseTrueFalse(src: MapSource, env: AnswerEnv): boolean {
  checkKeys(src, ["value"], "answer", env.r);
  const v = src.get("value");
  if (!v) {
    env.r.error(
      "question.answer-block",
      env.headingLine,
      "the answer block has no `value`",
      "add value: true or value: false",
    );
    return false;
  }
  const b = boolValue(v.value);
  if (b === null) {
    env.r.error("syntax.value", v.line, "`value` must be true or false");
    return false;
  }
  return b;
}
