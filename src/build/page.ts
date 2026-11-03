import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import type { Attempt } from "../core/attempt";
import { canonicalJson } from "../core/canonical";
import { embeddedFonts, type FontsChoice, fontFaceCss, offeredFonts } from "../core/fonts";
import { en, type Messages, vi } from "../core/i18n";
import type { Question, Quiz, Rubric, Section } from "../core/ir";
import { encodeKey, toBase64 } from "../core/keyblob";
import { planFor } from "../core/plan";
import type { AppliedGrades } from "../core/rubric/grades";
import { resolveRubric } from "../core/rubric/model";
import { themeCss } from "../core/themes";
import { App } from "../page/App";
import type {
  KeyBlob,
  PageCriterion,
  PageData,
  PageGrades,
  PageItem,
  PageQuestion,
  PageQuiz,
  PageSection,
} from "../page/data";
import { LicencesDialog } from "../page/Licences";
import { messagesFor } from "../page/questions/shared";
import { createStore } from "../page/store";
import { fontDataUri } from "./fonts";
import type { Highlight } from "./highlight";
import { infoFor, licencesFor } from "./licences";
import { type Asset, createRenderer, type RenderTools } from "./render";
import type { MathTools } from "./tex";

/** An attempt to show already submitted (`quiz replay`): the results file as read, the attempt in it and the grades. */
export type ReplayData = {
  /** the results file's text, exactly as read: Download results gives it back */
  results: string;
  /** the results file's name, which Download results keeps */
  name: string;
  attempt: Attempt;
  /** the grades for essay and code answers, checked; null: pending */
  applied: AppliedGrades | null;
};

/** One quiz to put on a page: the IR the check passed, its hash, and the files it refers to. */
export type BuildQuiz = {
  quiz: Quiz;
  hash: string;
  assets: readonly Asset[];
  /** the materials sheets in the order listed, rendered into `PageQuiz.materials` (the sidebar of 2f shows them) */
  sheets?: readonly { path: string; name: string; source: string }[];
  /** `build --ui-lang`: the language of the page's chrome, over the quiz's `ui_lang`; the key and the grading are the quiz's own */
  uiLang?: "en" | "vi";
  /** `quiz replay`: the page opens on this attempt, submitted */
  replay?: ReplayData;
};

export type PageOptions = {
  /** the runtime (`dist/page.js`) and the styles (`dist/page.css`), read by the CLI */
  runtime: string;
  css: string;
  /** an ISO time, written into the generator meta; the CLI reads the clock, never this module */
  builtAt: string;
  version: string;
  /** KaTeX, when it is available: without it maths stays as its source */
  math?: MathTools;
  /** the highlighter for the languages the quizzes use (`loadHighlighter`); null or absent: code stays plain */
  highlight?: Highlight | null;
  /** `--fonts`: which fonts the page embeds (`quiz` when absent) */
  fonts?: FontsChoice;
  /** the build options as given, for the Information tab; absent or `null` is the default (build inputs only) */
  given?: { profile?: string | null; fonts?: FontsChoice | null; uiLang?: "en" | "vi" | null; strict?: boolean };
  /** turns a registry font file's package path into a `data:` URI; absent: read from the npm package */
  fontData?: (path: string) => string;
};

/** A lone `<p>…</p>` loses its paragraph, so a choice is not set apart from its marker. */
const unwrap = (html: string): string => {
  const m = /^<p>([\s\S]*)<\/p>\n?$/.exec(html);
  return m && !(m[1] ?? "").includes("<p>") ? (m[1] ?? "") : html;
};

/** The quiz IR with everything a page shows removed: the key, as the grader needs it (foundation 5). */
function keyOf(
  quiz: Quiz,
  explanations: Record<string, string>,
  samples: Record<string, string>,
  dataOrder: Record<string, number[]>,
): KeyBlob {
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
  return { quiz: { ...quiz, file: "", sections }, explanations, samples, dataOrder };
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
export const plain = (html: string): string =>
  ENTITIES.reduce((text, [entity, char]) => text.replaceAll(entity, char), html.replace(/<[^>]*>/g, "")).trim();

/**
 * An item of `ordering` or `matching`. Its label (an `aria-label`, an `<option>`) cannot hold HTML, so it is made from
 * the source with the maths left as TeX between `$` signs, not from KaTeX's text.
 */
const item = (md: Md, labels: Md, source: string): PageItem => ({
  html: unwrap(md.block(source)),
  label: plain(unwrap(labels.block(source))),
});

/** A rubric's criteria as the page lists them before Submit; null when `show_rubric` is false or there are none. */
function criteriaOf(q: { rubric: Rubric | null; showRubric: boolean }, md: Md): PageCriterion[] | null {
  if (!q.showRubric || q.rubric === null || q.rubric.criteria.length === 0) return null;
  return q.rubric.criteria.map((c) => ({ html: unwrap(md.block(c.text)), points: c.points }));
}

/** A model answer as HTML. Code is shown as code, in a fence longer than any run of backticks inside it. */
export function sampleHtml(q: Question, md: Md): string | null {
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
function pageQuestion(
  q: Question,
  md: Md,
  labels: Md,
  t: Messages["page"],
  order: readonly number[] | undefined,
): PageQuestion {
  const base = {
    id: q.id,
    points: q.points,
    graded: q.graded,
    promptHtml: md.block(q.prompt),
    hintHtml: q.hint ? md.block(q.hint.text) : null,
    tags: q.tags,
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
      return {
        ...base,
        type: "ordering",
        items: inShownOrder(q.items, order, q.id).map((i) => item(md, labels, i.text)),
      };
    case "matching": {
      const rights = [...q.pairs.map((p) => p.right), ...q.distractors.map((d) => d.text)];
      return {
        ...base,
        type: "matching",
        lefts: q.pairs.map((p) => unwrap(md.block(p.left))),
        rights: inShownOrder(rights, order, q.id).map((r) => item(md, labels, r)),
      };
    }
    case "essay":
      return { ...base, type: "essay", minWords: q.minWords, maxWords: q.maxWords, rubric: criteriaOf(q, md) };
    case "code":
      return { ...base, type: "code", language: q.language, starter: q.starter, rubric: criteriaOf(q, md) };
  }
}

/**
 * The page data of one quiz. It holds no plan: the page draws one at Start (`planFor`, from the key blob). `plan` only
 * decides the order in which `ordering` items and `matching` right-hand items sit in the data, so that the data never
 * lists them in the right order; tests replace it. Without it, the plan is the one the quiz's short version gives.
 */
export function pageQuizOf(
  { quiz, hash, assets, sheets, uiLang: chosenUiLang, replay }: BuildQuiz,
  plan?: ReturnType<typeof planFor>,
  tools: Pick<RenderTools, "math" | "highlight"> = {},
): PageQuiz {
  let hasMath = false;
  const used: Pick<RenderTools, "math" | "highlight"> = {
    ...tools,
    ...(tools.math
      ? {
          math: (tex: string, display: boolean) => {
            const html = (tools.math as NonNullable<RenderTools["math"]>)(tex, display);
            hasMath = true;
            return html;
          },
        }
      : {}),
  };
  const md = createRenderer(assets, used);
  const labels = createRenderer(assets);
  const uiLang = chosenUiLang ?? quiz.frontMatter.uiLang;
  const t = uiLang === "vi" ? vi.page : en.page;
  plan ??= planFor(quiz, { source: "full", quizHash: hash });
  const explanations: Record<string, string> = {};
  const samples: Record<string, string> = {};
  const dataOrder: Record<string, number[]> = {};
  const sections: PageSection[] = quiz.sections.map((s) => ({
    id: s.id,
    title: s.title,
    introHtml: s.intro.trim() === "" ? "" : md.block(s.intro),
    ...(s.pick !== null ? { pick: s.pick } : {}),
    ...(s.time !== null ? { time: s.time } : {}),
    questions: s.questions.map((q) => {
      if ((q.type === "ordering" || q.type === "matching") && plan.optionOrder?.[q.id]) {
        dataOrder[q.id] = plan.optionOrder[q.id] as number[];
      }
      if (q.explanation) explanations[q.id] = md.block(q.explanation.text);
      const sample = sampleHtml(q, md);
      if (sample !== null) samples[q.id] = sample;
      return pageQuestion(q, md, labels, t, plan.optionOrder?.[q.id]);
    }),
  }));
  const materials = (sheets ?? []).map((s) => {
    const slash = s.path.lastIndexOf("/");
    const sheet = createRenderer(assets, { ...used, base: slash < 0 ? "" : s.path.slice(0, slash) });
    return { name: s.name, html: sheet.block(s.source.replace(/^\uFEFF/, "")) };
  });
  return {
    id: quiz.frontMatter.id,
    hash,
    title: quiz.frontMatter.title,
    descriptionHtml: quiz.frontMatter.description === null ? null : md.block(quiz.frontMatter.description),
    ...(quiz.frontMatter.timeLimit !== null ? { timeLimit: quiz.frontMatter.timeLimit } : {}),
    ...(quiz.frontMatter.passMark !== null ? { passMark: quiz.frontMatter.passMark } : {}),
    ...(quiz.frontMatter.feedback === "instant" ? { feedback: "instant" as const } : {}),
    uiLang,
    lang: quiz.frontMatter.lang,
    sections,
    key: encodeKey(keyOf(quiz, explanations, samples, dataOrder), hash),
    // only when there is something: a quiz without sheets or maths keeps the data it had
    ...(materials.length > 0 ? { materials } : {}),
    ...(replay
      ? {
          replay: {
            results: replay.results,
            name: replay.name,
            grades: replay.applied === null ? null : gradesOf(replay.applied, quiz, md),
          },
        }
      : {}),
    ...(hasMath ? { hasMath: true as const } : {}),
  };
}

/** The grades a replay page shows: the checked grades of `applyGrades`, their criteria rendered as HTML. */
function gradesOf(applied: AppliedGrades, quiz: Quiz, md: Md): PageGrades {
  const questions = new Map<string, Question>();
  for (const s of quiz.sections) for (const q of s.questions) questions.set(q.id, q);
  return {
    at: applied.grader?.at ?? null,
    marks: applied.manual,
    details: applied.details.map((d) => {
      const q = questions.get(d.id);
      const rubric = q && (q.type === "essay" || q.type === "code") ? resolveRubric(q.rubric) : null;
      return {
        id: d.id,
        mode: d.mode,
        points: d.points,
        earned: d.earned,
        band: d.band,
        scaleMax: rubric?.mode === "banded" ? rubric.scale.max : null,
        grader: d.graded_by,
        criteria: d.criteria.map((c) => ({
          html: unwrap(md.block(c.text)),
          earned: c.earned,
          max: c.max,
          band: c.band,
          verdict: c.verdict,
          note: c.note,
        })),
        justification: d.justification,
        improvement: d.improvement,
      };
    }),
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
  const maths = options.math?.start();
  // the Information tab names Shiki only when some code was coloured
  let coloured = false;
  const highlight: Highlight | null | undefined = options.highlight
    ? (code, lang) => {
        const html = (options.highlight as Highlight)(code, lang);
        if (html !== null) coloured = true;
        return html;
      }
    : options.highlight;
  const data: PageData = {
    version: 1,
    quizzes: quizzes.map((q) => pageQuizOf(q, undefined, { math: maths?.render, highlight })),
    theme: (quizzes[0] as BuildQuiz).quiz.frontMatter.theme,
    look: (quizzes[0] as BuildQuiz).quiz.frontMatter.look,
    font: (quizzes[0] as BuildQuiz).quiz.frontMatter.font,
    fonts: offeredFonts(options.fonts ?? "quiz", (quizzes[0] as BuildQuiz).quiz.frontMatter.font),
  };
  // the token CSS comes from the theme registry, with the quiz's theme as the plain `:root` rule; the rest is the page's
  const front = (quizzes[0] as BuildQuiz).quiz.frontMatter;
  const choice = options.fonts ?? "quiz";
  const css = themeCss(front.theme, front.font, offeredFonts(choice, front.font)) + options.css;
  const embedded = embeddedFonts(choice, front.font);
  const fontCss = embedded.length === 0 ? null : fontFaceCss(embedded, options.fontData ?? fontDataUri);
  const tree = renderToString(h(App, { store: createStore(data) }));
  const first = data.quizzes[0] as PageQuiz;
  // KaTeX's styles and fonts, once, and only for a page that has maths
  const mathCss = data.quizzes.some((q) => q.hasMath) ? (maths?.css() ?? null) : null;
  const licencesHtml = renderToString(
    h(LicencesDialog, {
      t: messagesFor(first),
      licences: licencesFor({ fonts: embedded, maths: mathCss !== null }),
      info: infoFor({
        version: options.version,
        builtAt: options.builtAt,
        hash: first.hash,
        fonts: embedded,
        maths: mathCss !== null,
        code: coloured,
        theme: front.theme,
        look: front.look,
        given: options.given ?? {},
      }),
    }),
  );
  const csp = [
    "default-src 'none'",
    `script-src ${sha256Source(options.runtime)}`,
    `style-src ${[css, ...(fontCss === null ? [] : [fontCss]), ...(mathCss === null ? [] : [mathCss])].map(sha256Source).join(" ")}`,
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
    `<style>${css}</style>`,
    ...(fontCss === null ? [] : [`<style id="fm-fonts">${fontCss}</style>`]),
    ...(mathCss === null ? [] : [`<style id="fm-katex">${mathCss}</style>`]),
    "</head>",
    "<body>",
    `<div id="fm-root">${tree}</div>`,
    licencesHtml,
    `<script type="application/json" id="fm-data">${scriptJson(data)}</script>`,
    `<script>${options.runtime}</script>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
