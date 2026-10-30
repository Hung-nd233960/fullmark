import type { Graded } from "../core/grade";
import type { PageQuiz } from "./data";
import { Icon } from "./icons";
import { Sheets, tabKeys } from "./Materials";
import {
  answeringMap,
  type Cell,
  chosenPart,
  currentOf,
  hasMaterials,
  jumpTargetAnswering,
  jumpTargetResults,
  type Part,
  partOpen,
  type ResultCell,
  resultsMap,
  ringOf,
  sideForm,
  singleRow,
} from "./map";
import { focusSidebarButton, jumpTo } from "./mapdom";
import type { PageMessages } from "./questions/shared";
import { Points } from "./ResultsCard";
import { missedIds, num, percentOf, type ResultState } from "./results";
import type { QuizState, Store } from "./store";

/** The mark on a cell after Submit, by state; `ungraded` has none. */
const GLYPH: Record<ResultState, string> = {
  correct: "✓",
  incorrect: "✗",
  partial: "◐",
  unanswered: "–",
  pending: "…",
  ungraded: "",
};

/** The top bar's sidebar button: before Focus mode, in both phases. */
export function SidebarButton({ t, state, store }: { t: PageMessages; state: QuizState; store: Store }) {
  const open = state.sidebar.value;
  const materials = hasMaterials(state.page);
  const phone = store.screen.phone.value;
  const full = materials ? t.sidebarLabelMaterials : t.sidebarLabel;
  return (
    <button
      type="button"
      class={phone ? "fm-button fm-icon-button fm-side-button" : "fm-button fm-side-button"}
      data-action="sidebar"
      aria-expanded={open}
      aria-keyshortcuts={materials ? "Q M" : "Q"}
      aria-label={phone ? full : undefined}
      title={materials ? t.sidebarTitleMaterials : t.sidebarTitle}
      onClick={() => store.sidebar(state.page.id)}
    >
      <Icon name={phone && materials ? "book" : "panel"} size={18} />
      {phone ? null : full}
    </button>
  );
}

function AnsweringCell({ t, cell, onJump }: { t: PageMessages; cell: Cell; onJump(id: string): void }) {
  return (
    <button
      type="button"
      class="fm-cell"
      data-cell={cell.id}
      data-answered={cell.answered ? "true" : undefined}
      data-current={cell.current ? "true" : undefined}
      data-flagged={cell.flagged ? "true" : undefined}
      aria-current={cell.current ? "true" : undefined}
      aria-label={t.mapCell(cell.number, cell.answered, cell.flagged, cell.current)}
      onClick={() => onJump(cell.id)}
    >
      {cell.number}
      {cell.flagged ? <span class="fm-cell-flag" aria-hidden="true" /> : null}
    </button>
  );
}

function ResultCellButton({ t, cell, onJump }: { t: PageMessages; cell: ResultCell; onJump(id: string): void }) {
  return (
    <button
      type="button"
      class="fm-cell"
      data-cell={cell.id}
      data-state={cell.state}
      data-flagged={cell.flagged ? "true" : undefined}
      aria-label={t.mapResultCell(cell.number, t.mapState[cell.state], cell.flagged)}
      onClick={() => onJump(cell.id)}
    >
      {cell.number}
      <span class="fm-cell-glyph" aria-hidden="true">
        {GLYPH[cell.state]}
      </span>
    </button>
  );
}

/** The legend under the map while answering. */
function AnsweringLegend({ t }: { t: PageMessages }) {
  return (
    <ul class="fm-legend">
      <li>
        <span class="fm-swatch fm-swatch-answered" aria-hidden="true" />
        {t.mapLegendAnswered}
      </li>
      <li>
        <span class="fm-swatch fm-swatch-flagged" aria-hidden="true" />
        {t.mapLegendFlagged}
      </li>
      <li>
        <span class="fm-swatch fm-swatch-current" aria-hidden="true" />
        {t.mapLegendCurrent}
      </li>
    </ul>
  );
}

/** The map while answering: collapsible parts of cells, then the legend. */
function AnsweringMap({ t, state, onJump }: { t: PageMessages; state: QuizState; onJump(id: string): void }) {
  const attempt = state.attempt.value;
  const parts = answeringMap(state.page, attempt, state.current.value);
  const chosen = state.mapOpen.value;
  const headless = parts.length === 1 || attempt.plan.source === "retry";
  const grid = (cells: Cell[]) => (
    <div class="fm-grid">
      {cells.map((cell) => (
        <AnsweringCell key={cell.id} t={t} cell={cell} onJump={onJump} />
      ))}
    </div>
  );
  return (
    <>
      {headless
        ? grid(parts.flatMap((p) => p.cells))
        : parts.map((part) => {
            const open = partOpen(part, chosen);
            const answered = part.cells.filter((c) => c.answered).length;
            const flags = part.cells.filter((c) => c.flagged).length;
            const target = jumpTargetAnswering(part);
            const only = part.cells[0];
            if (singleRow(part) && only !== undefined) {
              return (
                <div class="fm-map-part" key={part.id} data-part={part.id}>
                  <button
                    type="button"
                    class="fm-cell fm-cell-row"
                    data-cell={only.id}
                    data-answered={only.answered ? "true" : undefined}
                    data-current={only.current ? "true" : undefined}
                    data-flagged={only.flagged ? "true" : undefined}
                    aria-current={only.current ? "true" : undefined}
                    aria-label={t.mapRowCell(
                      only.number,
                      only.answered,
                      only.flagged,
                      only.current,
                      t.mapPart(part.number, part.title),
                    )}
                    onClick={() => onJump(only.id)}
                  >
                    <span class="fm-map-head-title">{t.mapPart(part.number, part.title)}</span>
                    <span class="fm-cell-row-number" aria-hidden="true">
                      {only.number}
                    </span>
                    {only.flagged ? <span class="fm-cell-flag" aria-hidden="true" /> : null}
                  </button>
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
                  data-current-part={part.cells.some((c) => c.current) ? "true" : undefined}
                  aria-expanded={open}
                  aria-description={t.mapHeadHint}
                  onClick={() => {
                    state.mapOpen.value = { ...chosen, [part.id]: !open };
                  }}
                  onDblClick={() => {
                    // the double-click's two clicks toggled the part twice, so it is as it was
                    if (target !== null) onJump(target);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || target === null) return;
                    e.preventDefault(); // Enter would press the button; here it jumps, and Space still opens and closes
                    onJump(target);
                  }}
                >
                  <span class="fm-map-head-title">{t.mapPart(part.number, part.title)}</span>
                  <span class="fm-map-head-count" aria-hidden="true">
                    {t.mapCount(answered, part.cells.length, flags)}
                  </span>
                  <span class="fm-sr">{t.mapCountLabel(answered, part.cells.length, flags)}</span>
                  <span class="fm-map-head-chevron" aria-hidden="true">
                    {open ? "▾" : "▸"}
                  </span>
                </button>
                {open ? grid(part.cells) : null}
              </div>
            );
          })}
      <AnsweringLegend t={t} />
    </>
  );
}

const LEGEND: ResultState[] = ["correct", "incorrect", "partial", "unanswered", "pending"];

/** The map after Submit: every part a heading row (with its score) over its grid, then the legend. */
function ResultsMap({
  t,
  state,
  graded,
  onJump,
}: {
  t: PageMessages;
  state: QuizState;
  graded: Graded;
  onJump(id: string): void;
}) {
  const page: PageQuiz = state.page;
  const attempt = state.attempt.value;
  const parts = resultsMap(page, attempt, graded);
  const missed = new Set(missedIds(graded));
  const headless = parts.length === 1 || attempt.plan.source === "retry";
  const grid = (cells: ResultCell[]) => (
    <div class="fm-grid">
      {cells.map((cell) => (
        <ResultCellButton key={cell.id} t={t} cell={cell} onJump={onJump} />
      ))}
    </div>
  );
  return (
    <>
      {headless
        ? grid(parts.flatMap((p) => p.cells))
        : parts.map((part) => {
            const score = graded.sections.find((s) => s.id === part.id);
            const percent = score === undefined ? null : percentOf(score.earned, score.points);
            const target = jumpTargetResults(part, state.filter.value, missed);
            const only = part.cells[0];
            if (singleRow(part) && only !== undefined) {
              return (
                <div class="fm-map-part" key={part.id} data-part={part.id}>
                  <button
                    type="button"
                    class="fm-cell fm-cell-row"
                    data-cell={only.id}
                    data-state={only.state}
                    data-flagged={only.flagged ? "true" : undefined}
                    aria-label={t.mapRowResult(
                      only.number,
                      t.mapState[only.state],
                      only.flagged,
                      t.mapPart(part.number, part.title),
                    )}
                    onClick={() => onJump(only.id)}
                  >
                    <span class="fm-map-head-title">{t.mapPart(part.number, part.title)}</span>
                    <span class="fm-cell-row-number" aria-hidden="true">
                      {only.number}
                    </span>
                    <span class="fm-cell-glyph" aria-hidden="true">
                      {GLYPH[only.state]}
                    </span>
                  </button>
                </div>
              );
            }
            return (
              <div class="fm-map-part" key={part.id} data-part={part.id}>
                <button
                  type="button"
                  class="fm-map-head fm-map-head-static"
                  data-part-head
                  aria-disabled={target === null ? "true" : undefined}
                  aria-description={t.mapHeadHintResults}
                  onClick={() => {
                    if (target !== null) onJump(target);
                  }}
                >
                  <span class="fm-map-head-title">{t.mapPart(part.number, part.title)}</span>
                  {score !== undefined && score.points > 0 ? (
                    <span class="fm-map-head-count" data-part-score>
                      <Points earned={score.earned} points={score.points} pending={score.pending} lang={page.uiLang} />
                      {percent === null ? null : ` · ${num(percent, page.uiLang)}%${score.pending > 0 ? "*" : ""}`}
                    </span>
                  ) : null}
                </button>
                {grid(part.cells)}
              </div>
            );
          })}
      <ul class="fm-legend fm-legend-results">
        {(parts.some((p) => p.cells.some((c) => c.state === "ungraded"))
          ? [...LEGEND, "ungraded" as const]
          : LEGEND
        ).map((s) => (
          <li key={s} class={s === "pending" ? "fm-legend-wide" : undefined}>
            <span class="fm-swatch fm-swatch-result" data-state={s} aria-hidden="true">
              {GLYPH[s]}
            </span>
            {t.mapState[s]}
          </li>
        ))}
        <li>
          <span class="fm-swatch fm-swatch-result" data-flagged="true" aria-hidden="true" />
          {t.mapLegendFlagged}
        </li>
      </ul>
    </>
  );
}

/** The completion ring of a part tab: the arc for the share answered; every question answered, a disc with the tick cut out. */
function Ring({ answered, total }: { answered: number; total: number }) {
  const { dash, done } = ringOf(answered, total);
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

/** The map while answering, for a quiz with materials: the parts as a vertical tablist, the chosen part's grid beside it. */
function StackedMap({ t, state, onJump }: { t: PageMessages; state: QuizState; onJump(id: string): void }) {
  const attempt = state.attempt.value;
  const parts: Part<Cell>[] = answeringMap(state.page, attempt, state.current.value);
  const headless = parts.length === 1 || attempt.plan.source === "retry";
  const part = chosenPart(parts, state.miniPart.value);
  const counts = (p: Part<Cell>) => ({
    answered: p.cells.filter((c) => c.answered).length,
    flags: p.cells.filter((c) => c.flagged).length,
  });
  const grid = (cells: Cell[]) => (
    <div class="fm-grid fm-grid-mini">
      {cells.map((cell) => (
        <AnsweringCell key={cell.id} t={t} cell={cell} onJump={onJump} />
      ))}
    </div>
  );
  if (headless) {
    return (
      <>
        {grid(parts.flatMap((p) => p.cells))}
        <AnsweringLegend t={t} />
      </>
    );
  }
  const stats = part === undefined ? null : counts(part);
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
            const c = counts(p);
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                class="fm-part-tab"
                data-part-tab={p.id}
                aria-selected={on}
                aria-label={t.partTabLabel(p.number, p.title, c.answered, p.cells.length, c.flags)}
                aria-description={t.mapHeadHint}
                tabIndex={on ? 0 : -1}
                onClick={() => {
                  state.miniPart.value = p.id;
                }}
                onDblClick={() => {
                  const target = jumpTargetAnswering(p);
                  if (target !== null) onJump(target);
                }}
              >
                <Ring answered={c.answered} total={p.cells.length} />
                <span class="fm-part-tab-text">
                  <span class="fm-part-tab-label">{t.mapPart(p.number, null)} </span>
                  {p.title === null ? null : <span class="fm-part-tab-name">{p.title}</span>}
                </span>
                {c.flags > 0 ? <span class="fm-part-tab-flag" title={t.partHasFlags} /> : null}
              </button>
            );
          })}
        </div>
        {part !== undefined && stats !== null ? (
          <div class="fm-part-panel" role="tabpanel" aria-label={t.partHeading(part.number, part.title)}>
            <div class="fm-part-panel-head">
              <span class="fm-part-panel-title">{t.partHeading(part.number, part.title)}</span>
              <span class="fm-part-panel-stats">{t.partStats(stats.answered, part.cells.length, stats.flags)}</span>
            </div>
            {grid(part.cells)}
          </div>
        ) : null}
      </div>
      <AnsweringLegend t={t} />
    </>
  );
}

function CloseButton({ t, state, store }: { t: PageMessages; state: QuizState; store: Store }) {
  return (
    <button
      type="button"
      class="fm-side-close"
      data-action="close-sidebar"
      aria-label={t.closeSidebar}
      title={t.closeSidebarTitle}
      onClick={() => {
        store.sidebar(state.page.id, false);
        focusSidebarButton();
      }}
    >
      <Icon name="cross" size={18} />
    </button>
  );
}

/**
 * The sidebar. Without materials: its heading, then the map for the phase. With them: while answering the map over the
 * sheets (stacked); after Submit the Questions and Materials tabs.
 */
export function Sidebar({ t, state, store }: { t: PageMessages; state: QuizState; store: Store }) {
  const attempt = state.attempt.value;
  const graded = state.graded.value;
  const phone = store.screen.phone.value;
  // on a phone a tapped cell first closes the sidebar (the questions show again), then the card is reached
  const onJump = (id: string): void => {
    if (!phone) {
      jumpTo(store, state.page.id, id);
      return;
    }
    store.sidebar(state.page.id, false);
    setTimeout(() => jumpTo(store, state.page.id, id), 0); // after the render that shows the questions again
  };
  const form = sideForm(state.page, attempt.phase, phone);
  const results = attempt.phase === "submitted" && graded;
  const tab = state.side.value;
  if (phone) {
    const here = currentOf(attempt.plan.questions, state.current.value);
    const back =
      attempt.phase === "submitted"
        ? t.backToResults
        : here === null
          ? t.backToQuestions
          : t.backToQuestion(attempt.plan.questions.indexOf(here) + 1);
    return (
      <aside class="fm-side" data-form={form} data-tab={tab} data-phone aria-label={t.sidebarAria}>
        <div class="fm-back-row">
          <button
            type="button"
            class="fm-back"
            data-action="close-sidebar"
            onClick={() => {
              store.sidebar(state.page.id, false);
              focusSidebarButton();
            }}
          >
            <Icon name="back" size={18} stroke={2.2} />
            {back}
          </button>
        </div>
        {form === "tabs" ? (
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
        {form === "tabs" && tab === "materials" ? (
          <Sheets t={t} state={state} />
        ) : (
          <div class="fm-side-body">
            {results ? (
              <ResultsMap t={t} state={state} graded={graded} onJump={onJump} />
            ) : (
              <AnsweringMap t={t} state={state} onJump={onJump} />
            )}
          </div>
        )}
      </aside>
    );
  }
  if (form === "stacked") {
    return (
      <aside class="fm-side" data-form="stacked" aria-label={t.sidebarAria}>
        <div class="fm-side-stack">
          <div class="fm-side-stack-head">
            <h2 class="fm-side-title">{t.sidebarLabel}</h2>
            <CloseButton t={t} state={state} store={store} />
          </div>
          <StackedMap t={t} state={state} onJump={onJump} />
        </div>
        <h2 class="fm-side-materials">{t.materialsLabel}</h2>
        <Sheets t={t} state={state} />
      </aside>
    );
  }
  if (form === "tabs") {
    return (
      <aside class="fm-side" data-form="tabs" data-tab={tab} aria-label={t.sidebarAria}>
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
          <CloseButton t={t} state={state} store={store} />
        </div>
        {tab === "materials" ? (
          <Sheets t={t} state={state} />
        ) : (
          <div class="fm-side-body">
            {results ? <ResultsMap t={t} state={state} graded={graded} onJump={onJump} /> : null}
          </div>
        )}
      </aside>
    );
  }
  return (
    <aside class="fm-side" aria-label={t.sidebarAria}>
      <div class="fm-side-head">
        <h2 class="fm-side-title">{t.sidebarLabel}</h2>
        <CloseButton t={t} state={state} store={store} />
      </div>
      <div class="fm-side-body">
        {results ? (
          <ResultsMap t={t} state={state} graded={graded} onJump={onJump} />
        ) : (
          <AnsweringMap t={t} state={state} onJump={onJump} />
        )}
      </div>
    </aside>
  );
}
