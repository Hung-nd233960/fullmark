import type { Results } from "./results";
import type { Attempt } from "./schema";

export const RESULTS_FORMAT = "fullmark-results";
export const RESULTS_VERSION = 2;

/** The file for an attempt: format and version first, then the attempt. */
export function resultsOf(attempt: Attempt, bundle?: Results["bundle"]): Results {
  return {
    format: RESULTS_FORMAT,
    version: RESULTS_VERSION,
    quizHash: attempt.quizHash,
    plan: attempt.plan,
    state: attempt.state,
    phase: attempt.phase,
    ...(bundle ? { bundle } : {}),
  };
}
