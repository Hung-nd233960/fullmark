import { readAnswer } from "../../core/attempt/answers";
import type { PageQuestion } from "../data";
import { acceptedNumber, CommaWarning, type Ctx, Html, wantsPoint } from "./shared";

export function Fields({ q, c }: { q: Extract<PageQuestion, { type: "fields" }>; c: Ctx }) {
  const { t } = c;
  const given = readAnswer("fields", c.answer)?.fields ?? [];
  const textAt = (i: number) => given[i] ?? "";
  const keyed = c.keyed?.type === "fields" ? c.keyed : undefined;
  const change = (i: number, value: string) => {
    const next = q.fields.map((_, j) => (j === i ? value : textAt(j)));
    c.set(next.every((x) => x === "") ? null : { fields: next });
  };
  return (
    <div class="fm-fields">
      {q.fields.map((field, i) => {
        const id = `${c.name}/f${i}`;
        const hit = c.submitted ? (c.result?.results?.[i] ?? null) : null;
        const key = keyed?.fields[i]?.key ?? null;
        const accepted =
          key === null
            ? null
            : key.kind === "numeric"
              ? acceptedNumber(t, key, c.quiz.uiLang)
              : (key.accept[0] ?? null);
        return (
          <div key={i} class="fm-field" data-result={hit === null ? undefined : hit ? "correct" : "wrong"}>
            <label for={id}>
              <Html html={field.labelHtml} tag="span" class="fm-field-label" />
            </label>
            <input
              type="text"
              id={id}
              class="fm-text"
              autocomplete="off"
              spellcheck={false}
              value={textAt(i)}
              disabled={c.submitted}
              aria-invalid={hit === false ? "true" : undefined}
              onInput={(e) => change(i, (e.currentTarget as HTMLInputElement).value)}
            />
            {!c.submitted && field.numeric && wantsPoint(c.quiz, textAt(i)) ? <CommaWarning t={t} /> : null}
            {hit !== null ? (
              <p class="fm-field-mark">
                <strong>{hit ? t.status.correct : t.status.incorrect}</strong>
                {!hit && accepted !== null ? ` · ${t.correctAnswer}: ${accepted}` : ""}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
