import { existsSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  defaultOf,
  type Lang,
  type Question,
  type QuestionFile,
  type QuestionValue,
  questionOf,
} from "../core/brief/questions";
import {
  type Answer,
  type BriefAnswers,
  briefOf,
  type ContentKind,
  type Decider,
  emitBrief,
  type MixKind,
  type Purpose,
} from "../core/brief/write";
import { resolveProfile, unknownProfileMessage } from "../core/config/resolve";
import { WriteError, writeFileAtomic } from "./atomic";
import { loadQuestions } from "./brief-questions";
import { loadConfig, type Machine } from "./config";
import { EXIT, type ExitCode } from "./exit-codes";
import { fail } from "./fail";
import type { Io } from "./ids";
import { readFailure, shownPath } from "./paths";
import { machineOf } from "./templates";

/** The options of `quiz brief` as the command line gave them: text, or null when not given. */
export type BriefOptions = {
  purpose: string | null;
  scope: string | null;
  kinds: string | null;
  kindsOther: string | null;
  elsewhere: string | null;
  count: string | null;
  minutes: string | null;
  mix: string | null;
  difficulty: string | null;
  mode: string | null;
  weakTopics: string | null;
  commitment: string | null;
  language: string | null;
  request: string | null;
  profile: string | null;
  config: string | null;
  acceptDefaults: boolean;
  web: boolean;
  tui: boolean;
  json: boolean;
};

/** A warning in `--json`'s `warnings` (and, in words, on stderr). */
export type BriefWarning = {
  rule: "brief.vague" | "brief.no-history";
  message: string;
  key?: string;
  words?: number;
  example?: string;
};

class Usage extends Error {}

const list = (values: readonly string[]): string => values.join(", ");
const wordsOf = (text: string): number => text.split(/\s+/).filter((w) => w !== "").length;

/** The values a choice or multi question accepts, from the question file. */
const valuesOf = (q: Question): string[] => (q.choices ?? []).map((c) => c.value);

function oneOf(q: Question, flag: string, given: string): string {
  const allowed = valuesOf(q);
  const value = given.trim();
  if (!allowed.includes(value)) throw new Usage(`--${flag} must be one of: ${list(allowed)}, not "${given}"`);
  return value;
}

function manyOf(q: Question, flag: string, given: string): string[] {
  const allowed = valuesOf(q);
  const picked = given
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x !== "");
  const bad = picked.find((x) => !allowed.includes(x));
  if (bad !== undefined)
    throw new Usage(`--${flag} takes a comma list of: ${list(allowed)}; "${bad}" is not one of them`);
  return picked;
}

function numberOf(q: Question, flag: string, given: string, whole: boolean): number {
  const min = q.min ?? 0;
  const range = q.max === undefined ? `${min} or more` : `from ${min} to ${q.max}`;
  const text = given.trim();
  const n = Number(text);
  if (
    !(whole ? /^\d+$/ : /^\d+(\.\d+)?$/).test(text) ||
    !Number.isFinite(n) ||
    n < min ||
    (q.max !== undefined && n > q.max)
  )
    throw new Usage(`--${flag} must be ${whole ? "a whole number" : "a number"}, ${range}, not "${given}"`);
  return n;
}

const asDecider = (given: boolean, accepted = false): Decider => (given ? "user" : accepted ? "agent" : "default");

/** The text, the example and the minimum of a detail rule, as they are shown in `lang`. */
const exampleIn = (q: Question, lang: Lang): string => q.example?.[lang] ?? "";

/**
 * `quiz brief DIR` through flags (COMMANDS.md): every option checked against the question file, the defaults filled
 * and recorded, then `DIR/brief.yaml` and an empty `DIR/content/` written. A human-only value without a flag makes
 * the run exit 3 and write nothing. `--web` and `--tui` come in later slices.
 */
export async function runBrief(
  dir: string,
  opts: BriefOptions,
  io: Io & { questions?: QuestionFile; machine?: Machine },
): Promise<ExitCode> {
  const json = opts.json;
  const say = (line: string): void => (json ? io.err(line) : io.out(line));
  if (opts.web || opts.tui) {
    fail(
      io,
      json,
      `${opts.web ? "--web" : "--tui"} is not available yet: give the answers as flags (quiz brief --help)`,
    );
    return EXIT.usage;
  }

  let questions: QuestionFile;
  try {
    questions = io.questions ?? loadQuestions();
  } catch (error) {
    fail(io, json, (error as Error).message);
    return EXIT.usage;
  }
  const q = (key: string): Question => questionOf(questions, key);

  // -- the machine config: the defaults of each purpose, and the profiles `--profile` may name
  const folder = resolve(io.cwd, dir);
  const config = loadConfig(machineOf(io), folder, opts.config);
  if (config.errors.length > 0) {
    fail(io, json, "the config has errors", { errors: config.errors });
    for (const e of config.errors) {
      io.err(`${e.file}:${e.line}: ${e.message}`);
      if (e.fix) io.err(`    fix: ${e.fix}`);
    }
    return EXIT.usage;
  }

  // -- every flag checked before anything else happens
  let given: {
    purpose?: Purpose;
    scope?: string;
    kinds?: ContentKind[];
    kindsOther?: string;
    elsewhere?: string;
    count?: number;
    minutes?: number;
    mix?: MixKind[];
    difficulty?: string;
    mode?: string;
    weakTopics?: boolean;
    commitment?: number;
    language?: Lang;
    request?: string;
    profile?: string;
  };
  try {
    given = {};
    if (opts.purpose !== null) given.purpose = oneOf(q("purpose"), "purpose", opts.purpose) as Purpose;
    if (opts.scope !== null && opts.scope.trim() !== "") given.scope = opts.scope.trim();
    if (opts.kinds !== null) given.kinds = manyOf(q("content.kinds"), "kinds", opts.kinds) as ContentKind[];
    if (opts.kindsOther !== null) {
      if (!given.kinds?.includes("other")) throw new Usage("--kinds-other needs `other` in --kinds");
      given.kindsOther = opts.kindsOther;
    }
    if (opts.elsewhere !== null) given.elsewhere = opts.elsewhere;
    if (opts.count !== null) given.count = numberOf(q("count"), "count", opts.count, true);
    if (opts.minutes !== null) given.minutes = numberOf(q("minutes"), "minutes", opts.minutes, false);
    if (opts.mix !== null) given.mix = manyOf(q("mix"), "mix", opts.mix) as MixKind[];
    if (opts.difficulty !== null) given.difficulty = oneOf(q("difficulty"), "difficulty", opts.difficulty);
    if (opts.mode !== null) given.mode = oneOf(q("mode"), "mode", opts.mode);
    if (opts.weakTopics !== null) given.weakTopics = oneOf(q("weak_topics"), "weak-topics", opts.weakTopics) === "yes";
    if (opts.commitment !== null) given.commitment = numberOf(q("commitment"), "commitment", opts.commitment, true);
    if (opts.language !== null) given.language = oneOf(q("language"), "language", opts.language) as Lang;
    if (opts.request !== null) given.request = opts.request;
    if (opts.profile !== null) {
      const name = opts.profile.trim();
      if (resolveProfile(name, config.layers).profile === null)
        throw new Usage(unknownProfileMessage(name, config.layers));
      given.profile = name;
    }
  } catch (error) {
    if (!(error instanceof Usage)) throw error;
    fail(io, json, error.message);
    return EXIT.usage;
  }

  // -- an existing brief is never overwritten, and that is found before anything is asked (G18)
  const target = join(folder, "brief.yaml");
  if (existsSync(target)) {
    const shown = shownPath(target, io.cwd);
    fail(io, json, `${shown} already exists: edit it, or delete it to start again`);
    return EXIT.usage;
  }

  // -- human-only values: purpose has a default `--accept-defaults` may take, scope has none
  const purposeQuestion = q("purpose");
  const missing: string[] = [];
  if (given.purpose === undefined && !opts.acceptDefaults) missing.push("purpose");
  if (given.scope === undefined) missing.push("scope");
  if (missing.length > 0) {
    const flags = missing.map((k) =>
      k === "purpose" ? `--purpose (${list(valuesOf(purposeQuestion))})` : "--scope TEXT",
    );
    const how = `give ${flags.join(" and ")}${missing.includes("purpose") ? ", or --accept-defaults to take the default purpose" : ""}; or ask the user in a form with --web`;
    if (json) io.out(JSON.stringify({ status: "needs_input", missing, how }));
    io.err(`needs input: ${missing.join(", ")}`);
    io.err(`    how: ${how}`);
    return EXIT.needsInput;
  }

  // -- every other value: the flag, else the default of the purpose (the machine config's table may change it)
  const purpose: Purpose = given.purpose ?? (purposeQuestion.default as Purpose);
  const overrides: Record<string, QuestionValue> = config.layers.user?.briefDefaults[purpose] ?? {};
  const fill = <T>(key: string, value: T | undefined, by: Decider = "default"): Answer<T> =>
    value !== undefined ? { value, by: "user" } : { value: defaultOf(q(key), purpose, overrides) as T, by };
  const lang: Lang = given.language ?? "en";

  const answers: BriefAnswers = {
    purpose:
      given.purpose !== undefined ? { value: purpose, by: "user" } : { value: purpose, by: asDecider(false, true) },
    scope: { value: given.scope as string, by: "user" },
    kinds: fill("content.kinds", given.kinds),
    kindsOther: { value: given.kindsOther ?? "", by: asDecider(given.kindsOther !== undefined) },
    elsewhere: fill("content.elsewhere", given.elsewhere),
    count: fill("count", given.count),
    minutes: fill("minutes", given.minutes),
    mix: fill("mix", given.mix),
    difficulty: fill("difficulty", given.difficulty) as BriefAnswers["difficulty"],
    mode: fill("mode", given.mode) as BriefAnswers["mode"],
    language: fill("language", given.language) as BriefAnswers["language"],
    request: fill("request", given.request),
    weakTopics:
      given.weakTopics !== undefined
        ? { value: given.weakTopics, by: "user" }
        : { value: defaultOf(q("weak_topics"), purpose, overrides) === "yes", by: "default" },
    commitment: fill("commitment", given.commitment),
    ...(given.profile !== undefined ? { profile: { value: given.profile, by: "user" as const } } : {}),
  };

  const brief = briefOf(answers);
  const text = emitBrief(brief);

  // -- warnings: a short answer is accepted (detail rules), weak topics have no history to read here (G17)
  const warnings: BriefWarning[] = [];
  // only the answers the user (or the agent) gave are held to a detail rule; a default is never vague
  for (const rule of questions.questions) {
    const min = rule["min-words"];
    const value = rule.key === "scope" ? given.scope : undefined;
    if (value === undefined || min === undefined) continue;
    const words = wordsOf(value);
    if (words >= min) continue;
    const example = exampleIn(rule, lang);
    warnings.push({
      rule: "brief.vague",
      key: rule.key,
      words,
      example,
      message: `--${rule.flag} has ${words} word${words === 1 ? "" : "s"}; ${min} or more say what the quiz covers, for example "${example}"`,
    });
  }
  if (brief.weak_topics && given.weakTopics === true) {
    warnings.push({
      rule: "brief.no-history",
      message:
        "focus_tags is empty: quiz brief reads no history; pick the weak topics from the learner's reports, or use the library's brief (step 4), which fills them from stats",
    });
  }

  // -- write: brief.yaml first (atomic, creates DIR), then the empty content folder; an existing one is kept
  try {
    if (existsSync(folder) && !statSync(folder).isDirectory()) throw new WriteError(folder, { code: "ENOTDIR" });
    await writeFileAtomic(target, Buffer.from(text, "utf8"));
    await mkdir(join(folder, "content"), { recursive: true });
  } catch (error) {
    const file = (error as { file?: string }).file ?? folder;
    fail(
      io,
      json,
      `cannot write ${shownPath(file, io.cwd)}: ${error instanceof WriteError ? error.message : readFailure(error)}`,
    );
    return EXIT.usage;
  }

  const shown = shownPath(target, io.cwd);
  const applied = Object.entries(brief.decided_by)
    .filter(([key, by]) => by !== "user" && key !== "focus_tags")
    .map(([key]) => key);
  for (const w of warnings) io.err(`warning ${w.rule}: ${w.message}`);
  if (json) {
    io.out(JSON.stringify({ status: "written", brief: shown, defaults_applied: applied, warnings }));
  }
  say(`wrote ${shown} and ${shownPath(join(folder, "content"), io.cwd)}/`);
  if (applied.length > 0) say(`defaults used: ${applied.join(", ")}`);
  return EXIT.done;
}
