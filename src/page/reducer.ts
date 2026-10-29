import type { Answer, Attempt, Plan } from "../core/attempt";
import { emptyState } from "../core/attempt/state";

/** What can happen to an attempt. The clock is an argument, so the reducer is pure. */
export type Action =
  /** `plan`: the questions and orders drawn when the learner pressed Start */
  | { type: "start"; at: string; plan: Plan }
  | { type: "answer"; question: string; answer: Answer | null }
  /** flag a question for review, or take the flag off */
  | { type: "flag"; question: string }
  /** `feedback: instant`: check an answered question, which locks its answer */
  | { type: "check"; question: string }
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
      if (attempt.phase !== "answering" || attempt.state.checked.includes(action.question)) return attempt;
      const answers = { ...attempt.state.answers };
      if (action.answer === null) delete answers[action.question];
      else answers[action.question] = action.answer;
      return { ...attempt, state: { ...attempt.state, answers } };
    }
    case "flag": {
      if (attempt.phase !== "answering" || !attempt.plan.questions.includes(action.question)) return attempt;
      const on = attempt.state.flagged.includes(action.question);
      const flagged = on
        ? attempt.state.flagged.filter((id) => id !== action.question)
        : [...attempt.state.flagged, action.question];
      return { ...attempt, state: { ...attempt.state, flagged } };
    }
    case "check": {
      const { state, plan } = attempt;
      if (attempt.phase !== "answering" || !plan.questions.includes(action.question)) return attempt;
      if (state.checked.includes(action.question) || state.answers[action.question] == null) return attempt;
      return { ...attempt, state: { ...state, checked: [...state.checked, action.question] } };
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
