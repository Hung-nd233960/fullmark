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
  target: Target;
  preventDefault(): void;
};

/**
 * The page's one key handler. `F` toggles Focus mode; 2f2 adds `Q`, `M` and `Esc` here. A key never acts while the
 * focus is in a text field, a `select` or a `contenteditable`, nor with a modifier held.
 */
export function keyHandler(store: Store): (event: KeyLike) => void {
  return (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (typingIn(event.target)) return;
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
