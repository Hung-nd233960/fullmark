import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { type ReviewMessages, reviewEn, reviewVi } from "../core/i18n/review";
import type { ReasonId, Verdict } from "../core/review/reasons";
import { AppearanceButton, AppearanceMenu, type LookStore, TextSize } from "../page/Appearance";
import type { PageQuestion, PageQuiz, PageSection } from "../page/data";
import { Icon } from "../page/icons";
import { Html, messagesFor } from "../page/questions/shared";
import { num } from "../page/results";
import { KeyBody, type Keyed, keyedOf } from "./Body";
import type { ReviewData } from "./data";
import { reasonsFor } from "./logic";
import { jump, scrolling } from "./nav";
import type { FormState } from "./state";

const GLYPH: Record<Verdict, string> = { keep: "✓", fix: "✎", drop: "✕" };
const VERDICTS: readonly Verdict[] = ["keep", "fix", "drop"];

/** The part a question belongs to, in source order; a quiz of one untitled section has one part with no heading. */
type Part = { id: string; title: string | null; number: number; ids: string[] };
function partsOf(page: PageQuiz): Part[] {
  return page.sections.map((s, i) => ({ id: s.id, title: s.title, number: i + 1, ids: s.questions.map((q) => q.id) }));
}

// -- the bar -------------------------------------------------------------------------------------------------------

function Bar({ state, store, r }: { state: FormState; store: LookStore; r: ReviewMessages }) {
  const { page } = state;
  const t = messagesFor(page);
  const dock = useRef<HTMLDivElement>(null);
  // the sidebar and the cards' scroll margin sit below the docked block, whatever height it wraps to
  useEffect(() => {
    const el = dock.current;
    const root = document.documentElement;
    if (!el) return;
    const measure = (): void => root.style.setProperty("--dock-h", `${el.offsetHeight}px`);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const counts = state.counts();
  const pct = counts.total === 0 ? 0 : Math.round((100 * counts.judged) / counts.total);
  const here = state.number(state.current.value);
  const done = state.saved.value !== null;
  return (
    <header class="fm-dock" data-dock ref={dock}>
      <div class="fm-topbar">
        <h1 class="fm-title">
          <span class="fm-review-label">{r.label}</span> {page.title}
        </h1>
        <div class="fm-topbar-actions">
          <button
            type="button"
            class="fm-button fm-side-button"
            data-action="sidebar"
            aria-expanded={state.sidebar.value}
            aria-keyshortcuts="Q"
            title={t.sidebarTitle}
            onClick={() => {
              state.sidebar.value = !state.sidebar.value;
            }}
          >
            <Icon name="panel" size={18} />
            {t.sidebarLabel}
          </button>
          <TextSize t={t} store={store} />
          {store.look.locked ? null : <AppearanceButton t={t} store={store} />}
          <button
            type="button"
            class="fm-button"
            data-action="keep-rest"
            title={r.keepRestTitle}
            disabled={done}
            onClick={() => state.keepRest()}
          >
            {r.keepRest}
          </button>
          <button
            type="button"
            class="fm-button fm-primary"
            data-action="finish"
            disabled={done}
            onClick={() => state.finish()}
          >
            {r.finish}
          </button>
        </div>
      </div>
      <ul class="fm-status" aria-label={t.statusLabel}>
        <li class="fm-status-seg" data-seg="judged">
          <span>{r.judged(counts.judged, counts.total)}</span>
          <progress
            class="fm-progress"
            max={counts.total}
            value={counts.judged}
            aria-label={r.judgedAria}
            data-progress
          />
          <b>{pct}%</b>
        </li>
        <li class="fm-status-seg" data-seg="counts">
          <span>
            <b data-verdict="keep">{counts.keep}</b> {r.verdictWord.keep} · <b data-verdict="fix">{counts.fix}</b>{" "}
            {r.verdictWord.fix} · <b data-verdict="drop">{counts.drop}</b> {r.verdictWord.drop}
          </span>
        </li>
        <li class="fm-status-seg" data-seg="question">
          {r.position(here, counts.total)}
        </li>
      </ul>
      {store.look.locked ? null : <AppearanceMenu t={t} store={store} />}
    </header>
  );
}

// -- a card ---------------------------------------------------------------------------------------------------------

function Status({ state, id, r }: { state: FormState; id: string; r: ReviewMessages }) {
  const e = state.entries.value[id];
  const v = e?.verdict ?? null;
  return (
    <span class="fm-review-status" data-verdict={v ?? "none"}>
      {v === null
        ? r.notJudged
        : v === "keep"
          ? `${GLYPH.keep} ${r.keep}`
          : `${GLYPH[v]} ${r[v]} · ${r.reasonCount(e?.reasons.length ?? 0)}`}
    </span>
  );
}

function Reasons({ state, q, r, held }: { state: FormState; q: PageQuestion; r: ReviewMessages; held: boolean }) {
  const e = state.entries.value[q.id];
  if (!e || (e.verdict !== "fix" && e.verdict !== "drop")) return null;
  const list = reasonsFor(e.verdict, q.type);
  const needsNote = e.reasons.includes("other");
  const missing = needsNote && e.note.trim() === "";
  const why = e.verdict === "drop" ? r.whyDrop : r.whyFix;
  const noteId = `${state.page.id}/${q.id}/note`;
  return (
    <div class="fm-reason-box" data-reasons data-held={held ? "true" : undefined}>
      <fieldset class="fm-chips">
        <legend class="fm-sr">{why}</legend>
        <span class="fm-verdict-label" aria-hidden="true">
          {why}
        </span>
        {list.map((reason: ReasonId) => (
          <button
            key={reason}
            type="button"
            class="fm-chip"
            data-reason={reason}
            data-verdict={e.verdict}
            aria-pressed={e.reasons.includes(reason)}
            onClick={() => state.reason(q.id, reason)}
          >
            {r.reason[reason]}
          </button>
        ))}
      </fieldset>
      {e.reasons.length === 0 ? (
        <span class="fm-err" data-error="reason" id={`${noteId}-reason-error`}>
          {r.pickOne}
        </span>
      ) : null}
      <label for={noteId} class="fm-note-label">
        {needsNote ? r.noteRequired : r.noteOptional}
      </label>
      <textarea
        id={noteId}
        class="fm-note"
        rows={2}
        lang="en"
        value={e.note}
        aria-invalid={missing ? "true" : undefined}
        aria-describedby={missing ? `${noteId}-error` : undefined}
        onInput={(ev) => state.note(q.id, (ev.currentTarget as HTMLTextAreaElement).value)}
      />
      {missing ? (
        <span class="fm-err" data-error="note" id={`${noteId}-error`}>
          {r.noteMissing}
        </span>
      ) : null}
    </div>
  );
}

function Card({
  state,
  keyed,
  q,
  r,
  held,
}: {
  state: FormState;
  keyed: Keyed;
  q: PageQuestion;
  r: ReviewMessages;
  held: boolean;
}) {
  const { page } = state;
  const t = messagesFor(page);
  const number = state.number(q.id);
  const v = state.entries.value[q.id]?.verdict ?? null;
  const explanation = keyed.key.explanations[q.id];
  const id = `${page.id}/${q.id}`;
  return (
    <article
      class="fm-question fm-review-card"
      id={id}
      data-type={q.type}
      data-qid={q.id}
      data-verdict={v ?? undefined}
      data-current={state.current.value === q.id ? "true" : undefined}
      aria-labelledby={`${id}/head`}
      onFocusIn={() => {
        state.current.value = q.id;
      }}
    >
      <header class="fm-question-head">
        <span class="fm-question-meta" id={`${id}/head`}>
          <span class="fm-question-number">{t.questionLabel(number)}</span>
          {q.graded ? <span class="fm-question-points">{t.pointsLabel(num(q.points, page.uiLang))}</span> : null}
          {q.type === "single" || q.type === "multi" ? (
            <span class="fm-kind">{q.type === "multi" ? t.chooseAll : t.chooseOne}</span>
          ) : null}
          {q.tags.map((tag) => (
            <span key={tag} class="fm-tag">{`#${tag}`}</span>
          ))}
        </span>
        <span class="fm-question-end">
          <Status state={state} id={q.id} r={r} />
        </span>
      </header>
      {q.type === "blanks" ? null : <Html html={q.promptHtml} class="fm-prompt" id={`${id}/prompt`} />}
      {q.hintHtml !== null ? (
        <div class="fm-hint-box fm-review-hint">
          <span class="fm-hint-label">{t.hint}</span>
          <Html html={q.hintHtml} class="fm-hint-text" />
        </div>
      ) : null}
      <KeyBody k={keyed} q={q} r={r} />
      {explanation ? (
        <div class="fm-explanation">
          <strong class="fm-explanation-label">{t.explanation}</strong>
          <Html html={explanation} class="fm-explanation-text" />
        </div>
      ) : null}
      <fieldset class="fm-verdict-row">
        <legend class="fm-sr">{r.verdictLabel}</legend>
        <span class="fm-verdict-label" aria-hidden="true">
          {r.verdictLabel}
        </span>
        {VERDICTS.map((verdict, i) => (
          <button
            key={verdict}
            type="button"
            class="fm-verdict"
            data-pick={verdict}
            aria-pressed={v === verdict}
            aria-keyshortcuts={String(i + 1)}
            onClick={() => state.pick(q.id, verdict)}
          >
            {r[verdict]}
          </button>
        ))}
      </fieldset>
      <Reasons state={state} q={q} r={r} held={held} />
    </article>
  );
}

// -- the sidebar ----------------------------------------------------------------------------------------------------

/** The plain Questions sidebar (G52): the parts as collapsible headings over their grids, then the legend and the keys. */
function Sidebar({ state, r }: { state: FormState; r: ReviewMessages }) {
  const { page } = state;
  const t = messagesFor(page);
  const parts = partsOf(page);
  const entries = state.entries.value;
  const headless = parts.length === 1 && parts[0]?.title === null;
  const cell = (id: string, row = false) => {
    const v = entries[id]?.verdict ?? null;
    const n = state.number(id);
    const current = state.current.value === id;
    return (
      <button
        key={id}
        type="button"
        class={row ? "fm-cell fm-cell-row" : "fm-cell"}
        data-cell={id}
        data-verdict={v ?? undefined}
        data-current={current ? "true" : undefined}
        aria-current={current ? "true" : undefined}
        aria-label={r.cellLabel(n, v === null ? r.notJudgedWord : r.verdictWord[v], current)}
        onClick={() => jump(page, state, id, true)}
      >
        {row ? null : n}
        {v === null || row ? null : (
          <span class="fm-cell-glyph" aria-hidden="true">
            {GLYPH[v]}
          </span>
        )}
        {row ? (
          <span class="fm-map-head-title">{t.mapPart(parts.find((p) => p.ids.includes(id))?.number ?? 1, null)}</span>
        ) : null}
      </button>
    );
  };
  const grid = (ids: string[]) => <div class="fm-grid">{ids.map((id) => cell(id))}</div>;
  return (
    <aside class="fm-side" aria-label={t.sidebarAria} data-review-side>
      <div class="fm-side-head">
        <h2 class="fm-side-title">{t.sidebarLabel}</h2>
        <button
          type="button"
          class="fm-side-close"
          data-action="close-sidebar"
          aria-label={t.closeSidebar}
          title={t.closeSidebarTitle}
          onClick={() => {
            state.sidebar.value = false;
            document.querySelector<HTMLElement>("[data-action=sidebar]")?.focus();
          }}
        >
          <Icon name="cross" size={18} />
        </button>
      </div>
      <div class="fm-side-body">
        {headless
          ? grid(parts.flatMap((p) => p.ids))
          : parts.map((part) => {
              const judged = part.ids.filter((id) => entries[id]?.verdict != null).length;
              const open = state.mapOpen.value[part.id] ?? part.ids.some((id) => id === state.current.value);
              if (part.ids.length === 1 && part.ids[0] !== undefined) {
                return (
                  <div class="fm-map-part" key={part.id} data-part={part.id}>
                    {cellRow(part, part.ids[0])}
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
                      {judged}/{part.ids.length}
                    </span>
                    <span class="fm-sr">{r.partCount(judged, part.ids.length)}</span>
                    <span class="fm-map-head-chevron" aria-hidden="true">
                      {open ? "▾" : "▸"}
                    </span>
                  </button>
                  {open ? grid(part.ids) : null}
                </div>
              );
            })}
        <Legend r={r} />
      </div>
    </aside>
  );

  function cellRow(part: Part, id: string) {
    const v = entries[id]?.verdict ?? null;
    const current = state.current.value === id;
    return (
      <button
        type="button"
        class="fm-cell fm-cell-row"
        data-cell={id}
        data-verdict={v ?? undefined}
        data-current={current ? "true" : undefined}
        aria-current={current ? "true" : undefined}
        aria-label={`${r.cellLabel(state.number(id), v === null ? r.notJudgedWord : r.verdictWord[v], current)}, ${t.mapPart(part.number, part.title)}`}
        onClick={() => jump(page, state, id, true)}
      >
        <span class="fm-map-head-title">{t.mapPart(part.number, part.title)}</span>
        {v === null ? null : (
          <span class="fm-cell-glyph" aria-hidden="true">
            {GLYPH[v]}
          </span>
        )}
      </button>
    );
  }
}

function Legend({ r }: { r: ReviewMessages }) {
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
      </ul>
    </>
  );
}

// -- the dialogs and the saved card ------------------------------------------------------------------------------------

/** Keep the rest and Finish, when questions are not judged (G43). Both end in the same button. */
function Dialog({ state, r }: { state: FormState; r: ReviewMessages }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const kind = state.dialog.value;
  const left = state.items.filter((q) => state.entries.value[q.id]?.verdict == null);
  const first = left[0]?.id ?? null;
  useLayoutEffect(() => {
    const el = dialog.current;
    if (el === null || kind === "none") return;
    if (!el.open) el.showModal();
    back.current?.focus();
  }, [kind]);
  if (kind === "none") return null;
  const close = (goTo: string | null): void => {
    state.dialog.value = "none";
    dialog.current?.close();
    if (goTo !== null) jump(state.page, state, goTo, true);
    else
      document
        .querySelector<HTMLElement>(kind === "rest" ? "[data-action=keep-rest]" : "[data-action=finish]")
        ?.focus();
  };
  return (
    <dialog
      ref={dialog}
      class="fm-dialog fm-review-dialog"
      data-review-dialog={kind}
      aria-labelledby="fm-review-dialog-title"
      onCancel={() => {
        state.dialog.value = "none";
      }}
    >
      <h2 id="fm-review-dialog-title">{r.dlgTitle(left.length)}</h2>
      <p>{kind === "rest" ? r.dlgRest : r.dlgFinish}</p>
      <p class="fm-review-dialog-note">{r.dlgNote}</p>
      <div class="fm-dialog-actions">
        <button
          type="button"
          class="fm-button"
          data-action="dialog-back"
          ref={back}
          onClick={() => close(kind === "rest" ? null : first)}
        >
          {kind === "rest" || first === null ? r.cancel : r.back(state.number(first))}
        </button>
        <button type="button" class="fm-button fm-primary" data-action="mark-keep" onClick={() => state.confirm()}>
          {r.markKeep}
        </button>
      </div>
    </dialog>
  );
}

function Saved({ state, data, r }: { state: FormState; data: ReviewData; r: ReviewMessages }) {
  const c = state.saved.value;
  if (c === null) return null;
  return (
    <section class="fm-question fm-review-saved" role="status" data-review-saved>
      <h2 class="fm-review-saved-title">
        <Icon name="check" size={22} stroke={2.5} />
        {r.saved}
      </h2>
      <p>{r.doneLine(data.out, c.keep, c.assumed, c.fix, c.drop)}</p>
      <p class="fm-review-saved-note">
        {r.closed} <code>{data.check}</code>
      </p>
    </section>
  );
}

function Notices({ state, r }: { state: FormState; r: ReviewMessages }) {
  const held = state.held.value;
  return (
    <>
      {held.length > 0 ? (
        <div class="fm-notice fm-review-held" role="alert" data-notice="held">
          {r.held(held.length)}{" "}
          {held.map((id, i) => (
            <span key={id}>
              {i > 0 ? ", " : ""}
              <button type="button" class="fm-link-button" onClick={() => jump(state.page, state, id, true)}>
                {state.number(id)}
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {state.problem.value !== null ? (
        <div class="fm-notice fm-review-problem" role="alert" data-problem>
          {r.saveFailed(state.problem.value)}
        </div>
      ) : null}
    </>
  );
}

// -- the form -------------------------------------------------------------------------------------------------------

export function Form({ state, store, data }: { state: FormState; store: LookStore; data: ReviewData }) {
  const { page } = state;
  const r = page.uiLang === "vi" ? reviewVi : reviewEn;
  const keyed = useRef<Keyed | null>(null);
  if (keyed.current === null) keyed.current = keyedOf(page);
  const sections: PageSection[] = page.sections;
  const done = state.saved.value !== null;
  const held = new Set(state.held.value);
  // the current question follows the scroll: the first card whose bottom is below the docked block
  useEffect(() => {
    let frame = 0;
    const onScroll = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (scrolling()) return;
        const top = (document.querySelector<HTMLElement>("[data-dock]")?.offsetHeight ?? 0) + 24;
        for (const card of document.querySelectorAll<HTMLElement>("article[data-qid]")) {
          if (card.getBoundingClientRect().bottom > top) {
            state.current.value = card.dataset.qid ?? state.current.value;
            return;
          }
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [state]);
  return (
    <div class="fm-quiz fm-review" data-quiz={page.id} data-phase={done ? "saved" : "reviewing"}>
      <Bar state={state} store={store} r={r} />
      <div class="fm-body" data-side={state.sidebar.value ? "open" : "closed"}>
        <main class="fm-main" lang={page.lang}>
          <Notices state={state} r={r} />
          {done ? (
            <Saved state={state} data={data} r={r} />
          ) : (
            <div class="fm-questions">
              {sections.map((section) => (
                <section
                  class="fm-section"
                  key={section.id}
                  id={section.title !== null ? `${page.id}/${section.id}` : undefined}
                >
                  {section.title !== null ? <h2>{section.title}</h2> : null}
                  {section.introHtml !== "" ? <Html html={section.introHtml} class="fm-intro" /> : null}
                  {section.questions.map((q) => (
                    <Card key={q.id} state={state} keyed={keyed.current as Keyed} q={q} r={r} held={held.has(q.id)} />
                  ))}
                </section>
              ))}
            </div>
          )}
        </main>
        {state.sidebar.value ? <Sidebar state={state} r={r} /> : null}
      </div>
      <Dialog state={state} r={r} />
    </div>
  );
}
