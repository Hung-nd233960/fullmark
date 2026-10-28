import { readAnswer } from "../../core/attempt/answers";
import { countWords } from "../../core/grade/normalise";
import type { PageCriterion, PageQuestion } from "../data";
import { type Ctx, Html } from "./shared";

/** The model answer, under the learner's own, after Submit (HTML from the key blob, like an explanation). */
function Sample({ c, id }: { c: Ctx; id: string }) {
  const html = c.sample;
  if (!c.submitted || html === undefined) return null;
  return (
    <div class="fm-sample" id={`${id}/sample`}>
      <strong>{c.t.sampleAnswer}</strong>
      <Html html={html} />
    </div>
  );
}

/** "87 / 120 words minimum", "87 / 300 words maximum", "87 words, 120 to 300", or "87 words". */
function countLine(t: Ctx["t"], words: number, min: number | null, max: number | null): string {
  if (min !== null && max !== null) return t.wordsRange(words, min, max);
  if (min !== null) return t.wordsMin(words, min);
  if (max !== null) return t.wordsMax(words, max);
  return t.words(words);
}

/** `essay`: a text box with a live word count (the grader's own count). It never blocks typing or Submit. */
export function Essay({ q, c }: { q: Extract<PageQuestion, { type: "essay" }>; c: Ctx }) {
  const { t } = c;
  const text = readAnswer("essay", c.answer)?.text ?? "";
  const words = countWords(text);
  const min = q.minWords !== null && q.minWords > 0 ? q.minWords : null;
  const max = q.maxWords !== null && q.maxWords > 0 ? q.maxWords : null;
  const over = max !== null && words > max;
  return (
    <div class="fm-open">
      {q.rubric !== null && !c.submitted ? <Rubric rubric={q.rubric} c={c} /> : null}
      <textarea
        class="fm-textarea fm-essay"
        rows={8}
        spellcheck
        aria-labelledby={`${c.name}/prompt`}
        aria-describedby={`${c.name}/count`}
        value={text}
        readOnly={c.submitted}
        onInput={(e) => {
          const v = (e.currentTarget as HTMLTextAreaElement).value;
          c.set(v === "" ? null : { text: v });
        }}
      />
      <p class="fm-count" id={`${c.name}/count`} data-over={over}>
        {countLine(t, words, min, max)}
        {over ? ` · ${t.overMaximum}` : ""}
      </p>
      <Sample c={c} id={c.name} />
    </div>
  );
}

function Rubric({ rubric, c }: { rubric: PageCriterion[]; c: Ctx }) {
  return (
    <div class="fm-rubric">
      <strong>{c.t.rubric}</strong>
      <ul>
        {rubric.map((criterion, i) => (
          <li key={i}>
            <Html html={criterion.html} tag="span" />
            {criterion.points !== null ? (
              <span class="fm-rubric-points">{` (${c.t.pointsLabel(String(criterion.points))})`}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * `code`: a monospaced box filled with `starter`. Tab is never captured. The box is not controlled (its text is
 * the starter at first), so clearing it does not bring the starter back; the answer is `null` while it is empty or
 * still the starter.
 */
export function Code({ q, c }: { q: Extract<PageQuestion, { type: "code" }>; c: Ctx }) {
  const given = readAnswer("code", c.answer)?.code;
  const starter = q.starter ?? "";
  return (
    <div class="fm-open">
      {q.rubric !== null && !c.submitted ? <Rubric rubric={q.rubric} c={c} /> : null}
      <textarea
        class="fm-textarea fm-code"
        rows={Math.max(6, starter.split("\n").length + 1)}
        spellcheck={false}
        autocapitalize="off"
        autocomplete="off"
        aria-labelledby={`${c.name}/prompt`}
        data-language={q.language}
        readOnly={c.submitted}
        onInput={(e) => {
          const v = (e.currentTarget as HTMLTextAreaElement).value;
          c.set(v === "" || v === starter ? null : { code: v, language: q.language });
        }}
      >
        {given ?? starter}
      </textarea>
      <Sample c={c} id={c.name} />
    </div>
  );
}
