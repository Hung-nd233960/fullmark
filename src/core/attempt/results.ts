import { z } from "zod";
import { type Attempt, AttemptSchema } from "./schema";

import { RESULTS_FORMAT, RESULTS_VERSION } from "./serialise";

export { RESULTS_FORMAT, RESULTS_VERSION, resultsOf } from "./serialise";

/**
 * `results-v2`: the serialised `Attempt` (TECHNICAL_DESIGN.md, section 4) under `format` and `version`. Every known
 * key is required; unknown keys are ignored, so a reader accepts what a later writer adds. `bundle` is the one key
 * reserved for pages that hold several quizzes (seams for later features): `hash` names the bundle, `sitting` the
 * sitting its files belong to.
 */
export const ResultsSchema = AttemptSchema.extend({
  format: z.literal(RESULTS_FORMAT),
  version: z.literal(RESULTS_VERSION),
  bundle: z.object({ hash: z.string(), sitting: z.string() }).optional(),
});
export type Results = z.infer<typeof ResultsSchema>;

export type ReadResults = { ok: true; results: Results; json: unknown } | { ok: false; message: string };

const MOVE_IN = "the move-in script converts the old files once (TECHNICAL_DESIGN.md, section 12, step 6)";

/**
 * Reads the text of a results file. `json` is the parsed file as it is (every key, the unknown ones too): the
 * `results_hash` of a grades file is taken over it. A 0.x file (version 1) is refused with a plain message.
 */
export function parseResults(text: string): ReadResults {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ""));
  } catch (error) {
    return { ok: false, message: `not a results file: it is not valid JSON (${(error as Error).message})` };
  }
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, message: "not a results file: it is not a JSON object" };
  }
  const head = json as { format?: unknown; version?: unknown };
  if (head.format !== RESULTS_FORMAT) {
    return { ok: false, message: `not a results file: its format is not "${RESULTS_FORMAT}"` };
  }
  if (head.version === 1) {
    return {
      ok: false,
      message: `this is a 0.x results file (version 1): fullmark 1.0 reads only version ${RESULTS_VERSION}; ${MOVE_IN}`,
    };
  }
  if (head.version !== RESULTS_VERSION) {
    return {
      ok: false,
      message: `unsupported results version ${String(head.version)}: this fullmark reads version ${RESULTS_VERSION}`,
    };
  }
  const parsed = ResultsSchema.safeParse(json);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".") || "(file)"}: ${i.message}`);
    return { ok: false, message: `the results file is malformed:\n  ${problems.join("\n  ")}` };
  }
  return { ok: true, results: parsed.data, json };
}

/** The `Attempt` a results file holds. */
export function attemptOf(results: Results): Attempt {
  return { quizHash: results.quizHash, plan: results.plan, state: results.state, phase: results.phase };
}
