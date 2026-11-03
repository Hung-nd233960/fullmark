import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { embeddedFonts, FONT_REGISTRY, type FontsChoice, fontFaceCss } from "../core/fonts";
import { en, vi } from "../core/i18n";
import { type PaperMessages, paperEn, paperVi } from "../core/i18n/paper";
import type { Question } from "../core/ir";
import { toBase64 } from "../core/keyblob";
import { planFor } from "../core/plan";
import { resolveRubric } from "../core/rubric/model";
import type { PageQuestion } from "../page/data";
import type { KeyEntry, PaperData, PaperPart, PaperQuestion, RubricView } from "../page/paper/data";
import { Paper } from "../page/paper/Paper";
import { num } from "../page/results";
import { fontDataUri } from "./fonts";
import { type BuildQuiz, pageQuizOf, plain, sampleHtml } from "./page";
import { keyAnswerOf, partialOf } from "./paper-answers";
import { createRenderer } from "./render";
import type { MathTools } from "./tex";

/**
 * The printable paper (TECHNICAL_DESIGN.md, section 8, "Printable paper"; STEP2.md, slice 2k): `quiz build --print`
 * writes a static page, with no script at all, that the browser prints. It is made from the same renderer as the page
 * (Markdown, maths, images, fonts) and from the order the page's plan would draw, but with its own components and its
 * own styles, which the interactive page never carries. Pure: the same input gives the same bytes.
 */
export type PaperOptions = {
  /** `dist/paper.css`, read by the CLI */
  css: string;
  /** `--seed S`: the paper code, printed as given; null: the quiz's short version draws the orders and no code is printed */
  seed: string | null;
  answerSheet: boolean;
  /** `none` (default): an exam paper; `key`: the key on a new page after the paper; `inline`: each answer under its question */
  answers?: "none" | "key" | "inline";
  /** false (`--materials none`): leave out the materials page and the header's line about it */
  materials?: boolean;
  math?: MathTools;
  fonts?: FontsChoice;
  fontData?: (path: string) => string;
};

export type PaperWarning = { rule: string; message: string; fix: string };

const BLANK = /<input type="text" class="fm-blank"[^>]*>/g;

/** A line count for an essay or a code answer: one line per 12 words of the limit, else 5 per point; 4 at least, 40 at most. */
export function linesFor(points: number, maxWords: number | null): number {
  const wanted = maxWords === null ? Math.ceil(points * 5) : Math.ceil(maxWords / 12);
  return Math.min(40, Math.max(4, wanted));
}

/** An option is short enough for two columns: 40 characters of Markdown at most, no image and no block maths. */
const isShort = (text: string): boolean => text.length <= 40 && !/!\[|\$\$/.test(text);

const sha256Source = (text: string): string => `'sha256-${toBase64(sha256(utf8ToBytes(text)))}'`;
const escapeAttr = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
/** A CSS string: for the footer's text in `@page`, which CSS cannot take from the document. */
const cssString = (text: string): string =>
  `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\A ")}"`;

function timeText(seconds: number, t: PaperMessages): string {
  if (seconds % 60 === 0) return t.minutes(seconds / 60);
  if (seconds < 60) return t.seconds(seconds);
  return `${t.minutes(Math.floor(seconds / 60))} ${t.seconds(seconds % 60)}`;
}

/** "A, B, C or D" */
function listOf(items: readonly string[], or: string): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${or} ${items[items.length - 1]}`;
}

export function buildPaper(built: BuildQuiz, options: PaperOptions): { html: string; warnings: PaperWarning[] } {
  const { quiz, hash } = built;
  const maths = options.math?.start();
  const warnings: PaperWarning[] = [];
  const plan = planFor(quiz, {
    source: "bank",
    ...(options.seed === null ? {} : { seed: options.seed }),
    quizHash: hash,
  });
  const mode = options.answers ?? "none";
  const withSheets = options.materials !== false;
  const page = pageQuizOf(withSheets ? built : { ...built, sheets: [] }, plan, { math: maths?.render });
  const lang = page.uiLang;
  const t = lang === "vi" ? paperVi : paperEn;
  const label = (points: number): string => (lang === "vi" ? vi : en).page.pointsLabel(num(points, lang));
  const md = createRenderer(built.assets, { ...(maths ? { math: maths.render } : {}) });

  const shown = new Map<string, PageQuestion>();
  for (const s of page.sections) for (const q of s.questions) shown.set(q.id, q);
  const source = new Map<string, Question>();
  for (const s of quiz.sections) for (const q of s.questions) source.set(q.id, q);

  const rubricOf = (ir: Question): RubricView | null => {
    if (mode === "none" || (ir.type !== "essay" && ir.type !== "code") || !ir.graded) return null;
    const r = resolveRubric(ir.rubric);
    const text = (source: string): string => md.inline(source);
    if (r.mode === "holistic") {
      return {
        preset: null,
        mode: "holistic",
        rows: r.criteria.map((c) => ({ html: text(c.text), value: null })),
        line: t.scoreRange(label(ir.points)),
      };
    }
    if (r.mode === "additive") {
      return {
        preset: null,
        mode: "additive",
        rows: r.criteria.map((c) => ({ html: text(c.text), value: num(c.max, lang) })),
        line: null,
      };
    }
    const round = r.round === "ielts" ? t.roundIelts : r.round === "down" ? t.roundDown : t.roundNearest;
    const preset = ir.rubric?.preset ?? null;
    return {
      preset: preset === null ? null : t.presetName[preset],
      mode: "banded",
      rows: r.criteria.map((c) => ({ html: text(c.text), value: preset === null ? num(c.weight, lang) : null })),
      line: t.bandsLine(num(r.scale.min, lang), num(r.scale.max, lang), num(r.scale.step, lang), round),
    };
  };

  const keyOf = (q: PageQuestion, ir: Question): KeyEntry => {
    const a = keyAnswerOf(ir, {
      order: plan.optionOrder?.[q.id],
      partial: partialOf(quiz, ir),
      t,
      lang,
      points: label,
      label: (s) => plain(md.inline(s)),
    });
    const sample = sampleHtml(ir, md);
    return {
      lines: a.lines,
      note: a.note,
      points: q.points > 0 ? num(q.points, lang) : null,
      sheet: a.sheet,
      explanationHtml: ir.explanation ? md.block(ir.explanation.text) : null,
      rubric: rubricOf(ir),
      sampleHtml: ir.graded ? sample : null,
    };
  };

  const questionOf = (q: PageQuestion, n: number): PaperQuestion => {
    const ir = source.get(q.id) as Question;
    const asked = questionAsked(q, ir, n);
    return mode === "none" ? asked : { ...asked, key: keyOf(q, ir) };
  };

  const questionAsked = (q: PageQuestion, ir: Question, n: number): PaperQuestion => {
    const base = {
      number: n,
      pointsLabel: q.points > 0 ? label(q.points) : null,
      promptHtml: q.promptHtml,
    };
    switch (q.type) {
      case "single":
      case "multi": {
        const order = plan.optionOrder?.[q.id] ?? q.choices.map((_, i) => i);
        const texts = "choices" in ir ? ir.choices.map((c) => c.text) : [];
        return {
          ...base,
          type: q.type,
          options: order.map((i) => ({
            html: (q.choices[i] as (typeof q.choices)[number]).html,
            line: (q.choices[i] as (typeof q.choices)[number]).input !== null,
          })),
          twoColumns: texts.every(isShort) && q.choices.every((c) => c.input === null),
        };
      }
      case "truefalse":
      case "short":
        return { ...base, type: q.type };
      case "blanks":
        return { ...base, type: "blanks", promptHtml: q.promptHtml.replace(BLANK, '<span class="blank"></span>') };
      case "numeric":
        return { ...base, type: "numeric", unit: q.unit };
      case "fields":
        return { ...base, type: "fields", fields: q.fields.map((f) => f.labelHtml) };
      case "scale":
        return {
          ...base,
          type: "scale",
          points: Array.from({ length: q.max - q.min + 1 }, (_, i) => ({
            value: q.min + i,
            labelHtml: q.labels.find((l) => l.value === q.min + i)?.html ?? null,
          })),
        };
      case "ordering":
        return { ...base, type: "ordering", items: q.items.map((i) => i.html) };
      case "matching":
        return { ...base, type: "matching", lefts: q.lefts, rights: q.rights.map((r) => r.html) };
      case "essay":
        return { ...base, type: "essay", lines: linesFor(q.points, q.maxWords), starterHtml: null };
      case "code": {
        const starter = q.starter?.replace(/\n$/, "") ?? "";
        const longest = Math.max(2, ...[...starter.matchAll(/`+/g)].map((m) => m[0].length));
        const fence = "`".repeat(longest + 1);
        return {
          ...base,
          type: "code",
          lines: linesFor(q.points, null),
          starterHtml: starter === "" ? null : md.block(`${fence}${q.language}\n${starter}\n${fence}`),
        };
      }
    }
  };

  // the plan's questions by part, numbered across parts
  const drawn = new Set(plan.questions);
  let n = 0;
  let total = 0;
  const parts: PaperPart[] = [];
  const questionsInPlan = plan.questions;
  for (const s of page.sections) {
    const ids = new Set(s.questions.map((q) => q.id));
    const mine = questionsInPlan.filter((id) => ids.has(id) && drawn.has(id));
    if (mine.length === 0) continue;
    const questions = mine.map((id) => questionOf(shown.get(id) as PageQuestion, ++n));
    const points = mine.reduce((sum, id) => sum + (shown.get(id) as PageQuestion).points, 0);
    total += points;
    parts.push({
      title: s.title,
      pointsLabel: label(points),
      max: num(points, lang),
      introHtml: s.introHtml,
      questions,
    });
  }
  // the answer sheet: single-choice and true/false questions, in paper order
  let sheet: PaperData["sheet"] = null;
  if (options.answerSheet && mode !== "inline") {
    const all = parts.flatMap((p) => p.questions);
    const onSheet = all.filter((q) => q.type === "single" || q.type === "truefalse");
    if (onSheet.length === 0) {
      warnings.push({ rule: "build.answer-sheet-empty", message: t.noSheetQuestions, fix: t.noSheetFix });
    } else {
      const widest = Math.max(0, ...onSheet.map((q) => (q.type === "single" ? q.options.length : 0)));
      const used = [
        ...(widest > 0
          ? [
              listOf(
                Array.from({ length: widest }, (_, i) => String.fromCharCode(65 + i)),
                t.or,
              ),
            ]
          : []),
        ...(onSheet.some((q) => q.type === "truefalse") ? [listOf([t.trueLetter, t.falseLetter], t.or)] : []),
      ];
      sheet = { numbers: onSheet.map((q) => q.number), note: t.sheetNote(used.join("; ")) };
    }
  }

  const data: PaperData = {
    lang,
    title: page.title,
    version: hash.slice(0, 4),
    code: options.seed,
    time: page.timeLimit === undefined ? null : timeText(page.timeLimit, t),
    total: total > 0 ? label(total) : null,
    totalMax: num(total, lang),
    parts,
    answers: mode,
    // the sheet's own `#` heading is the heading above it here
    materials:
      page.materials?.map((m) => ({ name: m.name, html: m.html.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/, "") })) ??
      null,
    sheet,
    typeOrder: quiz.frontMatter.typeOrderGroups,
  };

  const front = quiz.frontMatter;
  const choice = options.fonts ?? "quiz";
  const embedded = embeddedFonts(choice, front.font);
  const fontCss = embedded.length === 0 ? null : fontFaceCss(embedded, options.fontData ?? fontDataUri);
  const mathCss = page.hasMath ? (maths?.css() ?? null) : null;
  const footer = `${data.title} · ${t.version} ${data.version}${data.code === null ? "" : ` · ${t.paperCode} ${data.code}`}`;
  const css =
    `${options.css}\n:root{--font:${FONT_REGISTRY[front.font].stack}}` +
    `@page{@bottom-left{content:${cssString(footer)}}@bottom-right{content:${cssString(`${t.page} `)} counter(page) " / " counter(pages)}}`;
  const csp = [
    "default-src 'none'",
    "script-src 'none'",
    `style-src ${[css, ...(fontCss === null ? [] : [fontCss]), ...(mathCss === null ? [] : [mathCss])].map(sha256Source).join(" ")}`,
    "img-src data:",
    "font-src data:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  const tree = renderToString(h(Paper, { d: data, t }));
  const html = [
    "<!doctype html>",
    `<html lang="${lang}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}">`,
    `<title>${escapeAttr(data.title)}</title>`,
    `<style>${css}</style>`,
    ...(fontCss === null ? [] : [`<style id="fm-fonts">${fontCss}</style>`]),
    ...(mathCss === null ? [] : [`<style id="fm-katex">${mathCss}</style>`]),
    "</head>",
    `<body>${tree}</body>`,
    "</html>",
    "",
  ].join("\n");
  return { html, warnings };
}
