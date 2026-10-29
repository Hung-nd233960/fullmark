import type { Graded } from "../core/grade";
import type { PageQuiz } from "./data";
import { Icon } from "./icons";
import { answeringMap, type Cell, partOpen, type ResultCell, resultsMap } from "./map";
import { focusSidebarButton, jumpTo } from "./mapdom";
import type { PageMessages } from "./questions/shared";
import { Points } from "./ResultsCard";
import { num, percentOf, type ResultState } from "./results";
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
  return (
    <button
      type="button"
      class="fm-button fm-side-button"
      data-action="sidebar"
      aria-expanded={open}
      aria-keyshortcuts="Q"
      title={t.sidebarTitle}
      onClick={() => store.sidebar(state.page.id)}
    >
      <Icon name="panel" size={18} />
      {t.sidebarLabel}
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
            return (
              <div class="fm-map-part" key={part.id} data-part={part.id}>
                <button
                  type="button"
                  class="fm-map-head"
                  data-part-head
                  data-open={open ? "true" : undefined}
                  data-current-part={part.cells.some((c) => c.current) ? "true" : undefined}
                  aria-expanded={open}
                  onClick={() => {
                    state.mapOpen.value = { ...chosen, [part.id]: !open };
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
            return (
              <div class="fm-map-part" key={part.id} data-part={part.id}>
                <div class="fm-map-head fm-map-head-static">
                  <span class="fm-map-head-title">{t.mapPart(part.number, part.title)}</span>
                  {score !== undefined && score.points > 0 ? (
                    <span class="fm-map-head-count" data-part-score>
                      <Points earned={score.earned} points={score.points} pending={score.pending} lang={page.uiLang} />
                      {percent === null ? null : ` · ${num(percent, page.uiLang)}%${score.pending > 0 ? "*" : ""}`}
                    </span>
                  ) : null}
                </div>
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

/** The sidebar: its heading and close button, then the map for the phase. Without materials, nothing else (2f3). */
export function Sidebar({ t, state, store }: { t: PageMessages; state: QuizState; store: Store }) {
  const attempt = state.attempt.value;
  const graded = state.graded.value;
  const onJump = (id: string): void => jumpTo(store, state.page.id, id);
  return (
    <aside class="fm-side" aria-label={t.sidebarAria}>
      <div class="fm-side-head">
        <h2 class="fm-side-title">{t.sidebarLabel}</h2>
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
      </div>
      <div class="fm-side-body">
        {attempt.phase === "submitted" && graded ? (
          <ResultsMap t={t} state={state} graded={graded} onJump={onJump} />
        ) : (
          <AnsweringMap t={t} state={state} onJump={onJump} />
        )}
      </div>
    </aside>
  );
}
