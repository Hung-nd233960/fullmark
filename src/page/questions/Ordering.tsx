import { useEffect, useRef, useState } from "preact/hooks";
import { readAnswer } from "../../core/attempt/answers";
import type { PageQuestion } from "../data";
import { Icon } from "../icons";
import { edgeScroll, grabOf, landingIndex, liveNumbers, moveItem, pulled } from "./drag";
import { type Ctx, Html, shownEntries } from "./shared";

type Dir = "up" | "down";

/** What a drag in progress shows: the lifted item, and the place among the others where it will land. */
type Drag = { source: number; to: number };

/** The pointer side of a drag: how the lifted item was grabbed, and what to undo when it ends. */
type Session = { offset: number; height: number; y: number; frame: number; stop(): void };

/**
 * `ordering`: a list with a drag handle and ↑ and ↓ buttons on each item. Nothing is stored until the first move (the
 * page never starts in the right order, and an untouched list is unanswered). A drop and a button press record the same
 * action: one `answer` with the new order. The buttons are the accessible way; the handle is for a mouse or a finger.
 */
export function Ordering({ q, c }: { q: Extract<PageQuestion, { type: "ordering" }>; c: Ctx }) {
  const { t } = c;
  const shown = shownEntries(c, q.id, q.items);
  const start = shown.map((e) => e.source);
  const given = readAnswer("ordering", c.answer)?.order;
  // never moved: after Submit no item is marked, each shows only where it belongs
  const untouched = c.submitted && given === undefined;
  const order = given && given.length === q.items.length ? given : start;
  const itemOf = (s: number) => shown.find((e) => e.source === s)?.entry ?? { html: "", label: "" };
  const [said, setSaid] = useState("");
  const focus = useRef<{ source: number; dir: Dir } | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragging = useRef<Drag | null>(null);
  const session = useRef<Session | null>(null);
  // the handlers of a drag outlive the render they were made in
  const latest = useRef({ order, c, say: setSaid });
  latest.current = { order, c, say: setSaid };

  useEffect(() => {
    const want = focus.current;
    if (want === null) return;
    focus.current = null;
    const row = list.current?.querySelector(`[data-source="${want.source}"]`);
    const same = row?.querySelector<HTMLButtonElement>(`button[data-dir="${want.dir}"]`);
    const other = row?.querySelector<HTMLButtonElement>(`button[data-dir="${want.dir === "up" ? "down" : "up"}"]`);
    (same && !same.disabled ? same : other)?.focus();
  });

  // a drag ends with the component, and when the question is locked under it (the time ran out)
  useEffect(() => {
    if (c.submitted) session.current?.stop();
    return () => session.current?.stop();
  }, [c.submitted]);

  const move = (from: number, dir: Dir) => {
    const to = dir === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to] as number, next[from] as number];
    focus.current = { source: order[from] as number, dir };
    setSaid(t.movedTo(to + 1, order.length));
    c.set({ order: next });
  };

  /** Lifts `row`; the pointer is followed on the window until it is let go. */
  const lift = (g: { pointerId: number; clientY: number; pressY: number }, row: HTMLElement, source: number) => {
    const ol = list.current;
    if (c.submitted || ol === null || session.current !== null) return;
    try {
      row.setPointerCapture(g.pointerId);
    } catch {
      // the window listeners below do the work without it
    }
    const box = row.getBoundingClientRect();
    ol.style.setProperty("--drag-x", `${box.left}px`);
    ol.style.setProperty("--drag-w", `${box.width}px`);
    ol.style.setProperty("--drag-h", `${box.height}px`);
    const s: Session = { offset: g.pressY - box.top, height: box.height, y: g.clientY, frame: 0, stop: () => {} };
    session.current = s;

    // the lifted item follows the pointer; the slot goes where its middle falls among the items that stay
    const follow = () => {
      const top = s.y - s.offset;
      ol.style.setProperty("--drag-y", `${top}px`);
      const staying = [...ol.querySelectorAll<HTMLElement>(".fm-order-item:not([data-lifted])")].map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, height: r.height };
      });
      const to = landingIndex(staying, top + s.height / 2);
      if (dragging.current !== null && dragging.current.to !== to) {
        dragging.current = { source, to };
        setDrag(dragging.current);
      }
    };
    const scroll = () => {
      const dy = edgeScroll(s.y, window.innerHeight);
      if (dy !== 0) {
        window.scrollBy(0, dy);
        follow();
      }
      s.frame = requestAnimationFrame(scroll);
    };
    const moved = (ev: PointerEvent) => {
      s.y = ev.clientY;
      follow();
    };
    const end = (drop: boolean) => {
      const here = dragging.current;
      s.stop();
      if (!drop || here === null) return;
      const { order: now, c: ctx, say } = latest.current;
      const from = now.indexOf(here.source);
      if (here.to === from) return;
      say(ctx.t.movedTo(here.to + 1, now.length));
      ctx.set({ order: moveItem(now, from, here.to) });
    };
    const up = () => end(true);
    const cancel = () => end(false);
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      end(false);
    };
    s.stop = () => {
      cancelAnimationFrame(s.frame);
      window.removeEventListener("pointermove", moved);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      for (const name of ["--drag-x", "--drag-y", "--drag-w", "--drag-h"]) ol.style.removeProperty(name);
      session.current = null;
      dragging.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", moved);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
    dragging.current = { source, to: order.indexOf(source) };
    setDrag(dragging.current);
    follow();
    s.frame = requestAnimationFrame(scroll);
  };

  /**
   * A press on a row. Touch drags by the handle at once; a mouse or pen drags by any part of the row once it has moved a
   * few pixels (below that it is a click, and the row's text is not half-selected); the buttons never drag.
   */
  const press = (e: PointerEvent, source: number) => {
    const row = e.currentTarget as HTMLElement;
    const target = e.target as HTMLElement;
    const how = grabOf(e.pointerType, target.closest(".fm-drag-handle") !== null, target.closest("button") !== null);
    if (c.submitted || session.current !== null || how === "never") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const grab = { pointerId: e.pointerId, clientY: e.clientY, pressY: e.clientY };
    if (how === "now") {
      e.preventDefault();
      lift(grab, row, source);
      return;
    }
    const [x0, y0] = [e.clientX, e.clientY];
    row.setAttribute("data-pressing", "true");
    const unwatch = () => {
      row.removeAttribute("data-pressing");
      window.removeEventListener("pointermove", watch);
      window.removeEventListener("pointerup", unwatch);
      window.removeEventListener("pointercancel", unwatch);
    };
    const watch = (ev: PointerEvent) => {
      if (ev.pointerId !== grab.pointerId || !pulled(x0, y0, ev.clientX, ev.clientY)) return;
      unwatch();
      lift({ ...grab, clientY: ev.clientY }, row, source);
    };
    window.addEventListener("pointermove", watch);
    window.addEventListener("pointerup", unwatch);
    window.addEventListener("pointercancel", unwatch);
  };

  // while dragging, the slot goes before the staying item the lifted one will land in front of (or at the end)
  const staying = drag === null ? order : order.filter((s) => s !== drag.source);
  const slotBefore = drag === null ? null : (staying[drag.to] ?? null);
  const numbers = liveNumbers(order.length, drag === null ? null : order.indexOf(drag.source), drag?.to ?? null);
  const slot = <li key="slot" class="fm-order-slot" aria-hidden="true" />;

  return (
    <div class="fm-ordering">
      <ol
        class="fm-order-list"
        ref={list}
        aria-labelledby={`${c.name}/prompt`}
        data-dragging={drag === null ? undefined : "true"}
      >
        {order.flatMap((source, position) => {
          const item = itemOf(source);
          const hit = c.submitted && !untouched ? (c.result?.results?.[position] ?? null) : null;
          const row = (
            <li
              key={source}
              class="fm-order-item"
              data-source={source}
              data-lifted={drag?.source === source ? "true" : undefined}
              data-n={numbers[position]}
              onPointerDown={c.submitted ? undefined : (e) => press(e, source)}
              data-result={hit === null ? undefined : hit ? "correct" : "wrong"}
            >
              {!c.submitted ? (
                <span class="fm-drag-handle" aria-hidden="true">
                  <Icon name="grip" size={20} />
                </span>
              ) : null}
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
                    <Icon name="up" size={16} />
                    {t.moveUpWord}
                  </button>
                  <button
                    type="button"
                    class="fm-button fm-move"
                    data-dir="down"
                    aria-label={t.moveDown(item.label)}
                    disabled={position === order.length - 1}
                    onClick={() => move(position, "down")}
                  >
                    <Icon name="down" size={16} />
                    {t.moveDownWord}
                  </button>
                </span>
              ) : (
                <span class="fm-order-mark">
                  {untouched ? null : <strong>{hit ? t.status.correct : t.status.incorrect}</strong>}
                  {hit ? "" : `${untouched ? "" : " · "}${t.belongsAt(source + 1)}`}
                </span>
              )}
            </li>
          );
          return source === slotBefore ? [slot, row] : [row];
        })}
        {drag !== null && slotBefore === null ? slot : null}
      </ol>
      <p class="fm-sr" role="status" aria-live="polite">
        {said}
      </p>
    </div>
  );
}
