import type { Attempt } from "../core/attempt";
import { en, vi } from "../core/i18n";
import type { PageQuiz } from "./data";
import { currentOf } from "./map";
import { limitOf } from "./results";
import { clockText } from "./store";

/** One segment of the status line. `progress` carries the bar and its percentage. */
export type Segment =
  | { kind: "time" | "part" | "question" | "flags" | "submitted" | "taken" | "used" | "clock"; text: string }
  | { kind: "progress"; text: string; value: number; max: number; percent: number };

export type StatusInput = {
  page: PageQuiz;
  attempt: Attempt;
  /** seconds on the clock */
  elapsed: number;
  /** seconds in each section, as the clock counts them */
  sectionSeconds: Record<string, number>;
  /** the question last focused or answered; null: the first of the plan */
  current: string | null;
  /** the local time `14:05`, when the page is fullscreen; null otherwise */
  fullscreenClock: string | null;
  /** the page shows a replay (`quiz replay`): the first segment says so */
  replay?: boolean;
};

/** How far an attempt has got: the one count the status line and the Submit dialog both read. */
export type Counts = {
  total: number;
  answered: number;
  flagged: number;
  /** the first question of the plan without an answer, and the first flagged one */
  firstUnanswered: string | null;
  firstFlagged: string | null;
};

/** Answered, flagged and the first of each, over the plan (a `feedback: instant` question is answered once checked). */
export function attemptCounts(attempt: Pick<Attempt, "plan" | "state">): Counts {
  const plan = attempt.plan.questions;
  const answered = plan.filter((id) => attempt.state.answers[id] != null);
  const flagged = plan.filter((id) => attempt.state.flagged.includes(id));
  return {
    total: plan.length,
    answered: answered.length,
    flagged: flagged.length,
    firstUnanswered: plan.find((id) => attempt.state.answers[id] == null) ?? null,
    firstFlagged: flagged[0] ?? null,
  };
}

const pageText = (page: PageQuiz) => (page.uiLang === "vi" ? vi : en).page;

/** `26 Oct, 14:32`'s parts from a zoneless stamp (`2026-10-26T14:32:00`), read as written: no `toLocaleString`. */
export function stampParts(stamp: string): { day: number; month: number; time: string } | null {
  const m = /^\d{4}-(\d\d)-(\d\d)T(\d\d:\d\d)/.exec(stamp);
  return m ? { month: Number(m[1]), day: Number(m[2]), time: m[3] as string } : null;
}

/**
 * The status line's segments, from the attempt alone (TECHNICAL_DESIGN.md, section 8, "Top bar and status line"). While
 * answering: time, the current part (when its section has a suggested time), the current question, progress, flags.
 * After Submit: when, what was taken and the time used.
 */
export function statusFor({
  page,
  attempt,
  elapsed,
  sectionSeconds,
  current,
  fullscreenClock,
  replay = false,
}: StatusInput): Segment[] {
  const t = pageText(page);
  const plan = attempt.plan.questions;
  const total = plan.length;
  const limit = limitOf(page, attempt);
  const segments: Segment[] = [];

  if (attempt.phase === "submitted") {
    const stamp = attempt.state.submittedAt === null ? null : stampParts(attempt.state.submittedAt);
    if (stamp !== null) {
      segments.push({
        kind: "submitted",
        text: (replay ? t.replaySubmittedOn : t.submittedOn)(
          stamp.day,
          t.monthsShort[stamp.month - 1] ?? "",
          stamp.time,
        ),
      });
    }
    const count = t.questionsCount(total);
    const { source, section } = attempt.plan;
    const titled = page.sections.filter((s) => s.title !== null);
    const part = source === "section" ? titled.findIndex((s) => s.id === section) : -1;
    const partTitle = part >= 0 ? (titled[part]?.title ?? null) : null;
    segments.push({
      kind: "taken",
      text:
        source === "retry"
          ? t.takenRetry(count)
          : partTitle !== null
            ? t.takenPart(part + 1, partTitle, count)
            : t.takenWhole(count),
    });
    const used = attempt.state.timeUsed;
    segments.push({
      kind: "used",
      text: t.timeUsedLine(clockText(used), limit === undefined ? null : clockText(limit)),
    });
    if (fullscreenClock !== null) segments.push({ kind: "clock", text: t.focusClock(fullscreenClock) });
    return segments;
  }

  segments.push({
    kind: "time",
    text:
      limit === undefined
        ? t.timeSoFar(clockText(elapsed))
        : limit - elapsed > 0
          ? t.timeLeft(clockText(limit - elapsed))
          : t.timeUp,
  });

  const currentId = currentOf(plan, current);
  const owner = new Map<string, number>();
  page.sections.forEach((s, i) => {
    for (const q of s.questions) owner.set(q.id, i);
  });
  // the parts of this plan, in its order: a run of questions of one section is one part
  const parts: number[] = [];
  for (const id of plan) {
    const i = owner.get(id);
    if (i !== undefined && parts.at(-1) !== i) parts.push(i);
  }
  const at = currentId === null ? undefined : owner.get(currentId);
  const section = at === undefined ? undefined : page.sections[at];
  if (attempt.plan.source !== "retry" && section?.time !== undefined && at !== undefined) {
    const n = parts.indexOf(at) + 1;
    const left = section.time - (sectionSeconds[section.id] ?? 0);
    const title = section.title;
    segments.push({
      kind: "part",
      text:
        left > 0 ? t.partTimeLeft(n, parts.length, title, clockText(left)) : t.partTimePassed(n, parts.length, title),
    });
  }

  if (currentId !== null) {
    segments.push({ kind: "question", text: t.questionOf(plan.indexOf(currentId) + 1, total) });
  }

  const { answered, flagged: flags } = attemptCounts(attempt);
  segments.push({
    kind: "progress",
    text: t.answeredOf(answered, total),
    value: answered,
    max: total,
    percent: total === 0 ? 0 : Math.round((answered / total) * 100),
  });

  if (flags > 0) segments.push({ kind: "flags", text: t.flaggedCount(flags) });

  if (fullscreenClock !== null) segments.push({ kind: "clock", text: t.focusClock(fullscreenClock) });
  return segments;
}

/**
 * The phone's one muted line under the title (TECHNICAL_DESIGN.md, section 8, "On a phone"): while answering the time
 * and the progress ("18:42 left · 19 of 32 answered", untimed "Time 18:42 · ..."), then the clock in Focus mode; after
 * Submit when it was handed in. The part, the current question and the flags are left out.
 */
export function compactLine(input: StatusInput): string {
  return compactParts(input)
    .map((p) => p.text)
    .join(" · ");
}

/** The compact line's parts, each with the kind of status segment it came from (the phone bar bolds the numbers). */
export function compactParts(input: StatusInput): { kind: string; text: string }[] {
  const t = pageText(input.page);
  const limit = limitOf(input.page, input.attempt);
  const parts: { kind: string; text: string }[] = [];
  for (const segment of statusFor(input)) {
    if (segment.kind === "time") {
      const left = limit === undefined ? null : limit - input.elapsed;
      parts.push({ kind: "time", text: left !== null && left > 0 ? t.timeLeftCompact(clockText(left)) : segment.text });
    } else if (segment.kind === "progress" || segment.kind === "submitted") {
      parts.push({ kind: segment.kind, text: segment.text });
    } else if (segment.kind === "clock" && input.fullscreenClock !== null) {
      parts.push({ kind: "clock", text: t.focusClockCompact(input.fullscreenClock) });
    }
  }
  return parts;
}
