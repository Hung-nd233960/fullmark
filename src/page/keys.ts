import { focusInSidebar, focusMap, focusSidebarButton } from "./mapdom";
import type { Store } from "./store";

/** What a key handler needs to know of the element that has the focus. */
type Target = { tagName?: string; type?: string; isContentEditable?: boolean } | null;

const NOT_TEXT = new Set(["checkbox", "radio", "button", "submit", "reset", "image", "file", "color", "range"]);

/** A text field, a `select` or a `contenteditable`: the keys of the page never act there. */
export function typingIn(target: Target): boolean {
  if (target === null || target === undefined) return false;
  if (target.isContentEditable === true) return true;
  const tag = target.tagName?.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  return tag === "INPUT" && !NOT_TEXT.has((target.type ?? "text").toLowerCase());
}

type KeyLike = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey?: boolean;
  defaultPrevented?: boolean;
  target: Target;
  preventDefault(): void;
};

/**
 * The page's one key handler. `F` toggles Focus mode; `Q` opens the sidebar (the focus goes to its map) or closes it;
 * `Esc` closes it and returns the focus to its button. 2f3 adds `M`. A key never acts while the focus is in a text
 * field, a `select` or a `contenteditable`, nor with a modifier held.
 */
export function keyHandler(store: Store): (event: KeyLike) => void {
  return (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (typingIn(event.target)) return;
    if (event.key === "q" || event.key === "Q" || event.key === "Escape") {
      const quiz = store.sidebarTarget();
      if (quiz === null) return;
      const open = store.quizzes.get(quiz)?.sidebar.value === true;
      if (event.key === "Escape") {
        // a modal dialog or a drag in progress has its own Esc
        if (
          !open ||
          event.defaultPrevented ||
          (typeof document !== "undefined" && document.querySelector("dialog[open]") !== null)
        )
          return;
        store.sidebar(quiz, false);
        focusSidebarButton();
        return;
      }
      event.preventDefault();
      if (open) {
        const inside = focusInSidebar();
        store.sidebar(quiz, false);
        if (inside) focusSidebarButton();
      } else {
        store.sidebar(quiz, true);
        // after the render that shows the map
        setTimeout(focusMap, 0);
      }
      return;
    }
    if (event.key === "f" || event.key === "F") {
      if (!store.screen.available.value) return;
      event.preventDefault();
      store.fullscreen();
    }
  };
}

/** Installs the handler on the document. Returns what removes it. */
export function installKeys(store: Store): () => void {
  const handle = keyHandler(store);
  const listener = (event: KeyboardEvent): void => handle(event as unknown as KeyLike);
  document.addEventListener("keydown", listener);
  return () => document.removeEventListener("keydown", listener);
}
