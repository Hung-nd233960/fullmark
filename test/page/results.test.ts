import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { pageQuizOf } from "../../src/build/page";
import { quizHash } from "../../src/core/hash";
import type { Quiz } from "../../src/core/ir";
import { parse } from "../../src/core/parse";
import { App } from "../../src/page/App";
import { createStore } from "../../src/page/store";

export function build(text: string) {
  const result = parse(text, "q.md");
  expect(result.issues).toEqual([]);
  return { quiz: result.quiz as Quiz, hash: quizHash(text, []), assets: [] };
}

export const setup = (text: string) => {
  const page = pageQuizOf(build(text));
  const store = createStore({ version: 1, quizzes: [page] });
  const id = page.id;
  return {
    store,
    id,
    state: () => store.quizzes.get(id) as NonNullable<ReturnType<typeof store.quizzes.get>>,
    html: () => renderToString(h(App, { store })),
  };
};

const QUIZ = [
  "---",
  "title: Marks",
  "id: marks",
  "---",
  "",
  "## One? {type=single id=q1}",
  "",
  "- [x] right",
  "- [ ] wrong",
  "",
  "## Two? {type=truefalse id=q2}",
  "",
  "```answer",
  "value: true",
  "```",
  "",
].join("\n");

describe("nothing is marked before Submit", () => {
  it("has no data-correct while answering, even on a picked wrong choice", () => {
    const { store, id, html } = setup(QUIZ);
    store.start(id, { seed: "s1" });
    store.dispatch(id, { type: "answer", question: "q1", answer: { choice: 1 } });
    store.dispatch(id, { type: "answer", question: "q2", answer: { value: false } });
    expect(html()).not.toContain("data-correct");
  });

  it("has them after Submit", () => {
    const { store, id, html } = setup(QUIZ);
    store.start(id, { seed: "s1" });
    store.dispatch(id, { type: "answer", question: "q1", answer: { choice: 1 } });
    store.submit(id);
    expect(html()).toContain('data-correct="true"');
    expect(html()).toContain('data-correct="false"');
  });
});
