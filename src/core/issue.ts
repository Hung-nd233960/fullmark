/** A finding of the parser or of `check`: TECHNICAL_DESIGN.md, section 4 (Rules). */
export type Level = "error" | "warning" | "info" | "off";

export type Issue = {
  /** The rule id, a contract that agents and scripts match on: `choice.count`. */
  rule: string;
  level: Level;
  file: string;
  /** 1-based line in the file as written. */
  line: number;
  /** English, whatever the quiz's language. */
  message: string;
  fix?: string;
};
