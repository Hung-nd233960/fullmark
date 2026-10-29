import type { PageQuiz } from "./data";
import { Icon } from "./icons";
import type { PageMessages } from "./questions/shared";
import { Html } from "./questions/shared";
import type { QuizState } from "./store";

/** Arrow keys, Home and End move between the tabs of a `tablist` and choose the one reached. */
export function tabKeys(event: KeyboardEvent, vertical = false): void {
  const list = event.currentTarget as HTMLElement | null;
  if (list === null) return;
  const tabs = [...list.querySelectorAll<HTMLElement>("[role=tab]")];
  const at = tabs.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return;
  const [back, forward] = vertical ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
  const to =
    event.key === back
      ? (at + tabs.length - 1) % tabs.length
      : event.key === forward
        ? (at + 1) % tabs.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : -1;
  if (to < 0) return;
  event.preventDefault();
  tabs[to]?.focus();
  tabs[to]?.click();
}

/** A table of a sheet that is wider than its panel scrolls in its own box, which the keyboard must reach. */
const scrollable = (panel: HTMLElement | null): void => {
  if (panel === null) return;
  for (const table of panel.querySelectorAll<HTMLElement>("table")) table.tabIndex = 0;
};

/**
 * The sheets: one chip per sheet in a tablist, the chosen sheet's HTML under them. The same wherever it is shown (start
 * screen, sidebar while answering, Materials tab); the chosen sheet is `state.sheet`, kept for the page's life and in
 * no attempt, save or export.
 */
export function Sheets({ t, state }: { t: PageMessages; state: QuizState }) {
  const sheets = (state.page as PageQuiz).materials ?? [];
  const chosen = Math.min(Math.max(0, state.sheet.value), sheets.length - 1);
  const sheet = sheets[chosen];
  const id = `${state.page.id}/sheet`;
  return (
    <>
      <div class="fm-chips" role="tablist" aria-label={t.sheetsLabel} onKeyDown={(e) => tabKeys(e)}>
        {sheets.map((s, i) => (
          <button
            key={s.name}
            type="button"
            role="tab"
            class="fm-chip"
            id={`${id}-tab-${i}`}
            data-sheet-tab={i}
            aria-selected={i === chosen}
            aria-controls={`${id}-panel`}
            tabIndex={i === chosen ? 0 : -1}
            onClick={() => {
              state.sheet.value = i;
            }}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div
        class="fm-sheet-panel"
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${chosen}`}
        tabIndex={0}
        ref={scrollable}
      >
        {sheet ? <Html html={sheet.html} class="fm-sheet" /> : null}
      </div>
    </>
  );
}

/** The start screen's Materials panel: docked over the right edge, the same chips and sheet as the sidebar. */
export function MaterialsPanel({ t, state }: { t: PageMessages; state: QuizState }) {
  return (
    <aside class="fm-shelf" aria-label={t.materialsLabel}>
      <div class="fm-shelf-head">
        <h2 class="fm-shelf-title">{t.materialsLabel}</h2>
        <button
          type="button"
          class="fm-button fm-shelf-close"
          data-action="close-materials"
          aria-label={t.closeMaterialsLabel}
          onClick={() => {
            state.shelf.value = false;
            focusMaterialsButton();
          }}
        >
          {t.closeMaterials}
        </button>
      </div>
      <Sheets t={t} state={state} />
    </aside>
  );
}

/** The start screen's Materials button. */
export function MaterialsButton({ t, state }: { t: PageMessages; state: QuizState }) {
  return (
    <button
      type="button"
      class="fm-button fm-materials-button"
      data-action="materials"
      aria-expanded={state.shelf.value}
      onClick={() => {
        state.shelf.value = !state.shelf.value;
      }}
    >
      <Icon name="book" size={18} />
      {t.materialsLabel}
    </button>
  );
}

/** Where the focus returns when the start screen's panel closes. */
export const focusMaterialsButton = (): void => {
  if (typeof document !== "undefined") document.querySelector<HTMLElement>("[data-action=materials]")?.focus();
};
