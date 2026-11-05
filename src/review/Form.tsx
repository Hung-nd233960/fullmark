import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { type ReviewMessages, reviewEn, reviewVi } from "../core/i18n/review";
import { lineDiff } from "../core/review/diff";
import type { ReasonId } from "../core/review/reasons";
import { AppearanceButton, AppearanceMenu, type LookStore, TextSize } from "../page/Appearance";
import type { PageQuestion, PageSection } from "../page/data";
import { Icon } from "../page/icons";
import { Html, messagesFor } from "../page/questions/shared";
import { num } from "../page/results";
import { KeyBody, type Keyed, keyedOf } from "./Body";
import type { ReviewData } from "./data";
import { reasonsFor } from "./logic";
import { jump, scrolling } from "./nav";
import { GLYPH, VERDICTS } from "./parts";
import { Side } from "./Side";
import type { FormState } from "./state";

// -- the bar -------------------------------------------------------------------------------------------------------

/** Keep the rest and Finish: in the top bar, and on a phone in the bar at the foot of the screen (ReviewPhone board). */
function Actions({ state, r, done }: { state: FormState; r: ReviewMessages; done: boolean }) {
  return (
    <>
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
    </>
  );
}

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
  const since = state.since;
  const done = state.saved.value !== null;
  const phone = state.phone.value;
  const sideName = state.materials ? t.sidebarLabelMaterials : t.sidebarLabel;
  return (
    <header class="fm-dock" data-dock data-phone={phone ? "true" : undefined} ref={dock}>
      <div class="fm-topbar">
        {phone ? (
          <div class="fm-phone-head">
            <h1 class="fm-title">{r.phoneTitle(page.title)}</h1>
            <span class="fm-phone-line" data-compact>
              {r.judged(counts.judged, counts.total)} · {t.questionLabel(here)}
            </span>
          </div>
        ) : (
          <h1 class="fm-title">
            <span class="fm-review-label">{r.label}</span> {page.title}
          </h1>
        )}
        <div class="fm-topbar-actions">
          <button
            type="button"
            class={phone ? "fm-button fm-icon-button fm-side-button" : "fm-button fm-side-button"}
            data-action="sidebar"
            aria-expanded={state.sidebar.value}
            aria-keyshortcuts={state.materials ? "Q M" : "Q"}
            aria-label={phone ? sideName : undefined}
            title={state.materials ? t.sidebarTitleMaterials : t.sidebarTitle}
            onClick={() => {
              state.sidebar.value = !state.sidebar.value;
            }}
          >
            <Icon name={phone && state.materials ? "book" : "panel"} size={18} />
            {phone ? null : sideName}
          </button>
          {phone ? null : <TextSize t={t} store={store} />}
          {store.look.locked && !phone ? null : <AppearanceButton t={t} store={store} />}
          {phone ? null : <Actions state={state} r={r} done={done} />}
        </div>
      </div>
      {phone ? null : (
        <ul class="fm-status" aria-label={t.statusLabel}>
          {since !== null ? (
            <li class="fm-status-seg" data-seg="asked">
              {r.askedAgain(state.scope.length, r.date(since.reviewedAt))}
            </li>
          ) : null}
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
            {r.position(here, state.items.length)}
          </li>
        </ul>
      )}
      {store.look.locked && !phone ? null : <AppearanceMenu t={t} store={store} />}
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

/**
 * `--since`, a changed question (ReviewSince board): the learner's earlier verdict with its reasons and note, then what
 * changed as a line diff of the block judged against the block now. A Keep stores no block (G61), so a changed Keep
 * says so in place of the diff; a new question has none of this.
 */
function Earlier({ state, id, r }: { state: FormState; id: string; r: ReviewMessages }) {
  const was = state.since?.changed[id];
  if (!state.since || !was) return null;
  const on = r.date(state.since.reviewedAt);
  const { earlier } = was;
  const lines = was.before === null ? null : lineDiff(was.before, was.after);
  return (
    <div class="fm-since" data-since-box>
      <div class="fm-since-head">
        <span class="fm-verdict-label">{r.earlier(on)}</span>
        <span class="fm-since-verdict" data-verdict={earlier.verdict}>
          {r[earlier.verdict]}
        </span>
        {earlier.reasons.map((reason) => (
          <span key={reason} class="fm-since-chip">
            {r.reason[reason]}
          </span>
        ))}
        {earlier.assumed ? <span class="fm-since-chip">{r.notLookedAt}</span> : null}
      </div>
      {earlier.note.trim() === "" ? null : <p class="fm-since-note">{`“${earlier.note.trim()}”`}</p>}
      {lines !== null ? (
        <figure class="fm-since-changes" aria-label={r.diffAria(state.number(id), on)}>
          <figcaption class="fm-verdict-label">{r.changedSince}</figcaption>
          <pre class="fm-diff" data-diff>
            {lines.map((line, i) => (
              <span key={i} class="fm-diff-line" data-kind={line.kind}>
                <span class="fm-diff-sign" aria-hidden="true">
                  {line.kind === "del" ? "−" : line.kind === "add" ? "+" : " "}
                </span>
                <span class="fm-diff-text">{line.text}</span>
              </span>
            ))}
          </pre>
        </figure>
      ) : earlier.verdict === "keep" ? (
        <p class="fm-since-keep" data-since-keep>
          {r.keptChanged}
        </p>
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
      <Earlier state={state} id={q.id} r={r} />
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

// -- the dialogs and the saved card ------------------------------------------------------------------------------------

/** Keep the rest and Finish, when questions are not judged (G43). Both end in the same button. */
function Dialog({ state, r }: { state: FormState; r: ReviewMessages }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const kind = state.dialog.value;
  const left = state.scope.filter((q) => state.entries.value[q.id]?.verdict == null);
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
      <p class="fm-review-dialog-note">
        {r.dlgNote[0]}
        <code class="fm-nowrap">{r.dlgNote[1]}</code>
        {r.dlgNote[2]}
      </p>
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
  // with `--since` only the questions asked are cards; a section with none is left out
  const asked = state.asked;
  const sections: PageSection[] = page.sections
    .map((s) => (asked === null ? s : { ...s, questions: s.questions.filter((q) => asked.has(q.id)) }))
    .filter((s) => asked === null || s.questions.length > 0);
  const done = state.saved.value !== null;
  const phone = state.phone.value;
  // on a phone an open sidebar takes the screen: what is under it is not there (as the page's)
  const covered = phone && state.sidebar.value;
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
    <div
      class="fm-quiz fm-review"
      data-quiz={page.id}
      data-phase={done ? "saved" : "reviewing"}
      data-since={asked === null ? undefined : "true"}
    >
      <Bar state={state} store={store} r={r} />
      <div
        class="fm-body"
        data-side={state.sidebar.value ? "open" : "closed"}
        data-wide={state.materials && !phone ? "" : undefined}
      >
        <main class="fm-main" lang={page.lang} data-covered={covered ? "true" : undefined}>
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
        {state.sidebar.value ? <Side state={state} r={r} /> : null}
      </div>
      {phone ? (
        <div class="fm-footbar" data-footbar data-covered={covered ? "true" : undefined}>
          <Actions state={state} r={r} done={done} />
        </div>
      ) : null}
      <Dialog state={state} r={r} />
    </div>
  );
}
