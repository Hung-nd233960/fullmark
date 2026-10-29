import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { expect } from "vitest";
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
