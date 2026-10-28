import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { buildPage, type PageOptions, pageQuizOf } from "../../src/build/page";
import { loadQuiz } from "../../src/cli/load";
import { countWords } from "../../src/core/grade/normalise";
import { quizHash } from "../../src/core/hash";
import { en } from "../../src/core/i18n";
import type { Quiz } from "../../src/core/ir";
import { parse } from "../../src/core/parse";
import { App } from "../../src/page/App";
import type { PageData, PageQuestion } from "../../src/page/data";
import { openKey } from "../../src/page/data";
import { wantsPoint } from "../../src/page/questions/shared";
import { createStore } from "../../src/page/store";

const root = resolve(import.meta.dirname, "..", "..");
const runtime = readFileSync(join(root, "dist", "page.js"), "utf8");
const css = readFileSync(join(root, "dist", "page.css"), "utf8");
const options: PageOptions = { runtime, css, builtAt: "2026-10-28T10:00:00+07:00", version: "1.0.0-test" };

function load(path: string) {
  const loaded = loadQuiz(join(root, path));
  if (loaded.quiz === null || loaded.hash === null) throw new Error(`${path} does not load`);
  return { quiz: loaded.quiz, hash: loaded.hash, assets: loaded.assets };
}

const types = load("test/fixtures/page/types.md");
const typesVi = load("test/fixtures/page/types-vi.md");

const questionsOf = (data: PageData): Map<string, PageQuestion> =>
  new Map(data.quizzes[0]?.sections.flatMap((s) => s.questions).map((q) => [q.id, q]));

const dataOf = (html: string): PageData => {
  const m = /<script type="application\/json" id="fm-data">([\s\S]*?)<\/script>/.exec(html);
  return JSON.parse(m?.[1] ?? "null") as PageData;
};

describe("page data: each type holds only what the learner may see", () => {
  const html = buildPage([types], options);
  const questions = questionsOf(dataOf(html));
  const base = ["graded", "hintHtml", "id", "points", "promptHtml", "type"];
  const keysOf = (id: string) => Object.keys(questions.get(id) as object).sort();

  it("has the exact keys of the union, per type", () => {
    expect(keysOf("s1")).toEqual([...base, "choices"].sort());
    expect(keysOf("m1")).toEqual([...base, "choices"].sort());
    expect(keysOf("t1")).toEqual(base);
    expect(keysOf("n1")).toEqual([...base, "unit"].sort());
    expect(keysOf("h1")).toEqual(base);
    expect(keysOf("b1")).toEqual([...base, "blankCount"].sort());
    expect(keysOf("f1")).toEqual([...base, "fields"].sort());
    expect(keysOf("c1")).toEqual([...base, "labels", "max", "min"].sort());
    expect(keysOf("o1")).toEqual([...base, "items"].sort());
    expect(keysOf("g1")).toEqual([...base, "lefts", "rights"].sort());
    expect(keysOf("e1")).toEqual([...base, "maxWords", "minWords", "rubric"].sort());
    expect(keysOf("k1")).toEqual([...base, "language", "rubric", "starter"].sort());
    expect(Object.keys((questions.get("m1") as { choices: object[] }).choices[0] as object).sort()).toEqual([
      "html",
      "input",
    ]);
    expect(Object.keys((questions.get("f1") as { fields: object[] }).fields[0] as object).sort()).toEqual([
      "graded",
      "labelHtml",
      "numeric",
    ]);
  });

  it("holds no accepted text, number or blank answer outside the key blob", () => {
    // the page without its runtime and styles: the tree, the data block and the head
    const visible = html.replace(runtime, "").replace(css, "");
    for (const secret of [
      "zq-accept-alpha",
      "zq-accept-beta",
      "zq-pat-",
      "plorbix",
      "plorbax",
      "quuxle",
      "wibble",
      "7391.25",
      "0.0481",
      "4242.5",
      "3.14",
      "zq-field-name",
      "zq-sample-essay",
    ]) {
      expect(visible, secret).not.toContain(secret);
    }
  });

  it("holds the model answers and the item text only in the key blob, shape without text", () => {
    const blob = openKey(pageQuizOf(types));
    expect(blob.samples.e1).toContain("zq-sample-essay");
    expect(blob.samples.k1).toContain("<pre>");
    expect(blob.samples.k1).toContain("zqlargest");
    const keyed = blob.quiz.sections.flatMap((x) => x.questions);
    const o1 = keyed.find((q) => q.id === "o1");
    expect(o1?.type === "ordering" && o1.items.map((i) => i.text)).toEqual(["", "", ""]);
    expect(JSON.stringify(blob.quiz)).not.toContain("zq-lint");
    expect(JSON.stringify(blob.quiz)).not.toContain("zq-sample-essay");
  });

  it("marks `[x]` nowhere in the data", () => {
    const text = JSON.stringify(dataOf(html).quizzes[0]?.sections);
    expect(text).not.toContain("correct");
  });
});

describe("blanks in the prompt", () => {
  const page = pageQuizOf(types);
  const b1 = page.sections.flatMap((s) => s.questions).find((q) => q.id === "b1") as PageQuestion & {
    type: "blanks";
  };

  it("finds them in the heading, the body and fenced code, and skips inline code", () => {
    expect(b1.blankCount).toBe(4);
    const inputs = [...b1.promptHtml.matchAll(/<input [^>]*data-blank="(\d)"[^>]*>/g)];
    expect(inputs.map((m) => m[1])).toEqual(["0", "1", "2", "3"]);
    expect(b1.promptHtml).toContain("a[[0]]");
    // the last is in the code block; the first two are before the body text
    expect(b1.promptHtml.indexOf('data-blank="3"')).toBeGreaterThan(b1.promptHtml.indexOf("<pre>"));
    expect(b1.promptHtml.indexOf('data-blank="1"')).toBeLessThan(b1.promptHtml.indexOf("Also"));
  });

  it("marks numeric blanks and gives every box a label, autocomplete off and spellcheck off", () => {
    expect(b1.promptHtml).toMatch(/data-blank="1" data-numeric="1"/);
    expect(b1.promptHtml).not.toMatch(/data-blank="0" data-numeric/);
    expect(b1.promptHtml.match(/autocomplete="off" spellcheck="false" aria-label="Blank \d"/g)).toHaveLength(4);
  });

  it("throws when the count found differs from the question's blanks", () => {
    const broken = structuredClone(types.quiz) as Quiz;
    const q = broken.sections.flatMap((s) => s.questions).find((x) => x.id === "b1");
    if (q?.type !== "blanks") throw new Error("fixture");
    q.blanks.pop();
    expect(() => pageQuizOf({ ...types, quiz: broken })).toThrow(/blanks/);
  });
});

describe("the comma warning", () => {
  const withFront = (front: string) => {
    const text = readFileSync(join(root, "test/fixtures/page/types.md"), "utf8").replace(
      "id: types\n",
      `id: types\n${front}\n`,
    );
    const result = parse(text, "types.md");
    expect(result.issues).toEqual([]);
    return { quiz: result.quiz as Quiz, hash: quizHash(text, []), assets: [] };
  };

  function shownAfter(quizzes: typeof types, comma: boolean) {
    const page = pageQuizOf(quizzes);
    const store = createStore({ version: 1, quizzes: [page] });
    const id = page.id;
    const text = comma ? "2,5" : "2.5";
    store.start(id);
    store.dispatch(id, { type: "answer", question: "n1", answer: { raw: text } });
    store.dispatch(id, { type: "answer", question: "b1", answer: { blanks: ["", text, "", ""] } });
    store.dispatch(id, { type: "answer", question: "f1", answer: { fields: [text, text, ""] } });
    return renderToString(h(App, { store }));
  }

  it("follows lang, in English", () => {
    expect(wantsPoint({ lang: "en" } as never, "2,5")).toBe(true);
    expect(wantsPoint({ lang: "en" } as never, "2.5")).toBe(false);
    expect(wantsPoint({ lang: "vi" } as never, "2,5")).toBe(false);
    const html = shownAfter(types, true);
    // numeric question, numeric blank, numeric field (not the text field)
    expect(html.match(/Use a point for decimals: 2\.5, not 2,5/g)).toHaveLength(3);
    expect(shownAfter(types, false)).not.toContain("Use a point");
  });

  it("is silent for a vi quiz, and never follows ui_lang", () => {
    expect(shownAfter(typesVi, true)).not.toContain("Use a point");
    expect(shownAfter(typesVi, true)).not.toContain("Dùng dấu chấm");
    // lang en with ui_lang vi: the warning is shown in Vietnamese
    const vietnamese = shownAfter(withFront("ui_lang: vi"), true);
    expect(vietnamese.match(/Dùng dấu chấm cho số thập phân: 2\.5, không phải 2,5/g)).toHaveLength(3);
    // lang vi with ui_lang en: still no warning
    expect(shownAfter(withFront("lang: vi\nui_lang: en"), true)).not.toContain("Use a point");
  });

  it("never changes what is stored", () => {
    const store = createStore({ version: 1, quizzes: [pageQuizOf(types)] });
    store.start("types");
    store.dispatch("types", { type: "answer", question: "n3", answer: { raw: "2,5" } });
    expect(store.quizzes.get("types")?.attempt.value.state.answers.n3).toEqual({ raw: "2,5" });
  });
});

describe("a vi quiz's 2,5 through the page's grader", () => {
  const scoreOf = (quizzes: typeof types) => {
    const page = pageQuizOf(quizzes);
    const store = createStore({ version: 1, quizzes: [page] });
    store.start(page.id);
    store.dispatch(page.id, { type: "answer", question: "n3", answer: { raw: "2,5" } });
    store.submit(page.id);
    return store.quizzes.get(page.id)?.graded.value?.questions.find((q) => q.id === "n3");
  };

  it("is right in a vi quiz and wrong in an en one", () => {
    expect(scoreOf(typesVi)?.status).toBe("correct");
    expect(scoreOf(types)?.status).toBe("incorrect");
  });
});
describe("ordering and matching in the page data", () => {
  const page = pageQuizOf(types);
  const get = <T extends PageQuestion["type"]>(id: string, _type: T) =>
    page.sections.flatMap((x) => x.questions).find((q) => q.id === id) as Extract<PageQuestion, { type: T }>;
  const labels = (items: { label: string }[]) => items.map((i) => i.label);

  it("lists the ordering items in the shown order, which is not the source order", () => {
    const order = page.plan.optionOrder?.o1 as number[];
    expect(order).toHaveLength(3);
    expect(order).not.toEqual([0, 1, 2]);
    const source = ["zq-parse", "zq-check", "zq-render"];
    expect(labels(get("o1", "ordering").items)).toEqual(order.map((i) => source[i]));
    expect(labels(get("o1", "ordering").items)).not.toEqual(source);
  });

  it("lists the left items in source order and the right-hand items, distractors included, in the shown order", () => {
    const g1 = get("g1", "matching");
    expect(g1.lefts.join(" ")).toMatch(/zq-lint.*zq-test.*zq-bundle/s);
    const order = page.plan.optionOrder?.g1 as number[];
    expect(order).toHaveLength(4);
    expect(order).not.toEqual([0, 1, 2, 3]);
    const source = ["finds style problems", "runs the checks", "packs the files", "zq-unused distractor"];
    expect(labels(g1.rights)).toEqual(order.map((i) => source[i]));
  });

  it("carries the essay's targets and, with show_rubric, its criteria; the code's language and starter", () => {
    const e1 = get("e1", "essay");
    expect([e1.minWords, e1.maxWords]).toEqual([3, 6]);
    expect(e1.rubric?.map((c) => c.points)).toEqual([1, 1, 2]);
    const k1 = get("k1", "code");
    expect(k1.language).toBe("rust");
    expect(k1.starter).toContain("todo!()");
  });

  it("leaves the rubric out when show_rubric is false", () => {
    const broken = structuredClone(types.quiz) as Quiz;
    const e = broken.sections.flatMap((x) => x.questions).find((q) => q.id === "e1");
    if (e?.type !== "essay") throw new Error("fixture");
    e.showRubric = false;
    const data = pageQuizOf({ ...types, quiz: broken });
    const q = data.sections.flatMap((x) => x.questions).find((x) => x.id === "e1");
    expect(q?.type === "essay" && q.rubric).toBeNull();
  });
});

describe("a plan without an order for ordering or matching", () => {
  it("is a build error, never the source order", () => {
    for (const id of ["o1", "g1"]) {
      const plan = structuredClone(pageQuizOf(types).plan);
      delete plan.optionOrder?.[id];
      expect(() => pageQuizOf(types, plan)).toThrow(`question ${id}: the plan has no order`);
    }
  });
});

describe("what the page stores and shows for the four types", () => {
  function start() {
    const page = pageQuizOf(types);
    const store = createStore({ version: 1, quizzes: [page] });
    store.start(page.id);
    const answer = (question: string, value: Record<string, unknown> | null) =>
      store.dispatch("types", { type: "answer", question, answer: value });
    return {
      store,
      page,
      answer,
      html: () => renderToString(h(App, { store })),
      stored: () => store.quizzes.get("types")?.attempt.value.state.answers ?? {},
    };
  }
  const articleOf = (html: string, id: string) =>
    new RegExp(`<article[^>]*data-qid="${id}"[\\s\\S]*?</article>`).exec(html)?.[0] ?? "";
  const sources = (html: string) => [...html.matchAll(/data-source="(\d)"/g)].map((m) => Number(m[1]));

  it("stores nothing for an ordering that was not moved, and a full order after a move", () => {
    const r = start();
    expect(r.stored().o1 ?? null).toBeNull();
    const shown = r.page.plan.optionOrder?.o1 as number[];
    const html = articleOf(r.html(), "o1");
    expect(sources(html)).toEqual(shown);
    // the first item's up button and the last item's down button are disabled
    expect(html.match(/<button[^>]*disabled/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Move up: zq-');
    const moved = [shown[1], shown[0], shown[2]] as number[];
    r.answer("o1", { order: moved });
    expect(sources(articleOf(r.html(), "o1"))).toEqual(moved);
  });

  it("marks nothing in an untouched ordering after Submit, and says No answer for a pair left at the dash", () => {
    const r = start();
    r.answer("g1", { pairs: [0, null, 2] });
    r.store.submit("types");
    const o = articleOf(r.html(), "o1");
    expect(o).not.toContain("data-result=");
    expect(o).not.toContain("Wrong");
    expect(o).not.toContain("No answer");
    expect(o).toContain("Not answered");
    expect(o.match(/belongs at [0-9]/g)).toHaveLength(3);
    const g = articleOf(r.html(), "g1");
    const middle = g.split('class="fm-match"')[2] ?? "";
    expect(middle).toContain("No answer");
    expect(middle).not.toContain("Wrong");
    expect(middle).toContain("runs the checks");
  });

  it("answers by a dash-only matching say No answer for every pair", () => {
    const r = start();
    r.store.submit("types");
    const g = articleOf(r.html(), "g1");
    expect(g.match(/No answer/g)).toHaveLength(3);
    expect(g).not.toContain("Wrong");
  });

  it("shows marks, positions and right matches after Submit", () => {
    const r = start();
    r.answer("o1", { order: [0, 2, 1] });
    r.answer("g1", { pairs: [0, 2, null] });
    r.store.submit("types");
    const o = articleOf(r.html(), "o1");
    expect(o.match(/data-result="correct"/g)).toHaveLength(1);
    expect(o).toContain("belongs at 3");
    expect(o).toContain("belongs at 2");
    const g = articleOf(r.html(), "g1");
    expect(g.match(/data-result="correct"/g)).toHaveLength(1);
    expect(g.match(/data-result="wrong"/g)).toHaveLength(2);
    expect(g).toContain("Correct answer: ");
    expect(g).toContain("runs the checks");
  });

  it("grades essay and code as pending once answered, and shows the sample only after Submit", () => {
    const r = start();
    r.answer("e1", { text: "a cache saves work" });
    r.answer("k1", { code: "fn x() {}", language: "rust" });
    expect(articleOf(r.html(), "e1")).not.toContain("zq-sample-essay");
    expect(articleOf(r.html(), "e1")).toContain("4 words, 3 to 6");
    r.store.submit("types");
    const e = articleOf(r.html(), "e1");
    expect(e).toContain('data-status="pending"');
    expect(e).toContain("Sample answer");
    expect(e).toContain("zq-sample-essay");
    expect(articleOf(r.html(), "k1")).toContain('data-status="pending"');
  });

  it("an unanswered essay and code are unanswered, not pending", () => {
    const r = start();
    r.store.submit("types");
    expect(articleOf(r.html(), "e1")).toContain('data-status="unanswered"');
    expect(articleOf(r.html(), "k1")).toContain('data-status="unanswered"');
    expect(articleOf(r.html(), "o1")).toContain('data-status="unanswered"');
    expect(articleOf(r.html(), "g1")).toContain('data-status="unanswered"');
  });

  it("counts words as the grader does", () => {
    for (const [text, n] of [
      ["well-known state-of-the-art", 2],
      ["3.14 and 42", 3],
      ["Hôm nay trời đẹp quá", 5],
      ["  spaced   out\n\nlines ", 3],
    ] as const) {
      expect(countWords(text)).toBe(n);
      const r = start();
      r.answer("e1", { text });
      const line = /fm-count"[^>]*>([^<]*)</.exec(articleOf(r.html(), "e1"))?.[1] ?? "";
      expect(line).toContain(`${n} words`);
    }
  });

  it("writes the count line for each combination of targets", () => {
    const t = en.page;
    expect([t.wordsMin(87, 120), t.wordsMax(87, 300), t.wordsRange(87, 120, 300), t.words(87)]).toEqual([
      "87 / 120 words minimum",
      "87 / 300 words maximum",
      "87 words, 120 to 300",
      "87 words",
    ]);
  });
});
