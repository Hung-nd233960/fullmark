import { analyseHeading } from "./parse/heading";
import { outline } from "./parse/outline";

/** A place in a file where `quiz ids` writes an id. `offset` is a column in the line (after any BOM on line 1). */
export type IdInsertion = {
  /** 1-based line of the question heading */
  line: number;
  /** column in the line's text where the insertion goes */
  column: number;
  /** `join`: the id is added inside the heading's block; `block`: a new block is added */
  form: "join" | "first" | "block";
};

export type IdProblem = { rule: "question.id-duplicate" | "syntax.attributes"; line: number; message: string };

export type IdPlan = {
  /** question headings with no id, in file order */
  missing: IdInsertion[];
  /** every id already in the file: questions, and sections that name one */
  used: Set<string>;
  /** a duplicate id, or a heading whose `{…}` block does not parse; with any, the file is not to be touched */
  problems: IdProblem[];
};

/**
 * Finds the question headings that lack an `id` (QUIZ_SYNTAX.md, "Ids"). It reads headings the way the parser does
 * and nothing else, so it works on a quiz that has other errors. Pure: the random ids come from the caller.
 */
export function planIds(text: string): IdPlan {
  const o = outline(text);
  const plan: IdPlan = { missing: [], used: new Set(), problems: [] };
  const seen = new Map<string, number>();
  for (const u of o.units) {
    if (u.kind !== "heading" || u.level > 2) continue;
    const raw = o.lines[u.start] ?? "";
    const parts = analyseHeading(raw);
    if (!parts) continue;
    const line = u.start + 1;
    const block = parts.block;
    if (block && !block.ok) {
      plan.problems.push({
        rule: "syntax.attributes",
        line,
        message: `the {…} block at the end of the heading does not parse: ${block.reason}`,
      });
      continue;
    }
    const idPair = block?.pairs.find((p) => p.name === "id");
    if (u.level === 1) {
      if (idPair?.value) plan.used.add(idPair.value);
      continue;
    }
    if (idPair) {
      const id = idPair.value ?? "";
      const first = seen.get(id);
      if (first !== undefined) {
        plan.problems.push({
          rule: "question.id-duplicate",
          line,
          message: `the id "${id}" is already used on line ${first}`,
        });
      } else {
        seen.set(id, line);
      }
      plan.used.add(id);
    } else if (block) {
      const last = block.pairs.at(-1);
      plan.missing.push({ line, column: last ? last.end : block.inner[0], form: last ? "join" : "first" });
    } else {
      plan.missing.push({ line, column: raw.replace(/\s+$/, "").length, form: "block" });
    }
  }
  return plan;
}

/** The text written for one insertion. */
function insertionText(form: IdInsertion["form"], id: string): string {
  return form === "join" ? ` id=${id}` : form === "first" ? `id=${id}` : ` {id=${id}}`;
}

/**
 * Writes the ids into the raw text: `ids[i]` goes at `missing[i]`. Nothing else is touched, byte for byte, so
 * the line endings (CRLF included) and a BOM stay as they are.
 */
export function applyIds(text: string, missing: readonly IdInsertion[], ids: readonly string[]): string {
  const starts: number[] = [];
  const bom = text.startsWith("﻿") ? 1 : 0;
  starts.push(bom);
  for (let i = bom; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") starts.push(i + 1);
    else if (c === "\r") {
      if (text[i + 1] === "\n") i++;
      starts.push(i + 1);
    }
  }
  const edits = missing.map((m, i) => ({
    at: (starts[m.line - 1] ?? 0) + m.column,
    text: insertionText(m.form, ids[i] ?? ""),
  }));
  edits.sort((a, b) => b.at - a.at);
  let out = text;
  for (const e of edits) out = out.slice(0, e.at) + e.text + out.slice(e.at);
  return out;
}
