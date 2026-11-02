import { useRef } from "preact/hooks";
import type { Graded, GradedQuestion } from "../core/grade";
import type { PageQuiz } from "./data";
import { Icon } from "./icons";
import { messagesFor, type PageMessages } from "./questions/shared";
import { type Counts, countsOf, limitOf, missedIds, num, percentOf } from "./results";
import { clockText, type QuizState } from "./store";

/** The five states of a question, in the order a bar lays them out. */
const STATES = ["correct", "partial", "incorrect", "unanswered", "pending"] as const;

/** A bar split by result. The widths are SVG attributes: the page's CSP allows no `style` attribute. */
function SplitBar({ counts, label }: { counts: Counts; label: string }) {
  const total = STATES.reduce((n, s) => n + counts[s], 0);
  let at = 0;
  return (
    <svg class="fm-bar" viewBox="0 0 100 4" preserveAspectRatio="none" role="img" aria-label={label}>
      <rect class="fm-seg fm-seg-none" x="0" y="0" width="100" height="4" />
      {total > 0
        ? STATES.map((s) => {
            if (counts[s] === 0) return null;
            const width = (counts[s] / total) * 100;
            const x = at;
            at += width;
            return <rect key={s} class={`fm-seg fm-seg-${s}`} x={x} y="0" width={width} height="4" />;
          })
        : null}
    </svg>
  );
}

/** "23.5 / 33", with the points still waiting after a plus and an asterisk. */
export function Points({
  earned,
  points,
  pending,
  lang,
}: {
  earned: number;
  points: number;
  pending: number;
  lang: "en" | "vi";
}) {
  return pending > 0 ? (
    <i>
      {num(earned, lang)} / {num(points, lang)} + {num(pending, lang)}*
    </i>
  ) : (
    <>
      {num(earned, lang)} / {num(points, lang)}
    </>
  );
}

function Percent({ earned, points, pending }: { earned: number; points: number; pending: number }) {
  const percent = percentOf(earned, points);
  if (percent === null) return null;
  return pending > 0 ? <i>{percent}%*</i> : <>{percent}%</>;
}

/**
 * The results card (TECHNICAL_DESIGN.md, section 8, "Results"). Every number is core's `grade`; nothing is recomputed
 * here beyond percentages and counts of what `grade` returned.
 */
export function ResultsCard({
  page,
  state,
  graded,
  onDownload,
  onNew,
  onRetry,
  replaying = false,
}: {
  page: PageQuiz;
  state: Pick<QuizState, "attempt">;
  graded: Graded;
  onDownload(): void;
  onNew(): void;
  onRetry(): void;
  /** a replay (`quiz replay`) has no Start screen to go back to: no New attempt */
  replaying?: boolean;
}) {
  const t: PageMessages = messagesFor(page);
  const attempt = state.attempt.value;
  const dialog = useRef<HTMLDialogElement>(null);
  const { total } = graded;
  const waiting = graded.questions.filter((q) => q.status === "pending").length;
  const limit = limitOf(page, attempt);
  const used = attempt.state.timeUsed;
  const missed = missedIds(graded).length;
  const mark = graded.pass.mark;
  const id = page.id;
  const hasScore = total.points > 0;
  const own = (section: string): GradedQuestion[] => graded.questions.filter((q) => q.section === section);

  return (
    <section class="fm-results" data-results>
      <div class="fm-results-top">
        <div class="fm-score">
          <p
            class="fm-total"
            data-earned={total.earned}
            data-points={total.points}
            data-pending={total.pending}
            data-percent={percentOf(total.earned, total.points) ?? undefined}
          >
            <span class="fm-total-label">{t.yourScore}</span>
            <span class="fm-percent">
              <Percent earned={total.earned} points={total.points} pending={total.pending} />
            </span>
          </p>
          <dl class="fm-facts">
            <div class="fm-fact">
              <dt>{t.pointsCell}</dt>
              <dd data-cell="points">
                <Points earned={total.earned} points={total.points} pending={total.pending} lang={page.uiLang} />
              </dd>
            </div>
            <div class="fm-fact fm-fact-time">
              <dt>{t.timeUsedCell}</dt>
              <dd data-cell="time">
                {limit === undefined ? clockText(used) : `${clockText(used)} / ${clockText(limit)}`}
                {limit !== undefined ? (
                  <progress class="fm-timebar" aria-label={t.timeUsedCell} max={limit} value={Math.min(used, limit)} />
                ) : null}
              </dd>
            </div>
          </dl>
          {mark !== null && graded.pass.passed !== null ? (
            <p class="fm-goal" data-goal={graded.pass.passed ? "reached" : "not-yet"}>
              {graded.pass.passed
                ? t.goalReached(num(mark, page.uiLang), total.pending > 0)
                : t.goalNotYet(num(mark, page.uiLang), total.pending > 0)}
            </p>
          ) : null}
        </div>
        {graded.sections.length > 1 ? (
          <div class="fm-by-part">
            <span class="fm-label">{t.byPart}</span>
            <ul class="fm-part-rows">
              {graded.sections.map((s, index) => {
                const counts = countsOf(own(s.id));
                const label = t.countsLabel(counts);
                return (
                  <li key={s.id} class="fm-part-row" data-part={s.id} data-earned={s.earned} data-points={s.points}>
                    <span class="fm-part-title">{s.title ?? t.mapPart(index + 1, null)}</span>
                    <SplitBar counts={counts} label={label} />
                    <span class="fm-part-counts">{label}</span>
                    <span class="fm-part-points">
                      <Points earned={s.earned} points={s.points} pending={s.pending} lang={page.uiLang} />
                    </span>
                    <span class="fm-part-percent">
                      <Percent earned={s.earned} points={s.points} pending={s.pending} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
      {waiting > 0 ? (
        <p class="fm-pending-note" data-pending-note={waiting}>
          <Icon name="clock" size={18} />
          {t.pendingNote(waiting)}
        </p>
      ) : null}
      <div class="fm-actions">
        {missed > 0 ? (
          <button
            type="button"
            class="fm-button fm-primary"
            data-action="retry-missed"
            title={t.retryMissedHint}
            onClick={() => dialog.current?.showModal()}
          >
            <Icon name="retry" size={18} />
            {t.retryMissed(missed)}
          </button>
        ) : hasScore ? (
          <p class="fm-nothing-missed" data-nothing-missed>
            {t.nothingMissed}
          </p>
        ) : null}
        <button type="button" class="fm-button" data-action="export" title={t.exportHint} onClick={onDownload}>
          <Icon name="download" size={18} />
          {t.download}
        </button>
        {replaying ? null : (
          <button type="button" class="fm-button" data-action="new-attempt" onClick={onNew}>
            {t.newAttempt}
          </button>
        )}
      </div>
      <dialog ref={dialog} class="fm-dialog" aria-labelledby={`${id}/retry-title`}>
        <h2 id={`${id}/retry-title`}>{t.retryQuestion}</h2>
        <p>{t.retryBody}</p>
        <div class="fm-dialog-actions">
          <button
            type="button"
            class="fm-button fm-primary"
            data-action="confirm-retry"
            onClick={() => {
              dialog.current?.close();
              onRetry();
            }}
          >
            {t.retryAction}
          </button>
          <button type="button" class="fm-button" data-action="cancel" onClick={() => dialog.current?.close()}>
            {t.cancel}
          </button>
        </div>
      </dialog>
    </section>
  );
}
