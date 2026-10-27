import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { type AssetBytes, quizHash } from "../core/hash";
import type { FrontMatter, Quiz } from "../core/ir";
import type { Issue } from "../core/issue";
import { parse } from "../core/parse";

const IMAGE_TYPES = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
const AUDIO_TYPES = [".mp3", ".ogg", ".wav", ".m4a"];

export type LoadedQuiz = {
  /** the file as the user named it */
  file: string;
  /** the file's text as read: a BOM and CRLF are still there */
  text: string;
  /** the front matter as far as it could be read, also when the quiz has errors */
  frontMatter: FrontMatter;
  /** null when there is any error, in the syntax or in the assets */
  quiz: Quiz | null;
  issues: Issue[];
  /** the referenced files that exist and are allowed, with their bytes */
  assets: AssetBytes[];
  /** the quiz hash (TECHNICAL_DESIGN.md, foundation 1): null when an asset could not be read */
  hash: string | null;
};

/** Reads a quiz file, parses it and resolves its assets. Throws when the file itself cannot be read. */
export function loadQuiz(file: string): LoadedQuiz {
  const text = readFileSync(file).toString("utf8");
  const parsed = parse(text, file);
  const issues = [...parsed.issues];
  const assets: AssetBytes[] = [];
  const folder = resolve(dirname(file));
  let realFolder = folder;
  try {
    realFolder = realpathSync(folder);
  } catch {
    // the folder exists, since the file was just read from it
  }
  const seen = new Set<string>();
  let assetProblems = 0;

  for (const ref of parsed.assets) {
    const problem = (rule: string, message: string, fix?: string) => {
      assetProblems++;
      issues.push({ rule, level: "error", file, line: ref.line, message, ...(fix ? { fix } : {}) });
    };
    const path = ref.path;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path) || path.startsWith("//")) {
      problem(
        "asset.remote",
        `"${path}" is a URL: remote files are not supported`,
        "put the file in the quiz folder and refer to it by relative path",
      );
      continue;
    }
    const lexical = resolve(folder, path);
    if (isAbsolute(path) || !inside(folder, lexical)) {
      problem(
        "asset.outside",
        `"${path}" is outside the quiz folder`,
        "move the file into the quiz folder or below it",
      );
      continue;
    }
    let real: string;
    try {
      real = realpathSync(lexical);
      if (!statSync(real).isFile()) throw new Error("not a file");
    } catch {
      problem(
        "asset.missing",
        `the file "${path}" does not exist`,
        "check the path, which is relative to the quiz file",
      );
      continue;
    }
    if (!inside(realFolder, real)) {
      problem(
        "asset.outside",
        `"${path}" leads outside the quiz folder`,
        "move the file into the quiz folder or below it",
      );
      continue;
    }
    const ext = extname(path).toLowerCase();
    if (!IMAGE_TYPES.includes(ext) && !AUDIO_TYPES.includes(ext)) {
      problem(
        "asset.type",
        `"${path}" is not a supported file type`,
        `images: ${IMAGE_TYPES.join(" ")}; audio: ${AUDIO_TYPES.join(" ")}. Video is not supported`,
      );
      continue;
    }
    const key = relative(folder, lexical).split(sep).join("/");
    if (!seen.has(key)) {
      seen.add(key);
      assets.push({ path: key, bytes: new Uint8Array(readFileSync(real)) });
    }
  }

  const failed = issues.some((i) => i.level === "error");
  return {
    file,
    text,
    frontMatter: parsed.frontMatter,
    quiz: failed ? null : parsed.quiz,
    issues,
    assets,
    hash: assetProblems > 0 ? null : quizHash(text, assets),
  };
}

function inside(folder: string, target: string): boolean {
  const rel = relative(folder, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
