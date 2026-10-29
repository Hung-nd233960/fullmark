import type { AttemptState } from "./schema";

/** The state of an attempt that has not started: no answers, no time. */
export function emptyState(): AttemptState {
  return {
    answers: {},
    startedAt: null,
    submittedAt: null,
    timeUsed: 0,
    sectionTime: {},
    flagged: [],
    checked: [],
    timedOut: false,
  };
}
