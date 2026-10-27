import type { Reporter } from "../report";

/** What an answer parser needs to know about the question it belongs to. */
export type AnswerEnv = {
  r: Reporter;
  /** the question heading's line (1-based): where a problem with the whole question is reported */
  headingLine: number;
  /** false for an ungraded question (`graded=false`, a survey, `scale`) */
  graded: boolean;
  points: number;
};
