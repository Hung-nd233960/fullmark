import { isMap, isScalar, isSeq, LineCounter, type Node, parseDocument, type YAMLMap, type YAMLSeq } from "yaml";

/**
 * YAML with positions. `firstLine` is the file line (1-based) of the text's first line, so every line reported
 * here is the line in the quiz file. Alias expansion is capped (TECHNICAL_DESIGN.md, foundation 3).
 */
export type YamlRoot = {
  node: Node | null;
  errors: { line: number; message: string }[];
  lineOf(node: { range?: [number, number, number] | null } | null | undefined): number;
};

export function parseYaml(text: string, firstLine: number): YamlRoot {
  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter, uniqueKeys: true, prettyErrors: false });
  const end = text.trimEnd().length;
  const at = (offset: number) => firstLine + counter.linePos(offset).line - 1;
  return {
    node: doc.contents as Node | null,
    errors: doc.errors.map((e) => ({
      // An error at the very end of the text is on the last line that has text, not on the line after it.
      line: e.pos?.[0] !== undefined ? at(Math.min(e.pos[0], Math.max(0, end - 1))) : firstLine,
      message: e.message.split("\n")[0] ?? e.message,
    })),
    lineOf: (node) => (node?.range ? at(node.range[0]) : firstLine),
  };
}

/** A key of a YAML mapping, with the line of the key and its value node. */
export type Entry = { key: string; line: number; value: Node | null };

export function entriesOf(root: YamlRoot, map: YAMLMap): Entry[] {
  return map.items.map((pair) => ({
    key: isScalar(pair.key) ? String(pair.key.value) : String(pair.key),
    line: root.lineOf(pair.key as Node),
    value: pair.value as Node | null,
  }));
}

export function asMap(node: Node | null): YAMLMap | null {
  return isMap(node) ? (node as YAMLMap) : null;
}

export function asSeq(node: Node | null): YAMLSeq | null {
  return isSeq(node) ? (node as YAMLSeq) : null;
}

/** A scalar's text as written: a number keeps its spelling (`1e-3`, `0.50`). Null for a collection or an empty value. */
export function scalarText(node: Node | null): string | null {
  if (!isScalar(node)) return null;
  const v = node.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return typeof node.source === "string" ? node.source : String(v);
  return String(v);
}

export function isString(node: Node | null): boolean {
  return isScalar(node) && typeof node.value === "string";
}

export function isBoolean(node: Node | null): boolean {
  return isScalar(node) && typeof node.value === "boolean";
}

export function isNumber(node: Node | null): boolean {
  return isScalar(node) && typeof node.value === "number";
}

export function boolValue(node: Node | null): boolean | null {
  return isScalar(node) && typeof node.value === "boolean" ? node.value : null;
}
