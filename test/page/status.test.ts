import { describe, expect, it } from "vitest";
import { pageQuizOf } from "../../src/build/page";
import { keyHandler } from "../../src/page/keys";
import { statusFor } from "../../src/page/status";
import { createStore } from "../../src/page/store";
import { build, setup } from "../helpers/page";

const q = (id: string) => `## Q ${id}? {type=single id=${id}}\n\n- [x] right\n- [ ] wrong\n`;

const QUIZ = (front: string) =>
  [
    "---",
    "title: Status",
    "id: status",
    front,
    "---",
    "",
    "# Definitions {id=defs time=10m}",
    "",
    q("a1"),
    q("a2"),
    "# Fourier transform {id=fourier}",
    "",
    q("b1"),
    q("b2"),
    "# Plain {id=plain time=5m}",
    "",
    q("c1"),
  ].join("\n");

const texts = (s: ReturnType<typeof statusFor>) => s.map((x) => `${x.kind}: ${x.text}`);

function run(front = "time_limit: 30m", seed = "s") {
  const { store, id, state, html } = setup(QUIZ(front));
  store.start(id, { seed, now: new Date(2026, 9, 26, 14, 0, 0) });
  const input = (over: Partial<Parameters<typeof statusFor>[0]> = {}) => {
    const s = state();
    return statusFor({
      page: s.page,
      attempt: s.attempt.value,
      elapsed: s.elapsed.value,
      sectionSeconds: s.sectionSeconds.value,
      current: s.current.value,
      fullscreenClock: null,
      ...over,
    });
  };
  return { store, id, state, html, input };
}

describe("the status line while answering", () => {
  it("starts with time left, the first part's time, the first question and no progress", () => {
    const { input } = run();
    expect(texts(input())).toEqual([
      "time: Time left 30:00",
      "part: Part 1 of 3, Definitions: 10:00 left",
      "question: Question 1 of 5",
      "progress: 0 of 5 answered",
    ]);
  });

  it("follows an answer, a flag and a move to another part", () => {
    const { store, id, input } = run();
    store.dispatch(id, { type: "answer", question: "a1", answer: { choice: 0 } });
    store.dispatch(id, { type: "flag", question: "a1" });
    expect(texts(input())).toContain("progress: 1 of 5 answered");
    expect(texts(input())).toContain("flags: 1 flagged");
    store.focus(id, "b2");
    // the part without a suggested time has no part segment
    expect(texts(input()).filter((x) => x.startsWith("part"))).toEqual([]);
    expect(texts(input())).toContain("question: Question 4 of 5");
    store.focus(id, "c1");
    expect(texts(input())).toContain("part: Part 3 of 3, Plain: 05:00 left");
  });

  it("counts a part's time down from the section's time, and says when it has passed", () => {
    const { store, state, input } = run();
    store.tick(new Date(2026, 9, 26, 14, 4, 10).getTime());
    expect(state().elapsed.value).toBe(250);
    expect(texts(input())).toContain("time: Time left 25:50");
    expect(texts(input())).toContain("part: Part 1 of 3, Definitions: 05:50 left");
    store.tick(new Date(2026, 9, 26, 14, 11, 0).getTime());
    expect(texts(input())).toContain("part: Part 1 of 3, Definitions: suggested time passed");
  });

  it("shows elapsed time when the quiz is untimed", () => {
    const { input } = run("");
    expect(texts(input())[0]).toBe("time: Time 00:00");
  });

  it("reports progress with its bar and percentage", () => {
    const { store, id, input } = run();
    for (const [i, name] of ["a1", "a2", "b1"].entries()) {
      store.dispatch(id, { type: "answer", question: name, answer: { choice: i % 2 } });
    }
    const progress = input().find((x) => x.kind === "progress");
    expect(progress).toMatchObject({ text: "3 of 5 answered", value: 3, max: 5, percent: 60 });
  });

  it("ends with the clock in full screen", () => {
    const { input } = run();
    expect(texts(input({ fullscreenClock: "14:05" })).at(-1)).toBe("clock: Clock 14:05 · Esc leaves full screen");
  });

  it("is in Vietnamese on a vi page", () => {
    const { input } = run("time_limit: 30m\nui_lang: vi");
    expect(texts(input())).toEqual([
      "time: Còn lại 30:00",
      "part: Phần 1 trên 3, Definitions: còn 10:00",
      "question: Câu 1 trên 5",
      "progress: đã trả lời 0 trên 5",
    ]);
  });
});

describe("the status line after Submit", () => {
  it("names when, what was taken and the time used", () => {
    const { store, id, input } = run();
    store.submit(id, new Date(2026, 9, 26, 14, 27, 14));
    expect(texts(input())).toEqual([
      "submitted: Submitted 26 Oct, 14:27",
      "taken: The whole quiz · 5 questions",
      "used: Time used 27:14 of 30:00",
    ]);
  });

  it("says the time used alone when untimed, in Vietnamese on a vi page", () => {
    const { store, id, input } = run("ui_lang: vi");
    store.submit(id, new Date(2026, 9, 26, 14, 0, 30));
    expect(texts(input())).toEqual([
      "submitted: Đã nộp 26 thg 10, 14:00",
      "taken: Toàn bộ bài · 5 câu hỏi",
      "used: Thời gian đã dùng 00:30",
    ]);
  });

  it("names one part by its number and title", () => {
    const { store, id, state, input } = run();
    store.submit(id);
    store.newAttempt(id);
    store.start(id, { part: "fourier", seed: "s", now: new Date(2026, 9, 26, 15, 0, 0) });
    expect(state().attempt.value.plan.source).toBe("section");
    store.submit(id, new Date(2026, 9, 26, 15, 1, 0));
    expect(texts(input())[1]).toBe("taken: Part 2, Fourier transform · 2 questions");
  });

  it("says Retry for a retry, which has no limit", () => {
    const { store, id, input } = run();
    store.submit(id);
    store.retry(id, "r");
    expect(texts(input())).toEqual(["time: Time 00:00", "question: Question 1 of 5", "progress: 0 of 5 answered"]);
    store.submit(id);
    expect(texts(input())[1]).toBe("taken: Retry · 5 questions");
    expect(texts(input())[2]).toBe("used: Time used 00:00");
  });
});

describe("the status line on the page", () => {
  it("is a labelled list with the timer segment and a progressbar, and one Submit, in the top bar", () => {
    const { html } = run();
    const page = html();
    expect(page).toContain('class="fm-dock"');
    expect(page).toContain('aria-label="Status"');
    expect(page).toContain("data-timer");
    expect(page).toMatch(/<progress[^>]*aria-label="0 of 5 answered"/);
    expect(page.match(/data-action="submit"/g)).toHaveLength(1);
    expect(page.indexOf('class="fm-dock"')).toBeLessThan(page.indexOf('class="fm-questions"'));
  });

  it("has no top bar on the start screen", () => {
    const { html } = setup(QUIZ(""));
    expect(html()).not.toContain("fm-dock");
  });
});

describe("Focus mode", () => {
  const fresh = (focus?: true) => {
    const page = pageQuizOf(build(QUIZ("")));
    return createStore({ version: 1, quizzes: [page], ...(focus ? { focus } : {}) });
  };
  const key = (store: ReturnType<typeof fresh>, k: string, over: Record<string, unknown> = {}) => {
    let prevented = false;
    keyHandler(store)({
      key: k,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: { tagName: "BODY" },
      preventDefault: () => {
        prevented = true;
      },
      ...over,
    });
    return prevented;
  };

  it("ignores F where the browser has no fullscreen", () => {
    expect(key(fresh(), "f")).toBe(false);
  });

  it("acts on F when fullscreen is available", () => {
    const store = fresh();
    store.screen.available.value = true;
    expect(key(store, "f")).toBe(true);
    expect(key(store, "F")).toBe(true);
  });

  it("never acts in a text field, a textarea, a select or a contenteditable, or with a modifier", () => {
    const store = fresh();
    store.screen.available.value = true;
    expect(key(store, "f", { target: { tagName: "INPUT", type: "text" } })).toBe(false);
    expect(key(store, "f", { target: { tagName: "INPUT" } })).toBe(false);
    expect(key(store, "f", { target: { tagName: "TEXTAREA" } })).toBe(false);
    expect(key(store, "f", { target: { tagName: "SELECT" } })).toBe(false);
    expect(key(store, "f", { target: { tagName: "DIV", isContentEditable: true } })).toBe(false);
    expect(key(store, "f", { ctrlKey: true })).toBe(false);
    expect(key(store, "f", { metaKey: true })).toBe(false);
    expect(key(store, "f", { altKey: true })).toBe(false);
    // a radio button is not a text field
    expect(key(store, "f", { target: { tagName: "INPUT", type: "radio" } })).toBe(true);
  });

  it("ticks the start screen's box from PageData.focus", () => {
    expect(fresh(true).screen.wanted.value).toBe(true);
    expect(fresh().screen.wanted.value).toBe(false);
  });
});

describe("clockText", () => {
  it("pads the minutes, and shows hours only from an hour on", async () => {
    const { clockText } = await import("../../src/page/store");
    expect(clockText(0)).toBe("00:00");
    expect(clockText(250)).toBe("04:10");
    expect(clockText(1122)).toBe("18:42");
    expect(clockText(3723)).toBe("1:02:03");
    expect(clockText(-5)).toBe("00:00");
  });
});
