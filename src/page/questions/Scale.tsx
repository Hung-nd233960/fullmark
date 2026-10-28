import { readAnswer } from "../../core/attempt/answers";
import type { PageQuestion } from "../data";
import { type Ctx, Html } from "./shared";

/** One radio row from `min` to `max`, each label under its value. Never scored, so it shows only the pick. */
export function Scale({ q, c }: { q: Extract<PageQuestion, { type: "scale" }>; c: Ctx }) {
  const given = readAnswer("scale", c.answer)?.value;
  const values = Array.from({ length: Math.max(0, q.max - q.min + 1) }, (_, i) => q.min + i);
  return (
    <div class="fm-scale" role="radiogroup" aria-labelledby={`${c.name}/prompt`}>
      {values.map((value) => {
        const id = `${c.name}/s${value}`;
        const label = q.labels.find((l) => l.value === value);
        return (
          <label key={value} for={id} class="fm-scale-step" data-picked={given === value}>
            <input
              type="radio"
              id={id}
              name={c.name}
              checked={given === value}
              disabled={c.submitted}
              onChange={() => c.set({ value })}
            />
            <span class="fm-scale-value">{value}</span>
            {label ? <Html html={label.html} tag="span" class="fm-scale-label" /> : null}
          </label>
        );
      })}
    </div>
  );
}
