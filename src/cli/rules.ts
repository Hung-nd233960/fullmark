import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { chooseProfile, type ResolvedProfile, resolveProfile, unknownProfileMessage } from "../core/config/resolve";
import type { Brief } from "../core/ir";
import { suggest } from "../core/parse/report";
import { readBrief } from "../core/rules/brief-read";
import { findRule, RULES } from "../core/rules/registry";
import { type CheckIo, describeProfile } from "./check";
import { loadConfig, realMachine } from "./config";
import { EXIT, type ExitCode } from "./exit-codes";
import { loadQuiz } from "./load";
import { readFailure, shownPath } from "./paths";

export type RulesOptions = {
  profile: string | null;
  for: string | null;
  config: string | null;
  json: boolean;
  plain: boolean;
};

type Row = {
  id: string;
  kind: "fixed" | "quality" | "custom";
  level: string;
  options: Record<string, unknown>;
  origin: string;
  description: string;
  optionOrigins: Record<string, string>;
};

const showOptions = (o: Record<string, unknown>): string =>
  Object.entries(o)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(", ");

function rowsOf(profile: ResolvedProfile): Row[] {
  const order = new Map(RULES.map((r, i) => [r.id, i]));
  return [...profile.rules.values()]
    .sort((a, b) => (order.get(a.id) ?? 1e6) - (order.get(b.id) ?? 1e6) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      level: r.level,
      options: r.options,
      origin: r.origin,
      description: r.description,
      optionOrigins: r.optionOrigins,
    }));
}

/** `quiz rules [RULE]` (COMMANDS.md). */
export function runRules(rule: string | null, opts: RulesOptions, io: CheckIo): ExitCode {
  const machine = io.machine ?? { ...realMachine(), cwd: io.cwd };
  const fail = (message: string, details: string[] = []): ExitCode => {
    if (opts.json) io.out(JSON.stringify({ status: "error", message }));
    io.err(message);
    for (const d of details) io.err(d);
    return EXIT.usage;
  };

  // -- the quiz, when `--for` names one: the config is found from its folder, the profile chosen as `check` does
  let quizDir = io.cwd;
  let fm = null as ReturnType<typeof loadQuiz>["frontMatter"] | null;
  let brief: Brief | null = null;
  if (opts.for !== null) {
    const path = resolve(io.cwd, opts.for);
    if (!existsSync(path)) return fail(`no such file: ${opts.for}`);
    try {
      fm = loadQuiz(path).frontMatter;
    } catch (error) {
      return fail(`cannot read ${opts.for}: ${readFailure(error)}`);
    }
    quizDir = dirname(path);
    const briefPath = join(quizDir, "brief.yaml");
    if (existsSync(briefPath)) brief = readBrief(readFileSync(briefPath, "utf8"), shownPath(briefPath, io.cwd)).brief;
  }

  const config = loadConfig(machine, quizDir, opts.config);
  if (config.errors.length > 0) {
    if (opts.json) io.out(JSON.stringify({ status: "error", message: "the config has errors", errors: config.errors }));
    io.err("the config has errors");
    for (const e of config.errors) {
      io.err(`${e.file}:${e.line}: ${e.message}`);
      if (e.fix) io.err(`    fix: ${e.fix}`);
    }
    return EXIT.usage;
  }

  const choice =
    opts.for !== null || opts.profile !== null
      ? chooseProfile({ cli: opts.profile, frontMatter: fm, brief, layers: config.layers })
      : { name: "default", from: "the default" as const, line: null };
  const resolved = resolveProfile(choice.name, config.layers);
  if (!resolved.profile) {
    if (resolved.errors.length > 0)
      return fail(
        "the config has errors",
        resolved.errors.map((e) => `${e.file}:${e.line}: ${e.message}`),
      );
    return fail(unknownProfileMessage(choice.name, config.layers), []);
  }
  const profile = resolved.profile;
  const rows = rowsOf(profile);
  const chain = profile.chain.map((c) => c.name);

  if (rule !== null) {
    const row = rows.find((r) => r.id === rule);
    if (!row) {
      const near = suggest(
        rule,
        rows.map((r) => r.id),
      );
      return fail(`unknown rule \`${rule}\``, [near ? `did you mean \`${near}\`?` : "`quiz rules` lists the rules"]);
    }
    const info = findRule(rule);
    const detail = info
      ? { why: info.why, example: info.example, fix: info.fix, summary: info.summary }
      : { why: null, example: null, fix: null, summary: row.description };
    if (opts.json) {
      io.out(JSON.stringify({ profile: profile.name, chain, config: config.files, rules: [{ ...row, ...detail }] }));
      return EXIT.done;
    }
    io.out(`${row.id}  (${row.kind} rule)`);
    io.out(`level: ${row.level}  (${row.origin}, under profile ${profile.name})`);
    const keys = Object.keys(row.options);
    if (keys.length > 0) {
      io.out("options:");
      for (const k of keys) io.out(`  ${k} = ${String(row.options[k])}  (${row.optionOrigins[k] ?? "built-in"})`);
    }
    io.out("");
    io.out(`What it catches: ${detail.summary}`);
    if (detail.why) io.out(`Why it matters: ${detail.why}`);
    if (detail.example) {
      io.out("");
      io.out("An example that triggers it:");
      for (const l of detail.example.trimEnd().split("\n")) io.out(`    ${l}`);
    }
    if (detail.fix) {
      io.out("");
      io.out(`How to fix it: ${detail.fix}`);
    }
    return EXIT.done;
  }

  if (opts.json) {
    io.out(
      JSON.stringify({
        profile: profile.name,
        chain,
        config: config.files,
        rules: rows.map(({ id, kind, level, options, origin, description }) => ({
          id,
          kind,
          level,
          options,
          origin,
          description,
        })),
      }),
    );
    return EXIT.done;
  }
  io.out(describeProfile(profile, opts.for !== null || opts.profile !== null ? choice : null, config.files));
  io.out(`profile chain: ${chain.join(" extends ")}`);
  const w = Math.max(...rows.map((r) => r.id.length));
  const forQuiz = opts.for !== null;
  for (const r of rows) {
    const origin = forQuiz ? `  [${r.origin}]` : "";
    io.out(`${r.id.padEnd(w)}  ${r.kind.padEnd(7)}  ${r.level.padEnd(7)}  ${r.description}${origin}`);
    if (Object.keys(r.options).length > 0) io.out(`${" ".repeat(w + 2)}options: ${showOptions(r.options)}`);
  }
  return EXIT.done;
}
