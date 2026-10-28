import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { buildPage, type PageOptions, pageQuizOf } from "../../src/build/page";
import { loadQuiz } from "../../src/cli/load";
import { quizHash } from "../../src/core/hash";
import type { Quiz } from "../../src/core/ir";
import { parse } from "../../src/core/parse";
import { App } from "../../src/page/App";
import type { PageData, PageQuestion } from "../../src/page/data";
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
    ]) {
      expect(visible, secret).not.toContain(secret);
    }
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
