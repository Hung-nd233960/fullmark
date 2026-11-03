import { parse as parseToml } from "smol-toml";
import { FONT_CHOICES, type FontsChoice } from "../fonts";
import { BriefSchema, MIX_KINDS, PURPOSES, QUESTION_TYPES, type QuestionType } from "../ir";
import type { Level } from "../issue";
import { suggest } from "../parse/report";
import { findRule, RULES } from "../rules/registry";
import { TomlIndex } from "./toml-index";
import {
  type ConfigError,
  type ConfigFileData,
  type CustomCheck,
  type ProfileDef,
  REQUIRE_FIELDS,
  type RequireField,
  type RuleSetting,
  type Where,
} from "./types";

export type ConfigParse = { data: ConfigFileData | null; errors: ConfigError[] };

const LEVELS: readonly Level[] = ["error", "warning", "info", "off"];
const PROFILE_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;
const CUSTOM_ID = /^custom\.[a-z0-9][a-z0-9.-]*$/;

type Table = Record<string, unknown>;
const isTable = (v: unknown): v is Table =>
  typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);

const describe = (v: unknown): string =>
  Array.isArray(v)
    ? "a list"
    : v instanceof Date
      ? "a date"
      : v === null
        ? "nothing"
        : typeof v === "object"
          ? "a table"
          : `${typeof v} ${JSON.stringify(v)}`;

/**
 * Reads the text of a config file. `project` is a `fullmark.toml` (`[check]` and `[profiles.*]`); `user` is the
 * machine's `config.toml`, of which only `[profiles.*]` is ours (its other sections belong to the library). Every
 * error carries the file and the line of the key at fault, found with `TomlIndex`, since `smol-toml` reports a
 * position only for TOML that does not parse.
 */
export function parseConfig(text: string, file: string, kind: "project" | "user"): ConfigParse {
  const errors: ConfigError[] = [];
  let doc: Table;
  try {
    const parsed = parseToml(text);
    doc = parsed as Table;
  } catch (e) {
    const err = e as { line?: number; message?: string };
    errors.push({
      file,
      line: err.line ?? 1,
      message: `not valid TOML: ${(err.message ?? "").split("\n")[0]?.replace(/^Invalid TOML document: /, "") ?? ""}`,
      fix: "fix the syntax at that line: keys are `name = value`, tables are `[name]`, text is in quotes",
    });
    return { data: null, errors };
  }
  const index = new TomlIndex(text);
  const at = (path: readonly string[]) => index.lineOf(path);
  const fail = (path: readonly string[], message: string, fix?: string) =>
    errors.push({ file, line: at(path), message, ...(fix ? { fix } : {}) });

  const data: ConfigFileData = {
    file,
    check: { profile: null, profileLine: 1, failOn: null, failOnLine: 1 },
    fonts: null,
    profiles: new Map(),
    briefDefaults: {},
  };

  const unknownKeys = (t: Table, allowed: readonly string[], path: string[], where: string) => {
    for (const k of Object.keys(t)) {
      if (allowed.includes(k)) continue;
      const near = suggest(k, allowed);
      fail(
        [...path, k],
        `unknown key \`${k}\`${where === "" ? "" : ` in ${where}`}`,
        near ? `did you mean \`${near}\`?` : `the keys are: ${allowed.join(", ")}`,
      );
    }
  };

  if (kind === "project") {
    unknownKeys(doc, ["check", "profiles"], [], "");
    const check = doc.check;
    if (check !== undefined) {
      if (!isTable(check)) fail(["check"], `\`check\` must be a table, not ${describe(check)}`, "write [check]");
      else {
        unknownKeys(check, ["profile", "fail-on"], ["check"], "[check]");
        const profile = check.profile;
        if (profile !== undefined) {
          if (typeof profile !== "string" || profile === "") {
            fail(["check", "profile"], "`profile` must be the name of a profile, in quotes");
          } else {
            data.check.profile = profile;
            data.check.profileLine = at(["check", "profile"]);
          }
        }
        const failOn = check["fail-on"];
        if (failOn !== undefined) {
          if (failOn === "error" || failOn === "warning") {
            data.check.failOn = failOn;
            data.check.failOnLine = at(["check", "fail-on"]);
          } else fail(["check", "fail-on"], '`fail-on` must be "error" or "warning"');
        }
      }
    }
  }

  // the machine config's default for `--fonts` (the rest of that file belongs to the library)
  if (kind === "user" && doc.fonts !== undefined) {
    if ((FONT_CHOICES as readonly string[]).includes(doc.fonts as string)) data.fonts = doc.fonts as FontsChoice;
    else
      fail(["fonts"], `\`fonts\` must be ${FONT_CHOICES.map((c) => `"${c}"`).join(", ")}, not ${describe(doc.fonts)}`);
  }

  if (kind === "user" && doc.brief !== undefined) readBriefDefaults(doc.brief, data, fail);

  const profiles = doc.profiles;
  if (profiles !== undefined) {
    if (!isTable(profiles)) fail(["profiles"], `\`profiles\` must be a table, not ${describe(profiles)}`);
    else {
      for (const [name, value] of Object.entries(profiles)) {
        const path = ["profiles", name];
        if (!PROFILE_NAME.test(name)) {
          fail(path, `"${name}" is not a valid profile name`, "use letters, digits, - and _, starting with a letter");
          continue;
        }
        if (!isTable(value)) {
          fail(path, `profile \`${name}\` must be a table, not ${describe(value)}`, `write [profiles.${name}]`);
          continue;
        }
        const def = readProfile(name, value, path, kind === "user" ? "user" : "project");
        if (def) data.profiles.set(name, def);
      }
    }
  }
  return { data: errors.length > 0 ? null : data, errors };

  function readProfile(name: string, t: Table, path: string[], layer: "user" | "project"): ProfileDef | null {
    const def: ProfileDef = {
      name,
      extends: null,
      extendsLine: at(path),
      rules: new Map(),
      checks: [],
      allowIgnore: null,
      source: { file, line: at(path) },
      layer,
    };
    unknownKeys(t, ["extends", "allow-ignore", "rules", "checks"], path, `profile \`${name}\``);
    if (t.extends !== undefined) {
      if (typeof t.extends !== "string" || t.extends === "")
        fail([...path, "extends"], "`extends` must be the name of a profile, in quotes");
      else {
        def.extends = t.extends;
        def.extendsLine = at([...path, "extends"]);
      }
    }
    if (t["allow-ignore"] !== undefined) {
      if (typeof t["allow-ignore"] === "boolean") def.allowIgnore = t["allow-ignore"];
      else fail([...path, "allow-ignore"], "`allow-ignore` must be true or false");
    }
    const rules = t.rules;
    if (rules !== undefined) {
      if (!isTable(rules)) fail([...path, "rules"], `\`rules\` must be a table, not ${describe(rules)}`);
      else for (const [id, v] of Object.entries(rules)) readRule(def, id, v, [...path, "rules", id]);
    }
    const checks = t.checks;
    if (checks !== undefined) {
      if (!Array.isArray(checks)) {
        fail([...path, "checks"], "`checks` must be a list of tables", `write [[profiles.${name}.checks]]`);
      } else {
        const seen = new Set<string>();
        for (const [i, c] of checks.entries()) {
          const cp = [...path, "checks", String(i)];
          if (!isTable(c)) {
            fail(cp, "a check must be a table");
            continue;
          }
          const check = readCheck(c, cp);
          if (!check) continue;
          if (seen.has(check.id)) fail([...cp, "id"], `the check id \`${check.id}\` is used twice in this profile`);
          seen.add(check.id);
          def.checks.push(check);
        }
      }
    }
    return def;
  }

  function readLevel(v: unknown, path: string[]): Level | null {
    if (typeof v === "string" && (LEVELS as readonly string[]).includes(v)) return v as Level;
    fail(path, `the level must be one of ${LEVELS.map((l) => `"${l}"`).join(", ")}, not ${describe(v)}`);
    return null;
  }

  function readRule(def: ProfileDef, id: string, v: unknown, path: string[]): void {
    const setting: RuleSetting = { level: null, options: {}, optionLines: {}, source: { file, line: at(path) } };
    const rule = findRule(id);
    if (!rule && !id.startsWith("custom.")) {
      const near = suggest(
        id,
        RULES.filter((r) => r.kind === "quality").map((r) => r.id),
      );
      fail(path, `unknown rule \`${id}\``, near ? `did you mean \`${near}\`?` : "`quiz rules` lists the rules");
      return;
    }
    if (rule?.kind === "fixed") {
      fail(
        path,
        `\`${id}\` is a fixed rule: no profile can change it`,
        "fixed rules say whether a quiz can work at all; fix the quiz instead",
      );
      return;
    }
    const body: Table = typeof v === "string" ? { level: v } : isTable(v) ? v : {};
    if (typeof v !== "string" && !isTable(v)) {
      fail(
        path,
        `the setting of \`${id}\` must be a level or a table, not ${describe(v)}`,
        `write "warning", or { level = "warning" }`,
      );
      return;
    }
    if (body.level !== undefined) {
      setting.level = readLevel(body.level, typeof v === "string" ? path : [...path, "level"]);
    }
    const options: Table = {};
    for (const [k, val] of Object.entries(body)) {
      if (k === "level") continue;
      options[k] = val;
      setting.optionLines[k] = at([...path, k]);
    }
    if (rule?.kind === "quality") {
      const parsed = rule.options.safeParse(options);
      if (!parsed.success) {
        const known = Object.keys(rule.options.shape);
        for (const issue of parsed.error.issues) {
          if (issue.code === "unrecognized_keys") {
            for (const k of issue.keys) {
              const near = suggest(k, known);
              fail(
                [...path, k],
                `\`${id}\` has no option \`${k}\``,
                near
                  ? `did you mean \`${near}\`?`
                  : known.length > 0
                    ? `its options are: ${known.join(", ")}`
                    : "it takes no options, only a level",
              );
            }
          } else {
            const k = String(issue.path[0] ?? "");
            fail([...path, k], `option \`${k}\` of \`${id}\`: ${issue.message}`);
          }
        }
        return;
      }
      setting.options = Object.fromEntries(Object.keys(options).map((k) => [k, (parsed.data as Table)[k]]));
    } else if (Object.keys(options).length > 0) {
      fail(
        [...path, Object.keys(options)[0] ?? ""],
        `the custom check \`${id}\` takes only a level here`,
        "change its fields where it is defined",
      );
      return;
    }
    def.rules.set(id, setting);
  }

  function readCheck(t: Table, path: string[]): CustomCheck | null {
    const before = errors.length;
    const kind = t.kind;
    if (kind !== "count" && kind !== "require" && kind !== "forbid") {
      fail(
        [...path, kind === undefined ? "id" : "kind"],
        '`kind` must be "count", "require" or "forbid"',
        "the checks are count, require and forbid",
      );
      return null;
    }
    const allowed =
      kind === "count"
        ? ["id", "kind", "where", "measure", "min", "max", "level", "message"]
        : kind === "require"
          ? ["id", "kind", "where", "field", "level", "message"]
          : ["id", "kind", "where", "level", "message"];
    unknownKeys(t, allowed, path, `a \`${kind}\` check`);
    const id = t.id;
    if (typeof id !== "string" || !CUSTOM_ID.test(id)) {
      fail(
        [...path, "id"],
        `a custom check's id must start with \`custom.\` (for example custom.two-essays), not ${describe(id)}`,
      );
    }
    const level = t.level === undefined ? "error" : readLevel(t.level, [...path, "level"]);
    let message: string | null = null;
    if (t.message !== undefined) {
      if (typeof t.message === "string") message = t.message;
      else fail([...path, "message"], "`message` must be text");
    }
    const where = readWhere(t.where, [...path, "where"]);
    const base = { id: String(id), where, level: level ?? "error", message, source: { file, line: at(path) } };

    let check: CustomCheck | null = null;
    if (kind === "count") {
      const measure = t.measure ?? "questions";
      if (measure !== "questions" && measure !== "points")
        fail([...path, "measure"], '`measure` must be "questions" or "points"');
      const num = (key: "min" | "max"): number | null => {
        const v = t[key];
        if (v === undefined) return null;
        if (typeof v === "number" && v >= 0) return v;
        fail([...path, key], `\`${key}\` must be a number, 0 or more`);
        return null;
      };
      const min = num("min");
      const max = num("max");
      if (t.min === undefined && t.max === undefined)
        fail([...path, "kind"], "a `count` check needs `min`, `max` or both");
      else if (min !== null && max !== null && min > max)
        fail([...path, "min"], `\`min\` (${min}) is above \`max\` (${max})`);
      check = { ...base, kind: "count", measure: measure === "points" ? "points" : "questions", min, max };
    } else if (kind === "require") {
      const field = t.field;
      if (typeof field !== "string" || !(REQUIRE_FIELDS as readonly string[]).includes(field)) {
        fail(
          [...path, field === undefined ? "kind" : "field"],
          `\`field\` must be one of ${REQUIRE_FIELDS.join(", ")}`,
        );
      } else check = { ...base, kind: "require", field: field as RequireField };
    } else check = { ...base, kind: "forbid" };
    return errors.length > before ? null : check;
  }

  function readWhere(v: unknown, path: string[]): Where {
    const where: Where = {};
    if (v === undefined) return where;
    if (!isTable(v)) {
      fail(path, `\`where\` must be a table, not ${describe(v)}`, 'write where = { type = "essay" }');
      return where;
    }
    unknownKeys(v, ["type", "tag", "section", "graded"], path, "`where`");
    if (v.type !== undefined) {
      if (typeof v.type === "string" && (QUESTION_TYPES as readonly string[]).includes(v.type))
        where.type = v.type as QuestionType;
      else fail([...path, "type"], `\`type\` must be one of ${QUESTION_TYPES.join(", ")}`);
    }
    if (v.tag !== undefined) {
      if (typeof v.tag === "string" && v.tag !== "") where.tag = v.tag;
      else fail([...path, "tag"], "`tag` must be text");
    }
    if (v.section !== undefined) {
      if (typeof v.section === "string" && v.section !== "") where.section = v.section;
      else fail([...path, "section"], "`section` must be a section id or title, in quotes");
    }
    if (v.graded !== undefined) {
      if (typeof v.graded === "boolean") where.graded = v.graded;
      else fail([...path, "graded"], "`graded` must be true or false");
    }
    return where;
  }
}

const BRIEF_KEYS = ["count", "minutes", "mix", "difficulty", "mode"] as const;

/**
 * `[brief.purpose.<purpose>]` in the machine `config.toml` (COMMANDS.md, `quiz brief`, "Defaults per purpose"): the
 * defaults of `count`, `minutes`, `mix`, `difficulty` and `mode` for a purpose. The values are the ones the flags take,
 * checked against the brief's schema; an unknown purpose, key or value is an error with its line.
 */
function readBriefDefaults(
  brief: unknown,
  data: ConfigFileData,
  fail: (path: readonly string[], message: string, fix?: string) => void,
): void {
  if (!isTable(brief)) {
    fail(["brief"], `\`brief\` must be a table, not ${describe(brief)}`, "write [brief.purpose.exam-prep]");
    return;
  }
  for (const key of Object.keys(brief)) {
    if (key !== "purpose")
      fail(
        ["brief", key],
        `unknown key \`${key}\` in [brief]`,
        "the key is `purpose`: write [brief.purpose.exam-prep]",
      );
  }
  const purposes = brief.purpose;
  if (purposes === undefined) return;
  if (!isTable(purposes)) {
    fail(["brief", "purpose"], `\`purpose\` must be a table, not ${describe(purposes)}`);
    return;
  }
  for (const [name, table] of Object.entries(purposes)) {
    const path = ["brief", "purpose", name];
    if (!(PURPOSES as readonly string[]).includes(name)) {
      const near = suggest(name, PURPOSES);
      fail(
        path,
        `unknown purpose \`${name}\``,
        near ? `did you mean \`${near}\`?` : `the purposes are: ${PURPOSES.join(", ")}`,
      );
      continue;
    }
    if (!isTable(table)) {
      fail(path, `\`${name}\` must be a table, not ${describe(table)}`, `write [brief.purpose.${name}]`);
      continue;
    }
    const values: Record<string, string | number | string[]> = {};
    for (const [key, value] of Object.entries(table)) {
      const at = [...path, key];
      if (!(BRIEF_KEYS as readonly string[]).includes(key)) {
        const near = suggest(key, BRIEF_KEYS);
        fail(
          at,
          `unknown key \`${key}\` in [brief.purpose.${name}]`,
          near ? `did you mean \`${near}\`?` : `the keys are: ${BRIEF_KEYS.join(", ")}`,
        );
        continue;
      }
      const checked = briefValue(key as (typeof BRIEF_KEYS)[number], value);
      if ("error" in checked) fail(at, checked.error);
      else values[key] = checked.value;
    }
    data.briefDefaults[name as (typeof PURPOSES)[number]] = values;
  }
}

/** A value of a purpose's table, or what is wrong with it. Checked as the flags are. */
function briefValue(
  key: (typeof BRIEF_KEYS)[number],
  value: unknown,
): { value: string | number | string[] } | { error: string } {
  const bad = (error: string): { error: string } => ({ error });
  const good = (v: string | number | string[]): { value: string | number | string[] } => ({ value: v });
  const options = (list: readonly string[]): string => list.map((x) => `"${x}"`).join(", ");
  if (key === "count") {
    return typeof value === "number" && Number.isInteger(value) && value >= 1
      ? good(value)
      : bad(`\`count\` must be a whole number, 1 or more, not ${describe(value)}`);
  }
  if (key === "minutes") {
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? good(value)
      : bad(`\`minutes\` must be a number, 0 or more (0 for no limit), not ${describe(value)}`);
  }
  if (key === "mix") {
    if (!Array.isArray(value)) return bad(`\`mix\` must be a list of: ${options(MIX_KINDS)}, not ${describe(value)}`);
    const wrong = value.find((v) => typeof v !== "string" || !(MIX_KINDS as readonly string[]).includes(v));
    return wrong === undefined
      ? good(value as string[])
      : bad(`\`mix\` has ${describe(wrong)}, which is not one of: ${options(MIX_KINDS)}`);
  }
  const allowed = BriefSchema.shape[key].options as readonly string[];
  return typeof value === "string" && allowed.includes(value)
    ? good(value)
    : bad(`\`${key}\` must be one of: ${options(allowed)}, not ${describe(value)}`);
}
