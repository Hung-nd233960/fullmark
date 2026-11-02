import type { Attempt } from "../core/attempt";
import type { PageReplay } from "./data";

/**
 * The attempt a replay page opens on, read out of the embedded results file. The command has checked the file, so this
 * only picks the keys the Attempt has. A replay is shown submitted, whatever phase the file was saved in.
 */
export function replayAttempt(replay: PageReplay): Attempt {
  const file = JSON.parse(replay.results.replace(/^\uFEFF/, "")) as Attempt;
  return { quizHash: file.quizHash, plan: file.plan, state: file.state, phase: "submitted" };
}

/** `20 Oct 2026`'s parts from a zoneless stamp, read as written. */
export function dayOf(stamp: string | null | undefined): { day: number; month: number; year: number } | null {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(stamp ?? "");
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}
