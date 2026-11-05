import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { embeddedFonts, type FontsChoice, fontFaceCss, offeredFonts } from "../core/fonts";
import type { Question, Quiz } from "../core/ir";
import { toBase64 } from "../core/keyblob";
import type { Judged } from "../core/review/reasons";
import type { Review } from "../core/review/schema";
import { themeCss } from "../core/themes";
import type { ReviewData, SinceData } from "../review/data";
import { fontDataUri } from "./fonts";
import type { Highlight } from "./highlight";
import { escapeAttr, pageQuizOf, scriptJson } from "./page";
import type { Asset } from "./render";
import type { MathTools } from "./tex";

export type ReviewFormOptions = {
  quiz: Quiz;
  hash: string;
  assets: readonly Asset[];
  /** the review file as it stands (`--out`, read and checked by the command); null: none yet */
  review: Review | null;
  /** `--since`: the ids asked, and the blocks as hashed (what the diff of a changed question reads); absent otherwise */
  since?: { asked: readonly string[]; blocks: ReadonlyMap<string, string> };
  /** the review file as the user names it, and the command that checks it (the saved card shows both) */
  out: string;
  check: string;
  /** `dist/review.js`, `dist/page.css` and `dist/review.css`, read by the CLI */
  script: string;
  css: string;
  reviewCss: string;
  builtAt: string;
  version: string;
  math?: MathTools;
  highlight?: Highlight | null;
  fonts?: FontsChoice;
  fontData?: (path: string) => string;
};

/**
 * The questions as the form shows them (G55): every question of the quiz in source order, the pool of a bank whole,
 * the choices unshuffled, the rubrics shown, whatever the quiz says of `show_rubric`.
 */
function asShown(quiz: Quiz): Quiz {
  const open = (q: Question): Question => (q.type === "essay" || q.type === "code" ? { ...q, showRubric: true } : q);
  return { ...quiz, sections: quiz.sections.map((s) => ({ ...s, questions: s.questions.map(open) })) };
}

/** The data the page's `ordering` and `matching` take to list their items in source order (the key's own order). */
function sourceOrder(quiz: Quiz): Record<string, number[]> {
  const order: Record<string, number[]> = {};
  const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
  for (const s of quiz.sections) {
    for (const q of s.questions) {
      if (q.type === "ordering") order[q.id] = range(q.items.length);
      else if (q.type === "matching") order[q.id] = range(q.pairs.length + q.distractors.length);
    }
  }
  return order;
}

/** The earlier verdicts that still stand (G53): a question whose hash is the one the verdict was given on. */
export function earlierVerdicts(quiz: Quiz, review: Review | null): Record<string, Judged> {
  const out: Record<string, Judged> = {};
  if (review === null) return out;
  for (const s of quiz.sections) {
    for (const q of s.questions) {
      const entry = q.id === "" ? undefined : review.questions[q.id];
      if (!entry || entry.hash !== q.hash) continue;
      out[q.id] = {
        verdict: entry.verdict,
        reasons: entry.reasons,
        note: entry.note,
        ...(entry.verdict === "keep" && entry.assumed ? { assumed: true as const } : {}),
      };
    }
  }
  return out;
}

/** What `--since` asks and shows (G44, G61): the asked ids, and for each changed one the earlier verdict and both blocks. */
function sinceOf(quiz: Quiz, review: Review, asked: readonly string[], blocks: ReadonlyMap<string, string>): SinceData {
  const changed: SinceData["changed"] = {};
  const wanted = new Set(asked);
  for (const s of quiz.sections) {
    for (const q of s.questions) {
      const entry = review.questions[q.id];
      if (!wanted.has(q.id) || !entry) continue;
      changed[q.id] = {
        earlier: {
          verdict: entry.verdict,
          reasons: entry.reasons,
          note: entry.note,
          ...(entry.verdict === "keep" && entry.assumed ? { assumed: true as const } : {}),
        },
        before: entry.source ?? null,
        after: blocks.get(q.hash) ?? "",
      };
    }
  }
  return { reviewedAt: review.reviewedAt, asked: [...asked], changed };
}

const sha256Source = (text: string): string => `'sha256-${toBase64(sha256(utf8ToBytes(text)))}'`;

/**
 * The review form's page, built in memory (TECHNICAL_DESIGN.md, section 7, foundation 9): the page's styles and the
 * form's, the data block and the one script. The CSP allows that script and the styles by hash, and the form's own
 * `submit` (`connect-src 'self'`). Pure: the same input gives the same bytes.
 */
export function buildReviewForm(o: ReviewFormOptions): string {
  if (o.script.toLowerCase().includes("</script")) throw new Error("the review form holds a closing script tag");
  const quiz = asShown(o.quiz);
  const maths = o.math?.start();
  const page = pageQuizOf(
    { quiz, hash: o.hash, assets: o.assets },
    { source: "full", questions: [], optionOrder: sourceOrder(quiz) },
    { math: maths?.render, highlight: o.highlight },
  );
  const front = quiz.frontMatter;
  const data: ReviewData = {
    version: 1,
    page: {
      theme: front.theme,
      look: front.look,
      font: front.font,
      fonts: offeredFonts(o.fonts ?? "quiz", front.font),
      quizzes: [page],
    },
    earlier: earlierVerdicts(quiz, o.review),
    ...(o.since && o.review ? { since: sinceOf(o.quiz, o.review, o.since.asked, o.since.blocks) } : {}),
    out: o.out,
    check: o.check,
  };
  const choice = o.fonts ?? "quiz";
  const css = themeCss(front.theme, front.font, offeredFonts(choice, front.font)) + o.css + o.reviewCss;
  const embedded = embeddedFonts(choice, front.font);
  const fontCss = embedded.length === 0 ? null : fontFaceCss(embedded, o.fontData ?? fontDataUri);
  const mathCss = page.hasMath ? (maths?.css() ?? null) : null;
  const csp = [
    "default-src 'none'",
    `script-src ${sha256Source(o.script)}`,
    `style-src ${[css, ...(fontCss === null ? [] : [fontCss]), ...(mathCss === null ? [] : [mathCss])].map(sha256Source).join(" ")}`,
    "img-src data:",
    "media-src data:",
    "font-src data:",
    "base-uri 'none'",
    "form-action 'none'",
    "connect-src 'self'",
  ].join("; ");
  return [
    "<!doctype html>",
    `<html lang="${page.uiLang}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}">`,
    `<meta name="generator" content="${escapeAttr(`fullmark ${o.version}; built ${o.builtAt}`)}">`,
    `<title>${escapeAttr(page.title)}</title>`,
    '<link rel="icon" href="data:,">',
    `<style>${css}</style>`,
    ...(fontCss === null ? [] : [`<style id="fm-fonts">${fontCss}</style>`]),
    ...(mathCss === null ? [] : [`<style id="fm-katex">${mathCss}</style>`]),
    "</head>",
    "<body>",
    '<div id="fm-root"></div>',
    `<script type="application/json" id="fm-data">${scriptJson(data)}</script>`,
    `<script>${o.script}</script>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
