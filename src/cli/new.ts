import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { skeleton, withoutIdentity, withQuizId } from "../core/skeleton";
import { ID_FORMAT, slug } from "../core/slug";
import { writeFileAtomic } from "./atomic";
import type { CheckIo } from "./check";
import { humanIssue, issueJson } from "./check";
import { EXIT, type ExitCode } from "./exit-codes";
import { fail } from "./fail";
import type { Io } from "./ids";
import { type LoadedQuiz, loadQuiz } from "./load";
import { readFailure, shownPath } from "./paths";
import { findTemplate, listTemplates, machineOf, readTemplate, type TemplateFiles } from "./templates";

export type NewOptions = { from: string | null; skeleton: boolean; json?: boolean };

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

/**
 * The fresh quiz `id` of a new quiz (COMMANDS.md, `quiz new`): the folder's name when the file is `quiz.md`, else the
 * file's name, slugged. A name that is no id (it must start with a letter) gets `quiz-` in front; a name with no
 * letters or digits gives none, and the id then defaults to the file's name.
 */
export function freshId(folder: string, file: string): string | null {
  const stem = file.replace(/\.md$/i, "");
  const base = slug(stem.toLowerCase() === "quiz" ? basename(folder) : stem);
  if (base === "") return null;
  const named = /^[a-z]/.test(base) ? base : `quiz-${base}`;
  // over 64 characters: cut at the last hyphen before the limit, so a word is never split (one long word is cut)
  const window = named.slice(0, 65);
  const hyphen = window.lastIndexOf("-");
  const id = (named.length <= 64 ? named : hyphen > 0 ? window.slice(0, hyphen) : named.slice(0, 64)).replace(
    /-+$/,
    "",
  );
  return ID_FORMAT.test(id) ? id : null;
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
  const json = opts.json === true;
  // with --json the human text goes to stderr and stdout holds the one object
  const say = (line: string): void => (json ? io.err(line) : io.out(line));
  const template = opts.from === null ? positional[0] : undefined;
  const target = opts.from === null ? positional[1] : positional[0];
  if (opts.from !== null && positional.length > 1) {
    fail(io, json, "give a template or --from, not both: with --from the only argument is the PATH");
    return EXIT.usage;
  }
  if (opts.from === null && template === undefined) {
    fail(io, json, "give a template (quiz template list) or --from FILE");
    return EXIT.usage;
  }
  if (opts.skeleton && opts.from === null) {
    fail(io, json, "--skeleton needs --from FILE");
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
      fail(io, json, `cannot read the file: ${readFailure(error)}`, { file: opts.from });
      return EXIT.usage;
    }
    if (source.loaded.quiz === null) {
      const errors = source.loaded.issues.filter((x) => x.level === "error");
      if (json) {
        io.out(
          JSON.stringify({
            status: "failed",
            file: opts.from,
            message: "the quiz does not parse, so there is nothing to copy",
            errors: errors.map((i) => issueJson({ ...i, file: shownPath(i.file, io.cwd) })),
          }),
        );
        io.err(`${opts.from}: the quiz does not parse, so there is nothing to copy; fix these first:`);
      } else
        fail(io, false, "the quiz does not parse, so there is nothing to copy; fix these first:", { file: opts.from });
      for (const i of errors) for (const l of humanIssue({ ...i, file: shownPath(i.file, io.cwd) }, false)) io.err(l);
      return EXIT.problems;
    }
    output = copyOf(source, opts.skeleton);
    described = shownPath(path, io.cwd);
  } else {
    const m = machineOf(io);
    const found = findTemplate(m, template as string);
    if (!found) {
      const all = listTemplates(m);
      const broken = all.find((t) => t.name === template && t.invalid !== null);
      if (broken) {
        fail(io, json, `your template "${template}" cannot be used: ${broken.invalid}`);
        return EXIT.usage;
      }
      const names = all.filter((t) => t.invalid === null).map((t) => t.name);
      fail(io, json, `no template called "${template}"`, {}, [
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

  // PATH ending in .md is the file to write (a folder otherwise, where the quiz keeps its name)
  const asFile = target !== undefined && /\.md$/i.test(target);
  const full = resolve(io.cwd, target ?? ".");
  const dest = asFile ? dirname(full) : full;
  const first = output.files[0];
  if (asFile && first) {
    output.name = basename(full);
    first.path = output.name;
  }
  if (first) {
    const id = freshId(dest, output.name);
    if (id === null) {
      const kanji = asFile ? "kanji.md" : `${basename(dest)}/kanji.md`;
      fail(
        io,
        json,
        `cannot make a quiz id from the name "${asFile ? output.name : basename(dest)}": name the file, as in \`${kanji}\``,
      );
      return EXIT.usage;
    }
    first.bytes = Buffer.from(withQuizId(first.bytes.toString("utf8"), id), "utf8");
  }
  const taken = output.files.find((f) => existsSync(join(dest, f.path)));
  if (taken) {
    fail(io, json, `${shownPath(join(dest, taken.path), io.cwd)} already exists; new never overwrites`);
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
  if (json) io.out(JSON.stringify({ status: "written", file: quiz, template: template ?? null }));
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
