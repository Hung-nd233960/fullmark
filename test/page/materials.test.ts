import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { pageQuizOf } from "../../src/build/page";
import { en, vi } from "../../src/core/i18n";
import { App } from "../../src/page/App";
import { keyHandler } from "../../src/page/keys";
import { RING, ringOf, sideForm } from "../../src/page/map";
import { Sidebar } from "../../src/page/Sidebar";
import { createStore, exportFor } from "../../src/page/store";
import { build } from "../helpers/page";

const mcq = (id: string) => `## Q ${id}? {type=single id=${id} points=1}\n\n- [x] right ${id}\n- [ ] wrong ${id}\n`;
const TEXT = [
  "---",
  "title: Mats",
  "id: mats",
  "---",
  "",
  "# Signals {id=a}",
  "",
  mcq("a1"),
  mcq("a2"),
  "# Fourier {id=b}",
  "",
  mcq("b1"),
  "# Sampling {id=c}",
  "",
  mcq("c1"),
].join("\n");

const SHEETS = [
  { name: "Fourier", html: "<h1>Fourier</h1><table><tr><td>x</td></tr></table>" },
  { name: "Identities", html: "<h1>Identities</h1><p>e</p>" },
];

const make = (withSheets = true) => {
  const page = pageQuizOf(build(TEXT));
  if (withSheets) page.materials = SHEETS;
  const store = createStore({ version: 1, quizzes: [page] });
  const state = store.quizzes.get(page.id) as NonNullable<ReturnType<typeof store.quizzes.get>>;
  return { page, store, state, id: page.id };
};
const side = (m: ReturnType<typeof make>, t = en.page) =>
  renderToString(h(Sidebar, { t, state: m.state, store: m.store }));

describe("a part's completion ring", () => {
  it("is empty at 0, an arc for part, and done when all are answered", () => {
    expect(ringOf(0, 4)).toEqual({ dash: `0 ${RING}`, done: false });
    const part = ringOf(1, 4);
    expect(Number.parseFloat(part.dash)).toBeCloseTo(RING / 4, 6);
    expect(part.done).toBe(false);
    expect(ringOf(4, 4).done).toBe(true);
    expect(Number.parseFloat(ringOf(4, 4).dash)).toBeCloseTo(RING, 6);
  });
});

describe("the sidebar of a quiz with materials", () => {
  it("is plain without them, stacked while answering and tabs after Submit", () => {
    expect(sideForm(make(false).page, "answering")).toBe("plain");
    const m = make();
    expect(sideForm(m.page, "answering")).toBe("stacked");
    expect(sideForm(m.page, "submitted")).toBe("tabs");
  });

  it("names a part tab with its counts in words, in en and vi", () => {
    const m = make();
    m.store.start(m.id, { seed: "seed0001" });
    m.store.dispatch(m.id, { type: "answer", question: "a1", answer: { choice: 1 } });
    m.store.dispatch(m.id, { type: "flag", question: "a2" });
    const html = side(m);
    expect(html).toContain('aria-label="Part 1, Signals: 1 of 2 answered, 1 flagged"');
    expect(html).toContain('aria-label="Part 3, Sampling: 0 of 1 answered"');
    expect(html).toContain("Part 1 · Signals");
    expect(html).toContain('role="tablist" aria-label="Sheets"');
    expect(side(m, vi.page)).toContain("Phần 1, Signals: đã trả lời 1 trên 2, 1 câu đã đánh dấu");
  });

  it("chooses the current part first, then the learner's pick", () => {
    const m = make();
    m.store.start(m.id, { seed: "seed0001" });
    m.store.focus(m.id, "b1");
    expect(side(m)).toContain('data-part-tab="b" aria-selected="true"');
    m.state.miniPart.value = "a";
    expect(side(m)).toContain('data-part-tab="a" aria-selected="true"');
  });

  it("shows the sheet as built, once, under the chip that names it", () => {
    const m = make();
    m.store.start(m.id, { seed: "seed0001" });
    m.state.sheet.value = 1;
    const html = side(m);
    expect(html.match(/<h1>Identities<\/h1>/g)?.length).toBe(1);
    expect(html).not.toContain("<h1>Fourier</h1>");
  });
});

describe("M and Q", () => {
  const press = (m: ReturnType<typeof make>, key: string, target: Record<string, unknown> = { tagName: "BODY" }) =>
    keyHandler(m.store)({ key, ctrlKey: false, metaKey: false, altKey: false, target, preventDefault: () => {} });

  it("M does nothing without materials, and in a text field", () => {
    const none = make(false);
    none.store.start(none.id, { seed: "seed0001" });
    none.state.sidebar.value = false;
    press(none, "m");
    expect(none.state.sidebar.value).toBe(false);
    const m = make();
    m.store.start(m.id, { seed: "seed0001" });
    m.state.sidebar.value = false;
    press(m, "m", { tagName: "TEXTAREA" });
    expect(m.state.sidebar.value).toBe(false);
    press(m, "m");
    expect(m.state.sidebar.value).toBe(true);
  });

  it("opens Questions or Materials after Submit, switches between them and closes at the same tab", () => {
    const m = make();
    m.store.start(m.id, { seed: "seed0001" });
    m.store.submit(m.id);
    m.state.sidebar.value = false;
    press(m, "m");
    expect([m.state.sidebar.value, m.state.side.value]).toEqual([true, "materials"]);
    press(m, "q");
    expect([m.state.sidebar.value, m.state.side.value]).toEqual([true, "questions"]);
    press(m, "m");
    press(m, "m");
    expect(m.state.sidebar.value).toBe(false);
  });

  it("while answering Q closes the stacked sidebar and M keeps it open", () => {
    const m = make();
    m.store.start(m.id, { seed: "seed0001" });
    m.state.sidebar.value = true;
    press(m, "m");
    expect(m.state.sidebar.value).toBe(true);
    press(m, "q");
    expect(m.state.sidebar.value).toBe(false);
  });
});

describe("opening a sheet", () => {
  it("changes nothing in the attempt or the export", () => {
    const m = make();
    m.store.start(m.id, { seed: "seed0001", now: new Date("2026-10-29T10:00:00") });
    m.store.submit(m.id, new Date("2026-10-29T10:05:00"));
    const before = exportFor(m.state, new Date("2026-10-29T10:06:00"));
    const attempt = JSON.stringify(m.state.attempt.value);
    m.state.sheet.value = 1;
    m.state.side.value = "materials";
    m.state.shelf.value = true;
    expect(JSON.stringify(m.state.attempt.value)).toBe(attempt);
    expect(exportFor(m.state, new Date("2026-10-29T10:06:00"))).toEqual(before);
  });
});

describe("the start screen", () => {
  it("has a Materials button and the longer clock note only for a quiz with sheets", () => {
    const html = (m: ReturnType<typeof make>) => renderToString(h(App, { store: m.store }));
    expect(html(make())).toContain('data-action="materials"');
    expect(html(make())).toContain("Materials can be opened first.");
    expect(html(make(false))).not.toContain('data-action="materials"');
    const open = make();
    open.state.shelf.value = true;
    expect(html(open)).toContain('class="fm-shelf"');
  });
});
