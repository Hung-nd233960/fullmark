import type { QuestionType } from "../ir";

/**
 * `pending`: an essay or code answer waiting for a grader. `ungraded`: answered, and not scored (a survey, `scale`,
 * `graded=false`). `unanswered`: nothing was given (also for an ungraded question).
 */
export type QuestionStatus = "correct" | "partial" | "incorrect" | "unanswered" | "pending" | "ungraded";

export type GradedQuestion = {
  id: string;
  /** the id of the section the question is in (empty for an untitled section) */
  section: string;
  type: QuestionType;
  tags: string[];
  /** the question's points; 0 when the question is ungraded */
  points: number;
  /** null while pending, and for an ungraded question; an unanswered essay is null too */
  earned: number | null;
  status: QuestionStatus;
  /** per blank, field (null: an ungraded field), item or pair; null for the other types */
  results: (boolean | null)[] | null;
  /** an essay's word count, computed here; null for the other types */
  words: number | null;
};

/** What a group of questions (the quiz, a section, a tag) scored. */
export type Tally = {
  /** the questions in the group that are in the plan */
  questions: number;
  /** of those, the ones with an answer */
  answered: number;
  earned: number;
  /** the points that were scored: auto-graded questions, graded essays and code, and unanswered ones (0 earned) */
  points: number;
  /** the points still waiting for a grader */
  pending: number;
};

export type Graded = {
  /** the plan's questions, in the plan's order; questions outside the plan are not counted */
  questions: GradedQuestion[];
  /** the ids the plan names that the quiz does not have (a quiz edited since, or a wrong file) */
  unknown: string[];
  total: Tally;
  /** one per section that has a question in the plan, in the quiz's order */
  sections: (Tally & { id: string; title: string | null })[];
  /** one per tag, in code-unit order of the tag */
  tags: (Tally & { tag: string })[];
  /** a survey has no score: every question is ungraded */
  survey: boolean;
  /** `pass_mark` against the scored points; `passed` is null without a pass mark or a scored point */
  pass: { mark: number | null; passed: boolean | null };
};

/** Marks given by a grader to essays and code, by question id: `earned` out of the question's points. */
export type ManualScores = Readonly<Record<string, number>>;
