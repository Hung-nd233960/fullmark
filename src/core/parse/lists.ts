import type { Choice } from "../ir";
import { findTrailingBlock } from "./attributes";
import type { ListItem } from "./outline";
import type { Reporter } from "./report";
import { parseTaskMarker } from "./task-list";

/** A list item with its marker removed: the text of its first line, all its text, and its 1-based line. */
export type ItemText = { line: number; first: string; text: string };

/** Takes the marker off an item and removes the item's indentation from its continuation lines. */
export function itemText(lines: readonly string[], item: ListItem): ItemText {
  const head = lines[item.start] ?? "";
  const prefix = /^\s*(?:[-*+]|\d+[.)])[ \t]{0,4}/.exec(head)?.[0] ?? "";
  const first = head.slice(prefix.length);
  const rest = lines
    .slice(item.start + 1, item.end)
    .map((l) => l.slice(Math.min(prefix.length, /^ */.exec(l)?.[0].length ?? 0)));
  while (rest.length > 0 && rest[rest.length - 1]?.trim() === "") rest.pop();
  return { line: item.start + 1, first, text: [first, ...rest].join("\n") };
}

export type ChoiceInput =
  | { kind: "none" }
  | { kind: "ok"; prompt: string | null; before: string }
  | { kind: "error"; rule: "choice.input" | "syntax.attributes"; message: string; fix?: string };

/**
 * The `{input}` block at the end of a choice's first line. Only a trailing block that starts with `input` is one;
 * any other trailing braces are text. Forms: `{input}` and `{input="a prompt"}`. An unquoted or empty prompt is
 * `choice.input`; a quote that never closes is `syntax.attributes`.
 */
export function parseChoiceInput(line: string): ChoiceInput {
  const block = findTrailingBlock(line);
  if (!block) return { kind: "none" };
  const inner = line.slice(block.inner[0], block.inner[1]).trim();
  if (!/^input(?![A-Za-z0-9_-])/.test(inner)) return { kind: "none" };
  if (inner === "input") return { kind: "ok", prompt: null, before: block.before };
  const rest = /^input\s*=\s*(.*)$/s.exec(inner)?.[1];
  if (rest === undefined) {
    return {
      kind: "error",
      rule: "choice.input",
      message: '`{input}` takes no other text: write {input} or {input="a prompt"}',
    };
  }
  if (rest.startsWith('"')) {
    const m = /^"((?:[^"\\]|\\.)*)"$/s.exec(rest);
    if (!m) {
      const closed = /^"(?:[^"\\]|\\.)*"/s.test(rest);
      return closed
        ? { kind: "error", rule: "choice.input", message: "nothing may follow the quoted prompt of `{input=…}`" }
        : { kind: "error", rule: "syntax.attributes", message: "the quote opened after `input=` is never closed" };
    }
    const prompt = (m[1] ?? "").replace(/\\(["\\])/g, "$1");
    if (prompt.trim() === "") {
      return {
        kind: "error",
        rule: "choice.input",
        message: 'the prompt of `{input=""}` is empty',
        fix: "write {input} for no prompt, or give it text",
      };
    }
    return { kind: "ok", prompt, before: block.before };
  }
  return {
    kind: "error",
    rule: "choice.input",
    message: "the prompt of `{input=…}` must be in double quotes",
    fix: 'write {input="What is it?"}',
  };
}

/** Parses the items of a `single` or `multi` list. `graded` decides whether `[x]` counts. */
export function parseChoices(
  lines: readonly string[],
  items: readonly ListItem[],
  graded: boolean,
  r: Reporter,
  limits: Map<number, number>,
): Choice[] {
  return items.map((item) => {
    const t = itemText(lines, item);
    const marker = parseTaskMarker(t.text);
    if (!marker) {
      r.error("choice.marker", t.line, "a choice needs [ ] or [x] before its text", "write - [ ] text or - [x] text");
    }
    const rest = marker ? marker.rest : t.text;
    if (marker?.checked && !graded) {
      r.error(
        "question.ungraded-key",
        t.line,
        "an ungraded question has no correct choice: [x] is not allowed",
        "use [ ]",
      );
    }
    // `{input}` belongs to the first line of the choice.
    const firstLine = rest.split("\n")[0] ?? "";
    const input = parseChoiceInput(firstLine);
    let text = rest;
    let choiceInput: Choice["input"] = null;
    if (input.kind === "error") {
      r.error(input.rule, t.line, input.message, input.fix);
      limits.set(item.start, 0);
    } else if (input.kind === "ok") {
      choiceInput = { prompt: input.prompt };
      text = [input.before, ...rest.split("\n").slice(1)].join("\n");
      const offset = (lines[item.start] ?? "").length - firstLine.length;
      limits.set(item.start, offset + input.before.length);
    }
    return { line: t.line, text: text.trim(), correct: Boolean(marker?.checked) && graded, input: choiceInput };
  });
}
