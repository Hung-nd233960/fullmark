import type { Issue, Level } from "../issue";

/** Collects the issues of one parse. Lines are 1-based. */
export class Reporter {
  readonly issues: Issue[] = [];

  constructor(readonly file: string) {}

  add(level: Level, rule: string, line: number, message: string, fix?: string): void {
    this.issues.push({ rule, level, file: this.file, line, message, ...(fix === undefined ? {} : { fix }) });
  }

  error(rule: string, line: number, message: string, fix?: string): void {
    this.add("error", rule, line, message, fix);
  }

  warning(rule: string, line: number, message: string, fix?: string): void {
    this.add("warning", rule, line, message, fix);
  }

  get hasErrors(): boolean {
    return this.issues.some((i) => i.level === "error");
  }
}

/** The closest of `known` to `word` within two edits, for "did you mean". */
export function suggest(word: string, known: readonly string[]): string | undefined {
  let best: { name: string; d: number } | undefined;
  for (const name of known) {
    const d = distance(word, name);
    if (d <= 2 && (!best || d < best.d)) best = { name, d };
  }
  return best?.name;
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j] ?? 0;
      row[j] = Math.min(tmp + 1, (row[j - 1] ?? 0) + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length] ?? 0;
}

/** "unknown key `x`" with a suggestion when there is one close by. */
export function unknownKey(kind: string, name: string, known: readonly string[]): { message: string; fix?: string } {
  const near = suggest(name, known);
  return {
    message: `unknown ${kind} \`${name}\``,
    ...(near ? { fix: `did you mean \`${near}\`?` } : { fix: `the ${kind}s are: ${known.join(", ")}` }),
  };
}
