import { readAnswer } from "../../core/attempt/answers";
import type { PageQuestion } from "../data";
import { acceptedNumber, CommaWarning, type Ctx, Shown, wantsPoint } from "./shared";

export function Numeric({ q, c }: { q: Extract<PageQuestion, { type: "numeric" }>; c: Ctx }) {
  const { t } = c;
  const raw = readAnswer("numeric", c.answer)?.raw ?? "";
  const key = c.keyed?.type === "numeric" ? c.keyed.key : undefined;
  return (
    <div class="fm-text-answer">
      <div class="fm-numeric">
        <input
          type="text"
          class="fm-text"
          inputMode="decimal"
          autocomplete="off"
          spellcheck={false}
          aria-labelledby={`${c.name}/prompt`}
          value={raw}
          disabled={c.submitted}
          onInput={(e) => {
            const text = (e.currentTarget as HTMLInputElement).value;
            c.set(text === "" ? null : { raw: text });
          }}
        />
        {q.unit !== "" ? <span class="fm-unit">{q.unit}</span> : null}
      </div>
      {!c.submitted && wantsPoint(c.quiz, raw) ? <CommaWarning t={t} /> : null}
      {c.submitted ? <Shown t={t} given={raw} correct={key ? acceptedNumber(t, key) : null} /> : null}
    </div>
  );
}
