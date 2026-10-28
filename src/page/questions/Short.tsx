import { readAnswer } from "../../core/attempt/answers";
import type { PageQuestion } from "../data";
import { type Ctx, Shown } from "./shared";

export function Short({ c }: { q: Extract<PageQuestion, { type: "short" }>; c: Ctx }) {
  const text = readAnswer("short", c.answer)?.text ?? "";
  const key = c.keyed?.type === "short" ? c.keyed.key : undefined;
  return (
    <div class="fm-text-answer">
      <input
        type="text"
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
      {c.submitted ? <Shown t={c.t} given={text} correct={key?.accept[0] ?? null} /> : null}
    </div>
  );
}
