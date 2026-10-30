/** The pure part of dragging an `ordering` item (the pointer code is in Ordering.tsx). */

export type Rect = { top: number; height: number };

/**
 * Where a lifted item lands among the items that stay: the number of them whose middle is above the lifted item's
 * middle. `rects` are the staying items in list order; the result is 0 (first) to `rects.length` (last).
 */
export function landingIndex(rects: readonly Rect[], middle: number): number {
  let index = 0;
  for (const r of rects) {
    if (r.top + r.height / 2 < middle) index++;
  }
  return index;
}

/** The order after taking the item at `from` out and putting it back at `to` (an index among the others). */
export function moveItem(order: readonly number[], from: number, to: number): number[] {
  const rest = order.filter((_, i) => i !== from);
  rest.splice(to, 0, order[from] as number);
  return rest;
}

/** How far to scroll the page for a pointer this close to an edge of the viewport: negative up, 0 away from the edges. */
export function edgeScroll(y: number, viewport: number, zone = 64, max = 18): number {
  if (y < zone) return -Math.ceil((max * (zone - Math.max(y, 0))) / zone);
  if (y > viewport - zone) return Math.ceil((max * (Math.min(y, viewport) - (viewport - zone))) / zone);
  return 0;
}

/**
 * The number each row of `order` shows while the item at `from` is lifted over the slot `to` (an index among the
 * others): the staying rows count around the slot, the lifted one shows the slot's number. Without a lift, 1, 2, 3...
 */
export function liveNumbers(length: number, from: number | null, to: number | null): number[] {
  const own = Array.from({ length }, (_, i) => i + 1);
  if (from === null || to === null) return own;
  const result: number[] = [];
  let seen = 0;
  for (let i = 0; i < length; i++) {
    if (i === from) {
      result.push(to + 1);
      continue;
    }
    result.push(seen < to ? seen + 1 : seen + 2);
    seen++;
  }
  return result;
}

/** How far (px) a mouse or pen must move after a press before the row lifts; below it the press is a click. */
export const DRAG_SLOP = 4;

/**
 * How a press on an `ordering` row starts a drag: with a mouse or pen a press anywhere on the row lifts it once the
 * pointer has moved `DRAG_SLOP` (`after-move`); on touch only the handle drags, at once (`now`); a press on the Up or
 * Down button never drags.
 */
export function grabOf(pointerType: string, onHandle: boolean, onButton: boolean): "now" | "after-move" | "never" {
  if (onButton) return "never";
  if (pointerType === "mouse" || pointerType === "pen") return "after-move";
  return onHandle ? "now" : "never";
}

/** Whether the pointer has moved far enough from where it was pressed to lift the row. */
export const pulled = (x0: number, y0: number, x: number, y: number): boolean =>
  Math.hypot(x - x0, y - y0) >= DRAG_SLOP;
