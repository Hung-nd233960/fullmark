import type { Verdict } from "../core/review/reasons";
import type { LookStore } from "../page/Appearance";
import { typingIn } from "../page/keys";
import { jump } from "./nav";
import type { FormState } from "./state";

type KeyLike = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  defaultPrevented?: boolean;
  target: { tagName?: string; type?: string; isContentEditable?: boolean } | null;
  preventDefault(): void;
};

/** Back to a button after Esc closes what it opened. */
const focusOn = (selector: string): void => {
  if (typeof document !== "undefined") document.querySelector<HTMLElement>(selector)?.focus();
};

const VERDICT_OF: Record<string, Verdict> = { "1": "keep", "2": "fix", "3": "drop" };

/**
 * The form's keys (COMMANDS.md, `quiz review`, "Keys"): `1`, `2`, `3` give Keep, Fix, Drop to the current question, `N`
 * moves to the next one not judged, `Q` opens and closes the sidebar, `M` (with materials) opens it and moves the focus
 * to the sheets' chips, and `Esc` closes it (or the Appearance menu). No key acts while typing in a note, with a
 * modifier held, or while a dialog is open.
 */
export function keyHandler(state: FormState, store: LookStore): (event: KeyLike) => void {
  return (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (typingIn(event.target)) return;
    if (typeof document !== "undefined" && document.querySelector("dialog[open]") !== null) return;
    if (state.saved.value !== null) return;
    const verdict = VERDICT_OF[event.key];
    if (verdict !== undefined) {
      if (state.current.value === "") return;
      event.preventDefault();
      state.pick(state.current.value, verdict);
      return;
    }
    if (event.key === "n" || event.key === "N") {
      event.preventDefault();
      const id = state.next();
      if (id !== null) jump(state.page, state, id, true);
      return;
    }
    if (event.key === "q" || event.key === "Q") {
      event.preventDefault();
      // on a phone the two parts are tabs: Q from the Materials tab goes back to Questions, as on the page
      if (state.phone.value && state.materials && state.sidebar.value && state.side.value === "materials") {
        state.side.value = "questions";
        setTimeout(() => focusOn(".fm-side [data-cell]"), 0);
        return;
      }
      state.side.value = "questions";
      state.sidebar.value = !state.sidebar.value;
      return;
    }
    if (event.key === "m" || event.key === "M") {
      // G66: as on the page, with materials: open the sidebar and move the focus to the chips; none without
      if (!state.materials) return;
      event.preventDefault();
      if (state.phone.value) {
        if (state.sidebar.value && state.side.value === "materials") {
          state.sidebar.value = false;
          focusOn("[data-action=sidebar]");
          return;
        }
        state.side.value = "materials";
      }
      state.sidebar.value = true;
      setTimeout(() => focusOn(".fm-side [data-sheet-tab][aria-selected=true]"), 0);
      return;
    }
    if (event.key === "Escape" && !event.defaultPrevented) {
      if (store.look.menu.value) {
        store.look.menu.value = false;
        focusOn("[data-action=appearance]");
      } else if (state.sidebar.value) {
        state.sidebar.value = false;
        focusOn("[data-action=sidebar]");
      }
    }
  };
}

export function installKeys(state: FormState, store: LookStore): () => void {
  const handler = keyHandler(state, store);
  const listener = (event: KeyboardEvent): void => handler(event as unknown as KeyLike);
  document.addEventListener("keydown", listener);
  return () => document.removeEventListener("keydown", listener);
}
