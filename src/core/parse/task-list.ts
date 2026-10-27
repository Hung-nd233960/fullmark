/** A task-list marker at the start of a list item's text: `[ ]`, `[x]` or `[X]`. */
export type TaskMarker = { checked: boolean; rest: string };

/** Splits `[x] text` into its marker and the text; null when the item has no marker. */
export function parseTaskMarker(text: string): TaskMarker | null {
  const m = /^\[([ xX])\](?:\s+|$)(.*)$/s.exec(text);
  if (!m) return null;
  return { checked: m[1] !== " ", rest: m[2] ?? "" };
}
