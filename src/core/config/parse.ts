import { parse as parseToml } from "smol-toml";
import { QUESTION_TYPES, type QuestionType } from "../ir";
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
    profiles: new Map(),
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
