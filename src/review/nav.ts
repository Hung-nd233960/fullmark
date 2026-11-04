import type { PageQuiz } from "../page/data";
import type { FormState } from "./state";

let quietUntil = 0;

/** A scroll the form made itself is on its way: the scroll must not move the current question away from the target. */
export const scrolling = (): boolean => Date.now() < quietUntil;

/** Makes a question the current one and scrolls its card to the top (below the docked bar). */
export function jump(page: PageQuiz, state: FormState, id: string, smooth = false): void {
  state.current.value = id;
  if (typeof document === "undefined") return;
  quietUntil = Date.now() + (smooth ? 800 : 100);
  document.getElementById(`${page.id}/${id}`)?.scrollIntoView({
    block: "start",
    behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto",
  });
}
