import type { Store } from "./store";

/** What a learner can answer in, in a card: not the flag, not the hint button. */
const CONTROLS =
  "input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled]), " +
  "button:not([disabled]):not(.fm-flag):not(.fm-hint-toggle)";

const card = (quizId: string, questionId: string): HTMLElement | null =>
  document.getElementById(`${quizId}/${questionId}`);

/** Scrolls the card into view (below the docked block: the card's `scroll-margin-top`) and puts the focus on it. */
function arrive(store: Store, quizId: string, questionId: string, smooth: boolean): void {
  const el = card(quizId, questionId);
  if (el === null) return;
  const calm = smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "start", behavior: calm ? "smooth" : "auto" });
  const first = el.querySelector<HTMLElement>(CONTROLS);
  if (first !== null) first.focus({ preventScroll: true });
  else {
    el.tabIndex = -1;
    el.focus({ preventScroll: true });
  }
  store.focus(quizId, questionId);
}

/**
 * A map cell was pressed: the question becomes the current one, its card scrolls into view and takes the focus. A card
 * the review filter hides first sets the filter to All.
 */
export function jumpTo(store: Store, quizId: string, questionId: string, smooth = false): void {
  const state = store.quizzes.get(quizId);
  if (state === undefined) return;
  if (card(quizId, questionId)?.hidden) {
    state.filter.value = "all";
    // the card shows after the next render
    setTimeout(() => arrive(store, quizId, questionId, smooth), 0);
    return;
  }
  arrive(store, quizId, questionId, smooth);
}

/** A heading's click waits this long for a second click (a double-click jumps instead of toggling). */
export const DOUBLE_CLICK_WAIT = 250;

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * A heading's click. A click from the keyboard (`detail` 0) toggles at once; a pointer click waits out the double-click,
 * and a second click inside the wait cancels the toggle (the double-click's own handler jumps).
 */
export function clickToggle(key: string, detail: number, toggle: () => void, wait = DOUBLE_CLICK_WAIT): void {
  const earlier = pending.get(key);
  if (earlier !== undefined) {
    clearTimeout(earlier);
    pending.delete(key);
    return;
  }
  if (detail === 0) {
    toggle();
    return;
  }
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      toggle();
    }, wait),
  );
}

/** The top bar's sidebar button, where the focus returns when the sidebar closes. */
export const focusSidebarButton = (): void => {
  if (typeof document === "undefined") return;
  document.querySelector<HTMLElement>("[data-action=sidebar]")?.focus();
};

/** After `Q` opens the sidebar: the focus goes to the current part's heading button, else to the current cell. */
export function focusMap(): void {
  if (typeof document === "undefined") return;
  const target =
    document.querySelector<HTMLElement>("[data-part-tab][aria-selected=true]") ??
    document.querySelector<HTMLElement>("[data-part-head][data-current-part]") ??
    document.querySelector<HTMLElement>(".fm-side [data-cell][aria-current]") ??
    document.querySelector<HTMLElement>(".fm-side [data-cell]");
  target?.focus();
}

/** After `M`: the focus goes to the chosen sheet's chip. */
export function focusChip(): void {
  if (typeof document === "undefined") return;
  document.querySelector<HTMLElement>(".fm-side [data-sheet-tab][aria-selected=true]")?.focus();
}

/** Whether the focus is inside a sidebar. */
export const focusInSidebar = (): boolean =>
  typeof document !== "undefined" && document.activeElement?.closest(".fm-side") != null;
