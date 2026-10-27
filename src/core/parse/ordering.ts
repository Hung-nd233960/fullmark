import type { Text } from "../ir";
import { itemText } from "./lists";
import type { ListItem } from "./outline";
import type { Reporter } from "./report";

/** The items of an `ordering` question, in the correct order: at least two, no duplicates. */
export function parseOrdering(
  lines: readonly string[],
  items: readonly ListItem[] | null,
  headingLine: number,
  r: Reporter,
): Text[] {
  const out: Text[] = (items ?? []).map((item) => {
    const t = itemText(lines, item);
    return { line: t.line, text: t.text.trim() };
  });
  if (out.length < 2) {
    r.error(
      "ordering.items",
      headingLine,
      "an ordering question needs a list of at least two items",
      "write the steps as 1. 2. 3. in the correct order",
    );
    return out;
  }
  const seen = new Set<string>();
  for (const item of out) {
    if (seen.has(item.text)) {
      r.error("ordering.items", item.line, `the item "${item.text}" appears twice`, "make the items distinct");
    }
    seen.add(item.text);
  }
  return out;
}
