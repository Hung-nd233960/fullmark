/** The lines of a file as written: no BOM, any line ending (CRLF, LF, CR) removed. Line `n` is `lines[n - 1]`. */
export function splitLines(text: string): string[] {
  return text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
}

export type FrontMatterRange = {
  /** the closing delimiter's index in `lines` (0-based); the opening one is line 0 */
  close: number;
};

/**
 * Where the front matter ends. It must start on the first line with `---`. Returns "none" when the file does not
 * start with it and "unclosed" when it never ends.
 */
export function findFrontMatter(lines: readonly string[]): FrontMatterRange | "none" | "unclosed" {
  if (!/^---[ \t]*$/.test(lines[0] ?? "")) return "none";
  for (let i = 1; i < lines.length; i++) if (/^(---|\.\.\.)[ \t]*$/.test(lines[i] ?? "")) return { close: i };
  return "unclosed";
}

/**
 * The lines from `from` up to `to` (0-based, `to` excluded) that `claimed` does not take, with the blank lines
 * that followed a claimed block dropped, so that removing a container does not leave a gap of two blank lines.
 */
export function unclaimedLines(
  lines: readonly string[],
  from: number,
  to: number,
  claimed: (i: number) => boolean,
): string[] {
  const out: string[] = [];
  let afterClaim = false;
  for (let i = from; i < to; i++) {
    const line = lines[i] ?? "";
    if (claimed(i)) {
      afterClaim = true;
    } else if (afterClaim && line.trim() === "") {
      // dropped: the blank line that followed a removed block
    } else {
      afterClaim = false;
      out.push(line);
    }
  }
  return out;
}

/** Drops blank lines at the start and the end. */
export function trimBlankLines(lines: string[]): string[] {
  let a = 0;
  let b = lines.length;
  while (a < b && (lines[a] ?? "").trim() === "") a++;
  while (b > a && (lines[b - 1] ?? "").trim() === "") b--;
  return lines.slice(a, b);
}
