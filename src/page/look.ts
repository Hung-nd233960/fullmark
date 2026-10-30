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
  // the text size: `data-size` only when it is not the default; the CSS sets the base size from it
  const stopSize = effect(() => {
    const size = look.size.value;
    if (size === DEFAULT_SIZE) root.removeAttribute("data-size");
    else root.setAttribute("data-size", String(size));
  });
  // the font: `data-font` only when it is not the quiz's (the build wrote the quiz's font as the plain `:root` rule)
  const stopFont = effect(() => {
    const font = look.font.value;
    if (font === look.quizFont) root.removeAttribute("data-font");
    else root.setAttribute("data-font", font);
  });
  return () => {
    stop();
    stopSize();
    stopFont();
    for (const q of queries) q.removeEventListener("change", read);
  };
}

/** The five text sizes: the page's base size in px. 17 is the default. */
export const SIZES = [15, 17, 19, 21, 23] as const;
export const DEFAULT_SIZE = 17;

/** A size as a percentage of the default, rounded: 88, 100, 112, 124, 135. */
export const sizePercent = (size: number): number => Math.round((size / DEFAULT_SIZE) * 100);

/** The stored `size`: one of the five, else the default. */
export const sizeOf = (stored: unknown): number =>
  typeof stored === "number" && (SIZES as readonly number[]).includes(stored) ? stored : DEFAULT_SIZE;

/** One step up or down from `size`; at an end it stays. */
export function stepSize(size: number, direction: -1 | 1): number {
  const at = SIZES.indexOf(sizeOf(size) as (typeof SIZES)[number]);
  return SIZES[Math.min(SIZES.length - 1, Math.max(0, at + direction))] as number;
}
