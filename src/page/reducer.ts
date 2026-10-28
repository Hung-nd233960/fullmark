import type { Answer, Attempt, Plan } from "../core/attempt";
import { emptyState } from "../core/attempt/state";

/** What can happen to an attempt. The clock is an argument, so the reducer is pure. */
export type Action =
  /** `plan`: the questions and orders drawn when the learner pressed Start */
  | { type: "start"; at: string; plan: Plan }
  | { type: "answer"; question: string; answer: Answer | null }
  /** the clock moved: seconds used and seconds per section, as the page counted them */
  | { type: "tick"; timeUsed: number; sectionTime: Record<string, number> }
  | { type: "submit"; at: string; timeUsed: number; timedOut?: boolean; sectionTime?: Record<string, number> };

/** An attempt that has not started. Its plan is a stand-in (every question, in the data's order) until Start draws one. */
export function newAttempt(quizHash: string, plan: Plan): Attempt {
  return { quizHash, plan, state: emptyState(), phase: "start" };
}

/** The Attempt reducer (TECHNICAL_DESIGN.md, section 4): start, answer, tick, submit. An action out of phase changes nothing. */
export function reduce(attempt: Attempt, action: Action): Attempt {
  switch (action.type) {
    case "start":
      if (attempt.phase !== "start") return attempt;
      return { ...attempt, phase: "answering", plan: action.plan, state: { ...attempt.state, startedAt: action.at } };
    case "answer": {
      if (attempt.phase !== "answering") return attempt;
      const answers = { ...attempt.state.answers };
      if (action.answer === null) delete answers[action.question];
      else answers[action.question] = action.answer;
      return { ...attempt, state: { ...attempt.state, answers } };
    }
    case "tick":
      if (attempt.phase !== "answering") return attempt;
      return {
        ...attempt,
        state: { ...attempt.state, timeUsed: Math.max(0, action.timeUsed), sectionTime: { ...action.sectionTime } },
      };
    case "submit":
      if (attempt.phase !== "answering") return attempt;
      return {
        ...attempt,
        phase: "submitted",
        state: {
          ...attempt.state,
          submittedAt: action.at,
          timeUsed: Math.max(0, action.timeUsed),
          timedOut: action.timedOut === true,
          ...(action.sectionTime ? { sectionTime: { ...action.sectionTime } } : {}),
        },
      };
  }
}
