import { QUESTION_TYPES, type QuestionType } from "../ir";
import { readDuration, readNumber } from "../number";
import { ID_FORMAT } from "../slug";
import type { AttrPair } from "./attributes";
import type { HeadingParts } from "./heading";
import { type Reporter, unknownKey } from "./report";

export const QUESTION_ATTRS = [
  "type",
  "points",
  "tags",
  "id",
  "source",
  "graded",
  "shuffle",
  "partial",
  "case",
  "check-ignore",
  "because",
] as const;
export const SECTION_ATTRS = ["id", "time", "pick"] as const;

/**
 * The pairs of a heading's attribute block, checked for what every heading shares: the block parses
 * (`syntax.attributes`), no name twice, no unknown name (`syntax.unknown-key`), no bare name but `input` (which is
 * for choices only: `choice.input`). Returns the first pair of each name, or null when the block does not parse.
 */
export function readPairs(
  parts: HeadingParts,
  line: number,
  allowed: readonly string[],
  r: Reporter,
): Map<string, AttrPair> | null {
  const block = parts.block;
  if (!block) return new Map();
  if (!block.ok) {
    r.error(
      "syntax.attributes",
      line,
      `the {…} block at the end of the heading does not parse: ${block.reason}`,
      'quote a value that holds spaces, =, { } or "; escape a literal { as \\{',
    );
    return null;
  }
  const pairs = new Map<string, AttrPair>();
  for (const p of block.pairs) {
    if (p.name === "input" && p.value === null) {
      r.error(
        "choice.input",
        line,
        "`{input}` goes at the end of a choice, not on a heading",
        "move it to the end of the choice it belongs to",
      );
    } else if (pairs.has(p.name)) {
      r.error("syntax.attributes", line, `\`${p.name}\` is given twice in the {…} block`, `keep one \`${p.name}\``);
    } else if (!allowed.includes(p.name)) {
      const u = unknownKey("attribute", p.name, allowed);
      r.error("syntax.unknown-key", line, u.message, u.fix);
    } else if (p.value === null) {
      r.error("syntax.attributes", line, `\`${p.name}\` needs a value: ${p.name}=...`);
    } else {
      pairs.set(p.name, p);
    }
  }
  return pairs;
}

export type QuestionAttrs = {
  type: QuestionType | null;
  id: string | null;
  points: number;
  pointsGiven: boolean;
  tags: string[];
  source: string | null;
  /** the `graded=` value as given, null when absent */
  gradedGiven: boolean | null;
  shuffle: boolean | null;
  partial: boolean | null;
  case: "sensitive" | "insensitive";
  ignore: { rules: string[]; because: string | null } | null;
};

function boolean(p: AttrPair | undefined, line: number, r: Reporter): boolean | null {
  if (!p) return null;
  if (p.value === "true") return true;
  if (p.value === "false") return false;
  r.error("syntax.value", line, `\`${p.name}\` must be true or false, not "${p.value}"`);
  return null;
}

/** Reads and checks the attributes of a question heading. `pairs` is null when the block did not parse. */
export function readQuestionAttrs(
  pairs: Map<string, AttrPair> | null,
  line: number,
  r: Reporter,
  survey: boolean,
): QuestionAttrs & { blockFailed: boolean } {
  const out: QuestionAttrs & { blockFailed: boolean } = {
    type: null,
    id: null,
    points: 1,
    pointsGiven: false,
    tags: [],
    source: null,
    gradedGiven: null,
    shuffle: null,
    partial: null,
    case: "insensitive",
    ignore: null,
    blockFailed: pairs === null,
  };
  if (pairs === null) return out;

  const type = pairs.get("type");
  if (!type) {
    r.error(
      "question.type-missing",
      line,
      "the question has no `type`",
      `add type=... : one of ${QUESTION_TYPES.join(", ")}`,
    );
  } else if ((QUESTION_TYPES as readonly string[]).includes(type.value ?? "")) {
    out.type = type.value as QuestionType;
  } else {
    r.error("syntax.value", line, `unknown type "${type.value}"`, `the types are: ${QUESTION_TYPES.join(", ")}`);
  }

  const id = pairs.get("id");
  if (!id) {
    r.error("question.id-missing", line, "the question has no `id`", "run: quiz ids FILE");
  } else if (!ID_FORMAT.test(id.value ?? "")) {
    r.error(
      "question.id-format",
      line,
      `"${id.value}" is not a valid id`,
      "use lower-case letters, digits and -, starting with a letter, at most 64 characters",
    );
  } else {
    out.id = id.value;
  }

  const points = pairs.get("points");
  if (points) {
    const n = readNumber(points.value ?? "");
    if (n === null || n <= 0)
      r.error("syntax.value", line, `\`points\` must be a number above 0, not "${points.value}"`);
    else {
      out.points = n;
      out.pointsGiven = true;
    }
  }
  const tags = pairs.get("tags");
  if (tags) {
    const list = (tags.value ?? "").split(",");
    if (list.some((t) => t === "" || /\s/.test(t))) {
      r.error("syntax.value", line, "`tags` are comma-separated with no spaces: tags=a,b");
    } else {
      out.tags = list;
    }
  }
  const source = pairs.get("source");
  if (source) out.source = source.value;

  const graded = pairs.get("graded");
  out.gradedGiven = boolean(graded, line, r);
  if (graded && survey) {
    r.error(
      "survey.forbidden",
      line,
      "`graded=` is not allowed in a survey: every question is ungraded",
      "remove graded",
    );
  }
  out.shuffle = boolean(pairs.get("shuffle"), line, r);
  out.partial = boolean(pairs.get("partial"), line, r);
  if (pairs.has("partial") && survey) {
    r.error("survey.forbidden", line, "`partial` is not allowed in a survey", "remove partial");
  }
  const kase = pairs.get("case");
  if (kase) {
    if (kase.value === "sensitive" || kase.value === "insensitive") out.case = kase.value;
    else r.error("syntax.value", line, "`case` must be sensitive or insensitive");
  }
  const ignore = pairs.get("check-ignore");
  const because = pairs.get("because");
  if (ignore || because) {
    out.ignore = {
      rules: (ignore?.value ?? "").split(",").filter((s) => s !== ""),
      because: because?.value ?? null,
    };
  }
  return out;
}

export type SectionAttrs = { id: string | null; time: number | null; pick: number | null };

/** Reads and checks the attributes of a section heading. */
export function readSectionAttrs(
  pairs: Map<string, AttrPair> | null,
  line: number,
  r: Reporter,
  survey: boolean,
): SectionAttrs {
  const out: SectionAttrs = { id: null, time: null, pick: null };
  if (pairs === null) return out;
  const id = pairs.get("id");
  if (id) {
    if (/^[a-z0-9][a-z0-9-]*$/.test(id.value ?? "")) out.id = id.value;
    else
      r.error("syntax.value", line, `"${id.value}" is not a valid section id`, "use lower-case letters, digits and -");
  }
  const time = pairs.get("time");
  if (time) {
    const s = readDuration(time.value ?? "");
    if (s === null)
      r.error("syntax.value", line, `\`time\` must be a duration such as 90s, 10m or 1h30m, not "${time.value}"`);
    else out.time = s;
  }
  const pick = pairs.get("pick");
  if (pick) {
    const n = readNumber(pick.value ?? "");
    if (survey) r.error("survey.forbidden", line, "`pick` is not allowed in a survey", "remove pick");
    else if (n === null || !Number.isInteger(n))
      r.error("syntax.value", line, `\`pick\` must be a whole number, not "${pick.value}"`);
    else out.pick = n;
  }
  return out;
}
