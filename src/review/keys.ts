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
 * moves to the next one not judged, `Q` opens and closes the sidebar and `Esc` closes it (or the Appearance menu). No
 * key acts while typing in a note, with a modifier held, or while a dialog is open.
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
      state.sidebar.value = !state.sidebar.value;
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
