import { useLayoutEffect, useRef } from "preact/hooks";
import { jumpTo } from "./mapdom";
import type { PageMessages } from "./questions/shared";
import { limitOf } from "./results";
import { attemptCounts } from "./status";
import { clockText, type QuizState, type Store } from "./store";

/** The Submit button in the bar, where the focus returns when the dialog is cancelled. */
const focusSubmit = (): void => document.querySelector<HTMLElement>("[data-action=submit]")?.focus();

/**
 * The summary the dialog shows: the status line's counts (answered, flagged), what is not answered, and the clock. A
 * line whose count is 0 is left out; the clock line always stays.
 */
export function submitSummary(
  t: PageMessages,
  state: Pick<QuizState, "page" | "attempt" | "elapsed">,
): { text: string; kind: "answered" | "unanswered" | "flagged" | "clock"; first?: string }[] {
  const attempt = state.attempt.value;
  const counts = attemptCounts(attempt);
  const limit = limitOf(state.page, attempt);
  const lines: ReturnType<typeof submitSummary> = [
    { kind: "answered", text: t.submitAnswered(counts.answered, counts.total) },
  ];
  const unanswered = counts.total - counts.answered;
  if (unanswered > 0 && counts.firstUnanswered !== null) {
    lines.push({ kind: "unanswered", text: t.submitUnanswered(unanswered), first: counts.firstUnanswered });
  }
  if (counts.flagged > 0 && counts.firstFlagged !== null) {
    lines.push({ kind: "flagged", text: t.flaggedCount(counts.flagged), first: counts.firstFlagged });
  }
  const elapsed = state.elapsed.value;
  lines.push({
    kind: "clock",
    text:
      limit === undefined ? t.submitUsed(clockText(elapsed)) : t.submitLeft(clockText(Math.max(0, limit - elapsed))),
  });
  return lines;
}

/**
 * Submit asks first (TECHNICAL_DESIGN.md, section 8, row "Submit asks first"): a modal dialog with the summary. Esc, a
 * click outside, the Keep answering button and Enter on it cancel and return the focus to Submit; only a press on Submit submits. Rendered
 * only while it is open, so the summary is read when it opens and follows the clock while it stays.
 */
export function SubmitDialog({
  t,
  state,
  store,
  onClose,
  onSubmit,
}: {
  t: PageMessages;
  state: QuizState;
  store: Store;
  onClose(): void;
  onSubmit(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  /** where "Go to the first" is going; read when the dialog has closed */
  const going = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = dialog.current;
    if (el === null) return;
    if (!el.open) el.showModal();
    keep.current?.focus();
    // a click outside the dialog's box (on the backdrop) cancels, as on the Licences popup; the padding is inside the box
    const outside = (event: MouseEvent): void => {
      const box = el.getBoundingClientRect();
      const inside =
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom;
      if (event.target === el && !inside) el.close();
    };
    el.addEventListener("click", outside);
    return () => el.removeEventListener("click", outside);
  }, []);
  const id = state.page.id;
  return (
    <dialog
      ref={dialog}
      class="fm-dialog fm-submit-dialog"
      data-submit-dialog
      aria-labelledby={`${id}/submit-title`}
      onClose={() => {
        onClose();
        const target = going.current;
        if (target === null) focusSubmit();
        else jumpTo(store, id, target, true);
      }}
    >
      <h2 id={`${id}/submit-title`}>{t.submitTitle}</h2>
      <p class="fm-submit-body">{t.submitBody}</p>
      {store.served ? (
        <p class="fm-submit-served" data-served-line>
          {t.submitServed}
        </p>
      ) : null}
      <ul class="fm-submit-summary">
        {submitSummary(t, state).map((line) => (
          <li key={line.kind} data-line={line.kind}>
            <span>{line.text}</span>
            {line.first === undefined ? null : (
              <button
                type="button"
                class="fm-link-button"
                data-go={line.kind}
                onClick={() => {
                  going.current = line.first ?? null;
                  dialog.current?.close();
                }}
              >
                {t.submitGoFirst}
              </button>
            )}
          </li>
        ))}
      </ul>
      <div class="fm-dialog-actions fm-submit-actions">
        <button
          type="button"
          class="fm-button"
          data-action="keep-answering"
          ref={keep}
          onClick={() => dialog.current?.close()}
        >
          {t.keepAnswering}
        </button>
        <button
          type="button"
          class="fm-button fm-primary"
          data-action="confirm-submit"
          onClick={() => {
            going.current = null;
            onSubmit();
          }}
        >
          {t.submit}
        </button>
      </div>
    </dialog>
  );
}
