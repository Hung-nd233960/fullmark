import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { type AssetBytes, quizHash, type SheetText } from "../core/hash";
import type { AssetRef, FrontMatter, Quiz } from "../core/ir";
import type { Issue } from "../core/issue";
import { type ParseOptions, parse } from "../core/parse";
import { parseSheet } from "../core/parse/sheet";

const IMAGE_TYPES = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
const AUDIO_TYPES = [".mp3", ".ogg", ".wav", ".m4a"];

/** A materials sheet, read: its path relative to the quiz folder, its name and its text. */
export type LoadedSheet = { path: string; name: string; source: string };

export type LoadedQuiz = {
  /** the file as the user named it */
  file: string;
  /** the file's text as read: a BOM and CRLF are still there */
  text: string;
  /** the front matter as far as it could be read, also when the quiz has errors */
  frontMatter: FrontMatter;
  /** null when there is any error, in the syntax, in the assets or in a sheet */
  quiz: Quiz | null;
  /** the quiz's issues, and those of its sheets (their `file` is the sheet's path) */
  issues: Issue[];
  /** the referenced files that exist and are allowed, with their bytes (a sheet's images too) */
  assets: AssetBytes[];
  /** the materials sheets in the order listed; empty when there are none or when any sheet has an error */
  sheets: LoadedSheet[];
  /** the quiz hash (TECHNICAL_DESIGN.md, foundation 1): null when an asset or a sheet could not be read */
  hash: string | null;
  /**
   * Every file the quiz hash covers, as an absolute path: the assets and sheets the quiz and its sheets refer to, found
   * or not (a file that appears later is watched too). `build --watch` watches these (COMMANDS.md, `--watch`).
   */
  covered: string[];
};

/** `a/b/../c.png` written in a file in `fromDir`, as a path from `base`, with `/` separators. */
const slashes = (p: string): string => p.split(sep).join("/");

/**
 * Compares each segment of `rel` (inside `folder`) with the directory listing. Returns null when the letter case
 * matches (or the folder cannot be listed), else the path as it is on disk.
 */
function caseMismatch(folder: string, rel: string): string | null {
  const actual: string[] = [];
  let dir = folder;
  let differs = false;
  for (const seg of rel.split(sep)) {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return null;
    }
    const exact = names.includes(seg) ? seg : names.find((n) => n.toLowerCase() === seg.toLowerCase());
    if (exact === undefined) return null;
    if (exact !== seg) differs = true;
    actual.push(exact);
    dir = join(dir, exact);
  }
  return differs ? actual.join(sep) : null;
}

/** Reads a quiz file, parses it and resolves its assets and sheets. Throws when the file itself cannot be read. */
export function loadQuiz(file: string, options: ParseOptions = {}): LoadedQuiz {
  const text = readFileSync(file).toString("utf8");
  const parsed = parse(text, file, options);
  const issues = [...parsed.issues];
  const assets: AssetBytes[] = [];
  const sheetTexts: SheetText[] = [];
  const sheets: LoadedSheet[] = [];
  const folder = resolve(dirname(file));
  let realFolder = folder;
  try {
    realFolder = realpathSync(folder);
  } catch {
    // the folder exists, since the file was just read from it
  }
  const shownDir = slashes(dirname(file));
  const display = (rel: string): string => (shownDir === "." ? rel : `${shownDir}/${rel}`);
  const seen = new Set<string>();
  const covered = new Set<string>();
  let readProblems = 0;

  type Place = { file: string; line: number };
  /**
   * Checks a path written in a file in `fromDir` (remote, outside, missing, type, in that order) and returns the
   * file's key (relative to the quiz folder) and real path, or null after reporting the problem.
   */
  const resolveRef = (
    path: string,
    fromDir: string,
    at: Place,
    missing: { rule: "asset.missing" | "materials.missing"; what: string; fix: string },
    types: readonly string[],
    typeFix: string,
  ): { key: string; real: string } | null => {
    const problem = (rule: string, message: string, fix?: string) => {
      readProblems++;
      issues.push({ rule, level: "error", file: at.file, line: at.line, message, ...(fix ? { fix } : {}) });
    };
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path) || path.startsWith("//")) {
      problem(
        "asset.remote",
        `"${path}" is a URL: remote files are not supported`,
        "put the file in the quiz folder and refer to it by relative path",
      );
      return null;
    }
    const lexical = resolve(fromDir, path);
    if (isAbsolute(path) || !inside(folder, lexical)) {
      problem(
        "asset.outside",
        `"${path}" is outside the quiz folder`,
        "move the file into the quiz folder or below it",
      );
      return null;
    }
    covered.add(lexical);
    const key = slashes(relative(folder, lexical));
    // a file whose name differs only in letter case: found by realpath on a case-insensitive disk (Windows, macOS),
    // and not at all on a case-sensitive one (Linux); either way the fix names the file as it is
    const caseProblem = (): boolean => {
      const actual = caseMismatch(folder, relative(folder, lexical));
      if (actual === null) return false;
      const shown = slashes(relative(fromDir, join(folder, actual)));
      problem(
        missing.rule,
        `${missing.what} "${path}" does not exist`,
        `the file is \`${shown}\`; paths match letter case exactly`,
      );
      return true;
    };
    let real: string;
    try {
      real = realpathSync(lexical);
      if (!statSync(real).isFile()) throw new Error("not a file");
    } catch {
      if (!caseProblem()) problem(missing.rule, `${missing.what} "${path}" does not exist`, missing.fix);
      return null;
    }
    if (caseProblem()) return null;
    if (!inside(realFolder, real)) {
      problem(
        "asset.outside",
        `"${path}" leads outside the quiz folder`,
        "move the file into the quiz folder or below it",
      );
      return null;
    }
    if (!types.includes(extname(path).toLowerCase())) {
      problem("asset.type", `"${path}" is not a supported file type`, typeFix);
      return null;
    }
    return { key, real };
  };

  const ASSET_TYPES = [...IMAGE_TYPES, ...AUDIO_TYPES];
  const ASSET_TYPE_FIX = `images: ${IMAGE_TYPES.join(" ")}; audio: ${AUDIO_TYPES.join(" ")}. Video is not supported`;
  const addAssets = (refs: readonly AssetRef[], fromDir: string, shownFile: string, base: string) => {
    for (const ref of refs) {
      const found = resolveRef(
        ref.path,
        fromDir,
        { file: shownFile, line: ref.line },
        {
          rule: "asset.missing",
          what: "the file",
          fix: `check the path, which is relative to ${base}`,
        },
        ASSET_TYPES,
        ASSET_TYPE_FIX,
      );
      if (found && !seen.has(found.key)) {
        seen.add(found.key);
        assets.push({ path: found.key, bytes: new Uint8Array(readFileSync(found.real)) });
      }
    }
  };

  addAssets(parsed.assets, folder, file, "the quiz file");

  // -- the sheets, in the order listed
  const listedAt = parsed.frontMatter.keyLines.materials ?? 1;
  let sheetErrors = false;
  const found: { rel: string; text: string; shown: string }[] = [];
  for (const path of parsed.frontMatter.materials) {
    const before = issues.length;
    const sheet = resolveRef(
      path,
      folder,
      { file, line: listedAt },
      {
        rule: "materials.missing",
        what: "the sheet",
        fix: "check the path in `materials:`, which is relative to the quiz file; paths match letter case exactly",
      },
      [".md"],
      "a materials sheet is a Markdown file (.md)",
    );
    if (!sheet) {
      sheetErrors ||= issues.length > before;
      continue;
    }
    if (found.some((f) => f.rel === sheet.key)) continue;
    found.push({ rel: sheet.key, text: readFileSync(sheet.real).toString("utf8"), shown: display(sheet.key) });
  }
  for (const f of found) {
    const sheet = parseSheet(f.text, f.shown, options);
    for (const issue of sheet.issues) {
      issues.push(issue);
      if (issue.level === "error") sheetErrors = true;
    }
    const sheetDir = dirname(resolve(folder, f.rel));
    addAssets(sheet.assets, sheetDir, f.shown, "the sheet");
    sheetTexts.push({ path: f.rel, text: f.text });
    if (sheet.name !== null) sheets.push({ path: f.rel, name: sheet.name, source: sheet.source });
  }

  const failed = issues.some((i) => i.level === "error");
  return {
    file,
    text,
    frontMatter: parsed.frontMatter,
    quiz: failed ? null : parsed.quiz,
    issues,
    assets,
    sheets: failed || sheetErrors ? [] : sheets,
    hash: readProblems > 0 ? null : quizHash(text, [...assets, ...sheetTexts]),
    covered: [...covered],
  };
}

function inside(folder: string, target: string): boolean {
  const rel = relative(folder, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
