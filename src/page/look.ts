import { effect } from "@preact/signals";
import type { Store } from "./store";

const DARK = "(prefers-color-scheme: dark)";
const MORE = "(prefers-contrast: more)";

/**
 * Puts the theme on the page: the first step of the runtime. The build wrote the quiz's theme as the plain `:root`
 * rule (`auto`: `light`), so `data-theme` is set only when the shown theme is another one (a stored choice, a dark
 * device under `auto`, high contrast) and removed again when it is not. `auto` and high contrast follow the device
 * while the page is open. Returns what stops it.
 */
export function applyLook(store: Store, root: HTMLElement = document.documentElement): () => void {
  const { look } = store;
  const queries = typeof window.matchMedia === "function" ? [window.matchMedia(DARK), window.matchMedia(MORE)] : [];
  const read = (): void => {
    look.device.value = { dark: queries[0]?.matches === true, more: queries[1]?.matches === true };
  };
  read();
  look.load();
  for (const q of queries) q.addEventListener("change", read);
  const plain = look.quiz === "auto" ? "light" : look.quiz;
  const stop = effect(() => {
    const shown = look.shown.value;
    if (shown === plain) root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", shown);
  });
  return () => {
    stop();
    for (const q of queries) q.removeEventListener("change", read);
  };
}
