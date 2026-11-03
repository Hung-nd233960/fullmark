import type { Node } from "yaml";
import { DEFAULT_TYPE_ORDER, FONTS, type FrontMatter, QUESTION_TYPES, THEMES } from "../ir";
import { readDuration, readNumber } from "../number";
import { ID_FORMAT, slug } from "../slug";
import type { Outline } from "./outline";
import { type Reporter, unknownKey } from "./report";
import { asMap, asSeq, boolValue, type Entry, entriesOf, parseYaml, scalarText, type YamlRoot } from "./yaml-view";

const KEYS = [
  "title",
  "description",
  "id",
  "kind",
  "lang",
  "ui_lang",
  "profile",
  "time_limit",
  "feedback",
  "pass_mark",
  "shuffle_questions",
  "shuffle_choices",
  "type_order",
  "partial",
  "theme",
  "font",
  "look",
  "tags",
  "materials",
  "generated_by",
] as const;

export function defaultFrontMatter(file: string): FrontMatter {
  const name = file.split(/[\\/]/).pop() ?? file;
  return {
    title: "",
    description: null,
    id: slug(name.replace(/\.[^.]*$/, "")),
    kind: "quiz",
    lang: "en",
    uiLang: "en",
    profile: "default",
    profileGiven: false,
    profileLine: null,
    timeLimit: null,
    feedback: "end",
    passMark: null,
    shuffleQuestions: false,
    shuffleChoices: false,
    typeOrder: "none",
    typeOrderGroups: DEFAULT_TYPE_ORDER.map((g) => [...g]),
    partial: true,
    theme: "auto",
    font: "system",
    look: "free",
    tags: [],
    materials: [],
    generatedBy: null,
    keyLines: {},
  };
}

const TYPE_ORDER_MODES = ["none", "by-section", "by-quiz"] as const;

/** `type_order`: a mode, or `{ by, order }` with the quiz's own groups (QUIZ_SYNTAX.md, section 2). */
function typeOrder(e: Entry, root: YamlRoot, fm: FrontMatter, r: Reporter): void {
  const err = (line: number, expected: string) => r.error("syntax.value", line, `\`type_order\` ${expected}`);
  const modes = `must be one of ${TYPE_ORDER_MODES.join(", ")}`;
  const mode = (v: string | null): FrontMatter["typeOrder"] | undefined =>
    v !== null && (TYPE_ORDER_MODES as readonly string[]).includes(v) ? (v as FrontMatter["typeOrder"]) : undefined;
  const map = asMap(e.value);
  if (!map) {
    const m = mode(scalarText(e.value));
    if (m === undefined) err(e.line, `${modes}, or a list with \`by\` and \`order\``);
    else fm.typeOrder = m;
    return;
  }
  let by: FrontMatter["typeOrder"] | undefined;
  let order: string[][] | undefined;
  let ok = true;
  for (const item of map.items) {
    const key = scalarText(item.key as Node | null) ?? "";
    const line = root.lineOf(item.key as Node);
    if (key === "by") {
      by = mode(scalarText(item.value as Node | null));
      if (by === undefined) {
        ok = false;
        err(line, `\`by\` ${modes}`);
      }
    } else if (key === "order") {
      const seq = asSeq(item.value as Node | null);
      const groups: string[][] = [];
      const used = new Set<string>();
      let good = seq !== null && seq.items.length > 0;
      if (!good) err(line, "`order` must be a list of types and groups of types");
      for (const g of seq?.items ?? []) {
        const names = asSeq(g as Node | null)
          ? (asSeq(g as Node | null)?.items ?? []).map((n) => scalarText(n as Node | null))
          : [scalarText(g as Node | null)];
        if (names.length === 0 || names.some((n) => n === null)) {
          good = false;
          err(line, "`order` must be a list of types and groups of types");
          continue;
        }
        for (const n of names as string[]) {
          if (!(QUESTION_TYPES as readonly string[]).includes(n)) {
            good = false;
            err(line, `\`order\` names an unknown type \`${n}\``);
          } else if (used.has(n)) {
            good = false;
            err(line, `\`order\` names \`${n}\` in two places`);
          }
          used.add(n);
        }
        groups.push(names as string[]);
      }
      if (good) order = groups;
      else ok = false;
    } else {
      const u = unknownKey("type_order key", key, ["by", "order"]);
      r.error("syntax.unknown-key", line, u.message, u.fix);
      ok = false;
    }
  }
  if (by === undefined && ok) {
    err(e.line, "needs `by` when it gives an `order`");
    return;
  }
  if (by !== undefined && ok) {
    fm.typeOrder = by;
    if (order) fm.typeOrderGroups = order;
  }
}

/** Reads and validates the front matter (QUIZ_SYNTAX.md, section 2). Always returns a front matter; problems go to `r`. */
export function parseFrontMatter(o: Outline, file: string, r: Reporter): FrontMatter {
  const fm = defaultFrontMatter(file);
  if (o.frontMatter === "none") {
    r.error(
      "syntax.front-matter",
      1,
      "the file has no front matter",
      "start the file with --- , a title: line and --- . A materials sheet has no front matter: check the quiz that lists it",
    );
    return fm;
  }
  if (o.frontMatter === "unclosed") {
    r.error("syntax.front-matter", 1, "the front matter is never closed", "end it with a line holding only ---");
    return fm;
  }
  const yaml = parseYaml(o.lines.slice(1, o.frontMatter.close).join("\n"), 2);
  if (yaml.errors.length > 0) {
    for (const e of yaml.errors)
      r.error("syntax.front-matter", e.line, `the front matter is not valid YAML: ${e.message}`);
    return fm;
  }
  const map = asMap(yaml.node);
  if (!map) {
    r.error("syntax.front-matter", 1, "the front matter has no title", "add a title: line");
    return fm;
  }

  const seen = new Map<string, Entry>();
  for (const entry of entriesOf(yaml, map)) {
    if (!(KEYS as readonly string[]).includes(entry.key)) {
      const u = unknownKey("front-matter key", entry.key, KEYS);
      r.error("syntax.unknown-key", entry.line, u.message, u.fix);
    } else {
      seen.set(entry.key, entry);
      fm.keyLines[entry.key] = entry.line;
    }
  }

  const bad = (e: Entry, expected: string) =>
    r.error("syntax.value", e.line, `\`${e.key}\` must be ${expected}`) as undefined;
  const oneOf = <T extends string>(e: Entry, allowed: readonly T[]): T | undefined => {
    const v = scalarText(e.value);
    if (v !== null && (allowed as readonly string[]).includes(v)) return v as T;
    return bad(e, `one of ${allowed.join(", ")}`);
  };
  const flag = (e: Entry): boolean | undefined => boolValue(e.value) ?? bad(e, "true or false");
  const text = (e: Entry): string | undefined => scalarText(e.value) ?? bad(e, "text");

  const title = seen.get("title");
  const titleText = title ? text(title) : undefined;
  if (!title) r.error("syntax.front-matter", 1, "the front matter has no title", "add a title: line");
  else if (titleText !== undefined) {
    if (titleText.trim() === "") r.error("syntax.front-matter", title.line, "the title is empty");
    else fm.title = titleText;
  }

  for (const [key, e] of seen) {
    switch (key) {
      case "description": {
        const t = text(e);
        if (t !== undefined) fm.description = t;
        break;
      }
      case "id": {
        const t = text(e);
        if (t !== undefined) {
          if (ID_FORMAT.test(t) || /^[a-z0-9][a-z0-9-]*$/.test(t)) fm.id = t;
          else bad(e, "a slug: lower-case letters, digits and -");
        }
        break;
      }
      case "kind":
        fm.kind = oneOf(e, ["quiz", "survey"] as const) ?? fm.kind;
        break;
      case "lang":
        fm.lang = oneOf(e, ["en", "vi"] as const) ?? fm.lang;
        break;
      case "ui_lang":
        break; // after lang is known
      case "profile":
        {
          const t = text(e);
          if (t !== undefined) {
            fm.profile = t;
            fm.profileGiven = true;
            fm.profileLine = e.line;
          }
        }
        break;
      case "time_limit": {
        const s = readDuration(scalarText(e.value) ?? "");
        if (s === null) bad(e, "a duration such as 90s, 45m or 1h30m");
        else fm.timeLimit = s;
        break;
      }
      case "feedback":
        fm.feedback = oneOf(e, ["end", "instant"] as const) ?? fm.feedback;
        break;
      case "pass_mark": {
        const n = readNumber(scalarText(e.value) ?? "");
        if (n === null || n < 0 || n > 100) bad(e, "a number from 0 to 100");
        else fm.passMark = n;
        break;
      }
      case "shuffle_questions":
        fm.shuffleQuestions = flag(e) ?? fm.shuffleQuestions;
        break;
      case "shuffle_choices":
        fm.shuffleChoices = flag(e) ?? fm.shuffleChoices;
        break;
      case "type_order":
        typeOrder(e, yaml, fm, r);
        break;
      case "partial":
        fm.partial = flag(e) ?? fm.partial;
        break;
      case "theme": {
        const v = scalarText(e.value);
        if (v !== null && (THEMES as readonly string[]).includes(v)) fm.theme = v as FrontMatter["theme"];
        else r.error("theme.unknown", e.line, `unknown theme \`${v ?? ""}\``, `the themes are: ${THEMES.join(", ")}`);
        break;
      }
      case "font": {
        const v = scalarText(e.value);
        if (v !== null && (FONTS as readonly string[]).includes(v)) fm.font = v as FrontMatter["font"];
        else r.error("theme.unknown-font", e.line, `unknown font \`${v ?? ""}\``, `the fonts are: ${FONTS.join(", ")}`);
        break;
      }
      case "look":
        fm.look = oneOf(e, ["free", "locked"] as const) ?? fm.look;
        break;
      case "tags": {
        const seq = asSeq(e.value);
        const items = seq?.items.map((n) => scalarText(n as Node | null)) ?? [];
        if (!seq || items.some((t) => t === null)) bad(e, "a list of text");
        else fm.tags = items as string[];
        break;
      }
      case "materials": {
        const seq = asSeq(e.value);
        const items = seq?.items.map((n) => scalarText(n as Node | null)) ?? [];
        if (!seq || items.some((t) => t === null || t.trim() === "")) bad(e, "a list of file paths");
        else {
          const paths = (items as string[]).map((t) => t.trim());
          const twice = paths.find((t, i) => paths.indexOf(t) !== i);
          if (twice !== undefined) r.error("syntax.value", e.line, `\`materials\` lists "${twice}" twice`);
          else fm.materials = paths;
        }
        break;
      }
      case "generated_by": {
        const t = text(e);
        if (t !== undefined) {
          if (t.trim() === "" || /\n/.test(t.trim())) bad(e, "one line naming the model");
          else fm.generatedBy = t.trim();
        }
        break;
      }
    }
  }
  const ui = seen.get("ui_lang");
  fm.uiLang = (ui ? oneOf(ui, ["en", "vi"] as const) : undefined) ?? fm.lang;
  if (!fm.profileGiven) fm.profile = fm.kind === "survey" ? "survey" : "default";

  if (fm.kind === "survey") {
    const forbid = (key: string, why: string) => {
      const e = seen.get(key);
      if (e) r.error("survey.forbidden", e.line, `\`${why}\` is not allowed in a survey`, `remove ${key}`);
    };
    forbid("pass_mark", "pass_mark");
    forbid("partial", "partial");
    const fb = seen.get("feedback");
    if (fb && scalarText(fb.value) === "instant") {
      r.error("survey.forbidden", fb.line, "`feedback: instant` is not allowed in a survey", "remove feedback");
    }
  }
  return fm;
}
