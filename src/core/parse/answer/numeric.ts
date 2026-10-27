import type { NumberKey } from "../../ir";
import type { AnswerEnv } from "./env";
import { NUMBER_KEYS, readNumberKey } from "./keys";
import { checkKeys, type MapSource } from "./source";

export function parseNumeric(src: MapSource, env: AnswerEnv): NumberKey {
  checkKeys(src, NUMBER_KEYS, "answer", env.r);
  return (
    readNumberKey(src, env.r, env.headingLine) ?? { values: [], raw: [], tolerance: 0, relTolerance: null, unit: "" }
  );
}
