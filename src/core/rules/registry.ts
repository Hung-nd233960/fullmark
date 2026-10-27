import { FIXED_RULES } from "./fixed";
import { QUALITY_RULES } from "./quality";
import type { FixedRule, QualityRule, Rule } from "./types";

/** Every rule fullmark has: fixed rules first, then quality rules, each group in a stable order. */
export const RULES: readonly Rule[] = [...FIXED_RULES, ...QUALITY_RULES];

const byId = new Map<string, Rule>(RULES.map((r) => [r.id, r]));

export function findRule(id: string): Rule | undefined {
  return byId.get(id);
}

export const isFixedRule = (r: Rule | undefined): r is FixedRule => r?.kind === "fixed";
export const isQualityRule = (r: Rule | undefined): r is QualityRule => r?.kind === "quality";

export const RULE_IDS: readonly string[] = RULES.map((r) => r.id);

/** The default options of a quality rule: its schema applied to nothing. */
export function defaultOptions(rule: QualityRule): Record<string, unknown> {
  return rule.options.parse({}) as Record<string, unknown>;
}
