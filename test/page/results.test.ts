import { describe, expect, it } from "vitest";
import { setup } from "../helpers/page";

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
