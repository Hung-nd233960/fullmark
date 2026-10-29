import { useEffect } from "preact/hooks";
import { type Choice, THEME_NAMES } from "../core/themes";
import { Icon } from "./icons";
import type { PageMessages } from "./questions/shared";
import type { Store } from "./store";

/** Back to the ◐ button, after Esc closes the menu. */
export const focusLookButton = (): void => {
  if (typeof document === "undefined") return;
  document.querySelector<HTMLElement>("[data-action=appearance]")?.focus();
};

/** The top bar's Appearance button (the board's ◐, `hdrBtnIcon`): after Focus mode, before Submit, in both phases. */
export function AppearanceButton({ t, store }: { t: PageMessages; store: Store }) {
  const open = store.look.menu.value;
  return (
    <button
      type="button"
      class="fm-button fm-icon-button fm-look-button"
      data-action="appearance"
      aria-expanded={open}
      aria-label={t.appearance}
      title={t.appearance}
      onClick={() => {
        store.look.menu.value = !store.look.menu.value;
      }}
    >
      <Icon name="appearance" size={18} />
    </button>
  );
}

const CHOICES: readonly Choice[] = ["auto", ...THEME_NAMES];

/** The menu strip under the docked block: the Theme row and Reset. A click outside closes it; Esc is in `keys.ts`. */
export function AppearanceMenu({ t, store }: { t: PageMessages; store: Store }) {
  const { look } = store;
  const open = look.menu.value;
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent): void => {
      const target = event.target as Element | null;
      if (target?.closest("[data-look-menu], [data-action=appearance]")) return;
      look.menu.value = false;
    };
    document.addEventListener("click", away);
    return () => document.removeEventListener("click", away);
  }, [open, look]);
  if (!open) return null;
  const current = look.chosen.value ?? look.quiz;
  return (
    <div class="fm-look-menu" data-look-menu>
      <div class="fm-look-row">
        <span class="fm-look-label">{t.themeLabel}</span>
        {CHOICES.map((k) => {
          const name = t.themeName[k];
          const mine = k === look.quiz;
          return (
            <button
              key={k}
              type="button"
              class="fm-pill"
              data-theme-pick={k}
              aria-pressed={k === current}
              aria-label={mine ? t.themeQuizLook(name) : undefined}
              onClick={() => look.pick(k)}
            >
              {mine ? t.themeMarked(name) : name}
            </button>
          );
        })}
      </div>
      {look.chosen.value !== null && look.chosen.value !== look.quiz ? (
        <button type="button" class="fm-look-reset" data-action="reset-look" onClick={() => look.pick(null)}>
          {t.resetLook}
        </button>
      ) : null}
    </div>
  );
}
