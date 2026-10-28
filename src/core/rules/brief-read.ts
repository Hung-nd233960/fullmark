import { type Brief, BriefSchema } from "../ir";
import type { Issue } from "../issue";
import { suggest } from "../parse/report";
import { asMap, asSeq, parseYaml, type YamlRoot } from "../parse/yaml-view";

export type BriefRead = { brief: Brief | null; issues: Issue[] };

/**
 * Reads the text of a `brief.yaml`. Anything wrong is a `brief.invalid` finding with the line of the offending key
 * (the level is the profile's to set), and the quiz is then simply not held against it. Pure: the CLI reads the file.
 */
export function readBrief(text: string, file: string): BriefRead {
  const bad = (
    line: number,
    message: string,
    fix = "fix brief.yaml: `quiz brief` writes it, and can write it again",
  ): BriefRead => ({
    brief: null,
    issues: [
      {
        rule: "brief.invalid",
        level: "warning",
        file,
        line,
        message: `${message}, so the quiz was not held against it`,
        fix,
      },
    ],
  });
  const yaml = parseYaml(text, 1);
  const first = yaml.errors[0];
  if (first) return bad(first.line, `brief.yaml is not valid YAML: ${first.message}`);
  const node = yaml.node;
  if (node === null) return bad(1, "brief.yaml is empty: it holds every key, and `quiz brief` writes them");
  if (!asMap(node)) return bad(1, "brief.yaml must be a mapping of keys to values");

  const raw: unknown = node.toJSON();
  const parsed = BriefSchema.safeParse(raw);
  if (parsed.success) return { brief: parsed.data, issues: [] };

  const issues: Issue[] = [];
  for (const e of parsed.error.issues) {
    if (e.code === "unrecognized_keys") {
      for (const name of e.keys) {
        const known = knownKeys(e.path);
        const near = suggest(name, known);
        const at = [...e.path, name];
        issues.push(
          bad(
            lineOfPath(yaml, at, true),
            `brief.yaml has an unknown key \`${name}\``,
            near ? `did you mean \`${near}\`?` : `the keys are: ${known.join(", ")}`,
          ).issues[0] as Issue,
        );
      }
    } else if (valueAt(raw, e.path) === undefined) {
      // a missing key is reported at the mapping that should hold it
      const path = e.path.map(String);
      issues.push(
        bad(
          lineOfPath(yaml, path.slice(0, -1), false, true),
          `brief.yaml has no \`${path.join(".")}\`: it holds every key`,
          "add the key: `quiz brief` writes them all, and can write the file again",
        ).issues[0] as Issue,
      );
    } else {
      const path = e.path.map(String);
      issues.push(
        bad(lineOfPath(yaml, path, false), `\`${path.join(".") || "brief"}\` in brief.yaml: ${e.message}`)
          .issues[0] as Issue,
      );
    }
  }
  return { brief: null, issues };
}

function knownKeys(path: PropertyKey[]): string[] {
  return path.length === 0 ? Object.keys(BriefSchema.shape) : ["kinds", "kinds_other", "elsewhere"];
}

/** The line of a key (or of the value at `path`), falling back to the longest prefix found, then to line 1. */
function lineOfPath(root: YamlRoot, path: readonly PropertyKey[], keyOnly: boolean, mapping = false): number {
  let node: unknown = root.node;
  let line = 1;
  for (const [i, part] of path.entries()) {
    const map = asMap(node as never);
    const seq = asSeq(node as never);
    if (map) {
      const pair = map.items.find((p) => String((p.key as { value?: unknown })?.value ?? p.key) === String(part));
      if (!pair) break;
      line = root.lineOf(pair.key as never);
      node = pair.value;
      if (keyOnly && i === path.length - 1) break;
    } else if (seq) {
      const item = seq.items[Number(part)];
      if (!item) break;
      line = root.lineOf(item as never);
      node = item;
    } else break;
  }
  // a missing key belongs to its mapping: the line of the mapping's first key (line 1 for the file itself)
  if (mapping) {
    const first = asMap(node as never)?.items[0];
    if (first) return root.lineOf(first.key as never);
  }
  return line;
}

function valueAt(value: unknown, path: readonly PropertyKey[]): unknown {
  let at = value;
  for (const part of path) {
    if (at === null || typeof at !== "object") return undefined;
    at = (at as Record<PropertyKey, unknown>)[part];
  }
  return at;
}
