import type { PaperMessages } from "../core/i18n/paper";
import type { Question, Quiz } from "../core/ir";

/**
 * What the printed key says for a question (STEP2.md, slice 2k2, decision 2): one function from the question and the
 * paper's order to the answer, read from the same IR the grader marks, so there is no second copy of an answer rule.
 * Letters and numbers are the paper's, after the plan's shuffle (`order` is the plan's `optionOrder` for the question).
 */
export type KeyAnswer = {
  /** the lines of the answer cell, plain text (the build escapes it); one line for every type but `fields` */
  lines: string[];
  /**
   * the answer as pieces a test can read back: the letters for `single`, `multi` and `ordering` (in the order the key
   * names them), T or F, the accepted answers of a `short`, a number's text, the first answer of each blank and each
   * field, the right-hand letter of each matching pair; empty where there is nothing to mark
   */
  parts: string[];
  /** how partial credit is given when `quiz grade` gives it for this question, else null */
  note: string | null;
  /** the letter or T/F that goes in the answer sheet's grid; null for a question that is not on it */
  sheet: string | null;
};

export type KeyContext = {
  /** `optionOrder` of the plan for this question; absent: the source order */
  order: readonly number[] | undefined;
  /** the quiz's `partial` and the question's own, as the grader reads them */
  partial: boolean;
  t: PaperMessages;
  /** the paper's language: a `vi` key writes a decimal with a comma, as points are written; absent: `en` */
  lang?: "en" | "vi";
  /** "4 points" / "4 điểm" */
  points: (n: number) => string;
  /** plain text of a field's label (the label is Markdown) */
  label: (source: string) => string;
};

const letter = (i: number): string => String.fromCharCode(65 + i);
const lower = (i: number): string => String.fromCharCode(97 + i);

/** A decimal without float noise: 0.1 + 0.2 reads 0.3. */
const clean = (x: number): string => String(Number.parseFloat(x.toFixed(10)));

type NumberLike = { raw: string; tolerance: number; relTolerance: number | null };

/** A decimal in the paper's format: "0.4" is "0,4" in `vi`; a fraction, an integer or text is left as written. */
const inLang = (text: string, lang: "en" | "vi"): string =>
  lang === "vi" && /^[+-]?\d*\.\d+(?:[eE][+-]?\d+)?$/.test(text) ? text.replace(".", ",") : text;

/** A number as the quiz states it, with its tolerance: "0.4 (± 0.001)", "5 (± 2%)"; "0,4 (± 0,001)" in `vi`. */
function numberText(k: NumberLike, lang: "en" | "vi", unit = ""): string {
  const tol =
    k.relTolerance !== null
      ? ` (± ${inLang(clean(k.relTolerance * 100), lang)}%)`
      : k.tolerance > 0
        ? ` (± ${inLang(clean(k.tolerance), lang)})`
        : "";
  return `${inLang(k.raw, lang)}${tol}${unit === "" ? "" : ` ${unit}`}`;
}

function textsOf(k: { accept: readonly string[]; patterns: readonly string[] }): string[] {
  return [...k.accept, ...k.patterns.map((p) => `/${p}/`)];
}

/** The position (0-based) at which the source index `source` stands on the paper. */
const positionOf = (order: readonly number[] | undefined, source: number): number => {
  if (order === undefined) return source;
  const at = order.indexOf(source);
  return at < 0 ? source : at;
};

export function keyAnswerOf(q: Question, ctx: KeyContext): KeyAnswer {
  const { t } = ctx;
  const lang = ctx.lang ?? "en";
  const none = { note: null, sheet: null };
  if (!q.graded && q.type !== "essay" && q.type !== "code") {
    return { lines: [t.notMarked], parts: [], ...none };
  }
  switch (q.type) {
    case "single": {
      const right = q.choices.findIndex((c) => c.correct);
      const l = right < 0 ? "" : letter(positionOf(ctx.order, right));
      return { lines: [l], parts: l === "" ? [] : [l], ...none, sheet: l === "" ? null : l };
    }
    case "multi": {
      const letters = q.choices
        .flatMap((c, i) => (c.correct ? [positionOf(ctx.order, i)] : []))
        .sort((a, b) => a - b)
        .map(letter);
      const note = ctx.partial && letters.length > 1 ? t.partialMulti(ctx.points(q.points)) : null;
      return { lines: [letters.join(", ")], parts: letters, note, sheet: null };
    }
    case "truefalse": {
      const l = q.value ? t.trueLetter : t.falseLetter;
      return { lines: [l], parts: [l], note: null, sheet: l };
    }
    case "short": {
      const answers = textsOf(q.key);
      return { lines: [answers.join("; ")], parts: answers, ...none };
    }
    case "numeric": {
      const values = q.key.values.map((_, i) => q.key.raw[i] ?? String(q.key.values[i]));
      const text = values
        .map((raw) => numberText({ raw, tolerance: q.key.tolerance, relTolerance: q.key.relTolerance }, lang))
        .join("; ");
      return { lines: [q.key.unit === "" ? text : `${text} ${q.key.unit}`], parts: values, ...none };
    }
    case "blanks": {
      const each = q.blanks.map((b) =>
        b.kind === "text"
          ? { text: b.answers.join(" / "), first: b.answers[0] ?? "" }
          : { text: numberText({ raw: b.raw, tolerance: b.tolerance, relTolerance: null }, lang), first: b.raw },
      );
      return {
        lines: [each.map((b, i) => `(${i + 1}) ${b.text}`).join("; ")],
        parts: each.map((b) => b.first),
        note: q.blanks.length > 1 ? t.partialShared(ctx.points(q.points), t.blanksWord) : null,
        sheet: null,
      };
    }
    case "fields": {
      const lines: string[] = [];
      const parts: string[] = [];
      const gradedFields = q.fields.filter((f) => f.key !== null);
      const absolute = gradedFields.every((f) => f.points !== null);
      const own = (f: { points: number | null }): string =>
        absolute && gradedFields.length > 1 && f.points !== null ? ` (${ctx.points(f.points)})` : "";
      for (const f of q.fields) {
        const label = ctx.label(f.label);
        if (f.key === null) {
          lines.push(`${label}: ${t.notMarked}`);
          parts.push("");
        } else if (f.key.kind === "text") {
          const answers = textsOf(f.key);
          lines.push(`${label}: ${answers.join(" / ")}${own(f)}`);
          parts.push(answers[0] ?? "");
        } else {
          const key = f.key;
          const raw = key.values.map((_, i) => key.raw[i] ?? "");
          lines.push(
            `${label}: ${raw.map((r) => numberText({ raw: r, tolerance: key.tolerance, relTolerance: key.relTolerance }, lang, key.unit)).join(" / ")}${own(f)}`,
          );
          parts.push(raw[0] ?? "");
        }
      }
      const note =
        gradedFields.length < 2
          ? null
          : absolute
            ? t.partialFieldPoints
            : t.partialShared(ctx.points(q.points), t.fieldsWord);
      return { lines, parts, note, sheet: null };
    }
    case "matching": {
      const letters = q.pairs.map((_, i) => lower(positionOf(ctx.order, i)));
      return {
        lines: [letters.map((l, i) => `${i + 1} → ${l}`).join(", ")],
        parts: letters,
        note: ctx.partial && q.pairs.length > 1 ? t.partialShared(ctx.points(q.points), t.pairsWord) : null,
        sheet: null,
      };
    }
    case "ordering": {
      const letters = q.items.map((_, i) => letter(positionOf(ctx.order, i)));
      return {
        lines: [letters.join(", ")],
        parts: letters,
        note: ctx.partial && q.items.length > 1 ? t.partialShared(ctx.points(q.points), t.itemsWord) : null,
        sheet: null,
      };
    }
    case "essay":
    case "code":
      return { lines: [q.graded ? t.seeRubric : t.notMarked], parts: [], ...none };
    case "scale":
      return { lines: [t.notMarked], parts: [], ...none };
  }
}

/** The quiz's `partial` setting for a question, as the grader reads it. */
export const partialOf = (quiz: Quiz, q: Question): boolean => q.partial ?? quiz.frontMatter.partial;
