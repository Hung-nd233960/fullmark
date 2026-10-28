import { useEffect, useRef } from "preact/hooks";
import { readAnswer } from "../../core/attempt/answers";
import type { PageQuestion } from "../data";
import { acceptedNumber, CommaWarning, type Ctx, Html, wantsPoint } from "./shared";

type BlanksQuestion = Extract<PageQuestion, { type: "blanks" }>;

/**
 * The prompt's blanks are `<input>`s written into its HTML at build. Preact does not render inside that HTML: the
 * component sits in the card's prompt slot (so the hint comes after it), listens at the prompt (event delegation)
 * and, after each render, sets the boxes' value, `disabled` and result from the stored answer and the grader's word.
 */
export function BlanksPrompt({ q, c }: { q: BlanksQuestion; c: Ctx }) {
  const root = useRef<HTMLDivElement>(null);
  const given = readAnswer("blanks", c.answer)?.blanks ?? [];
  const results = c.submitted ? (c.result?.results ?? []) : [];

  useEffect(() => {
    root.current?.querySelectorAll<HTMLInputElement>("input.fm-blank").forEach((el) => {
      const i = Number(el.dataset.blank);
      const text = given[i] ?? "";
      if (el.value !== text) el.value = text;
      el.disabled = c.submitted;
      const hit = results[i];
      if (hit === undefined || hit === null) {
        delete el.dataset.result;
        el.removeAttribute("aria-invalid");
      } else {
        el.dataset.result = hit ? "correct" : "wrong";
        if (hit) el.removeAttribute("aria-invalid");
        else el.setAttribute("aria-invalid", "true");
      }
    });
  });

  const onInput = (e: Event) => {
    const target = e.target as HTMLElement;
    if (!target.matches("input.fm-blank")) return;
    const texts = Array.from({ length: q.blankCount }, () => "");
    root.current?.querySelectorAll<HTMLInputElement>("input.fm-blank").forEach((el) => {
      texts[Number(el.dataset.blank)] = el.value;
    });
    c.set(texts.every((x) => x === "") ? null : { blanks: texts });
  };

  return (
    <div ref={root} onInput={onInput}>
      <Html html={q.promptHtml} class="fm-prompt" id={`${c.name}/prompt`} />
    </div>
  );
}

/** What follows a blanks prompt: the comma warning, and after Submit each blank's result. */
export function Blanks({ q, c }: { q: BlanksQuestion; c: Ctx }) {
  const { t } = c;
  const given = readAnswer("blanks", c.answer)?.blanks ?? [];
  const results = c.submitted ? (c.result?.results ?? []) : [];
  const keyed = c.keyed?.type === "blanks" ? c.keyed : undefined;
  const numeric = [...q.promptHtml.matchAll(/data-blank="(\d+)" data-numeric/g)].map((m) => Number(m[1]));
  return (
    <div>
      {!c.submitted
        ? numeric
            .filter((i) => wantsPoint(c.quiz, given[i] ?? ""))
            .map((i) => <CommaWarning key={i} t={t} prefix={t.blankLabel(i + 1)} />)
        : null}
      {c.submitted ? (
        <ul class="fm-blank-results">
          {Array.from({ length: q.blankCount }, (_, i) => {
            const hit = results[i];
            const blank = keyed?.blanks[i];
            const accepted = !blank
              ? null
              : blank.kind === "numeric"
                ? acceptedNumber(t, { ...blank, values: [blank.value], raw: [blank.raw], relTolerance: null })
                : (blank.answers[0] ?? null);
            return (
              <li key={i} data-result={hit === true ? "correct" : "wrong"}>
                {t.blankLabel(i + 1)}:{" "}
                <strong>
                  {(given[i] ?? "") === "" ? t.noAnswer : hit === true ? t.status.correct : t.status.incorrect}
                </strong>
                {(given[i] ?? "") === "" ? "" : ` · ${t.yourAnswer}: ${given[i]}`}
                {hit !== true && accepted !== null ? ` · ${t.correctAnswer}: ${accepted}` : ""}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
