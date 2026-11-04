import type { z } from "zod";
import type { Brief, Quiz } from "../ir";
import type { Level } from "../issue";
import type { Review } from "../review/schema";

/** A problem a rule found, before the runner adds the rule id, the level and the file. */
export type Finding = { line: number; message: string; fix?: string };

/** What the rules of one quiz may look at besides the quiz itself. */
export type RuleContext = {
  /** the brief beside the quiz (`brief.yaml`), when there is one and it can be read */
  brief: Brief | null;
  /**
   * The files under the brief's `content/` folder, as paths relative to it, `README.md` left out. Null when the
   * folder could not be looked at (no brief, or a caller that does not read the disk).
   */
  contentFiles: readonly string[] | null;
  /** the review given to `check --review`; null everywhere else */
  review: Review | null;
};

type Common = {
  /** the rule id: a contract that agents and scripts match on, never renamed */
  id: string;
  /** one line for `quiz rules` */
  summary: string;
  /** why it matters (quality rules) or what makes the quiz unusable (fixed rules) */
  why: string;
  /** a quiz fragment (the body after the front matter) that triggers the rule, for `quiz rules RULE` */
  example: string;
  /** how to fix what the rule finds */
  fix: string;
};

/** A rule that says whether a quiz can work at all. No config can change its level or ignore it. */
export type FixedRule = Common & {
  kind: "fixed";
  level: Level;
  /** where the rule is raised: the parser, the asset loader, `check` itself, or the grading slice (not yet) */
  raisedBy: "parser" | "loader" | "check" | "grading";
};

/** A rule about quality: its level and options come from the profile. */
export type QualityRule = Common & {
  kind: "quality";
  /** the built-in default level, under the `default` profile */
  level: Level;
  /** the options with their defaults; keys are written as in `fullmark.toml` (`min-length`) */
  options: z.ZodObject;
  run(quiz: Quiz, ctx: RuleContext, options: Record<string, unknown>): Finding[];
};

export type Rule = FixedRule | QualityRule;
