import type { Answer, Attempt, Plan } from "../core/attempt";
import { emptyState } from "../core/attempt/state";

/** What can happen to an attempt. The clock is an argument, so the reducer is pure. */
export type Action =
  | { type: "start"; at: string }
  | { type: "answer"; question: string; answer: Answer | null }
  | { type: "submit"; at: string; timeUsed: number };

export function newAttempt(quizHash: string, plan: Plan): Attempt {
  return { quizHash, plan, state: emptyState(), phase: "start" };
}

/** The Attempt reducer (TECHNICAL_DESIGN.md, section 4): start, answer, submit. An action out of phase changes nothing. */
export function reduce(attempt: Attempt, action: Action): Attempt {
  switch (action.type) {
    case "start":
      if (attempt.phase !== "start") return attempt;
      return { ...attempt, phase: "answering", state: { ...attempt.state, startedAt: action.at } };
    case "answer": {
      if (attempt.phase !== "answering") return attempt;
      const answers = { ...attempt.state.answers };
      if (action.answer === null) delete answers[action.question];
      else answers[action.question] = action.answer;
      return { ...attempt, state: { ...attempt.state, answers } };
    }
    case "submit":
      if (attempt.phase !== "answering") return attempt;
      return {
        ...attempt,
        phase: "submitted",
        state: { ...attempt.state, submittedAt: action.at, timeUsed: Math.max(0, action.timeUsed) },
      };
  }
}
