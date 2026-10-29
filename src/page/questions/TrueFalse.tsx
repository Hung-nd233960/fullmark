import { readAnswer } from "../../core/attempt/answers";
import type { PageQuestion } from "../data";
import { Badges, type Ctx } from "./shared";

export function TrueFalse({ c }: { q: Extract<PageQuestion, { type: "truefalse" }>; c: Ctx }) {
  const { t } = c;
  const given = readAnswer("truefalse", c.answer)?.value;
  const right = c.keyed?.type === "truefalse" ? c.keyed.value : undefined;
  return (
    <ul class="fm-choices fm-truefalse">
      {[true, false].map((value) => {
        const id = `${c.name}/${value ? "true" : "false"}`;
        const isPicked = given === value;
        const isRight = c.submitted && right === value;
        return (
          <li
            key={String(value)}
            class="fm-choice"
            data-picked={isPicked}
            data-correct={c.submitted ? isRight : undefined}
          >
            <label for={id}>
              <input
                class="fm-native"
                type="radio"
                id={id}
                name={c.name}
                checked={isPicked}
                disabled={c.submitted}
                onChange={() => c.set({ value })}
              />
              <span class="fm-letter" aria-hidden="true">
                {value ? t.trueLetter : t.falseLetter}
              </span>
              <span class="fm-choice-text">{value ? t.trueLabel : t.falseLabel}</span>
              {c.submitted ? <Badges t={t} picked={isPicked} right={isRight} /> : null}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
