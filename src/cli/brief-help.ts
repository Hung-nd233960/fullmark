import type { Command } from "commander";
import { defaultOf, type Question, type QuestionValue } from "../core/brief/questions";
import { PURPOSES } from "../core/ir";
import { loadQuestions } from "./brief-questions";

const show = (v: QuestionValue): string =>
  Array.isArray(v) ? (v.length === 0 ? "none" : v.join(", ")) : v === "" ? "empty" : String(v);

/** The help line of an option: the question file's own words (English), its allowed values and its default. */
function describe(q: Question): string {
  const parts = [q.help.en.replace(/\.$/, "")];
  if (q.choices)
    parts.push(`${q.kind === "multi" ? "a comma list of" : "one of"}: ${q.choices.map((c) => c.value).join(", ")}`);
  if (q["min-words"] !== undefined)
    parts.push(`at least ${q["min-words"]} words, for example "${q.example?.en ?? ""}"`);
  if (q.kind === "number") parts.push(`from ${q.min ?? 0}${q.max === undefined ? "" : ` to ${q.max}`}`);
  if (q["human-only"]) parts.push("human-only");
  const byPurpose = q.choices?.some((c) => c["default-for"] !== undefined) || q["default-by-purpose"] !== undefined;
  if (byPurpose) parts.push(`default by purpose: ${PURPOSES.map((p) => `${p} ${show(defaultOf(q, p))}`).join("; ")}`);
  else if (q.default !== undefined) parts.push(`default: ${show(q.default)}`);
  return `${parts.join("; ")}`;
}

/** Puts the question file's words on `quiz brief`'s options, so the help cannot drift from the forms. Help only. */
export function describeBriefOptions(program: Command): void {
  const brief = program.commands.find((c) => c.name() === "brief");
  if (!brief) return;
  const file = loadQuestions();
  for (const option of brief.options) {
    const flag = option.long?.replace(/^--/, "");
    const q = file.questions.find((x) => x.flag === flag);
    if (q) option.description = describe(q);
    else {
      const follow = file.questions.find((x) => x["follow-up"]?.flag === flag)?.["follow-up"];
      if (follow) option.description = `${follow.help.en.replace(/\.$/, "")}; needs other in --kinds`;
    }
  }
}
