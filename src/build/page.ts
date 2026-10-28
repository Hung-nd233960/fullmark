import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { canonicalJson } from "../core/canonical";
import { en, type Messages, vi } from "../core/i18n";
import type { Question, Quiz, Rubric, Section } from "../core/ir";
import { encodeKey, toBase64 } from "../core/keyblob";
import { planFor } from "../core/plan";
import { App } from "../page/App";
import type { KeyBlob, PageCriterion, PageData, PageItem, PageQuestion, PageQuiz, PageSection } from "../page/data";
import { createStore } from "../page/store";
import { type Asset, createRenderer } from "./render";

/** One quiz to put on a page: the IR the check passed, its hash, and the files it refers to. */
export type BuildQuiz = {
  quiz: Quiz;
  hash: string;
  assets: readonly Asset[];
  /** the materials sheets in the order listed, for the sidebar (2f) and the paper (2k); the page does not use them yet */
  sheets?: readonly { path: string; name: string; source: string }[];
};

export type PageOptions = {
  /** the runtime (`dist/page.js`) and the styles (`dist/page.css`), read by the CLI */
  runtime: string;
  css: string;
  /** an ISO time, written into the generator meta; the CLI reads the clock, never this module */
  builtAt: string;
  version: string;
};

/** A lone `<p>…</p>` loses its paragraph, so a choice is not set apart from its marker. */
const unwrap = (html: string): string => {
  const m = /^<p>([\s\S]*)<\/p>\n?$/.exec(html);
  return m && !(m[1] ?? "").includes("<p>") ? (m[1] ?? "") : html;
};

/** The quiz IR with everything a page shows removed: the key, as the grader needs it (foundation 5). */
function keyOf(quiz: Quiz, explanations: Record<string, string>, samples: Record<string, string>): KeyBlob {
  const sections: Section[] = quiz.sections.map((s) => ({
    ...s,
    intro: "",
    passages: [],
    questions: s.questions.map((q) => {
      const bare = { ...q, prompt: "", hint: null, explanation: null };
      if ("choices" in bare) return { ...bare, choices: bare.choices.map((c) => ({ ...c, text: "" })) };
      if (bare.type === "fields") return { ...bare, fields: bare.fields.map((f) => ({ ...f, label: "" })) };
      if (bare.type === "scale") return { ...bare, labels: bare.labels.map((l) => ({ ...l, text: "" })) };
      if (bare.type === "ordering") return { ...bare, items: bare.items.map((i) => ({ ...i, text: "" })) };
      if (bare.type === "matching") {
        return {
          ...bare,
          pairs: bare.pairs.map((p) => ({ ...p, left: "", right: "" })),
          distractors: bare.distractors.map((d) => ({ ...d, text: "" })),
        };
      }
      // the model answer is shown after Submit, from `samples`; the grader needs only that there is one
      if (bare.type === "essay") return { ...bare, sampleAnswer: bare.sampleAnswer === null ? null : "" };
      if (bare.type === "code") return { ...bare, starter: null, sampleAnswer: bare.sampleAnswer === null ? null : "" };
      return bare;
    }),
  }));
  return { quiz: { ...quiz, file: "", sections }, explanations, samples };
}

type Md = ReturnType<typeof createRenderer>;

const ENTITIES: [string, string][] = [
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&quot;", '"'],
  ["&#39;", "'"],
  ["&amp;", "&"],
];

/** The text of rendered HTML, for an `aria-label` or an `<option>`: tags go, the entities the renderer writes are decoded. */
const plain = (html: string): string =>
  ENTITIES.reduce((text, [entity, char]) => text.replaceAll(entity, char), html.replace(/<[^>]*>/g, "")).trim();

const item = (md: Md, source: string): PageItem => {
  const html = unwrap(md.block(source));
  return { html, label: plain(html) };
};

/** A rubric's criteria as the page lists them before Submit; null when `show_rubric` is false or there are none. */
function criteriaOf(q: { rubric: Rubric | null; showRubric: boolean }, md: Md): PageCriterion[] | null {
  if (!q.showRubric || q.rubric === null || q.rubric.criteria.length === 0) return null;
  return q.rubric.criteria.map((c) => ({ html: unwrap(md.block(c.text)), points: c.points }));
}

/** A model answer as HTML. Code is shown as code, in a fence longer than any run of backticks inside it. */
function sampleHtml(q: Question, md: Md): string | null {
  if ((q.type !== "essay" && q.type !== "code") || q.sampleAnswer === null) return null;
  if (q.type === "essay") return md.block(q.sampleAnswer);
  const longest = Math.max(2, ...[...q.sampleAnswer.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  return md.block(`${fence}${q.language}\n${q.sampleAnswer.replace(/\n$/, "")}\n${fence}`);
}

/**
 * The items in the order the page shows them: `optionOrder` names source indices in display order. A plan without
 * the entry would show the key's order, so it is a bug, not a fallback.
 */
const inShownOrder = <T>(list: readonly T[], order: readonly number[] | undefined, id: string): T[] => {
  if (!order || order.length !== list.length) throw new Error(`question ${id}: the plan has no order for its items`);
  return order.map((i) => list[i] as T);
};

/** One question as the page sees it: its prompt and what the learner sees to answer, never its key. */
function pageQuestion(q: Question, md: Md, t: Messages["page"], order: readonly number[] | undefined): PageQuestion {
  const base = {
    id: q.id,
    points: q.points,
    graded: q.graded,
    promptHtml: md.block(q.prompt),
    hintHtml: q.hint ? md.block(q.hint.text) : null,
  };
  switch (q.type) {
    case "single":
    case "multi":
      return {
        ...base,
        type: q.type,
        choices: q.choices.map((c) => ({ html: unwrap(md.block(c.text)), input: c.input })),
      };
    case "truefalse":
    case "short":
      return { ...base, type: q.type };
    case "numeric":
      return { ...base, type: "numeric", unit: q.key.unit };
    case "blanks":
      return {
        ...base,
        type: "blanks",
        promptHtml: md.blanks(
          q.prompt,
          q.blanks.map((b) => b.kind),
          t.blankLabel,
        ),
        blankCount: q.blanks.length,
      };
    case "fields":
      return {
        ...base,
        type: "fields",
        fields: q.fields.map((f) => ({
          labelHtml: unwrap(md.block(f.label)),
          graded: f.key !== null,
          numeric: f.key?.kind === "numeric",
        })),
      };
    case "scale":
      return {
        ...base,
        type: "scale",
        min: q.min,
        max: q.max,
        labels: q.labels.map((l) => ({ value: l.value, html: unwrap(md.block(l.text)) })),
      };
    case "ordering":
      return { ...base, type: "ordering", items: inShownOrder(q.items, order, q.id).map((i) => item(md, i.text)) };
    case "matching": {
      const rights = [...q.pairs.map((p) => p.right), ...q.distractors.map((d) => d.text)];
      return {
        ...base,
        type: "matching",
        lefts: q.pairs.map((p) => unwrap(md.block(p.left))),
        rights: inShownOrder(rights, order, q.id).map((r) => item(md, r)),
      };
    }
    case "essay":
      return { ...base, type: "essay", minWords: q.minWords, maxWords: q.maxWords, rubric: criteriaOf(q, md) };
    case "code":
      return { ...base, type: "code", language: q.language, starter: q.starter, rubric: criteriaOf(q, md) };
  }
}

/** `plan` is for tests: it replaces the plan the quiz would be given. */
export function pageQuizOf({ quiz, hash, assets }: BuildQuiz, plan?: ReturnType<typeof planFor>): PageQuiz {
  const md = createRenderer(assets);
  const t = quiz.frontMatter.uiLang === "vi" ? vi.page : en.page;
  plan ??= planFor(quiz, { source: "full", quizHash: hash });
  const explanations: Record<string, string> = {};
  const samples: Record<string, string> = {};
  const sections: PageSection[] = quiz.sections.map((s) => ({
    id: s.id,
    title: s.title,
    introHtml: s.intro.trim() === "" ? "" : md.block(s.intro),
    questions: s.questions.map((q) => {
      if (q.explanation) explanations[q.id] = md.block(q.explanation.text);
      const sample = sampleHtml(q, md);
      if (sample !== null) samples[q.id] = sample;
      return pageQuestion(q, md, t, plan.optionOrder?.[q.id]);
    }),
  }));
  return {
    id: quiz.frontMatter.id,
    hash,
    title: quiz.frontMatter.title,
    description: quiz.frontMatter.description,
    uiLang: quiz.frontMatter.uiLang,
    lang: quiz.frontMatter.lang,
    sections,
    plan,
    key: encodeKey(keyOf(quiz, explanations, samples), hash),
  };
}

const sha256Source = (text: string): string => `'sha256-${toBase64(sha256(utf8ToBytes(text)))}'`;

/** JSON that is safe inside a `<script>`: no `<`, and no line separators that old parsers mind. */
const scriptJson = (value: unknown): string =>
  canonicalJson(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");

const escapeAttr = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * The page: one HTML file with the styles, the pre-rendered tree, the data and the runtime inline (TECHNICAL_DESIGN.md,
 * section 7). It takes a list of quizzes (seam 1); the CSP allows only the page's own script and style, by hash.
 * Pure: the same input gives the same bytes.
 */
export function buildPage(quizzes: readonly BuildQuiz[], options: PageOptions): string {
  if (quizzes.length === 0) throw new Error("a page needs at least one quiz");
  if (options.runtime.toLowerCase().includes("</script")) throw new Error("the runtime holds a closing script tag");
  const data: PageData = { version: 1, quizzes: quizzes.map((q) => pageQuizOf(q)) };
  const tree = renderToString(h(App, { store: createStore(data) }));
  const first = data.quizzes[0] as PageQuiz;
  const csp = [
    "default-src 'none'",
    `script-src ${sha256Source(options.runtime)}`,
    `style-src ${sha256Source(options.css)}`,
    "img-src data:",
    "media-src data:",
    "font-src data:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  return [
    "<!doctype html>",
    `<html lang="${first.uiLang}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}">`,
    `<meta name="generator" content="${escapeAttr(`fullmark ${options.version}; built ${options.builtAt}`)}">`,
    `<title>${escapeAttr(first.title)}</title>`,
    `<style>${options.css}</style>`,
    "</head>",
    "<body>",
    `<div id="fm-root">${tree}</div>`,
    `<script type="application/json" id="fm-data">${scriptJson(data)}</script>`,
    `<script>${options.runtime}</script>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
