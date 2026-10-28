import type { Brief, FrontMatter } from "../ir";
import type { Level } from "../issue";
import { suggest } from "../parse/report";
import { defaultOptions, RULES } from "../rules/registry";
import type { Rule } from "../rules/types";
import { BUILTIN_PROFILES } from "./profiles";
import type { ConfigError, ConfigFileData, CustomCheck, ProfileDef, Source } from "./types";

/** The config files in play: the user's `config.toml` and the nearest `fullmark.toml`, each already parsed. */
export type Layers = { user: ConfigFileData | null; project: ConfigFileData | null };

/** One rule as a profile resolves it, with where each value came from. */
export type ResolvedRule = {
  id: string;
  kind: Rule["kind"] | "custom";
  level: Level;
  options: Record<string, unknown>;
  /** where the level came from: `built-in`, `profile exam`, or `fullmark.toml:12` */
  origin: string;
  optionOrigins: Record<string, string>;
  description: string;
};

export type ResolvedProfile = {
  name: string;
  /** the profile, then what it extends, down to the base: `signals-exam`, `exam`, `default` */
  chain: { name: string; origin: string }[];
  rules: Map<string, ResolvedRule>;
  checks: CustomCheck[];
  allowIgnore: boolean;
  allowIgnoreOrigin: string;
  /** the config files that contributed (those that define a profile of the chain) */
  files: string[];
};

const label = (source: Source): string => (source ? `${source.file}:${source.line}` : "built-in");

function lookup(name: string, layers: Layers): ProfileDef | null {
  return layers.project?.profiles.get(name) ?? layers.user?.profiles.get(name) ?? BUILTIN_PROFILES.get(name) ?? null;
}

const known = (layers: Layers): string[] =>
  [
    ...new Set([
      ...BUILTIN_PROFILES.keys(),
      ...(layers.user?.profiles.keys() ?? []),
      ...(layers.project?.profiles.keys() ?? []),
    ]),
  ].sort();

/**
 * Resolves a profile: follows `extends` (a profile named like a built-in one, with no `extends` of its own, changes
 * that built-in profile; a project profile replaces a user profile of the same name), then applies the rule
 * settings from the base up. The errors are config errors, each with the file and line it comes from.
 */
export function resolveProfile(
  name: string,
  layers: Layers,
): { profile: ResolvedProfile | null; errors: ConfigError[] } {
  const errors: ConfigError[] = [];
  const first = lookup(name, layers);
  if (!first) {
    return { profile: null, errors: [] };
  }

  // -- the chain, leaf first
  const defs: ProfileDef[] = [];
  let def: ProfileDef | null = first;
  while (def) {
    if (defs.includes(def)) {
      const at = def.source;
      errors.push({
        file: at?.file ?? "",
        line: def.extendsLine,
        message: `profile \`${def.name}\` extends itself: ${[...defs.map((d) => d.name), def.name].join(" -> ")}`,
        fix: "remove one `extends`",
      });
      return { profile: null, errors };
    }
    defs.push(def);
    if (def.extends !== null && def.extends !== def.name) {
      const next = lookup(def.extends, layers);
      if (!next) {
        errors.push({
          file: def.source?.file ?? "",
          line: def.extendsLine,
          message: `profile \`${def.name}\` extends \`${def.extends}\`, which does not exist`,
          fix: unknownProfileFix(def.extends, layers),
        });
        return { profile: null, errors };
      }
      def = next;
    } else if (def.layer !== "built-in" && BUILTIN_PROFILES.has(def.name)) {
      def = BUILTIN_PROFILES.get(def.name) ?? null;
    } else def = null;
  }
  const base = [...defs].reverse();

  // -- the rules, from their built-in defaults
  const rules = new Map<string, ResolvedRule>();
  for (const r of RULES) {
    rules.set(r.id, {
      id: r.id,
      kind: r.kind,
      level: r.level,
      options: r.kind === "quality" ? defaultOptions(r) : {},
      origin: "built-in",
      optionOrigins: {},
      description: r.summary,
    });
  }
  const checks = new Map<string, CustomCheck>();
  let allowIgnore = true;
  let allowIgnoreOrigin = "built-in";
  const files = new Set<string>();
  const customLevels: { id: string; level: Level; source: Source; origin: string }[] = [];

  for (const d of base) {
    const where = d.source ? label(d.source) : `profile ${d.name}`;
    if (d.source) files.add(d.source.file);
    if (d.allowIgnore !== null) {
      allowIgnore = d.allowIgnore;
      allowIgnoreOrigin = where;
    }
    for (const c of d.checks) checks.set(c.id, c);
    for (const [id, s] of d.rules) {
      const origin = s.source ? label(s.source) : `profile ${d.name}`;
      const rule = rules.get(id);
      if (!rule) {
        if (s.level !== null) customLevels.push({ id, level: s.level, source: s.source, origin });
        continue;
      }
      if (s.level !== null) {
        rule.level = s.level;
        rule.origin = origin;
      }
      for (const [k, v] of Object.entries(s.options)) {
        rule.options[k] = v;
        rule.optionOrigins[k] = origin;
      }
    }
  }

  // -- custom checks join the rules; a level set in `rules` wins over the check's own
  for (const c of checks.values()) {
    rules.set(c.id, {
      id: c.id,
      kind: "custom",
      level: c.level,
      options: {},
      origin: label(c.source),
      optionOrigins: {},
      description: c.message ?? describeCheck(c),
    });
  }
  for (const c of customLevels) {
    const rule = rules.get(c.id);
    if (!rule || rule.kind !== "custom") {
      errors.push({
        file: c.source?.file ?? "",
        line: c.source?.line ?? 1,
        message: `\`${c.id}\` is not a check of profile \`${name}\``,
        fix: "define it with [[profiles.NAME.checks]] in this profile or one it extends",
      });
    } else {
      rule.level = c.level;
      rule.origin = c.origin;
    }
  }

  const profile: ResolvedProfile = {
    name,
    chain: defs.map((d) => ({ name: d.name, origin: label(d.source) })),
    rules,
    checks: [...checks.values()],
    allowIgnore,
    allowIgnoreOrigin,
    files: [...files],
  };
  return { profile: errors.length > 0 ? null : profile, errors };
}

export function describeCheck(c: CustomCheck): string {
  const where = Object.entries(c.where)
    .map(([k, v]) => `${k} = ${String(v)}`)
    .join(", ");
  const filter = where === "" ? "every question" : `questions with ${where}`;
  if (c.kind === "count") {
    const range =
      c.min !== null && c.max !== null
        ? `${c.min} to ${c.max}`
        : c.min !== null
          ? `at least ${c.min}`
          : `at most ${c.max}`;
    return `${c.measure === "points" ? "points of" : "number of"} ${filter}: ${range}`;
  }
  if (c.kind === "require") return `${filter} must have ${c.field}`;
  return `no question may match ${filter}`;
}

export function unknownProfileFix(name: string, layers: Layers): string {
  const near = suggest(name, known(layers));
  return near ? `did you mean \`${near}\`?` : `the profiles are: ${known(layers).join(", ")}`;
}

/** The plain message for an unknown `--profile`: it always names the profiles there are. */
export function unknownProfileMessage(name: string, layers: Layers): string {
  const near = suggest(name, known(layers));
  return `unknown profile \`${name}\`${near ? ` (did you mean \`${near}\`?)` : ""}; the profiles are: ${known(layers).join(", ")}`;
}

/**
 * Resolves every profile the config files define, so that a mistake in a profile nobody has used yet (an unknown
 * `extends`, a cycle, a `custom.` level with no check) is reported now, with its file and line.
 */
export function validateLayers(layers: Layers): ConfigError[] {
  const errors: ConfigError[] = [];
  const names = new Set([...(layers.user?.profiles.keys() ?? []), ...(layers.project?.profiles.keys() ?? [])]);
  for (const name of [...names].sort()) errors.push(...resolveProfile(name, layers).errors);
  const seen = new Set<string>();
  return errors.filter((e) => {
    const key = `${e.file}:${e.line}:${e.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type ProfileChoice = {
  name: string;
  /** where the name came from, in words */
  from: "--profile" | "the quiz" | "the survey default" | "brief.yaml" | "[check] profile" | "the default";
  /** the line it came from, when it came from a config file or the quiz */
  line: number | null;
};

/**
 * The profile choice order (TECHNICAL_DESIGN.md, section 5): `--profile`, then `profile:` in the quiz's front
 * matter (a survey's default is `survey`), then `profile` in `brief.yaml`, then `[check] profile`, then `default`.
 */
export function chooseProfile(input: {
  cli: string | null;
  frontMatter: FrontMatter | null;
  brief: Brief | null;
  layers: Layers;
}): ProfileChoice {
  const { cli, frontMatter: fm, brief, layers } = input;
  if (cli !== null) return { name: cli, from: "--profile", line: null };
  if (fm?.profileGiven) return { name: fm.profile, from: "the quiz", line: fm.profileLine };
  if (fm?.kind === "survey") return { name: "survey", from: "the survey default", line: null };
  if (brief?.profile) return { name: brief.profile, from: "brief.yaml", line: null };
  const check = layers.project?.check;
  if (check?.profile) return { name: check.profile, from: "[check] profile", line: check.profileLine };
  return { name: "default", from: "the default", line: null };
}
