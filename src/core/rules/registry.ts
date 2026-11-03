import { BRIEF_RULES } from "./brief";
import { BUILD_RULES } from "./build";
import { FIXED_RULES } from "./fixed";
import { QUALITY_RULES } from "./quality";
import type { QualityRule, Rule } from "./types";

/** Every rule fullmark has: fixed rules first, then quality rules, each group in a stable order. */
export const RULES: readonly Rule[] = [...FIXED_RULES, ...QUALITY_RULES, ...BRIEF_RULES, ...BUILD_RULES];

const byId = new Map<string, Rule>(RULES.map((r) => [r.id, r]));

export function findRule(id: string): Rule | undefined {
  return byId.get(id);
}

export const RULE_IDS: readonly string[] = RULES.map((r) => r.id);

/** The default options of a quality rule: its schema applied to nothing. */
export function defaultOptions(rule: QualityRule): Record<string, unknown> {
  return rule.options.parse({}) as Record<string, unknown>;
}
