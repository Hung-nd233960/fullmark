import { readAnswer } from "../../core/attempt/answers";
import type { PageQuestion } from "../data";
import { type Ctx, Html, shownEntries } from "./shared";

/**
 * `matching`: a dropdown per left item. The right-hand items come in the order the page shows them
 * (`plan.optionOrder`, mapped to the data through the key); the stored value is the right-hand item's source index.
 */
export function Matching({ q, c }: { q: Extract<PageQuestion, { type: "matching" }>; c: Ctx }) {
  const { t } = c;
  const entries = shownEntries(c, q.id, q.rights);
  const shown = entries.map((e) => e.source);
  const given = readAnswer("matching", c.answer)?.pairs ?? [];
  const pairAt = (i: number): number | null => given[i] ?? null;
  const change = (i: number, value: string) => {
    const next = q.lefts.map((_, j) => (j === i ? (value === "" ? null : Number(value)) : pairAt(j)));
    c.set(next.every((x) => x === null) ? null : { pairs: next });
  };
  const rightOf = (source: number) => entries.find((e) => e.source === source)?.entry ?? { html: "", label: "" };
  return (
    <div class="fm-matching">
      {q.lefts.map((left, i) => {
        const id = `${c.name}/m${i}`;
        const hit = c.submitted ? (c.result?.results?.[i] ?? null) : null;
        const picked = pairAt(i);
        return (
          <div key={i} class="fm-match" data-result={hit === null ? undefined : hit ? "correct" : "wrong"}>
            <Html html={left} tag="span" class="fm-match-left" id={`${id}/label`} />
            <select
              id={id}
              class="fm-select"
              aria-labelledby={`${id}/label`}
              disabled={c.submitted}
              aria-invalid={hit === false ? "true" : undefined}
              value={picked === null ? "" : String(picked)}
              onChange={(e) => change(i, (e.currentTarget as HTMLSelectElement).value)}
            >
              <option value="">—</option>
              {shown.map((source) => (
                <option key={source} value={String(source)} selected={picked === source}>
                  {rightOf(source).label}
                </option>
              ))}
            </select>
            {hit !== null ? (
              <p class="fm-match-mark">
                <strong>{picked === null ? t.noAnswer : hit ? t.status.correct : t.status.incorrect}</strong>
                {hit ? null : (
                  <>
                    {` · ${t.correctAnswer}: `}
                    <Html html={rightOf(i).html} tag="span" />
                  </>
                )}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
