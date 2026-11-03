import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { skeleton, withoutIdentity } from "../core/skeleton";
import { writeFileAtomic } from "./atomic";
import type { CheckIo } from "./check";
import { humanIssue } from "./check";
import { EXIT, type ExitCode } from "./exit-codes";
import { fail } from "./fail";
import type { Io } from "./ids";
import { type LoadedQuiz, loadQuiz } from "./load";
import { readFailure, shownPath } from "./paths";
import { findTemplate, listTemplates, machineOf, readTemplate, type TemplateFiles } from "./templates";

export type NewOptions = { from: string | null; skeleton: boolean };

/** A quiz file read with the files it refers to: what `new --from` and `template add` copy. */
export type QuizSource = { loaded: LoadedQuiz; name: string; text: string; files: { path: string; bytes: Buffer }[] };

/**
 * Reads a quiz and the assets and materials sheets it names (not the whole folder: a folder may hold other quizzes).
 * Throws when the file cannot be read; a quiz that does not parse comes back with `loaded.quiz` null.
 */
export function readSource(path: string): QuizSource {
  const loaded = loadQuiz(path);
  const folder = dirname(path);
  const files = [...loaded.assets.map((a) => a.path), ...loaded.sheets.map((s) => s.path)]
    .sort()
    .map((rel) => ({ path: rel, bytes: readFileSync(join(folder, rel)) }));
  return { loaded, name: basename(path), text: loaded.text, files };
}

/** A new quiz's files from a template or a source: the file, then the assets, as they are to be written. */
export type Output = { name: string; files: { path: string; bytes: Buffer }[] };

/** The copy of a quiz that is a quiz of its own (G13), or its skeleton. */
export function copyOf(
  source: { name: string; text: string; files: { path: string; bytes: Buffer }[] },
  asSkeleton: boolean,
): Output {
  if (asSkeleton)
    return { name: source.name, files: [{ path: source.name, bytes: Buffer.from(skeleton(source.text), "utf8") }] };
  return {
    name: source.name,
    files: [{ path: source.name, bytes: Buffer.from(withoutIdentity(source.text), "utf8") }, ...source.files],
  };
}

const fromTemplate = (t: TemplateFiles): { name: string; text: string; files: TemplateFiles["files"] } => ({
  name: t.md.name,
  text: t.md.bytes.toString("utf8"),
  files: t.files,
});

/**
 * `quiz new TEMPLATE [PATH]` and `quiz new --from FILE [--skeleton] [PATH]` (COMMANDS.md). `positional` is what the
 * command line gave after the options: the template and the path, or only the path with `--from`. Never overwrites:
 * a file that exists exits 2 before anything is written.
 */
export async function runNew(positional: readonly string[], opts: NewOptions, io: CheckIo): Promise<ExitCode> {
  const say = (line: string): void => io.out(line);
  const template = opts.from === null ? positional[0] : undefined;
  const target = opts.from === null ? positional[1] : positional[0];
  if (opts.from !== null && positional.length > 1) {
    fail(io, false, "give a template or --from, not both: with --from the only argument is the PATH");
    return EXIT.usage;
  }
  if (opts.from === null && template === undefined) {
    fail(io, false, "give a template (quiz template list) or --from FILE");
    return EXIT.usage;
  }
  if (opts.skeleton && opts.from === null) {
    fail(io, false, "--skeleton needs --from FILE");
    return EXIT.usage;
  }

  let output: Output;
  let described: string;
  if (opts.from !== null) {
    const path = resolve(io.cwd, opts.from);
    let source: QuizSource;
    try {
      source = readSource(path);
    } catch (error) {
      fail(io, false, `cannot read the file: ${readFailure(error)}`, { file: opts.from });
      return EXIT.usage;
    }
    if (source.loaded.quiz === null) {
      fail(io, false, "the quiz does not parse, so there is nothing to copy; fix these first:", { file: opts.from });
      for (const i of source.loaded.issues.filter((x) => x.level === "error"))
        for (const l of humanIssue({ ...i, file: shownPath(i.file, io.cwd) }, false)) io.err(l);
      return EXIT.problems;
    }
    output = copyOf(source, opts.skeleton);
    described = shownPath(path, io.cwd);
  } else {
    const m = machineOf(io);
    const found = findTemplate(m, template as string);
    if (!found) {
      const names = listTemplates(m).map((t) => t.name);
      fail(io, false, `no template called "${template}"`, {}, [
        `the templates are: ${[...new Set(names)].join(", ")} (quiz template list)`,
      ]);
      return EXIT.usage;
    }
    if (found.ignoredUser) {
      io.err(`ignored your template "${template}": a built-in template has that name; rename its folder to use it`);
    }
    output = copyOf(fromTemplate(readTemplate(found.info)), false);
    described = `template ${template}`;
  }

  const dest = resolve(io.cwd, target ?? ".");
  const taken = output.files.find((f) => existsSync(join(dest, f.path)));
  if (taken) {
    fail(io, false, `${shownPath(join(dest, taken.path), io.cwd)} already exists; new never overwrites`);
    return EXIT.usage;
  }
  try {
    for (const f of output.files) await writeFileAtomic(join(dest, f.path), f.bytes);
  } catch (error) {
    fail(
      io,
      false,
      `cannot write ${shownPath((error as { file?: string }).file ?? dest, io.cwd)}: ${(error as Error).message}`,
    );
    return EXIT.usage;
  }
  const quiz = shownPath(join(dest, output.name), io.cwd);
  const others = output.files.length - 1;
  say(
    `wrote ${quiz} from ${described}${others > 0 ? `, with ${others} file${others === 1 ? "" : "s"} beside it` : ""}`,
  );
  if (opts.skeleton) {
    say(`it fails \`quiz check\` until it is filled in; then run \`quiz ids ${quiz}\` to give the questions ids`);
  } else {
    say(`run \`quiz ids ${quiz}\` to give the questions ids`);
  }
  return EXIT.done;
}

export type { Io };
