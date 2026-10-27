import type { Node } from "yaml";
import type { Reporter } from "../report";
import { unknownKey } from "../report";
import { asMap, type Entry, entriesOf, type YamlRoot } from "../yaml-view";

/** A YAML mapping (an `answer` block or one field of `fields`) with its keys and their lines. */
export type MapSource = {
  root: YamlRoot;
  entries: Entry[];
  get(key: string): Entry | undefined;
};

export function mapSource(root: YamlRoot, node: Node | null): MapSource | null {
  const map = asMap(node);
  if (!map) return null;
  const entries = entriesOf(root, map);
  return { root, entries, get: (key) => entries.find((e) => e.key === key) };
}

/** Reports every key not in `allowed` (`syntax.unknown-key`). */
export function checkKeys(src: MapSource, allowed: readonly string[], what: string, r: Reporter): void {
  for (const e of src.entries) {
    if (!allowed.includes(e.key)) {
      const u = unknownKey(`${what} key`, e.key, allowed);
      r.error("syntax.unknown-key", e.line, u.message, u.fix);
    }
  }
}
