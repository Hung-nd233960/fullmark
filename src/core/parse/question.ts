import { normaliseText, sha256Hex } from "../hash";
import type { FrontMatter, Question, QuestionType, Text } from "../ir";
import { type AnswerBlock, readAnswerBlock } from "./answer/block";
import { parseCode } from "./answer/code";
import type { AnswerEnv } from "./answer/env";
import { parseEssay } from "./answer/essay";
import { parseFields } from "./answer/fields";
import { parseNumeric } from "./answer/numeric";
import { parseScale } from "./answer/scale";
import { parseShort } from "./answer/short";
import { parseTrueFalse } from "./answer/truefalse";
import { type Blank, scanBlanks } from "./blanks";
import { analyseHeading, withoutId } from "./heading";
import { QUESTION_ATTRS, readPairs, readQuestionAttrs } from "./heading-attrs";
import { trimBlankLines, unclaimedLines } from "./lines";
import { parseChoices } from "./lists";
import { parseMatching } from "./matching";
import { parseOrdering } from "./ordering";
import type { Chunk, Outline, Unit } from "./outline";
import type { Reporter } from "./report";
import { findSpans, spanAt } from "./spans";

/** A question's lines: its heading, and everything up to the next `#` or `##` heading. 0-based, `end` exclusive. */
export type Region = { start: number; end: number; units: Unit[] };

export type QuestionCtx = { o: Outline; fm: FrontMatter; r: Reporter; ids: Map<string, number> };

/** Whether a question of this type takes an answer block, and when. */
type BlockPolicy = "required" | "optional" | "forbidden";

const CANNOT_BE_UNGRADED: readonly QuestionType[] = ["truefalse", "numeric", "blanks", "matching", "code"];

function blockPolicy(type: QuestionType, graded: boolean): BlockPolicy {
  switch (type) {
    case "truefalse":
    case "numeric":
    case "fields":
    case "code":
      return "required";
    case "short":
      return graded ? "required" : "forbidden";
    case "essay":
    case "scale":
      return "optional";
    default:
      return "forbidden";
  }
}

/**
 * Builds one question from its region. Everything wrong with it is reported; the question is still returned so
 * that one run reports every problem. (The caller drops the quiz when there is an error.)
 */
export function parseQuestion(region: Region, ctx: QuestionCtx): Question {
  const { o, fm, r } = ctx;
  const lines = o.lines;
  const line = region.start + 1;
  const parts = analyseHeading(lines[region.start] ?? "") ?? { level: 2, text: "", block: null };

  // -- attributes
  const pairs = readPairs(parts, line, QUESTION_ATTRS, r);
  const attrs = readQuestionAttrs(pairs, line, r, fm.kind === "survey");
  if (parts.text.trim() === "")
    r.error("question.prompt-empty", line, "the heading has no prompt text", "write the question after ##");
  if (attrs.id !== null) {
    const first = ctx.ids.get(attrs.id);
    if (first !== undefined) {
      r.error(
        "question.id-duplicate",
        line,
        `the id "${attrs.id}" is already used on line ${first}`,
        "delete the id from the copy and run: quiz ids FILE",
      );
    } else ctx.ids.set(attrs.id, line);
  }

  // -- the blocks of the region
  let hint: Text | null = null;
  let explanation: Text | null = null;
  const claims: [number, number][] = [];
  const answers: Extract<Unit, { kind: "fence" }>[] = [];
  const lists: Extract<Unit, { kind: "list" }>[] = [];
  const fences: [number, number][] = [];
  let swallowed = region.end;
  for (const u of region.units) {
    if (u.start >= swallowed) break;
    if (u.kind === "container") {
      claims.push([u.start, u.closed ? u.end + 1 : region.end]);
      if (!u.closed) {
        r.error(
          "syntax.container",
          u.start + 1,
          `the \`::: ${u.name}\` container is never closed`,
          "end it with a line holding only :::",
        );
        swallowed = u.start;
      }
      if (u.nested) {
        r.error("syntax.container", u.start + 1, "containers do not nest");
      } else if (u.name === "hint" || u.name === "explanation") {
        const text: Text = {
          line: u.start + 2,
          text: trimBlankLines(lines.slice(u.start + 1, u.closed ? u.end : region.end)).join("\n"),
        };
        const had = u.name === "hint" ? hint : explanation;
        if (had)
          r.error(
            "question.container-twice",
            u.start + 1,
            `the question has two \`::: ${u.name}\` containers`,
            `keep one ${u.name}`,
          );
        else if (u.name === "hint") hint = text;
        else explanation = text;
      } else if (u.name === "passage") {
        r.error(
          "syntax.container",
          u.start + 1,
          "a `::: passage` belongs in a section's intro, not in a question",
          "move it above the section's first question",
        );
      } else {
        r.error(
          "syntax.container",
          u.start + 1,
          `unknown container \`::: ${u.name}\``,
          "the containers are hint, explanation and passage",
        );
      }
    } else if (u.kind === "fence") {
      fences.push([u.start, u.end]);
      if (u.info === "answer") {
        answers.push(u);
        claims.push([u.start, u.end]);
      }
    } else if (u.kind === "list") {
      lists.push(u);
    } else if (u.kind === "stray-closer") {
      r.error("syntax.container", u.start + 1, "a closing ::: with no container open", "remove it");
    }
  }
  const claimed = (i: number) => claims.some(([a, b]) => i >= a && i < b);

  // -- the type, and whether the question is graded
  const type = attrs.type;
  const survey = fm.kind === "survey";
  let graded = !(survey || attrs.gradedGiven === false || type === "scale");
  if (type === "scale" && attrs.gradedGiven !== null) {
    r.error("question.ungraded", line, "a `scale` is always ungraded: `graded=` is not allowed", "remove graded");
  } else if (!graded && type && CANNOT_BE_UNGRADED.includes(type)) {
    r.error(
      "question.ungraded",
      line,
      `a \`${type}\` question cannot be ungraded${survey ? ", so it cannot be in a survey" : ""}`,
      survey ? "move it to a quiz" : "remove graded=false",
    );
    graded = true;
  }
  if (!graded && attrs.pointsGiven) {
    r.warning("question.points-ignored", line, "`points` on an ungraded question is ignored", "remove points");
  }

  // -- the answer list, for the types that write their answer as one
  const listFor = type === "single" || type === "multi" || type === "ordering" || type === "matching";
  const answerList = listFor ? lists.filter((l) => !claimed(l.start)).at(-1) : undefined;
  const inList = (i: number) => answerList !== undefined && i >= answerList.start && i < answerList.end;

  // -- where the answer is, if the type writes one in the body: the prompt is what comes before it, and nothing
  // but a hint or an explanation may come after it (`question.trailing-text`)
  const policy = type ? blockPolicy(type, graded) : "optional";
  const firstBlock = answers[0];
  const answerAt: { start: number; end: number } | null = answerList
    ? { start: answerList.start, end: answerList.end }
    : firstBlock && policy !== "forbidden"
      ? { start: firstBlock.start, end: firstBlock.end }
      : null;
  if (answerAt) {
    const stray = region.units.find(
      (u) =>
        u.start >= answerAt.end &&
        u.start < swallowed &&
        u.kind !== "container" &&
        u.kind !== "stray-closer" &&
        !(u.kind === "fence" && u.info === "answer") &&
        !o.rawHtml.some((h) => h.line >= u.start && h.line < u.end),
    );
    if (stray) {
      r.error(
        "question.trailing-text",
        stray.start + 1,
        "there is text after the answer; only a hint or an explanation may follow it",
        "move it above the answer, into the prompt, or into the explanation",
      );
    }
  }

  // -- the prompt
  const body = unclaimedLines(
    lines,
    region.start + 1,
    answerAt ? answerAt.start : region.end,
    (i) => claimed(i) || inList(i),
  );
  const promptBody = trimBlankLines(body).join("\n");
  const prompt =
    parts.text.trim() === ""
      ? promptBody
      : promptBody === ""
        ? parts.text.trim()
        : `${parts.text.trim()}\n\n${promptBody}`;

  // -- blanks, in the heading and the body
  const blanks: Blank[] = [];
  const pieces: { text: string; line: number; mode: Chunk["mode"] }[] = [{ text: parts.text, line, mode: "markdown" }];
  for (const c of o.chunks) {
    if (c.line <= region.start || c.line >= region.end || claimed(c.line)) continue;
    pieces.push({ text: c.text, line: c.line + 1, mode: c.mode });
  }
  let sawOpening = false;
  for (const p of pieces) {
    const scan = scanBlanks(p.text, p.line, p.mode);
    if (p.text.includes("[[")) sawOpening = true;
    if (type === "blanks") {
      for (const b of scan.blanks) blanks.push(b);
      for (const problem of scan.problems) r.error(problem.rule, problem.line, problem.message);
    } else if (type !== null && p.mode === "markdown") {
      for (const b of scan.blanks)
        r.error(
          "blanks.outside",
          b.line,
          "a blank [[…]] belongs in a `blanks` question",
          "change the type to blanks, or remove the brackets",
        );
    }
  }
  if (type === "blanks" && blanks.length === 0 && !sawOpening) {
    r.error("blanks.none", line, "a blanks question needs at least one blank", "write the missing word as [[answer]]");
  }

  // -- `{input}` anywhere but the end of a choice
  const limits = new Map<number, number>();
  const choices =
    (type === "single" || type === "multi") && answerList
      ? parseChoices(lines, answerList.items, graded, r, limits)
      : [];
  for (let i = region.start + 1; i < region.end; i++) {
    if (claimed(i)) continue;
    if (fences.some(([a, b]) => i >= a && i < b)) continue;
    const raw = (lines[i] ?? "").slice(0, limits.get(i) ?? Number.MAX_SAFE_INTEGER);
    const spans = findSpans(raw);
    for (const m of raw.matchAll(/\{input(?=\}|=)/g)) {
      const at = m.index ?? 0;
      if (spanAt(spans, at) || raw[at - 1] === "\\") continue;
      r.error(
        "choice.input",
        i + 1,
        "`{input}` goes at the end of a choice, nowhere else",
        "move it to the end of the choice it belongs to",
      );
    }
  }

  // -- the answer block
  const env: AnswerEnv = { r, headingLine: line, graded, points: attrs.points };
  const first = answers[0];
  if (type && first && policy === "forbidden") {
    r.error(
      "question.answer-block",
      line,
      `a \`${type}\` question takes no answer block${graded ? "" : " when it is ungraded"}`,
      "remove the ```answer block",
    );
  } else if (type && !first && policy === "required") {
    r.error("question.answer-block", line, `a \`${type}\` question needs an answer block`, "add a ```answer block");
  }
  if (answers.length > 1 && answers[1]) {
    r.error("question.answer-block", answers[1].start + 1, "a question has one answer block");
  }
  const block: AnswerBlock | null = first
    ? { fenceLine: first.start + 1, contentLine: first.start + 2, content: first.content }
    : null;
  const readable = type && block && policy !== "forbidden" ? readAnswerBlock(block, r) : null;
  const src =
    readable ??
    (block || policy === "required"
      ? null
      : { root: { node: null, errors: [], lineOf: () => line }, entries: [], get: () => undefined });

  // -- hash
  const hashLines = lines.slice(region.start, region.end);
  hashLines[0] = withoutId(hashLines[0] ?? "", parts.block);
  const hash = sha256Hex(normaliseText(hashLines.join("\n")));

  const base = {
    line,
    id: attrs.id ?? "",
    points: attrs.points,
    tags: attrs.tags,
    source: attrs.source,
    graded,
    shuffle: attrs.shuffle,
    partial: attrs.partial,
    case: attrs.case,
    ignore: attrs.ignore ? { line, ...attrs.ignore } : null,
    prompt,
    hint,
    explanation,
    hash,
  };

  switch (type ?? "single") {
    case "multi":
    case "single": {
      const kind = type === "multi" ? "multi" : "single";
      if (type && choices.length < 2) {
        r.error(
          "choice.count",
          line,
          "a choice question needs at least two choices",
          "write each choice as - [ ] text, with - [x] for the right one",
        );
      } else if (type && graded) {
        const correct = choices.filter((c) => c.correct).length;
        if (kind === "single" && correct !== 1) {
          r.error(
            "choice.correct-count",
            line,
            `a single-answer question needs exactly one [x], not ${correct}`,
            "mark one choice, or use type=multi",
          );
        } else if (kind === "multi" && correct === 0) {
          r.error(
            "choice.correct-count",
            line,
            "a multiple-answer question needs at least one [x]",
            "mark the right choices",
          );
        }
      }
      return { ...base, type: kind, choices };
    }
    case "truefalse":
      return { ...base, type: "truefalse", value: src ? parseTrueFalse(src, env) : false };
    case "numeric":
      return {
        ...base,
        type: "numeric",
        key: src ? parseNumeric(src, env) : { values: [], raw: [], tolerance: 0, relTolerance: null, unit: "" },
      };
    case "short":
      return { ...base, type: "short", key: src ? parseShort(src, env) : { accept: [], patterns: [] } };
    case "blanks":
      return { ...base, type: "blanks", blanks };
    case "fields":
      return { ...base, type: "fields", fields: src ? parseFields(src, env) : [] };
    case "ordering":
      return { ...base, type: "ordering", items: parseOrdering(lines, answerList?.items ?? null, line, r) };
    case "matching":
      return { ...base, type: "matching", ...parseMatching(lines, answerList?.items ?? null, line, r) };
    case "essay":
      return {
        ...base,
        type: "essay",
        ...(src
          ? parseEssay(src, env)
          : { minWords: null, maxWords: null, rubric: null, sampleAnswer: null, showRubric: true }),
      };
    case "code":
      return {
        ...base,
        type: "code",
        ...(src
          ? parseCode(src, env)
          : { language: "", starter: null, rubric: null, sampleAnswer: null, showRubric: true }),
      };
    case "scale":
      return { ...base, type: "scale", ...(src ? parseScale(src, env) : { min: 1, max: 5, labels: [] }) };
  }
}
