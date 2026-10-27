/**
 * Whether a pattern is valid in JavaScript's `u` mode with the extra limits of QUIZ_SYNTAX.md (short): no
 * lookbehind and no inline flags, which engines differ on. Returns a reason, or null when the pattern is fine.
 */
export function regexProblem(pattern: string): string | null {
  // Escapes and character classes are blanked out so that "[(?<=]" or "\(?i)" are not mistaken for syntax.
  const bare = pattern.replace(/\\./gs, "xx").replace(/\[(?:[^\]\\]|\\.)*\]/gs, "x");
  if (/\(\?<[=!]/.test(bare)) return "lookbehind is not supported";
  if (/\(\?[a-zA-Z-]+[:)]/.test(bare)) return "inline flags are not supported";
  try {
    new RegExp(pattern, "u");
  } catch (error) {
    return (error as Error).message.replace(/^Invalid regular expression: /, "");
  }
  return null;
}
