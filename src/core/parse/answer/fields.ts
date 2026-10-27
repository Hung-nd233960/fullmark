import type { Field } from "../../ir";
import { readNumber } from "../../number";
import { asSeq, scalarText } from "../yaml-view";
import type { AnswerEnv } from "./env";
import { NUMBER_KEYS, readNumberKey, readTextKey, TEXT_KEYS } from "./keys";
import { checkKeys, type MapSource, mapSource } from "./source";

const FAMILY = ["value", "values", "accept", "patterns"];

/** The `fields` of a `fields` question (QUIZ_SYNTAX.md, fields). */
export function parseFields(src: MapSource, env: AnswerEnv): Field[] {
  const { r } = env;
  checkKeys(src, ["fields"], "answer", r);
  const entry = src.get("fields");
  const seq = entry ? asSeq(entry.value) : null;
  if (!seq || seq.items.length === 0) {
    r.error("fields.empty", env.headingLine, "a fields question needs at least one field", "add fields: - label: ...");
    return [];
  }
  const fields: Field[] = [];
  let withKey = 0;
  for (const item of seq.items) {
    const line = src.root.lineOf(item as never);
    const fs = mapSource(src.root, item as never);
    if (!fs) {
      r.error("syntax.value", line, "a field is a mapping with a `label`");
      continue;
    }
    checkKeys(fs, ["label", "points", ...NUMBER_KEYS, ...TEXT_KEYS], "field", r);
    const label = scalarText(fs.get("label")?.value ?? null);
    if (label === null) r.error("syntax.value", line, "a field needs a `label`");

    const given = fs.entries.filter((e) => FAMILY.includes(e.key));
    const numeric = given.some((e) => e.key === "value" || e.key === "values");
    const text = given.some((e) => e.key === "accept" || e.key === "patterns");
    let key: Field["key"] = null;
    if (!env.graded) {
      for (const e of given) {
        r.error("question.ungraded-key", e.line, `an ungraded question takes no \`${e.key}\``, "keep only the label");
      }
    } else if (numeric && text) {
      const first = given[0];
      r.error(
        "fields.key",
        first?.line ?? line,
        "a field takes the keys of a number (value) or of a text (accept), not both",
      );
    } else if (numeric) {
      const k = readNumberKey(fs, r, line);
      if (k) key = { kind: "numeric", ...k };
    } else if (text) {
      key = { kind: "text", ...readTextKey(fs, r) };
    }

    let points: number | null = null;
    const p = fs.get("points");
    if (p) {
      const n = readNumber(scalarText(p.value) ?? "");
      if (n === null || n <= 0) r.error("syntax.value", p.line, "`points` must be a number above 0");
      else if (env.graded && key === null && !numeric && !text) {
        r.error("fields.points", p.line, "a field with no answer key is ungraded and carries no points");
      } else points = n;
    }
    if (numeric || text) withKey++;
    fields.push({ line, label: label ?? "", key, points });
  }

  if (env.graded) {
    const graded = fields.filter((f) => f.key !== null);
    if (withKey === 0 && fields.length > 0) {
      r.error(
        "fields.empty",
        env.headingLine,
        "a graded fields question needs at least one graded field",
        "give a field a `value` or `accept`, or make the question ungraded with graded=false",
      );
    }
    const withPoints = graded.filter((f) => f.points !== null);
    if (withPoints.length > 0 && withPoints.length < graded.length) {
      r.error("fields.points", env.headingLine, "either every graded field has `points` or none does");
    } else if (withPoints.length > 0) {
      const sum = withPoints.reduce((s, f) => s + (f.points ?? 0), 0);
      if (Math.abs(sum - env.points) > 1e-9) {
        r.error(
          "fields.points",
          env.headingLine,
          `the fields' points add up to ${sum}, but the question has ${env.points}`,
        );
      }
    }
  }
  return fields;
}
