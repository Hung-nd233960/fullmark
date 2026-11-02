import { parse as parseToml } from "smol-toml";
import { FONT_CHOICES, type FontsChoice } from "../fonts";
import { suggest } from "../parse/report";
import { TomlIndex } from "./toml-index";
import type { ConfigError } from "./types";

/**
 * Reads a build file (COMMANDS.md, `quiz build`, "Build file"): TOML with defaults at the top level and one `[[build]]`
 * entry per set of pages. Every error carries the file and the line of the key at fault, found with `TomlIndex`, as a
 * malformed config does. This reads the text only; paths are resolved relative to the build file by the caller.
 */

/** A pinned build time: `2026-10-24T09:00:00+07:00` and its shorter forms. The `--built-at` flag is held to the same. */
export const ISO_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)?$/;

/** The keys that are `build` flag names and can be set in a build file, each with the entry it applies to. */
export const BUILD_FILE_KEYS = ["out", "profile", "config", "strict", "fonts", "ui-lang", "built-at"] as const;
/** The printed paper arrives in a later release; its keys are known and refused until then. */
const LATER_KEYS = ["print", "answers", "seed", "materials"] as const;
/** Flags about one run, not about what to build. */
const RUN_KEYS = ["attempt", "grades", "watch", "serve", "open", "port"] as const;

export type BuildEntry = {
  /** the line of the entry's `[[build]]` */
  line: number;
  /** paths and globs, relative to the build file */
  files: string[];
  /** a folder, relative to the build file */
  out: string | null;
  outLine: number;
  profile: string | null;
  /** a config file, relative to the build file */
  config: string | null;
  strict: boolean | null;
  fonts: FontsChoice | null;
  uiLang: "en" | "vi" | null;
  builtAt: string | null;
};

export type BuildFileParse = { entries: BuildEntry[]; errors: ConfigError[] };

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

type Setting = { value: string | boolean; line: number };

export function parseBuildFile(text: string, file: string): BuildFileParse {
  const errors: ConfigError[] = [];
  let doc: Table;
  try {
    doc = parseToml(text) as Table;
  } catch (e) {
    const err = e as { line?: number; message?: string };
    errors.push({
      file,
      line: err.line ?? 1,
      message: `not valid TOML: ${(err.message ?? "").split("\n")[0]?.replace(/^Invalid TOML document: /, "") ?? ""}`,
      fix: "fix the syntax at that line: keys are `name = value`, tables are `[name]`, text is in quotes",
    });
    return { entries: [], errors };
  }
  const index = new TomlIndex(text);
  const fail = (path: readonly string[], message: string, fix?: string) =>
    errors.push({ file, line: index.lineOf(path), message, ...(fix ? { fix } : {}) });

  /** Checks the keys of a table and reads the settings; the same messages as the flags give. */
  const settings = (t: Table, path: string[]): Map<string, Setting> => {
    const found = new Map<string, Setting>();
    const known = [...BUILD_FILE_KEYS, ...LATER_KEYS, ...(path.length === 0 ? [] : ["files"])];
    for (const [key, value] of Object.entries(t)) {
      const at = [...path, key];
      if (path.length === 0 && key === "build") continue;
      if ((RUN_KEYS as readonly string[]).includes(key)) {
        fail(at, `\`${key}\` is about one run, not about what to build`, "give it on the command line instead");
        continue;
      }
      if ((LATER_KEYS as readonly string[]).includes(key)) {
        fail(at, `\`${key}\` is not available yet: it arrives in a later release`);
        continue;
      }
      if (key === "files") {
        if (path.length === 0)
          fail(at, "`files` belongs in a [[build]] entry, not at the top level", "write [[build]]");
        continue;
      }
      if (!(BUILD_FILE_KEYS as readonly string[]).includes(key)) {
        const near = suggest(key, known);
        fail(
          at,
          `unknown key \`${key}\``,
          near ? `did you mean \`${near}\`?` : `the keys are: ${[...BUILD_FILE_KEYS, "files"].join(", ")}`,
        );
        continue;
      }
      const line = index.lineOf(at);
      const text = (what: string): string | null => {
        if (typeof value === "string" && value !== "") return value;
        fail(at, `\`${key}\` must be ${what}, in quotes, not ${describe(value)}`);
        return null;
      };
      let ok: string | boolean | null = null;
      if (key === "strict") {
        if (typeof value === "boolean") ok = value;
        else fail(at, `\`strict\` must be true or false, not ${describe(value)}`);
      } else if (key === "fonts") {
        const v = text("one of quiz, all, none");
        if (v !== null && !(FONT_CHOICES as readonly string[]).includes(v))
          fail(at, `fonts ${v} is not one of quiz, all, none`);
        else ok = v;
      } else if (key === "ui-lang") {
        const v = text("en or vi");
        if (v !== null && v !== "en" && v !== "vi") fail(at, `ui-lang ${v} is not one of en, vi`);
        else ok = v;
      } else if (key === "built-at") {
        if (value instanceof Date) {
          fail(at, "`built-at` must be in quotes", 'built-at = "2026-10-24T09:00:00+07:00"');
          continue;
        }
        const v = text("a date and time, such as 2026-10-24T09:00:00+07:00");
        if (v !== null && !ISO_TIME.test(v))
          fail(at, `built-at ${v} is not an ISO date and time, such as 2026-10-24T09:00:00+07:00`);
        else ok = v;
      } else if (key === "out") ok = text("a folder");
      else if (key === "profile") ok = text("the name of a profile");
      else if (key === "config") ok = text("a path");
      if (ok !== null) found.set(key, { value: ok, line });
    }
    return found;
  };

  const defaults = settings(doc, []);
  const entries: BuildEntry[] = [];
  const build = doc.build;
  if (build === undefined) {
    fail([], "the build file has no [[build]] entry", "add one: [[build]] and files = [...]");
  } else if (!Array.isArray(build) || !build.every(isTable)) {
    fail(["build"], `\`build\` must be a list of tables, not ${describe(build)}`, "write [[build]] for each entry");
  } else if (build.length === 0) {
    fail([], "the build file has no [[build]] entry", "add one: [[build]] and files = [...]");
  } else {
    build.forEach((t, i) => {
      const path = ["build", String(i)];
      const own = settings(t, path);
      const line = index.lineOf(path);
      const get = (k: string) => own.get(k) ?? defaults.get(k);
      let files: string[] = [];
      if (t.files === undefined) fail(path, "this [[build]] entry has no `files`", 'add files = ["quiz.md"]');
      else if (!Array.isArray(t.files) || !t.files.every((f) => typeof f === "string" && f !== "")) {
        fail([...path, "files"], `\`files\` must be a list of paths or globs in quotes, not ${describe(t.files)}`);
      } else if (t.files.length === 0) {
        fail([...path, "files"], "`files` is empty: list the quiz files to build");
      } else files = t.files as string[];
      const str = (k: string) => {
        const v = get(k)?.value;
        return typeof v === "string" ? v : null;
      };
      const strict = get("strict")?.value;
      entries.push({
        line,
        files,
        out: str("out"),
        outLine: get("out")?.line ?? line,
        profile: str("profile"),
        config: str("config"),
        strict: typeof strict === "boolean" ? strict : null,
        fonts: str("fonts") as FontsChoice | null,
        uiLang: str("ui-lang") as "en" | "vi" | null,
        builtAt: str("built-at"),
      });
    });
  }
  return { entries: errors.length === 0 ? entries : [], errors };
}
