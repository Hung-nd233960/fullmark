import type { Level } from "../issue";
import { BRIEF_RULES } from "../rules/brief";
import { BUILD_RULES } from "../rules/build";
import { QUALITY_RULES } from "../rules/quality";
import type { ProfileDef, RuleSetting } from "./types";

function setting(level: Level | null, options: Record<string, unknown> = {}): RuleSetting {
  return { level, options, optionLines: {}, source: null };
}

function builtin(
  name: string,
  extendsName: string | null,
  rules: [string, RuleSetting][],
  allowIgnore: boolean | null,
): ProfileDef {
  return {
    name,
    extends: extendsName,
    extendsLine: 1,
    rules: new Map(rules),
    checks: [],
    allowIgnore,
    source: null,
    layer: "built-in",
  };
}

const quality = [...QUALITY_RULES, ...BRIEF_RULES, ...BUILD_RULES];

/**
 * The built-in profiles (TECHNICAL_DESIGN.md, section 5). `draft` makes every quality rule that is on an `info`;
 * `exam` makes them errors, switches on the rules that are off in `default` (but not `quiz.no-time-limit`, which the
 * design does not name) and tightens a few options; `survey` switches off the rules about answer keys and
 * explanations.
 */
export const BUILTIN_PROFILES: ReadonlyMap<string, ProfileDef> = new Map(
  [
    builtin("default", null, [], null),
    builtin(
      "draft",
      "default",
      quality.filter((r) => r.level !== "off").map((r): [string, RuleSetting] => [r.id, setting("info")]),
      null,
    ),
    builtin(
      "exam",
      "default",
      [
        ...quality.filter((r) => r.level !== "off").map((r): [string, RuleSetting] => [r.id, setting("error")]),
        ["explanation.missing", setting("error")],
        ["question.untagged", setting("error")],
        ["explanation.short", setting("error", { "min-words": 8 })],
        ["answers.position-skew", setting("error", { "max-share": 0.4 })],
        ["brief.count", setting("error", { tolerance: 0.1 })],
      ],
      false,
    ),
    builtin(
      "survey",
      "default",
      [
        "choice.correct-longest",
        "choice.in-stem",
        "explanation.short",
        "explanation.missing",
        "answers.position-skew",
      ].map((id): [string, RuleSetting] => [id, setting("off")]),
      null,
    ),
  ].map((p) => [p.name, p]),
);
