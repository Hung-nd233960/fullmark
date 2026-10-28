import { readAnswer } from "../../core/attempt/answers";
import type { PageQuestion } from "../data";
import { Badges, type Ctx, Html } from "./shared";

type Props = { q: Extract<PageQuestion, { type: "single" | "multi" }>; c: Ctx; multi: boolean };

/** `single` (radio) and `multi` (checkbox) share this list; `{input}` opens a box on any picked choice. */
export function ChoiceList({ q, c, multi }: Props) {
  const { t } = c;
  const one = multi ? null : readAnswer("single", c.answer);
  const many = multi ? readAnswer("multi", c.answer) : null;
  const picked = new Set<number>(
    multi ? (many?.choices ?? []) : one?.choice !== undefined && one.choice !== null ? [one.choice] : [],
  );
  const inputs = (multi ? many?.inputs : one?.inputs) ?? {};
  const keyed = c.keyed?.type === "single" || c.keyed?.type === "multi" ? c.keyed : undefined;

  const store = (next: Set<number>, texts: Record<string, string>) => {
    const kept = Object.fromEntries(Object.entries(texts).filter(([i]) => next.has(Number(i))));
    const withInputs = Object.keys(kept).length > 0 ? { inputs: kept } : {};
    if (multi) c.set(next.size === 0 ? null : { choices: [...next].sort((a, b) => a - b), ...withInputs });
    else c.set({ choice: [...next][0] ?? null, ...withInputs });
  };
  const toggle = (i: number) => {
    if (!multi) return store(new Set([i]), {});
    const next = new Set(picked);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    store(next, inputs);
  };

  return (
    <ul class="fm-choices">
      {q.choices.map((choice, i) => {
        const isPicked = picked.has(i);
        const isRight = c.submitted && keyed?.choices[i]?.correct === true;
        const id = `${c.name}/c${i}`;
        return (
          <li key={i} class="fm-choice" data-picked={isPicked} data-correct={isRight}>
            <label for={id}>
              <input
                type={multi ? "checkbox" : "radio"}
                id={id}
                name={c.name}
                value={i}
                checked={isPicked}
                disabled={c.submitted}
                onChange={() => toggle(i)}
              />
              <Html html={choice.html} tag="span" class="fm-choice-text" />
              {c.submitted ? <Badges t={t} picked={isPicked} right={isRight} /> : null}
            </label>
            {choice.input !== null && isPicked ? (
              <input
                type="text"
                class="fm-choice-input"
                aria-label={choice.input.prompt ?? t.inputPlaceholder}
                placeholder={choice.input.prompt ?? t.inputPlaceholder}
                autocomplete="off"
                value={inputs[String(i)] ?? ""}
                disabled={c.submitted}
                onInput={(e) => store(picked, { ...inputs, [String(i)]: (e.currentTarget as HTMLInputElement).value })}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
