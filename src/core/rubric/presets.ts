import type { RoundRule, Scale } from "./arith";

export type PresetName = "ielts-writing-task1" | "ielts-writing-task2";

export type Preset = {
  scale: Scale;
  round: RoundRule;
  criteria: readonly { id: string; text: string; weight: number }[];
};

const BANDS: Scale = { min: 0, max: 9, step: 0.5 };
const COMMON = [
  { id: "CC", text: "Coherence and Cohesion", weight: 1 },
  { id: "LR", text: "Lexical Resource", weight: 1 },
  { id: "GRA", text: "Grammatical Range and Accuracy", weight: 1 },
] as const;

/**
 * The built-in presets (TECHNICAL_DESIGN.md, section 6): the four public IELTS Writing criteria with equal weights,
 * bands 0 to 9 in halves, and IELTS rounding. The criterion texts are English whatever the quiz's language: grades
 * refer to the ids, so they are not in the message catalogs.
 */
export const PRESETS: Readonly<Record<PresetName, Preset>> = {
  "ielts-writing-task1": {
    scale: BANDS,
    round: "ielts",
    criteria: [{ id: "TA", text: "Task Achievement", weight: 1 }, ...COMMON],
  },
  "ielts-writing-task2": {
    scale: BANDS,
    round: "ielts",
    criteria: [{ id: "TR", text: "Task Response", weight: 1 }, ...COMMON],
  },
};

export const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];
