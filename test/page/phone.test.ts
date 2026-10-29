import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { App } from "../../src/page/App";
import { keyHandler } from "../../src/page/keys";
import { sideForm } from "../../src/page/map";
import { compactLine } from "../../src/page/status";
import { setup } from "../helpers/page";

const q = (id: string) => `## Q ${id}? {type=single id=${id}}\n\n- [x] right\n- [ ] wrong\n`;
const quiz = (front: string, extra = "") =>
  ["---", "title: Phone", "id: phone", front, "---", "", extra, q("a1"), q("a2")].join("\n");

function run(front: string, extra = "") {
  const { store, id, state, html } = setup(quiz(front, extra));
  store.start(id, { seed: "s", now: new Date(2026, 9, 26, 14, 0, 0) });
  const line = (fullscreenClock: string | null = null) => {
    const s = state();
    return compactLine({
      page: s.page,
      attempt: s.attempt.value,
      elapsed: s.elapsed.value,
      sectionSeconds: s.sectionSeconds.value,
      current: s.current.value,
      fullscreenClock,
    });
  };
  return { store, id, state, html, line };
}

describe("the phone's compact line", () => {
  it("holds the time left and the progress, nothing else, while answering a timed quiz", () => {
    const { store, id, state, line } = run("time_limit: 30m");
    expect(line()).toBe("30:00 left · 0 of 2 answered");
    store.dispatch(id, { type: "answer", question: "a1", answer: { choice: 0 } });
    store.dispatch(id, { type: "flag", question: "a1" });
    store.tick(new Date(2026, 9, 26, 14, 11, 18).getTime());
    expect(state().elapsed.value).toBe(678);
    expect(line()).toBe("18:42 left · 1 of 2 answered");
  });

  it("says Time and the clock when the quiz is untimed", () => {
    const { line } = run("");
    expect(line()).toBe("Time 00:00 · 0 of 2 answered");
  });

  it("says when the time is up", () => {
    const { store, line } = run("time_limit: 1m");
    store.tick(new Date(2026, 9, 26, 14, 0, 59).getTime());
    expect(line()).toBe("00:01 left · 0 of 2 answered");
  });

  it("ends with the clock in Focus mode", () => {
    const { line } = run("time_limit: 30m");
    expect(line("14:05")).toBe("30:00 left · 0 of 2 answered · Clock 14:05");
  });

  it("reads the submission after Submit", () => {
    const { store, id, line } = run("time_limit: 30m");
    store.submit(id, new Date(2026, 9, 26, 14, 32, 0));
    expect(line()).toBe("Submitted 26 Oct, 14:32");
  });

  it("is in Vietnamese on a vi page", () => {
    const { line } = run("time_limit: 30m\nui_lang: vi");
    expect(line()).toBe("30:00 còn lại · đã trả lời 0 trên 2");
    expect(line("14:05")).toBe("30:00 còn lại · đã trả lời 0 trên 2 · Đồng hồ 14:05");
  });
});

describe("the phone's top bar and sidebar", () => {
  it("keeps the full status line on a wide screen and swaps it for the compact line on a phone", () => {
    const { store, html } = run("time_limit: 30m");
    expect(html()).toContain('class="fm-status"');
    expect(html()).not.toContain("data-compact");
    store.screen.phone.value = true;
    expect(html()).not.toContain('class="fm-status"');
    expect(html()).toContain("30:00 left");
  });

  it("names the sidebar button Questions, or Materials with the full name for a quiz with them", () => {
    const { store, html } = run("time_limit: 30m");
    store.screen.phone.value = true;
    expect(html()).toMatch(/data-action="sidebar"[^>]*aria-label="Questions"[^>]*><svg[^>]*>.*?<\/svg><\/button>/);
    expect(sideForm({ materials: [{ name: "x", html: "" }] } as never, "answering", true)).toBe("tabs");
    expect(sideForm({ materials: [{ name: "x", html: "" }] } as never, "answering", false)).toBe("stacked");
  });

  it("covers the questions while the sidebar is open on a phone, and not on a wide screen", () => {
    const { store, id, html } = run("time_limit: 30m");
    store.sidebar(id, true);
    expect(html()).not.toContain('data-covered="true"');
    store.screen.phone.value = true;
    expect(html()).toContain('data-covered="true"');
    expect(html()).toContain("Back to question 1");
    store.sidebar(id, false);
    expect(html()).not.toContain('data-covered="true"');
  });

  it("says where the back button leads: the results after Submit", () => {
    const { store, id, html } = run("");
    store.screen.phone.value = true;
    store.submit(id, new Date(2026, 9, 26, 14, 32, 0));
    store.sidebar(id, true);
    expect(html()).toContain("Back to the results");
  });

  it("keeps Esc closing the sidebar", () => {
    const { store, id, state } = run("");
    store.screen.phone.value = true;
    store.sidebar(id, true);
    keyHandler(store)({
      key: "Escape",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: null,
      preventDefault() {},
    });
    expect(state().sidebar.value).toBe(false);
  });

  it("renders the App without a phone the way it did", () => {
    const { store } = run("");
    expect(renderToString(h(App, { store }))).toContain("fm-topbar");
  });
});
