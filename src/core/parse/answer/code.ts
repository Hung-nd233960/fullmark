import { scalarText } from "../yaml-view";
import type { AnswerEnv } from "./env";
import { type OpenParts, parseOpenParts } from "./open";
import { checkKeys, type MapSource } from "./source";

export type CodeAnswer = OpenParts & { language: string; starter: string | null };

export function parseCode(src: MapSource, env: AnswerEnv): CodeAnswer {
  const { r } = env;
  checkKeys(src, ["language", "starter", "rubric", "sample_answer", "show_rubric"], "answer", r);
  const lang = src.get("language");
  const language = lang ? (scalarText(lang.value) ?? "").trim() : "";
  if (language === "") {
    r.error(
      "code.language",
      lang ? lang.line : env.headingLine,
      "a code question needs a `language`",
      "add language: python",
    );
  }
  const starter = src.get("starter");
  const text = starter ? scalarText(starter.value) : null;
  if (starter && text === null) r.error("syntax.value", starter.line, "`starter` must be text");
  return { language, starter: text === null ? null : text.replace(/\n$/, ""), ...parseOpenParts(src, env) };
}
