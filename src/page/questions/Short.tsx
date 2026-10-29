import { readAnswer } from "../../core/attempt/answers";
import type { PageQuestion } from "../data";
import { type Ctx, Shown } from "./shared";

export function Short({ c }: { q: Extract<PageQuestion, { type: "short" }>; c: Ctx }) {
  const { t } = c;
  const text = readAnswer("short", c.answer)?.text ?? "";
  const key = c.keyed?.type === "short" ? c.keyed.key : undefined;
  return (
    <div class="fm-text-answer">
      {!c.submitted ? (
        <div class="fm-numeric">
          <label class="fm-answer-label" for={`${c.name}/input`}>
            {t.yourAnswer}
          </label>
          <input
            type="text"
            id={`${c.name}/input`}
            class="fm-text"
            autocomplete="off"
            spellcheck={false}
            aria-labelledby={`${c.name}/prompt`}
            value={text}
            disabled={c.submitted}
            onInput={(e) => {
              const v = (e.currentTarget as HTMLInputElement).value;
              c.set(v === "" ? null : { text: v });
            }}
          />
        </div>
      ) : null}
      {c.submitted ? <Shown t={c.t} given={text} correct={key?.accept[0] ?? null} status={c.result?.status} /> : null}
    </div>
  );
}
