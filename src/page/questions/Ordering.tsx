import { useEffect, useRef, useState } from "preact/hooks";
import { readAnswer } from "../../core/attempt/answers";
import type { PageQuestion } from "../data";
import { type Ctx, Html } from "./shared";

type Dir = "up" | "down";

/** The order the page first shows: `plan.optionOrder` (source indices in display order). */
export const shownOrder = (c: Ctx, q: { id: string; items: unknown[] }): number[] => {
  const planned = c.quiz.plan.optionOrder?.[q.id];
  return planned && planned.length === q.items.length ? planned : q.items.map((_, i) => i);
};

/**
 * `ordering`: a list with ↑ and ↓ buttons. Nothing is stored until the first move (the page never starts in the right
 * order, and an untouched list is unanswered). Dragging comes later, on top of these buttons.
 */
export function Ordering({ q, c }: { q: Extract<PageQuestion, { type: "ordering" }>; c: Ctx }) {
  const { t } = c;
  const start = shownOrder(c, q);
  const given = readAnswer("ordering", c.answer)?.order;
  const order = given && given.length === q.items.length ? given : start;
  // the item at source index s was sent to the page at the place `start` holds s
  const itemOf = (s: number) => q.items[start.indexOf(s)] ?? { html: "", label: "" };
  const [said, setSaid] = useState("");
  const focus = useRef<{ source: number; dir: Dir } | null>(null);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const want = focus.current;
    if (want === null) return;
    focus.current = null;
    const row = list.current?.querySelector(`[data-source="${want.source}"]`);
    const same = row?.querySelector<HTMLButtonElement>(`button[data-dir="${want.dir}"]`);
    const other = row?.querySelector<HTMLButtonElement>(`button[data-dir="${want.dir === "up" ? "down" : "up"}"]`);
    (same && !same.disabled ? same : other)?.focus();
  });

  const move = (from: number, dir: Dir) => {
    const to = dir === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to] as number, next[from] as number];
    focus.current = { source: order[from] as number, dir };
    setSaid(t.movedTo(to + 1, order.length));
    c.set({ order: next });
  };

  return (
    <div class="fm-ordering">
      <ol class="fm-order-list" ref={list} aria-labelledby={`${c.name}/prompt`}>
        {order.map((source, position) => {
          const item = itemOf(source);
          const hit = c.submitted ? (c.result?.results?.[position] ?? null) : null;
          return (
            <li
              key={source}
              class="fm-order-item"
              data-source={source}
              data-result={hit === null ? undefined : hit ? "correct" : "wrong"}
            >
              <Html html={item.html} tag="span" class="fm-order-text" />
              {!c.submitted ? (
                <span class="fm-order-buttons">
                  <button
                    type="button"
                    class="fm-button fm-move"
                    data-dir="up"
                    aria-label={t.moveUp(item.label)}
                    disabled={position === 0}
                    onClick={() => move(position, "up")}
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    class="fm-button fm-move"
                    data-dir="down"
                    aria-label={t.moveDown(item.label)}
                    disabled={position === order.length - 1}
                    onClick={() => move(position, "down")}
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                </span>
              ) : (
                <span class="fm-order-mark">
                  <strong>{hit ? t.status.correct : t.status.incorrect}</strong>
                  {hit ? "" : ` · ${t.belongsAt(source + 1)}`}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p class="fm-sr" role="status" aria-live="polite">
        {said}
      </p>
    </div>
  );
}
