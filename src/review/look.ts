import { computed, signal } from "@preact/signals";
import type { FontId } from "../core/fonts";
import { type Choice, shownTheme } from "../core/themes";
import { DEFAULT_SIZE, stepSize } from "../page/look";
import type { Look } from "../page/store";
import type { ReviewData } from "./data";

/**
 * The form's look: the page's `Look` (theme, font, text size, the menu) without the page's store and its storage. The
 * quiz's look is the start (its `theme`, `font`, `look: locked`); a choice lasts while the form is open. A learner's
 * size is kept under `locked` too, as on the page.
 */
export function createFormLook(data: ReviewData["page"]): Look {
  const quiz: Choice = data.theme ?? "auto";
  const locked = data.look === "locked";
  const quizFont: FontId = data.font ?? "system";
  const fonts: readonly FontId[] = data.fonts ?? ["system"];
  const chosen = signal<Choice | null>(null);
  const chosenFont = signal<FontId | null>(null);
  const device = signal({ dark: false, more: false });
  const size = signal(DEFAULT_SIZE);
  const pick = (choice: Choice | null): void => {
    if (locked) return;
    chosen.value = choice === quiz ? null : choice;
  };
  const pickFont = (font: FontId | null): void => {
    if (locked) return;
    chosenFont.value = font === quizFont || (font !== null && !fonts.includes(font)) ? null : font;
  };
  return {
    quiz,
    locked,
    chosen,
    device,
    size,
    quizFont,
    fonts,
    chosenFont,
    font: computed(() => (chosenFont.value !== null && fonts.includes(chosenFont.value) ? chosenFont.value : quizFont)),
    pickFont,
    menu: signal(false),
    shown: computed(() => shownTheme(chosen.value ?? quiz, device.value)),
    load: () => undefined,
    pick,
    step: (direction) => {
      size.value = stepSize(size.value, direction);
    },
    resetSize: () => {
      size.value = DEFAULT_SIZE;
    },
    reset() {
      pick(null);
      pickFont(null);
      size.value = DEFAULT_SIZE;
    },
  };
}
