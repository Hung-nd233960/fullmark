import { z } from "zod";
import { AnswerSchema } from "./answers";

/** Where a plan's questions came from (TECHNICAL_DESIGN.md, section 4). `missed` and `retry` are made elsewhere. */
export const PLAN_SOURCES = ["full", "bank", "section", "missed", "retry"] as const;

/**
 * Which questions an attempt gets, and in which order. `optionOrder` is only there when options are shuffled, and
 * holds the order the page showed them in; the answers never depend on it.
 */
export const PlanSchema = z.object({
  source: z.enum(PLAN_SOURCES),
  /** the section's id, for a `section` plan */
  section: z.string().optional(),
  questions: z.array(z.string()),
  optionOrder: z.record(z.string(), z.array(z.number().int().min(0))).optional(),
  seed: z.string().optional(),
});
export type Plan = z.infer<typeof PlanSchema>;

/** An ISO 8601 date and time as the page writes it: `2026-10-23T16:02:00`, with an optional fraction and zone. */
const iso = z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?$/, "an ISO date and time");

/**
 * Everything that changes while a quiz is taken (a proposal for the design docs): what grading, reports and `stats`
 * need, and what the page's reducer restores on resume and replay. Every key is required.
 */
export const AttemptStateSchema = z.object({
  /** the answers by question id; null (or no entry) for a question left unanswered */
  answers: z.record(z.string(), AnswerSchema.nullable()),
  /** when the learner pressed Start, as the page wrote it; null before that */
  startedAt: iso.nullable(),
  /** when the attempt was submitted; null until then */
  submittedAt: iso.nullable(),
  /** seconds spent, as the page's timer counted them */
  timeUsed: z.number().min(0),
  /** seconds spent in each section, by section id (an untitled section: the empty string); sections visited only */
  sectionTime: z.record(z.string(), z.number().min(0)),
  /** the ids of the questions the learner flagged for review */
  flagged: z.array(z.string()),
  /** true when `time_limit` ran out and the page submitted */
  timedOut: z.boolean(),
});
export type AttemptState = z.infer<typeof AttemptStateSchema>;

export const PHASES = ["start", "answering", "submitted"] as const;

export const AttemptSchema = z.object({
  /** the version this attempt was taken on */
  quizHash: z.string().regex(/^[0-9a-f]{64}$/, "a SHA-256 in lower-case hex"),
  plan: PlanSchema,
  state: AttemptStateSchema,
  phase: z.enum(PHASES),
});
export type Attempt = z.infer<typeof AttemptSchema>;

/** The state of an attempt that has not started: no answers, no time. */
export function emptyState(): AttemptState {
  return {
    answers: {},
    startedAt: null,
    submittedAt: null,
    timeUsed: 0,
    sectionTime: {},
    flagged: [],
    timedOut: false,
  };
}
