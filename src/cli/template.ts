import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parse } from "../core/parse";
import { SKELETON_RULES, skeleton } from "../core/skeleton";
import { slug } from "../core/slug";
import { writeFileAtomic } from "./atomic";
import { type CheckIo, type CheckOptions, checkFile, humanIssue, issueJson } from "./check";
import { EXIT, type ExitCode } from "./exit-codes";
import { fail } from "./fail";
import { copyOf, type Output, type QuizSource, readSource } from "./new";
import { readFailure, shownPath } from "./paths";
import { BUILT_IN, listTemplates, machineOf, readTemplate, stem, userTemplatesFolder } from "./templates";

const NAME = /^[a-z0-9][a-z0-9-]*$/;

/** `template list` (COMMANDS.md): every template with its source; `--json` is the array. */
export function runTemplateList(json: boolean, io: CheckIo): ExitCode {
  const m = machineOf(io);
  let all: ReturnType<typeof listTemplates>;
  try {
    all = listTemplates(m);
  } catch (error) {
    fail(io, json, `cannot read the templates folder: ${readFailure(error)}`);
    return EXIT.usage;
  }
  if (json) {
    io.out(
      JSON.stringify(
        all.map((t) => ({
          name: t.name,
          source: t.source,
          path: t.path === null ? null : shownPath(t.path, io.cwd),
          ignored: t.ignored,
          invalid: t.invalid,
        })),
      ),
    );
    return EXIT.done;
  }
  const width = Math.max(...all.map((t) => t.name.length));
  for (const t of all) {
    const where = t.source === "built-in" ? "built-in" : `user  ${shownPath(t.path as string, io.cwd)}`;
    io.out(
      `${t.name.padEnd(width)}  ${where}${t.invalid !== null ? `  (invalid: ${t.invalid})` : t.ignored ? "  (ignored: a built-in template has this name; rename the folder)" : ""}`,
    );
  }
  return EXIT.done;
}

export type TemplateAddOptions = { as: string | null; skeleton: boolean; replace: boolean; json: boolean };

const same = (a: { path: string; bytes: Buffer }[], b: { path: string; bytes: Buffer }[]): boolean =>
  a.length === b.length &&
  a.every((f, i) => f.path === b[i]?.path && f.bytes.equals((b[i] as { bytes: Buffer }).bytes));

/** A free name beside `name`: `name-2`, `name-3`... */
function freeName(name: string, taken: ReadonlySet<string>): string {
  for (let n = 2; ; n++) if (!taken.has(`${name}-${n}`)) return `${name}-${n}`;
}

/**
 * `template add FILE` (COMMANDS.md). A full quiz must pass `check`; a skeleton fails it by design and gets a
 * structural check instead: it parses, the profile exists, and every error it has is an emptied field's.
 */
export function runTemplateAdd(file: string, opts: TemplateAddOptions, io: CheckIo): Promise<ExitCode> {
  return add(file, opts, io);
}

async function add(file: string, opts: TemplateAddOptions, io: CheckIo): Promise<ExitCode> {
  const m = machineOf(io);
  const refuse = (
    code: ExitCode,
    message: string,
    extra: Record<string, unknown> = {},
    details: string[] = [],
  ): ExitCode => {
    if (opts.json) io.out(JSON.stringify({ status: code === EXIT.problems ? "failed" : "error", message, ...extra }));
    io.err(message);
    for (const d of details) io.err(d);
    return code;
  };
  const path = resolve(io.cwd, file);
  let source: QuizSource;
  try {
    source = readSource(path);
  } catch (error) {
    return refuse(EXIT.usage, `${file}: cannot read the file: ${readFailure(error)}`, { file });
  }

  const name = opts.as ?? slug(stem(file));
  if (!NAME.test(name)) {
    return refuse(
      EXIT.usage,
      opts.as === null
        ? `cannot make a template name from "${file}": give one with --as NAME`
        : `"${name}" is not a name: use lower-case letters, digits and -`,
      { file },
    );
  }
  if ((BUILT_IN as readonly string[]).includes(name)) {
    return refuse(EXIT.problems, `"${name}" is a built-in template, and --replace does not change that`, { name }, [
      "give your template another name with --as NAME",
    ]);
  }

  // the checks
  const check: CheckOptions = { profile: null, config: null, strict: false, review: null, json: false, plain: true };
  const result = checkFile(file, check, io);
  if (result.status === "error") return refuse(EXIT.usage, `${file}: ${result.message}`, { file });
  if (opts.skeleton) {
    const problem = structuralProblem(
      source,
      result.issues.some((i) => i.rule === "profile.unknown"),
    );
    if (problem) return refuse(EXIT.problems, `${file}: ${problem}`, { file, name });
  } else if (result.status === "failed") {
    io.err(`${file}: the quiz fails check, so it would hand its errors to every quiz started from it:`);
    for (const i of result.issues.filter((x) => x.level === "error")) for (const l of humanIssue(i, false)) io.err(l);
    if (opts.json)
      io.out(
        JSON.stringify({
          status: "failed",
          name,
          errors: result.issues.filter((i) => i.level === "error").map(issueJson),
        }),
      );
    return EXIT.problems;
  }

  // what is stored: the quiz as given (ids and all), or the skeleton
  const out: Output = opts.skeleton
    ? copyOf(source, true)
    : { name: source.name, files: [{ path: source.name, bytes: Buffer.from(source.text, "utf8") }, ...source.files] };

  const folder = userTemplatesFolder(m);
  const target = join(folder, name);
  let replaced = false;
  if (existsSync(target)) {
    let current: ReturnType<typeof readTemplate> | null = null;
    try {
      const info = listTemplates(m).find((t) => t.name === name && t.source === "user");
      current = info ? readTemplate(info) : null;
    } catch {
      current = null;
    }
    const now = current ? [{ path: current.md.name, bytes: current.md.bytes }, ...current.files] : [];
    if (same(now, out.files)) {
      if (opts.json) io.out(JSON.stringify({ status: "unchanged", name, path: shownPath(target, io.cwd) }));
      else io.out(`template ${name} is already stored with this content: unchanged`);
      return EXIT.done;
    }
    if (!opts.replace) {
      const taken = new Set(listTemplates(m).map((t) => t.name));
      const free = freeName(name, taken);
      return refuse(EXIT.problems, `you already have a template called "${name}"`, { name }, [
        `use --replace to overwrite it, or --as ${free}`,
      ]);
    }
    replaced = true;
  }

  const temp = join(folder, `.${name}.${process.pid}.tmp`);
  try {
    rmSync(temp, { recursive: true, force: true });
    mkdirSync(temp, { recursive: true });
    for (const f of out.files) await writeFileAtomic(join(temp, f.path), f.bytes);
    if (replaced) rmSync(target, { recursive: true, force: true });
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    return refuse(
      EXIT.usage,
      `cannot write the template: ${(error as { code?: string }).code ? readFailure(error) : (error as Error).message}`,
      { name },
    );
  }
  if (opts.json)
    io.out(JSON.stringify({ status: replaced ? "replaced" : "added", name, path: shownPath(target, io.cwd) }));
  else
    io.out(
      `${replaced ? "replaced" : "added"} template ${name} in ${shownPath(target, io.cwd)}${opts.skeleton ? " (a skeleton)" : ""}`,
    );
  return EXIT.done;
}

/** Why a skeleton of this quiz is not a template, or null: the structural check of COMMANDS.md. */
function structuralProblem(source: QuizSource, unknownProfile: boolean): string | null {
  if (source.loaded.quiz === null) return "the quiz does not parse, so it has no structure to keep";
  if (unknownProfile) return "the quiz names a profile that does not exist";
  const found = parse(skeleton(source.text), source.name);
  const other = found.issues.find((i) => i.level === "error" && !SKELETON_RULES.has(i.rule));
  if (other) return `its skeleton has an error that is not an empty field: ${other.rule} on line ${other.line}`;
  if (source.loaded.quiz.sections.every((s) => s.questions.length === 0)) return "the quiz has no questions";
  return null;
}

export type TemplateRemoveOptions = { yes: boolean; json: boolean };

/** `template rm NAME` (COMMANDS.md): deletes a user template's folder, after asking unless `--yes`. */
export async function runTemplateRemove(
  name: string,
  opts: TemplateRemoveOptions,
  io: CheckIo & { ask?: (q: string) => Promise<boolean> },
): Promise<ExitCode> {
  const m = machineOf(io);
  const refuse = (code: ExitCode, message: string): ExitCode => {
    if (opts.json) io.out(JSON.stringify({ status: code === EXIT.problems ? "failed" : "error", name, message }));
    io.err(message);
    return code;
  };
  const all = listTemplates(m);
  const user = all.find((t) => t.name === name && t.source === "user");
  if ((BUILT_IN as readonly string[]).includes(name) && !user?.ignored) {
    return refuse(EXIT.problems, `"${name}" is a built-in template and cannot be removed`);
  }
  if (!user || user.path === null)
    return refuse(EXIT.usage, `you have no template called "${name}" (quiz template list)`);
  if (!opts.yes) {
    const ask = io.ask ?? (io.tty && !opts.json ? askOnTerminal : null);
    if (!ask)
      return refuse(
        EXIT.usage,
        `remove "${name}"? pass --yes to confirm: ${opts.json ? "--json never prompts" : "there is no terminal to ask on"}`,
      );
    if (!(await ask(`remove your template "${name}" (${shownPath(user.path, io.cwd)})? [y/N] `))) {
      io.err("not removed");
      return EXIT.usage;
    }
  }
  try {
    rmSync(user.path, { recursive: true });
  } catch (error) {
    return refuse(EXIT.usage, `cannot remove ${shownPath(user.path, io.cwd)}: ${readFailure(error)}`);
  }
  if (opts.json) io.out(JSON.stringify({ status: "removed", name }));
  else io.out(`removed template ${name}`);
  return EXIT.done;
}

async function askOnTerminal(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}
