import { type Brief, BriefSchema, CONTENT_KINDS, MIX_KINDS, type PURPOSES } from "../ir";

/**
 * The text of a `brief.yaml` (COMMANDS.md, `quiz brief`, "The file"). One pure function: the answers, each marked with
 * who chose it, in; the YAML out. Every key is always written, in the file table's order, with `decided_by` for each,
 * and the same answers give the same bytes however they were collected (flags, `--web`, `--tui`). The lists are put
 * in the question file's order, so `--kinds notes,textbook` and `--kinds textbook,notes` are one answer.
 */

export type Decider = "user" | "default" | "agent";
export type Answer<T> = { value: T; by: Decider };
export type Purpose = (typeof PURPOSES)[number];
export type ContentKind = (typeof CONTENT_KINDS)[number];
export type MixKind = (typeof MIX_KINDS)[number];

export type BriefAnswers = {
  purpose: Answer<Purpose>;
  scope: Answer<string>;
  kinds: Answer<readonly ContentKind[]>;
  kindsOther: Answer<string>;
  elsewhere: Answer<string>;
  count: Answer<number>;
  minutes: Answer<number>;
  mix: Answer<readonly MixKind[]>;
  difficulty: Answer<Brief["difficulty"]>;
  mode: Answer<Brief["mode"]>;
  language: Answer<Brief["language"]>;
  request: Answer<string>;
  weakTopics: Answer<boolean>;
  commitment: Answer<number>;
  /** left out, the profile follows the purpose (recorded as a default) */
  profile?: Answer<string>;
};

/** The check profile each purpose gives (TECHNICAL_DESIGN.md section 5). The question file's defaults say the same. */
export const PROFILE_OF_PURPOSE: Readonly<Record<Purpose, string>> = {
  "self-study": "default",
  "exam-prep": "exam",
  classmates: "default",
  survey: "survey",
};

const RANK: Record<Decider, number> = { default: 0, agent: 1, user: 2 };

/** One decider for several answers that make one key: the user's word beats the agent's, which beats a default. */
const strongest = (...answers: Answer<unknown>[]): Decider =>
  answers.reduce<Decider>((best, a) => (RANK[a.by] > RANK[best] ? a.by : best), "default");

const inOrder = <T extends string>(all: readonly T[], chosen: readonly T[]): T[] =>
  all.filter((x) => chosen.includes(x));

/** The brief these answers make. Throws when a value is not one the schema accepts: the callers check theirs first. */
export function briefOf(a: BriefAnswers): Brief {
  const profile = a.profile ?? { value: PROFILE_OF_PURPOSE[a.purpose.value], by: "default" as const };
  return BriefSchema.parse({
    purpose: a.purpose.value,
    scope: a.scope.value,
    content: {
      kinds: inOrder(CONTENT_KINDS, a.kinds.value),
      kinds_other: a.kindsOther.value,
      elsewhere: a.elsewhere.value,
    },
    count: a.count.value,
    minutes: a.minutes.value,
    mix: inOrder(MIX_KINDS, a.mix.value),
    difficulty: a.difficulty.value,
    mode: a.mode.value,
    language: a.language.value,
    request: a.request.value,
    weak_topics: a.weakTopics.value,
    commitment: a.commitment.value,
    // `quiz brief` reads no history, so it never fills the focus tags (COMMANDS.md, "Also")
    focus_tags: [],
    profile: profile.value,
    decided_by: {
      purpose: a.purpose.by,
      scope: a.scope.by,
      content: strongest(a.kinds, a.kindsOther, a.elsewhere),
      count: a.count.by,
      minutes: a.minutes.by,
      mix: a.mix.by,
      difficulty: a.difficulty.by,
      mode: a.mode.by,
      language: a.language.by,
      request: a.request.by,
      weak_topics: a.weakTopics.by,
      commitment: a.commitment.by,
      focus_tags: "default",
      profile: profile.by,
    },
  });
}

/** A double-quoted YAML string. JSON's escapes are YAML's; the line separators JSON leaves raw are escaped too. */
const RAW_BREAKS = new RegExp(`[${["0085", "2028", "2029", "FEFF"].map((h) => `\\u${h}`).join("")}]`, "g");
const quoted = (s: string): string =>
  JSON.stringify(s).replace(RAW_BREAKS, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

/** A value from a closed list (`self-study`, `en`, `user`): a plain scalar that no YAML reader takes for another type. */
const word = (s: string): string =>
  /^[a-z][a-z-]*$/.test(s) && !["yes", "no", "true", "false", "null", "on", "off"].includes(s) ? s : quoted(s);

function list(key: string, items: readonly string[], indent: string, show: (s: string) => string = word): string[] {
  return items.length === 0
    ? [`${indent}${key}: []`]
    : [`${indent}${key}:`, ...items.map((x) => `${indent}  - ${show(x)}`)];
}

/** The YAML text of a brief: every key, in the file table's order. */
export function emitBrief(b: Brief): string {
  const out: string[] = [
    `purpose: ${word(b.purpose)}`,
    `scope: ${quoted(b.scope)}`,
    "content:",
    ...list("kinds", b.content.kinds, "  "),
    `  kinds_other: ${quoted(b.content.kinds_other)}`,
    `  elsewhere: ${quoted(b.content.elsewhere)}`,
    `count: ${b.count}`,
    `minutes: ${b.minutes}`,
    ...list("mix", b.mix, ""),
    `difficulty: ${word(b.difficulty)}`,
    `mode: ${word(b.mode)}`,
    `language: ${word(b.language)}`,
    `request: ${quoted(b.request)}`,
    `weak_topics: ${b.weak_topics}`,
    `commitment: ${b.commitment}`,
    ...list("focus_tags", b.focus_tags, "", quoted),
    `profile: ${quoted(b.profile)}`,
    "decided_by:",
  ];
  const by = b.decided_by;
  for (const key of [
    "purpose",
    "scope",
    "content",
    "count",
    "minutes",
    "mix",
    "difficulty",
    "mode",
    "language",
    "request",
    "weak_topics",
    "commitment",
    "focus_tags",
    "profile",
  ])
    out.push(`  ${key}: ${by[key]}`);
  return `${out.join("\n")}\n`;
}

/** The `brief.yaml` these answers make. */
export const writeBrief = (answers: BriefAnswers): string => emitBrief(briefOf(answers));
