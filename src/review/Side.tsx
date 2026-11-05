import type { ReviewMessages } from "../core/i18n/review";
import { Icon } from "../page/icons";
import { tabKeys } from "../page/Materials";
import { ringOf } from "../page/map";
import { Html, messagesFor, type PageMessages } from "../page/questions/shared";
import { jump } from "./nav";
import { chosenPart, GLYPH, type Part, partStats, partsOf, VERDICTS } from "./parts";
import type { FormState } from "./state";

type R = ReviewMessages;

/** Closes the sidebar and returns the focus to its button. */
function close(state: FormState): void {
  state.sidebar.value = false;
  if (typeof document !== "undefined") document.querySelector<HTMLElement>("[data-action=sidebar]")?.focus();
}

/** Goes to a question's card; on a phone the sidebar covers the screen, so it closes first (as the page's does). */
function go(state: FormState, id: string): void {
  if (!state.phone.value) {
    jump(state.page, state, id, true);
    return;
  }
  state.sidebar.value = false;
  setTimeout(() => jump(state.page, state, id, true), 0); // after the render that shows the questions again
}

// -- the cells ------------------------------------------------------------------------------------------------------

/** One question of a map: its verdict, or (with `--since`) muted and dashed when it is not asked again. */
function Cell({ state, r, id, part }: { state: FormState; r: R; id: string; part?: Part }) {
  const v = state.entries.value[id]?.verdict ?? null;
  const n = state.number(id);
  const current = state.current.value === id;
  const t = messagesFor(state.page);
  const heading = part === undefined ? null : t.mapPart(part.number, part.title);
  const cls = heading === null ? "fm-cell" : "fm-cell fm-cell-row";
  const face = heading === null ? n : <span class="fm-map-head-title">{heading}</span>;
  if (state.asked !== null && !state.asked.has(id)) {
    const old = r.cellLabel(n, r.notAsked, false);
    return (
      <button
        type="button"
        class={cls}
        data-cell={id}
        data-old="true"
        disabled
        aria-label={heading === null ? old : `${old}, ${heading}`}
      >
        {face}
      </button>
    );
  }
  const label = r.cellLabel(n, v === null ? r.notJudgedWord : r.verdictWord[v], current);
  return (
    <button
      type="button"
      class={cls}
      data-cell={id}
      data-verdict={v ?? undefined}
      data-current={current ? "true" : undefined}
      aria-current={current ? "true" : undefined}
      aria-label={heading === null ? label : `${label}, ${heading}`}
      onClick={() => go(state, id)}
    >
      {face}
      {v === null ? null : (
        <span class="fm-cell-glyph" aria-hidden="true">
          {GLYPH[v]}
        </span>
      )}
    </button>
  );
}

// -- the legend and the keys ---------------------------------------------------------------------------------------

function Legend({ state, r }: { state: FormState; r: R }) {
  return (
    <>
      <ul class="fm-legend fm-legend-review">
        {VERDICTS.map((v) => (
          <li key={v}>
            <span class="fm-swatch fm-swatch-verdict" data-verdict={v} aria-hidden="true">
              {GLYPH[v]}
            </span>
            {r.verdictWord[v]}
          </li>
        ))}
        <li>
          <span class="fm-swatch fm-swatch-verdict" aria-hidden="true" />
          {r.notJudgedWord}
        </li>
        <li>
          <span class="fm-swatch fm-swatch-current" aria-hidden="true" />
          {r.currentWord}
        </li>
        {state.since !== null ? (
          <li>
            <span class="fm-swatch fm-swatch-old" aria-hidden="true" />
            {r.notAsked}
          </li>
        ) : null}
      </ul>
      <ul class="fm-keys" aria-label={r.keysLabel}>
        <li>
          <kbd>1</kbd> {r.keep}
        </li>
        <li>
          <kbd>2</kbd> {r.fix}
        </li>
        <li>
          <kbd>3</kbd> {r.drop}
        </li>
        <li>
          <kbd>N</kbd> {r.nextKey}
        </li>
        {state.materials ? (
          <li>
            <kbd>M</kbd> {r.materialsKey}
          </li>
        ) : null}
      </ul>
    </>
  );
}

// -- the plain map: the parts as collapsible headings ------------------------------------------------------------

function PlainMap({ state, r }: { state: FormState; r: R }) {
  const { page } = state;
  const t = messagesFor(page);
  const parts = partsOf(page);
  const headless = parts.length === 1 && parts[0]?.title === null;
  const grid = (ids: string[]) => (
    <div class="fm-grid">
      {ids.map((id) => (
        <Cell key={id} state={state} r={r} id={id} />
      ))}
    </div>
  );
  return (
    <>
      {headless
        ? grid(parts.flatMap((p) => p.ids))
        : parts.map((part) => {
            const stats = partStats(part.ids, state.entries.value, state.asked);
            const open = state.mapOpen.value[part.id] ?? part.ids.some((id) => id === state.current.value);
            const only = part.ids[0];
            if (only !== undefined && part.ids.length === 1) {
              return (
                <div class="fm-map-part" key={part.id} data-part={part.id}>
                  <Cell state={state} r={r} id={only} part={part} />
                </div>
              );
            }
            return (
              <div class="fm-map-part" key={part.id} data-part={part.id}>
                <button
                  type="button"
                  class="fm-map-head"
                  data-part-head
                  data-open={open ? "true" : undefined}
                  aria-expanded={open}
                  onClick={() => {
                    state.mapOpen.value = { ...state.mapOpen.value, [part.id]: !open };
                  }}
                >
                  <span class="fm-map-head-title">{t.mapPart(part.number, part.title)}</span>
                  <span class="fm-map-head-count" aria-hidden="true">
                    {stats.total === 0 ? "" : `${stats.judged}/${stats.total}`}
                  </span>
                  <span class="fm-sr">{r.partCount(stats.judged, stats.total)}</span>
                  <span class="fm-map-head-chevron" aria-hidden="true">
                    {open ? "▾" : "▸"}
                  </span>
                </button>
                {open ? grid(part.ids) : null}
              </div>
            );
          })}
      <Legend state={state} r={r} />
    </>
  );
}

// -- the stacked map: the parts as a vertical tab list, the chosen part's grid beside it ----------------------

/**
 * The completion ring of a part tab: the arc for the share judged; every question judged, a disc with the tick cut out.
 * A copy of `Ring` in `src/page/Sidebar.tsx`, which is not exported (the page does not change in 3m).
 */
function Ring({ judged, total }: { judged: number; total: number }) {
  const { dash, done } = ringOf(judged, total);
  return (
    <svg
      class="fm-ring"
      width="28"
      height="28"
      viewBox="0 0 28 28"
      aria-hidden="true"
      data-done={done ? "true" : undefined}
    >
      <circle cx="14" cy="14" r="10" fill="none" stroke="var(--line)" stroke-width="3" />
      <circle
        class="fm-ring-arc"
        cx="14"
        cy="14"
        r="10"
        fill="none"
        stroke="var(--accent)"
        stroke-width="3"
        stroke-dasharray={dash}
        transform="rotate(-90 14 14)"
      />
      {done ? <circle cx="14" cy="14" r="12" fill="var(--accent)" /> : null}
      {done ? (
        <path
          d="M9 14.5l3.5 3.5L19 11"
          fill="none"
          stroke="var(--card)"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      ) : null}
    </svg>
  );
}

function StackedMap({ state, r }: { state: FormState; r: R }) {
  const { page } = state;
  const t = messagesFor(page);
  const parts = partsOf(page);
  const grid = (ids: string[]) => (
    <div class="fm-grid fm-grid-mini">
      {ids.map((id) => (
        <Cell key={id} state={state} r={r} id={id} />
      ))}
    </div>
  );
  if (parts.length === 1) {
    return (
      <>
        {grid(parts.flatMap((p) => p.ids))}
        <Legend state={state} r={r} />
      </>
    );
  }
  const part = chosenPart(parts, state.miniPart.value, state.current.value);
  const stats = part === undefined ? null : partStats(part.ids, state.entries.value, state.asked);
  return (
    <>
      <div class="fm-split">
        <div
          class="fm-part-tabs"
          role="tablist"
          aria-label={t.partsLabel}
          aria-orientation="vertical"
          onKeyDown={(e) => tabKeys(e, true)}
        >
          {parts.map((p) => {
            const on = p === part;
            const s = partStats(p.ids, state.entries.value, state.asked);
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                class="fm-part-tab"
                data-part-tab={p.id}
                data-done={s.total > 0 && s.judged >= s.total ? "true" : undefined}
                aria-selected={on}
                aria-label={r.partTab(p.number, p.title, s.judged, s.total, s.fix, s.drop)}
                tabIndex={on ? 0 : -1}
                onClick={() => {
                  state.miniPart.value = p.id;
                }}
              >
                <Ring judged={s.judged} total={s.total} />
                <span class="fm-part-tab-text">
                  <span class="fm-part-tab-label">{t.mapPart(p.number, null)} </span>
                  {p.title === null ? null : <span class="fm-part-tab-name">{p.title}</span>}
                </span>
              </button>
            );
          })}
        </div>
        {part !== undefined && stats !== null ? (
          <div class="fm-part-panel" role="tabpanel" aria-label={t.partHeading(part.number, part.title)}>
            <div class="fm-part-panel-head">
              <span class="fm-part-panel-title">{t.partHeading(part.number, part.title)}</span>
              <span class="fm-part-panel-stats" data-part-stats>
                {r.partStats(stats.judged, stats.total, stats.fix, stats.drop)}
              </span>
            </div>
            {grid(part.ids)}
          </div>
        ) : null}
      </div>
      <Legend state={state} r={r} />
    </>
  );
}

// -- the sheets -----------------------------------------------------------------------------------------------------

/** A table of a sheet that is wider than its panel scrolls in its own box, which the keyboard must reach. */
const scrollable = (panel: HTMLElement | null): void => {
  if (panel === null) return;
  panel.tabIndex = 0;
  for (const table of panel.querySelectorAll<HTMLElement>("table")) table.tabIndex = 0;
};

/**
 * The sheets, read-only: one chip per sheet in a tablist, the chosen sheet's HTML under them. A copy of `Sheets` in
 * `src/page/Materials.tsx`, which takes the page's `QuizState` (the page does not change in 3m); the chosen sheet is
 * `state.sheet`, kept for the form's life only.
 */
function Sheets({ state, t }: { state: FormState; t: PageMessages }) {
  const sheets = state.page.materials ?? [];
  const chosen = Math.min(Math.max(0, state.sheet.value), sheets.length - 1);
  const sheet = sheets[chosen];
  const id = `${state.page.id}/sheet`;
  return (
    <>
      <div class="fm-chips fm-sheet-chips" role="tablist" aria-label={t.sheetsLabel} onKeyDown={(e) => tabKeys(e)}>
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
        ref={scrollable}
      >
        {sheet ? <Html html={sheet.html} class="fm-sheet" /> : null}
      </div>
    </>
  );
}

// -- the sidebar ------------------------------------------------------------------------------------------------------

function CloseButton({ state, t }: { state: FormState; t: PageMessages }) {
  return (
    <button
      type="button"
      class="fm-side-close"
      data-action="close-sidebar"
      aria-label={t.closeSidebar}
      title={t.closeSidebarTitle}
      onClick={() => close(state)}
    >
      <Icon name="cross" size={18} />
    </button>
  );
}

/**
 * The form's sidebar. A phone: the whole screen with a back link and, with materials, the two tabs Questions and
 * Materials (G65). Otherwise: with materials one stacked block, the verdict map over the sheets (G39); without, the
 * plain Questions sidebar of the parts as collapsible headings.
 */
export function Side({ state, r }: { state: FormState; r: R }) {
  const t = messagesFor(state.page);
  if (state.phone.value) {
    const tab = state.side.value;
    return (
      <aside
        class="fm-side"
        data-form={state.materials ? "tabs" : "plain"}
        data-tab={tab}
        data-phone
        aria-label={t.sidebarAria}
        data-review-side
      >
        <div class="fm-back-row">
          <button type="button" class="fm-back" data-action="close-sidebar" onClick={() => close(state)}>
            <Icon name="back" size={18} stroke={2.2} />
            {t.backToQuestion(state.number(state.current.value))}
          </button>
        </div>
        {state.materials ? (
          <div class="fm-side-head">
            <div class="fm-side-tabs" role="tablist" aria-label={t.sidebarAria} onKeyDown={(e) => tabKeys(e)}>
              {(["questions", "materials"] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  class="fm-side-tab"
                  data-side-tab={name}
                  aria-selected={tab === name}
                  tabIndex={tab === name ? 0 : -1}
                  onClick={() => {
                    state.side.value = name;
                  }}
                >
                  {name === "questions" ? t.sidebarLabel : t.materialsLabel}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div class="fm-side-head">
            <h2 class="fm-side-title">{t.sidebarLabel}</h2>
          </div>
        )}
        {state.materials && tab === "materials" ? (
          <Sheets state={state} t={t} />
        ) : (
          <div class="fm-side-body">
            <PlainMap state={state} r={r} />
          </div>
        )}
      </aside>
    );
  }
  if (state.materials) {
    return (
      <aside class="fm-side" data-form="stacked" aria-label={t.sidebarAria} data-review-side>
        <div class="fm-side-stack">
          <div class="fm-side-stack-head">
            <h2 class="fm-side-title">{t.sidebarLabel}</h2>
            <CloseButton state={state} t={t} />
          </div>
          <StackedMap state={state} r={r} />
        </div>
        <h2 class="fm-side-materials">{t.materialsLabel}</h2>
        <Sheets state={state} t={t} />
      </aside>
    );
  }
  return (
    <aside class="fm-side" aria-label={t.sidebarAria} data-review-side>
      <div class="fm-side-head">
        <h2 class="fm-side-title">{t.sidebarLabel}</h2>
        <CloseButton state={state} t={t} />
      </div>
      <div class="fm-side-body">
        <PlainMap state={state} r={r} />
      </div>
    </aside>
  );
}
