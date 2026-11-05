/** One line of a line diff: unchanged, only in the earlier text (`del`) or only in the later one (`add`). */
export type DiffLine = { kind: "same" | "del" | "add"; text: string };

/**
 * The lines of a text. One final newline ends the last line rather than starting an empty one, so a block as hashed
 * (which ends in a newline) and the same block without it have the same lines.
 */
function linesOf(text: string): string[] {
  if (text === "") return [];
  return (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
}

/**
 * A line diff of two texts, by their longest common subsequence of lines (`quiz review --since` shows it between the
 * question as judged and as it is now). Pure, with no package behind it: a question's block is a few dozen lines. In a
 * stretch that changed, the removed lines come before the added ones.
 */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = linesOf(before);
  const b = linesOf(after);
  // common[i][j]: the length of the longest common subsequence of a[i..] and b[j..]
  const common: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i]![j] = a[i] === b[j] ? common[i + 1]![j + 1]! + 1 : Math.max(common[i + 1]![j]!, common[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] as string });
      i++;
      j++;
    } else if (common[i + 1]![j]! >= common[i]![j + 1]!) {
      out.push({ kind: "del", text: a[i] as string });
      i++;
    } else {
      out.push({ kind: "add", text: b[j] as string });
      j++;
    }
  }
  for (; i < a.length; i++) out.push({ kind: "del", text: a[i] as string });
  for (; j < b.length; j++) out.push({ kind: "add", text: b[j] as string });
  return out;
}
