import type { TextKey } from "../../ir";
import type { AnswerEnv } from "./env";
import { readTextKey, TEXT_KEYS } from "./keys";
import { checkKeys, type MapSource } from "./source";

export function parseShort(src: MapSource, env: AnswerEnv): TextKey {
  checkKeys(src, TEXT_KEYS, "answer", env.r);
  const key = readTextKey(src, env.r);
  if (env.graded && key.accept.length === 0 && key.patterns.length === 0) {
    env.r.error(
      "short.key",
      env.headingLine,
      "a short answer needs `accept` or `patterns`",
      "add accept: [the answer]",
    );
  }
  return key;
}
