/** A whole quiz file around a body, for the examples that `quiz rules RULE` shows. */
export function file(body: string, front = "title: Example"): string {
  return `---\n${front}\n---\n\n${body}\n`;
}
