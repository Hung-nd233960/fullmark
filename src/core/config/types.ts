import type { QuestionType } from "../ir";
import type { Level } from "../issue";

/** Where a setting was written: a line of a config file, or null for the built-in value. */
export type Source = { file: string; line: number } | null;

/** The filter of a custom check (TECHNICAL_DESIGN.md, section 5). An empty one matches every question. */
export type Where = { type?: QuestionType; tag?: string; section?: string; graded?: boolean };

export const REQUIRE_FIELDS = ["tags", "explanation", "id", "points", "source"] as const;
export type RequireField = (typeof REQUIRE_FIELDS)[number];

type CheckBase = { id: string; where: Where; level: Level; message: string | null; source: Source };

/** A declarative check of a profile: `count`, `require` or `forbid`. There are no scripts. */
export type CustomCheck =
  | (CheckBase & { kind: "count"; measure: "questions" | "points"; min: number | null; max: number | null })
  | (CheckBase & { kind: "require"; field: RequireField })
  | (CheckBase & { kind: "forbid" });

/** What a profile says about one rule: a level and/or options. */
export type RuleSetting = {
  level: Level | null;
  options: Record<string, unknown>;
  /** the line of each option key, for errors found later */
  optionLines: Record<string, number>;
  source: Source;
};

export type ProfileLayer = "built-in" | "user" | "project";

/** A profile as written, before `extends` is followed. */
export type ProfileDef = {
  name: string;
  extends: string | null;
  extendsLine: number;
  rules: Map<string, RuleSetting>;
  checks: CustomCheck[];
  allowIgnore: boolean | null;
  source: Source;
  layer: ProfileLayer;
};

/** What one config file contributes. */
export type ConfigFileData = {
  file: string;
  /** `[check]`: read from `fullmark.toml` only */
  check: { profile: string | null; profileLine: number; failOn: "error" | "warning" | null; failOnLine: number };
  profiles: Map<string, ProfileDef>;
};

/** A problem in a config file: always a file and a line. */
export type ConfigError = { file: string; line: number; message: string; fix?: string };
