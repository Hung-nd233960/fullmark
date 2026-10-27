import type { Reporter } from "../report";
import { parseYaml } from "../yaml-view";
import { type MapSource, mapSource } from "./source";

/** A fenced `answer` block: where its YAML text starts, and the text. */
export type AnswerBlock = { fenceLine: number; contentLine: number; content: string };

/**
 * Parses the YAML of an `answer` block. Returns null, with `syntax.yaml` reported, when it does not parse or is
 * not a mapping, so that no other rule runs on a block we cannot read. An empty block is an empty mapping.
 */
export function readAnswerBlock(block: AnswerBlock, r: Reporter): MapSource | null {
  const root = parseYaml(block.content, block.contentLine);
  const first = root.errors[0];
  if (first) {
    r.error("syntax.yaml", first.line, `the answer block is not valid YAML: ${first.message}`);
    return null;
  }
  if (root.node === null) return { root, entries: [], get: () => undefined };
  const src = mapSource(root, root.node);
  if (!src) {
    r.error("syntax.yaml", block.contentLine, "the answer block must be a list of key: value lines");
    return null;
  }
  return src;
}
