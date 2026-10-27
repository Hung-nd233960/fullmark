/** The four exit codes of COMMANDS.md (Conventions). */
export const EXIT = {
  /** Done. Warnings may have been printed. */
  done: 0,
  /** Problems found: check errors, a refused quiz, a mismatched attempt. */
  problems: 1,
  /** Usage error, I/O error, timeout, or nothing to work on. */
  usage: 2,
  /** Needs input: a human-only value is missing. */
  needsInput: 3,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];
