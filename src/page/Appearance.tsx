import { useEffect } from "preact/hooks";
import type { FontId } from "../core/fonts";
import { type Choice, THEME_NAMES } from "../core/themes";
import { Icon } from "./icons";
import { DEFAULT_SIZE, SIZES, sizePercent } from "./look";
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

/** A− / A+ (the board's joined pair): five sizes, each button disabled at its end. Under both `free` and `locked`. */
export function TextSize({ t, store }: { t: PageMessages; store: Store }) {
  const size = store.look.size.value;
  const smallest = size <= (SIZES[0] as number);
  const largest = size >= (SIZES.at(-1) as number);
  const percent = sizePercent(size);
  const plain = size === DEFAULT_SIZE;
  return (
    <div class="fm-textsize" data-textsize>
      <button
        type="button"
        class="fm-textsize-button"
        data-action="smaller"
        title={t.smallerText}
        disabled={smallest}
        aria-disabled={smallest}
        onClick={() => store.look.step(-1)}
      >
        <span aria-hidden="true">A−</span>
        <span class="fm-sr">{t.smallerText}</span>
      </button>
      <button
        type="button"
        class="fm-textsize-reset"
        data-action="reset-size"
        aria-label={plain ? t.textSizeNow(percent) : t.textSizeResets(percent)}
        aria-disabled={plain}
        title={plain ? t.textSizeNow(percent) : t.textSizeBack}
        onClick={() => {
          if (!plain) store.look.resetSize();
        }}
      >
        {t.textSizeValue(percent)}
      </button>
      <button
        type="button"
        class="fm-textsize-button"
        data-action="larger"
        title={t.largerText}
        disabled={largest}
        aria-disabled={largest}
        onClick={() => store.look.step(1)}
      >
        <span aria-hidden="true">A+</span>
        <span class="fm-sr">{t.largerText}</span>
      </button>
    </div>
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
  const phone = store.screen.phone.value;
  const changed =
    (look.chosen.value !== null && look.chosen.value !== look.quiz) ||
    look.chosenFont.value !== null ||
    look.size.value !== DEFAULT_SIZE;
  return (
    <div class="fm-look-menu" data-look-menu>
      {phone ? (
        <div class="fm-look-row">
          <span class="fm-look-label">{t.textSizeLabel}</span>
          <TextSize t={t} store={store} />
        </div>
      ) : null}
      {look.locked ? null : (
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
      )}
      {look.locked || look.fonts.length < 2 ? null : (
        <div class="fm-look-row" data-font-row>
          <span class="fm-look-label">{t.fontLabel}</span>
          {look.fonts.map((id: FontId) => (
            <button
              key={id}
              type="button"
              class={`fm-pill fm-font-${id}`}
              data-font-pick={id}
              aria-pressed={id === look.font.value}
              onClick={() => look.pickFont(id)}
            >
              {t.fontName[id]}
            </button>
          ))}
        </div>
      )}
      {!look.locked && changed ? (
        <button type="button" class="fm-look-reset" data-action="reset-look" onClick={() => look.reset()}>
          {t.resetLook}
        </button>
      ) : null}
    </div>
  );
}
