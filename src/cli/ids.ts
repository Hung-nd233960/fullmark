import { randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applyIds, type IdProblem, planIds } from "../core/ids";
import { writeFileAtomic } from "./atomic";
import { EXIT, type ExitCode } from "./exit-codes";
import { expandInputs } from "./files";

export type IdsOptions = { dryRun: boolean; json: boolean; plain: boolean };

/** Where a command's output goes, and the few things that vary between runs, so tests can control them. */
export type Io = {
  out(text: string): void;
  err(text: string): void;
  /** raw text to stderr, without a newline: the progress line */
  errRaw(text: string): void;
  cwd: string;
  /** whether stderr is a terminal, which decides the progress line */
  tty: boolean;
  /** an id not in `used`; the default draws from `node:crypto` */
  newId?: (used: ReadonlySet<string>) => string;
};

type FileResult =
  | {
      status: "written" | "unchanged";
      file: string;
      added: { line: number; id: string }[];
      problems: [];
      dryRun?: true;
    }
  | { status: "problems"; file: string; added: []; problems: IdProblem[] }
  | { status: "error"; file: string; message: string };

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** `q-` and six characters from a-z0-9, not in `used` (QUIZ_SYNTAX.md, "Ids"; COMMANDS.md, `quiz ids`). */
export function randomId(used: ReadonlySet<string>): string {
  for (;;) {
    let id = "q-";
    for (let i = 0; i < 6; i++) id += ALPHABET[randomInt(ALPHABET.length)];
    if (!used.has(id)) return id;
  }
}

/**
 * TEST-ONLY. Ids from a seeded generator (mulberry32 over the seed's characters), so the golden files of `quiz ids`
 * are stable. It is switched on by the environment variable `FULLMARK_TEST_SEED`, which only `main.ts` reads; the
 * ids it makes are predictable, so it is never to be used for a real quiz.
 */
export function seededIds(seed: string): (used: ReadonlySet<string>) => string {
  let state = 0x811c9dc5;
  for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0), 0x01000193) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return (used) => {
    for (;;) {
      let id = "q-";
      for (let i = 0; i < 6; i++) id += ALPHABET[Math.floor(next() * ALPHABET.length)];
      if (!used.has(id)) return id;
    }
  };
}

async function idsForFile(file: string, opts: IdsOptions, io: Io): Promise<FileResult> {
  const path = resolve(io.cwd, file);
  let buffer: Buffer;
  try {
    buffer = await readFile(path);
  } catch (error) {
    return { status: "error", file, message: `cannot read the file: ${(error as Error).message}` };
  }
  const text = buffer.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(buffer)) {
    return { status: "error", file, message: "the file is not valid UTF-8, so it is left untouched" };
  }
  const plan = planIds(text);
  if (plan.problems.length > 0) return { status: "problems", file, added: [], problems: plan.problems };
  if (plan.missing.length === 0) return { status: "unchanged", file, added: [], problems: [] };

  const used = new Set(plan.used);
  const next = io.newId ?? randomId;
  const ids = plan.missing.map(() => {
    const id = next(used);
    used.add(id);
    return id;
  });
  const added = plan.missing.map((m, i) => ({ line: m.line, id: ids[i] ?? "" }));
  if (opts.dryRun) return { status: "unchanged", file, added, problems: [], dryRun: true };
  try {
    await writeFileAtomic(path, Buffer.from(applyIds(text, plan.missing, ids), "utf8"));
  } catch (error) {
    return { status: "error", file, message: (error as Error).message };
  }
  return { status: "written", file, added, problems: [] };
}

function describe(r: FileResult, opts: IdsOptions): string[] {
  switch (r.status) {
    case "error":
      return [`${r.file}: ${r.message}`];
    case "problems":
      return [`${r.file}: left untouched`, ...r.problems.map((p) => `  ${r.file}:${p.line}: ${p.rule}: ${p.message}`)];
    default: {
      if (r.added.length === 0) return [`${r.file}: no ids to add`];
      const verb = opts.dryRun ? "would add" : "added";
      const lines = r.added.map((a) => `line ${a.line}: ${a.id}`);
      return [
        `${r.file}: ${verb} ${r.added.length} id${r.added.length === 1 ? "" : "s"}`,
        ...lines.map((l) => `  ${l}`),
      ];
    }
  }
}

function worst(a: ExitCode, b: ExitCode): ExitCode {
  const rank = (c: ExitCode) => (c === EXIT.usage ? 2 : c === EXIT.problems ? 1 : 0);
  return rank(b) > rank(a) ? b : a;
}

/** `quiz ids FILE...` (COMMANDS.md). Every input is attempted; the exit code is the worst one. */
export async function runIds(patterns: readonly string[], opts: IdsOptions, io: Io): Promise<ExitCode> {
  const inputs = expandInputs(patterns, io.cwd);
  let exit: ExitCode = EXIT.done;
  let ok = 0;
  let failed = 0;
  const progress = !opts.json && !opts.plain && io.tty && inputs.files.length > 1;
  const emit = (r: FileResult) => {
    if (opts.json) io.out(JSON.stringify(r));
    else for (const line of describe(r, opts)) (r.status === "error" ? io.err : io.out)(line);
  };

  if (inputs.items.length === 0) {
    io.err("nothing to work on: give at least one quiz file");
    return EXIT.usage;
  }

  let n = 0;
  // one after another, in the order given (COMMANDS.md, "Several files"): an unusable input is a failure in its place
  for (const item of inputs.items) {
    if ("error" in item) {
      emit({ status: "error", file: item.error.input, message: item.error.message });
      failed++;
      exit = worst(exit, EXIT.usage);
      continue;
    }
    const file = item.file;
    n++;
    if (progress) io.errRaw(`\r[${n}/${inputs.files.length}] ${file}`);
    const result = await idsForFile(file, opts, io);
    if (progress) io.errRaw("\r\u001b[K");
    emit(result);
    if (result.status === "error") {
      failed++;
      exit = worst(exit, EXIT.usage);
    } else if (result.status === "problems") {
      failed++;
      exit = worst(exit, EXIT.problems);
    } else ok++;
  }
  const several = inputs.files.length + inputs.errors.length > 1;
  if (several) {
    if (opts.json) io.out(JSON.stringify({ status: "done", ok, failed }));
    else io.out(`${ok} done, ${failed} failed`);
  }
  return exit;
}
