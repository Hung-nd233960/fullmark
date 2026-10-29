import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { pageQuizOf } from "../../src/build/page";
import { en } from "../../src/core/i18n";
import { keyHandler } from "../../src/page/keys";
import { answeringMap, currentOf, partOpen, resultsMap } from "../../src/page/map";
import { countsOf, resultState } from "../../src/page/results";
import { Sidebar } from "../../src/page/Sidebar";
import { sidebarKey, sidebarStart } from "../../src/page/saved";
import { createStore } from "../../src/page/store";
import { build, setup } from "../helpers/page";

const mcq = (id: string, extra = "") =>
  `## Q ${id}? {type=single id=${id} points=2${extra}}\n\n- [x] right ${id}\n- [ ] wrong ${id}\n`;

const THREE = [
  "---",
  "title: Three",
  "id: three",
  "---",
  "",
  "# Signals {id=a}",
  "",
  ...["a1", "a2", "a3"].map((id) => mcq(id)),
  "# Fourier {id=b}",
  "",
  "## Q b1? {type=multi id=b1 points=3 partial=true}\n\n- [x] one\n- [x] two\n- [ ] three\n",
  "## Explain. {type=essay id=e1 points=4}\n\n```answer\nmin_words: 1\nrubric:\n  mode: additive\n  criteria:\n    - Names it (4 pts)\n```\n",
  "# Sampling {id=c}",
  "",
  mcq("c1"),
].join("\n");

const ONE = ["---", "title: One", "id: one", "---", "", ...["p1", "p2"].map((id) => mcq(id))].join("\n");

class Memory {
  items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key = (i: number) => [...this.items.keys()][i] ?? null;
  getItem = (k: string) => this.items.get(k) ?? null;
  setItem = (k: string, v: string) => void this.items.set(k, v);
  removeItem = (k: string) => void this.items.delete(k);
}

const storeOver = (text: string, storage: () => Storage | null | undefined, width: number) => {
  const page = pageQuizOf(build(text));
  const store = createStore({ version: 1, quizzes: [page] }, { storage, width: () => width });
  return { page, store, state: () => store.quizzes.get(page.id) as NonNullable<ReturnType<typeof store.quizzes.get>> };
};

describe("the sidebar's first state", () => {
  it("is what was stored, else open from 1100 px", () => {
    expect(sidebarStart("open", 500)).toBe(true);
    expect(sidebarStart("closed", 1600)).toBe(false);
    expect(sidebarStart(null, 1099)).toBe(false);
    expect(sidebarStart(null, 1100)).toBe(true);
    expect(sidebarStart("junk", 1280)).toBe(true);
    expect(sidebarStart("junk", 900)).toBe(false);
  });
});

describe("the sidebar's stored state", () => {
  it("is written under the page's key, and read back by the next visit", () => {
    const memory = new Memory();
    const first = storeOver(THREE, () => memory as unknown as Storage, 1280);
    first.store.restore();
    expect(first.state().sidebar.value).toBe(true);
    first.store.sidebar(first.page.id, false);
    expect(memory.items.get(sidebarKey(first.page))).toBe("closed");
    expect(sidebarKey(first.page)).toBe(`fullmark:v1:three:${first.page.hash}:sidebar`);
    const second = storeOver(THREE, () => memory as unknown as Storage, 1280);
    second.store.restore();
    expect(second.state().sidebar.value).toBe(false);
    second.store.sidebar(second.page.id);
    expect(memory.items.get(sidebarKey(second.page))).toBe("open");
  });

  it("is not swept away with the other keys of the quiz", () => {
    const memory = new Memory();
    const one = storeOver(THREE, () => memory as unknown as Storage, 900);
    one.store.restore();
    one.store.sidebar(one.page.id, true);
    one.store.restore();
    expect(memory.items.get(sidebarKey(one.page))).toBe("open");
  });

  it("starts by the window's width when nothing is stored", () => {
    const memory = new Memory();
    const wide = storeOver(THREE, () => memory as unknown as Storage, 1280);
    const narrow = storeOver(THREE, () => memory as unknown as Storage, 900);
    wide.store.restore();
    narrow.store.restore();
    expect(wide.state().sidebar.value).toBe(true);
    expect(narrow.state().sidebar.value).toBe(false);
  });

  it("works, unsaved, when storage throws or is missing", () => {
    const throwing = {
      get length(): number {
        throw new Error("blocked");
      },
      key: () => {
        throw new Error("blocked");
      },
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    for (const find of [() => throwing as unknown as Storage, () => null, () => undefined]) {
      const s = storeOver(THREE, find, 1280);
      expect(() => s.store.restore()).not.toThrow();
      expect(s.state().sidebar.value).toBe(true);
      expect(() => s.store.sidebar(s.page.id, false)).not.toThrow();
      expect(s.state().sidebar.value).toBe(false);
    }
  });

  it("works with no storage at all (the build)", () => {
    const s = storeOver(THREE, () => null, 1280);
    const bare = createStore({ version: 1, quizzes: [s.page] }, { width: () => 1280 });
    bare.restore();
    expect(bare.quizzes.get(s.page.id)?.sidebar.value).toBe(true);
  });
});

describe("Q and Esc", () => {
  const press = (store: ReturnType<typeof createStore>, key: string, over: Record<string, unknown> = {}) => {
    let prevented = false;
    keyHandler(store)({
      key,
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

  const started = () => {
    const s = storeOver(THREE, () => new Memory() as unknown as Storage, 900);
    s.store.restore();
    s.store.start(s.page.id, { seed: "seed0001" });
    return s;
  };

  it("toggles with Q, closes with Esc, and does nothing on the start screen", () => {
    const idle = storeOver(THREE, () => null, 900);
    idle.store.restore();
    press(idle.store, "q");
    expect(idle.state().sidebar.value).toBe(false);

    const s = started();
    expect(press(s.store, "q")).toBe(true);
    expect(s.state().sidebar.value).toBe(true);
    press(s.store, "Escape");
    expect(s.state().sidebar.value).toBe(false);
    press(s.store, "Q");
    press(s.store, "Q");
    expect(s.state().sidebar.value).toBe(false);
  });

  it("leaves a text field, a modifier and a drag's Esc alone", () => {
    const s = started();
    press(s.store, "q", { target: { tagName: "INPUT", type: "text" } });
    press(s.store, "q", { target: { tagName: "TEXTAREA" } });
    press(s.store, "q", { ctrlKey: true });
    expect(s.state().sidebar.value).toBe(false);
    s.store.sidebar(s.page.id, true);
    press(s.store, "Escape", { target: { tagName: "SELECT" } });
    press(s.store, "Escape", { defaultPrevented: true });
    expect(s.state().sidebar.value).toBe(true);
  });
});

describe("the map while answering", () => {
  const take = () => {
    const s = setup(THREE);
    s.store.start(s.id, { seed: "seed0001" });
    return s;
  };

  it("has a cell per question, numbered across the parts in the plan's order", () => {
    const s = take();
    const parts = answeringMap(s.state().page, s.state().attempt.value, null);
    expect(parts.map((p) => p.cells.map((c) => c.number))).toEqual([[1, 2, 3], [4, 5], [6]]);
    expect(parts.map((p) => p.title)).toEqual(["Signals", "Fourier", "Sampling"]);
    expect(parts.map((p) => p.number)).toEqual([1, 2, 3]);
  });

  it("shows answered, flagged and current as the attempt has them, at every step", () => {
    const s = take();
    const cells = () =>
      answeringMap(s.state().page, s.state().attempt.value, s.state().current.value).flatMap((p) => p.cells);
    const of = (id: string) => cells().find((c) => c.id === id);
    expect(cells().filter((c) => c.answered || c.flagged).length).toBe(0);
    expect(
      cells()
        .filter((c) => c.current)
        .map((c) => c.id),
    ).toEqual(["a1"]);

    s.store.dispatch(s.id, { type: "answer", question: "a2", answer: { choice: 0 } });
    expect(of("a2")).toMatchObject({ answered: true, current: true, flagged: false });
    expect(of("a1")?.current).toBe(false);

    s.store.dispatch(s.id, { type: "flag", question: "c1" });
    expect(of("c1")).toMatchObject({ answered: false, flagged: true });
    s.store.focus(s.id, "c1");
    expect(of("c1")?.current).toBe(true);
    expect(of("a2")?.current).toBe(false);

    // clearing an answer and taking the flag off
    s.store.dispatch(s.id, { type: "answer", question: "a2", answer: null });
    s.store.dispatch(s.id, { type: "flag", question: "c1" });
    expect(of("a2")?.answered).toBe(false);
    expect(of("c1")?.flagged).toBe(false);
  });

  it("agrees with the status line's count of answers", () => {
    const s = take();
    s.store.dispatch(s.id, { type: "answer", question: "a1", answer: { choice: 1 } });
    s.store.dispatch(s.id, { type: "answer", question: "b1", answer: { choices: [0] } });
    const cells = answeringMap(s.state().page, s.state().attempt.value, null).flatMap((p) => p.cells);
    const html = s.html();
    expect(cells.filter((c) => c.answered).length).toBe(2);
    expect(html).toContain(en.page.answeredOf(2, 6));
  });

  it("opens the current part and the learner's choices override it", () => {
    const s = take();
    const parts = answeringMap(s.state().page, s.state().attempt.value, "b1");
    expect(parts.map((p) => partOpen(p, {}))).toEqual([false, true, false]);
    expect(parts.map((p) => partOpen(p, { a: true, b: false }))).toEqual([true, false, false]);
  });

  it("holds only a retry's questions, and one part has no heading", () => {
    const s = take();
    s.store.dispatch(s.id, { type: "answer", question: "a1", answer: { choice: 1 } });
    s.store.submit(s.id);
    s.store.retry(s.id, "seed0002");
    const attempt = s.state().attempt.value;
    const parts = answeringMap(s.state().page, attempt, null);
    expect(parts.flatMap((p) => p.cells).length).toBe(attempt.plan.questions.length);
    expect(parts.flatMap((p) => p.cells.map((c) => c.number))).toEqual(attempt.plan.questions.map((_, i) => i + 1));
    s.store.sidebar(s.id, true);
    const html = renderToString(h(Sidebar, { t: en.page, state: s.state(), store: s.store }));
    expect(html).not.toContain("data-part-head");

    const one = setup(ONE);
    one.store.start(one.id, { seed: "seed0001" });
    one.store.sidebar(one.id, true);
    const oneHtml = renderToString(h(Sidebar, { t: en.page, state: one.state(), store: one.store }));
    expect(oneHtml).not.toContain("data-part-head");
    expect(oneHtml.match(/data-cell=/g)?.length).toBe(2);
  });

  it("names a cell in words and a part with its counts in words", () => {
    const s = take();
    s.store.dispatch(s.id, { type: "answer", question: "a1", answer: { choice: 1 } });
    s.store.dispatch(s.id, { type: "flag", question: "a2" });
    const html = renderToString(h(Sidebar, { t: en.page, state: s.state(), store: s.store }));
    expect(html).toContain('aria-label="Question 1, answered, current"');
    expect(html).toContain('aria-label="Question 2, flagged"');
    expect(html).toContain("1 of 3 answered, 1 flagged");
    expect(html).toContain("1/3 · 1 flag");
    expect(html).toContain("1 · Signals");
  });
});

describe("currentOf", () => {
  it("is the first of the plan until another is current", () => {
    expect(currentOf(["a", "b"], null)).toBe("a");
    expect(currentOf(["a", "b"], "b")).toBe("b");
    expect(currentOf(["a", "b"], "gone")).toBe("a");
    expect(currentOf([], null)).toBeNull();
  });
});

describe("the map after Submit", () => {
  const submitted = () => {
    const s = setup(THREE);
    s.store.start(s.id, { seed: "seed0001" });
    const put = (question: string, answer: Record<string, unknown>) =>
      s.store.dispatch(s.id, { type: "answer", question, answer });
    put("a1", { choice: 0 }); // right
    put("a2", { choice: 1 }); // wrong
    // a3 left
    put("b1", { choices: [0] }); // partly right
    put("e1", { text: "an answer" }); // waits for a grader
    s.store.dispatch(s.id, { type: "flag", question: "a2" });
    s.store.submit(s.id);
    return s;
  };

  it("gives each cell the state the results card counts, for every state", () => {
    const s = submitted();
    const graded = s.state().graded.value;
    if (graded === null) throw new Error("not graded");
    const cells = resultsMap(s.state().page, s.state().attempt.value, graded).flatMap((p) => p.cells);
    const state = Object.fromEntries(cells.map((c) => [c.id, c.state]));
    expect(state).toMatchObject({
      a1: "correct",
      a2: "incorrect",
      a3: "unanswered",
      b1: "partial",
      e1: "pending",
    });
    for (const q of graded.questions) expect(state[q.id]).toBe(resultState(q));
    const tally = { correct: 0, partial: 0, incorrect: 0, unanswered: 0, pending: 0 };
    for (const c of cells) if (c.state !== "ungraded") tally[c.state] += 1;
    expect(tally).toEqual(countsOf(graded.questions));
    expect(cells.find((c) => c.id === "a2")?.flagged).toBe(true);
    expect(cells.filter((c) => c.flagged).length).toBe(1);
  });

  it("puts a question that carries no points in its own state, not in the five", () => {
    const text = [
      "---",
      "title: Mixed",
      "id: mixed",
      "---",
      "",
      mcq("m1"),
      "## Rate it. {type=scale id=m2}\n\n- 1\n- 2\n",
    ].join("\n");
    const s = setup(text);
    s.store.start(s.id, { seed: "seed0001" });
    s.store.dispatch(s.id, { type: "answer", question: "m2", answer: { choice: 1 } });
    s.store.submit(s.id);
    const graded = s.state().graded.value;
    if (graded === null) throw new Error("not graded");
    const cells = resultsMap(s.state().page, s.state().attempt.value, graded).flatMap((p) => p.cells);
    expect(cells.map((c) => c.state)).toEqual(["unanswered", "ungraded"]);
  });

  it("lists the not-scored swatch in the legend only when such a question is in the map", () => {
    const legend = (text: string) => {
      const s = setup(text);
      s.store.start(s.id, { seed: "seed0001" });
      s.store.submit(s.id);
      s.store.sidebar(s.id, true);
      return renderToString(h(Sidebar, { t: en.page, state: s.state(), store: s.store }));
    };
    const head = ["---", "title: Mixed", "id: mixed", "---", "", mcq("m1")];
    expect(legend([...head, "## Rate it. {type=scale id=m2}\n\n- 1\n- 2\n"].join("\n"))).toContain("not scored");
    expect(legend(head.join("\n"))).not.toContain("not scored");
  });

  it("prints a heading row per part with the results card's points, and words on every cell", () => {
    const s = submitted();
    const html = renderToString(h(Sidebar, { t: en.page, state: s.state(), store: s.store }));
    const graded = s.state().graded.value;
    expect(graded?.sections.length).toBe(3);
    expect(html).toContain("1 · Signals");
    expect(html).toContain("2 / 6");
    expect(html).toContain('aria-label="Question 2, wrong, flagged"');
    expect(html).toContain('aria-label="Question 5, waiting for a grader"');
    expect(html).toContain('aria-label="Question 3, unanswered"');
    expect(html).toContain('aria-label="Question 4, partly right"');
    expect(html).toContain('aria-label="Question 1, correct"');
    // the glyphs are not read
    expect(html).toMatch(/aria-hidden="true">✓/);
    expect(html).not.toContain("data-part-head");
  });

  it("prints the part points with a decimal comma in vi", () => {
    const vi = THREE.replace("id: three", "id: three\nlang: vi\nui_lang: vi");
    const s = setup(vi);
    s.store.start(s.id, { seed: "seed0001" });
    s.store.dispatch(s.id, { type: "answer", question: "b1", answer: { choices: [0] } });
    s.store.submit(s.id);
    const html = s.html();
    expect(s.state().page.uiLang).toBe("vi");
    expect(html).toContain("1,5 / 7");
  });

  it("shows every question whatever the filter is", () => {
    const s = submitted();
    s.state().filter.value = "missed";
    const html = renderToString(h(Sidebar, { t: en.page, state: s.state(), store: s.store }));
    expect(html.match(/data-cell=/g)?.length).toBe(6);
  });
});
