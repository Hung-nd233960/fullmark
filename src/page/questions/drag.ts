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
