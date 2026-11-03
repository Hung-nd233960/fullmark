import { isMap, isScalar, isSeq, parseDocument, type YAMLMap } from "yaml";
import { scanBlanks } from "./parse/blanks";
import { analyseHeading } from "./parse/heading";
import { splitLines } from "./parse/lines";
import { itemText, parseChoiceInput } from "./parse/lists";
import { type Outline, outline, type Unit } from "./parse/outline";
import { parseTaskMarker } from "./parse/task-list";

/**
 * What a new quiz copied from another one keeps and drops (COMMANDS.md, `quiz new`; QUIZ_SYNTAX.md, section 9).
 * Pure text in, text out: nothing here reads a file. `withoutIdentity` is a copy that is a quiz of its own;
 * `skeleton` also empties the content.
 */

/** The title a skeleton starts with: the one content field that cannot be empty, since `title` is required. */
export const SKELETON_TITLE = "TODO: the quiz's title";

// -- the front matter ---------------------------------------------------------------------------------------------

type KeyEntry = { key: string | null; lines: string[] };

/**
 * The lines between the `---` fences as top-level keys: a key's line and the lines that belong to it (indented,
 * blank or a list item, up to the next line that starts a key or a comment in column 0). Other lines stand alone with
 * `key: null`.
 */
function frontMatterEntries(lines: readonly string[]): KeyEntry[] {
  const entries: KeyEntry[] = [];
  for (const line of lines) {
    const key = /^([A-Za-z_][\w-]*)[ \t]*:/.exec(line)?.[1];
    const last = entries.at(-1);
    if (key !== undefined) entries.push({ key, lines: [line] });
    else if (last?.key != null && (line.trim() === "" || /^[ \t-]/.test(line))) last.lines.push(line);
    else entries.push({ key: null, lines: [line] });
  }
  return entries;
}

/** Blank lines that ended up at the end of a dropped entry are not a gap to keep. */
const trimmed = (lines: string[]): string[] => {
  const out = [...lines];
  while (out.length > 0 && (out[out.length - 1] ?? "").trim() === "") out.pop();
  return out;
};

// -- the same quiz with its own identity ---------------------------------------------------------------------------

/** Start offset of each line of `text`, and the offset where its content ends (before the line ending). */
function lineSpans(text: string): { start: number; end: number; next: number }[] {
  const spans: { start: number; end: number; next: number }[] = [];
  let start = text.startsWith("﻿") ? 1 : 0;
  for (let i = start; i <= text.length; i++) {
    const c = text[i];
    if (i === text.length || c === "\n" || c === "\r") {
      const crlf = c === "\r" && text[i + 1] === "\n";
      spans.push({ start, end: i, next: i === text.length ? i : i + (crlf ? 2 : 1) });
      if (crlf) i++;
      start = i + 1;
    }
  }
  return spans;
}

/**
 * The quiz with the front matter's `id` and every question's `id` removed, and nothing else changed, byte for byte
 * (line endings and a BOM included). The quiz id then defaults to the new file's name, and `quiz ids` gives the
 * questions fresh ones, so a copy never shares an identity with its source (owner, 2026-11-03).
 */
export function withoutIdentity(text: string): string {
  const o = outline(text);
  const spans = lineSpans(text);
  const cuts: { from: number; to: number }[] = [];
  const at = (line: number, column: number): number => (spans[line]?.start ?? 0) + column;

  if (typeof o.frontMatter === "object") {
    const body = o.lines.slice(1, o.frontMatter.close);
    let index = 1;
    for (const entry of frontMatterEntries(body)) {
      if (entry.key === "id") {
        const first = spans[index];
        const last = spans[index + entry.lines.length - 1];
        // keep the blank lines that ended the entry: they are the gap before the next key
        const used = trimmed(entry.lines).length;
        cuts.push({ from: first?.start ?? 0, to: spans[index + used - 1]?.next ?? last?.next ?? 0 });
      }
      index += entry.lines.length;
    }
  }
  for (const u of o.units) {
    if (u.kind !== "heading" || u.level !== 2) continue;
    const raw = o.lines[u.start] ?? "";
    const block = analyseHeading(raw)?.block;
    if (!block?.ok) continue;
    const pair = block.pairs.find((p) => p.name === "id");
    if (!pair) continue;
    let { start, end } = pair;
    if (start > block.inner[0] && /\s/.test(raw[start - 1] ?? "")) start--;
    else if (/\s/.test(raw[end] ?? "") && end < block.inner[1]) end++;
    cuts.push({ from: at(u.start, start), to: at(u.start, end) });
  }
  cuts.sort((a, b) => b.from - a.from);
  let out = text;
  for (const c of cuts) out = out.slice(0, c.from) + out.slice(c.to);
  return out;
}

/**
 * The quiz with `id: ID` written into the front matter, after its last key (a quiz that has an `id` there is returned
 * unchanged, a quiz with no front matter too). Line endings stay as the file has them.
 */
export function withQuizId(text: string, id: string): string {
  const o = outline(text);
  if (typeof o.frontMatter !== "object") return text;
  const body = o.lines.slice(1, o.frontMatter.close);
  if (frontMatterEntries(body).some((e) => e.key === "id")) return text;
  let last = o.frontMatter.close - 1;
  while (last > 0 && (o.lines[last] ?? "").trim() === "") last--;
  const spans = lineSpans(text);
  const eol = /\r\n/.test(text) ? "\r\n" : "\n";
  const at = spans[last]?.next ?? 0;
  return `${text.slice(0, at)}id: ${id}${eol}${text.slice(at)}`;
}

// -- the skeleton -------------------------------------------------------------------------------------------------

const slice = (o: Outline, u: { start: number; end: number }): string[] => o.lines.slice(u.start, u.end);

/** The `answer` block's YAML with these top-level keys cut out; their lines go, up to the next key. */
function withoutKeys(content: string, drop: readonly string[]): string {
  const doc = parseDocument(content, { prettyErrors: false });
  const map = doc.contents;
  if (!isMap(map) || doc.errors.length > 0) return content;
  const lines = splitLines(content);
  const starts: number[] = [];
  let at = 0;
  for (const l of lines) {
    starts.push(at);
    at += l.length + 1;
  }
  const lineOf = (offset: number): number => {
    let i = 0;
    while (i + 1 < starts.length && (starts[i + 1] as number) <= offset) i++;
    return i;
  };
  const gone = new Set<number>();
  const pairs = (map as YAMLMap).items;
  pairs.forEach((pair, n) => {
    if (!isScalar(pair.key) || !drop.includes(String(pair.key.value))) return;
    const from = lineOf(pair.key.range?.[0] ?? 0);
    const next = pairs[n + 1];
    const to = next && isScalar(next.key) ? lineOf(next.key.range?.[0] ?? 0) : lines.length;
    for (let i = from; i < to; i++) gone.add(i);
  });
  return lines.filter((_l, i) => !gone.has(i)).join("\n");
}

/** The pair `key: value` of a top-level key as written (its lines), or null. */
function keyLines(content: string, key: string): string | null {
  const doc = parseDocument(content, { prettyErrors: false });
  const map = doc.contents;
  if (!isMap(map) || doc.errors.length > 0) return null;
  const rest = withoutKeys(content, [key]);
  if (rest === content) return null;
  const keep = splitLines(content).filter((l) => !splitLines(rest).includes(l));
  return keep.join("\n");
}

/** The `fields` of a fields question with the keys emptied: labels and points kept, one empty key per graded field. */
function emptyFields(content: string): string {
  const doc = parseDocument(content, { prettyErrors: false });
  const map = doc.contents;
  if (!isMap(map) || doc.errors.length > 0) return "fields:";
  const seq = map.get("fields", true);
  if (!isSeq(seq)) return "fields:";
  const out = ["fields:"];
  for (const item of seq.items) {
    if (!isMap(item)) continue;
    const label = item.get("label");
    out.push(`  - label: ${JSON.stringify(String(label ?? ""))}`);
    if (item.has("value") || item.has("values")) out.push("    value:");
    else if (item.has("accept") || item.has("patterns")) out.push("    accept: []");
    const points = item.get("points");
    if (points !== undefined && points !== null) out.push(`    points: ${String(points)}`);
  }
  return out.join("\n");
}

/** The `answer` block of a question, emptied by what its type's keys are (QUIZ_SYNTAX.md, section 6). */
function answerBlock(type: string, content: string): string[] | null {
  let body: string;
  switch (type) {
    case "truefalse":
      // no `value` at all: `question.answer-block` says it is missing, where `value:` would be a bad value
      return ["```answer", "```"];
    case "numeric":
      body = ["value:", keyLines(content, "unit")].filter((l) => l !== null).join("\n");
      break;
    case "short":
      body = "accept: []";
      break;
    case "fields":
      body = emptyFields(content);
      break;
    case "essay":
      body = withoutKeys(content, ["sample_answer"]);
      break;
    case "code":
      body = withoutKeys(content, ["starter", "sample_answer"]);
      break;
    default:
      body = content.replace(/\n+$/, "");
  }
  if (body.trim() === "") return null;
  return ["```answer", ...body.replace(/\n+$/, "").split("\n"), "```"];
}

/** A choice list with the text emptied: the markers stay (all cleared), and so does a `{input}`. */
function emptyChoices(o: Outline, list: Extract<Unit, { kind: "list" }>): string[] {
  return list.items.map((item) => {
    const head = o.lines[item.start] ?? "";
    const bullet = /^\s*([-*+])/.exec(head)?.[1] ?? "-";
    const t = itemText(o.lines, item);
    const marker = parseTaskMarker(t.text);
    const input = parseChoiceInput((marker?.rest ?? t.text).split("\n")[0] ?? "");
    return `${bullet} [ ]${input.kind === "ok" ? " {input}" : ""}`;
  });
}

/** An ordering or matching list with the text emptied, one line per item. */
function emptyList(o: Outline, list: Extract<Unit, { kind: "list" }>, matching: boolean): string[] {
  return list.items.map((item, n) => {
    if (!matching) return `${n + 1}.`;
    // a pair keeps a `?` on the left so that it is not read as a distractor; both lack the right-hand text
    return itemText(o.lines, item).text.trimStart().startsWith("::") ? "- ::" : "- ? ::";
  });
}

/** The blanks of a question as empty ones, so that their number is kept. */
function emptyBlanks(o: Outline, headingText: string, units: readonly Unit[]): string[] {
  const kinds: string[] = [];
  const count = (text: string, mode: "markdown" | "code") => {
    for (const b of scanBlanks(text, 1, mode).blanks) kinds.push(b.kind === "numeric" ? "[[=]]" : "[[]]");
  };
  count(headingText, "markdown");
  for (const u of units) {
    if (u.kind === "container" || u.kind === "stray-closer") continue;
    if (u.kind === "fence") count(u.content, "code");
    else count(slice(o, u).join("\n"), "markdown");
  }
  return kinds.length > 0 ? [kinds.join(" ")] : [];
}

/** A heading with the prompt and the `id` and `source` taken out: `## {type=single points=2}`. */
function emptyHeading(raw: string): string {
  const parts = analyseHeading(raw);
  const block = parts?.block;
  if (!parts || !block?.ok) return "##";
  const kept = block.pairs.filter((p) => p.name !== "id" && p.name !== "source").map((p) => raw.slice(p.start, p.end));
  return `## {${kept.join(" ")}}`;
}

/** The pair `type=…` of a question heading, and whether the question is `graded=false`. */
function questionType(raw: string): string {
  const block = analyseHeading(raw)?.block;
  return block?.ok ? (block.pairs.find((p) => p.name === "type")?.value ?? "") : "";
}

/**
 * The quiz as a skeleton (QUIZ_SYNTAX.md, section 9): every structure field kept, every content field emptied. The
 * source is a quiz that parses. The result fails `check` by design, with an error for each empty field, and has no
 * identity of its own (no `id` at all).
 */
export function skeleton(text: string): string {
  const o = outline(text);
  const out: string[] = [];
  const block = (lines: string[]): void => {
    if (out.length > 0) out.push("");
    out.push(...lines);
  };

  // the front matter: structure kept; title to a placeholder; description, id, generated_by and the materials emptied
  const kept: string[] = [];
  const entries = typeof o.frontMatter === "object" ? frontMatterEntries(o.lines.slice(1, o.frontMatter.close)) : [];
  let titled = false;
  for (const entry of entries) {
    if (entry.key === "title") {
      kept.push(`title: ${JSON.stringify(SKELETON_TITLE)}`);
      titled = true;
    } else if (
      entry.key === "description" ||
      entry.key === "id" ||
      entry.key === "generated_by" ||
      entry.key === "materials"
    ) {
      // emptied: no key is the empty value of each
    } else kept.push(...trimmed(entry.lines));
  }
  if (!titled) kept.unshift(`title: ${JSON.stringify(SKELETON_TITLE)}`);
  out.push("---", ...kept, "---");

  type Pending = { heading: string; type: string; units: Unit[] };
  const open: { question: Pending | null; section: boolean } = { question: null, section: false };
  const closeQuestion = (): void => {
    if (!open.question) return;
    const { heading, type, units } = open.question;
    const own = units.filter((u) => u.kind !== "container" && u.kind !== "stray-closer");
    const lists = own.filter((u): u is Extract<Unit, { kind: "list" }> => u.kind === "list");
    const answer = own.find((u): u is Extract<Unit, { kind: "fence" }> => u.kind === "fence" && u.info === "answer");
    const headingText = analyseHeading(heading)?.text ?? "";
    let body: string[] = [];
    if (type === "single" || type === "multi") {
      const list = lists.at(-1);
      if (list) body = emptyChoices(o, list);
    } else if (type === "ordering" || type === "matching") {
      const list = lists.at(-1);
      if (list) body = emptyList(o, list, type === "matching");
    } else if (type === "blanks") body = emptyBlanks(o, headingText, own);
    else if (answer) body = answerBlock(type, answer.content) ?? [];
    block([emptyHeading(heading), ...(body.length > 0 ? ["", ...body] : [])]);
    open.question = null;
  };

  for (const u of o.units) {
    if (u.kind === "heading" && u.level === 2) {
      closeQuestion();
      open.question = { heading: o.lines[u.start] ?? "", type: questionType(o.lines[u.start] ?? ""), units: [] };
    } else if (u.kind === "heading") {
      closeQuestion();
      if (u.level === 1) {
        block(slice(o, u));
        open.section = true;
      }
    } else if (open.question) open.question.units.push(u);
    else if (open.section) {
      // a section's intro: the instructions stay, the passage is emptied
      if (u.kind === "container" && u.name === "passage") block(["::: passage", ":::"]);
      else if (u.kind !== "stray-closer") block(slice(o, u));
    }
  }
  closeQuestion();
  return `${out.join("\n")}\n`;
}

/**
 * The rules a skeleton fails by design, one error for each emptied field (`quiz check` on it is the author's
 * to-do list). Any other error in a skeleton means the structure is broken, and `template add --skeleton` refuses it.
 */
export const SKELETON_RULES: ReadonlySet<string> = new Set([
  "question.id-missing",
  "question.prompt-empty",
  "question.answer-block",
  "choice.correct-count",
  "numeric.value",
  "short.key",
  "blanks.syntax",
  "ordering.items",
  "matching.pairs",
  "fields.points",
]);
