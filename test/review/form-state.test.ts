import { describe, expect, it } from "vitest";
import { buildReviewForm } from "../../src/build/review-form";
import { quizHash } from "../../src/core/hash";
import { parse } from "../../src/core/parse";
import type { ReviewData } from "../../src/review/data";
import { keyHandler } from "../../src/review/keys";
import { createFormState } from "../../src/review/state";

/**
 * The form's state machine and its keys, driven without a DOM: the post is injected, so no test touches a network.
 * The data is what `quiz review` writes into the page, read back out of the page.
 */
const SOURCE = `---
title: Tiny
id: tiny
---

## One? {type=single id=one}

- [x] a
- [ ] b

## Two? {type=single id=two}

- [ ] a
- [x] b

## Essay {type=essay id=three}

\`\`\`answer
rubric:
  - Names it (2)
\`\`\`
`;

function dataOf(earlier = false): ReviewData {
  const { quiz } = parse(SOURCE, "quiz.md");
  if (quiz === null) throw new Error("the fixture does not parse");
  const html = buildReviewForm({
    quiz,
    hash: quizHash(SOURCE, []),
    assets: [],
    review: null,
    out: "review.json",
    check: "quiz check quiz.md --review review.json",
    script: "void 0",
    css: "",
    reviewCss: "",
    builtAt: "2026-11-03T00:00:00.000Z",
    version: "test",
  });
  const data = JSON.parse(/id="fm-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "") as ReviewData;
  if (earlier) data.earlier = { one: { verdict: "fix", reasons: ["unclear"], note: "n" } };
  return data;
}

type Posted = { quizId: string; quizHash: string; judged: Record<string, unknown> };
function setup(data = dataOf(), reply: { ok: boolean; text?: string } | Error = { ok: true }) {
  const posted: Posted[] = [];
  const state = createFormState(data, {
    post: async (body) => {
      posted.push(JSON.parse(body) as Posted);
      if (reply instanceof Error) throw reply;
      return { ok: reply.ok, text: async () => reply.text ?? "" };
    },
  });
  return { state, posted, data };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("the form's state", () => {
  it("starts with every question not judged and the first one current, and holds nothing of an earlier run", () => {
    const { state } = setup();
    expect(state.items.map((q) => q.id)).toEqual(["one", "two", "three"]);
    expect(state.current.value).toBe("one");
    expect(state.counts()).toEqual({ total: 3, judged: 0, keep: 0, fix: 0, drop: 0, assumed: 0 });
    expect(state.number("three")).toBe(3);
  });

  it("opens with the earlier verdicts, counted as judged (G53)", () => {
    const { state } = setup(dataOf(true));
    expect(state.counts()).toMatchObject({ judged: 1, fix: 1 });
    expect(state.entries.value.one).toMatchObject({ verdict: "fix", reasons: ["unclear"], note: "n" });
    expect(state.entries.value.two?.verdict).toBeNull();
  });

  it("Finish with every question judged writes at once, with one entry per question", async () => {
    const { state, posted, data } = setup();
    state.pick("one", "keep");
    state.pick("two", "fix");
    state.reason("two", "key-wrong");
    state.pick("three", "drop");
    state.reason("three", "other");
    state.note("three", "dup");
    state.finish();
    await settle();
    expect(state.dialog.value).toBe("none");
    expect(posted).toHaveLength(1);
    expect(posted[0]).toEqual({
      quizId: "tiny",
      quizHash: data.page.quizzes[0].hash,
      judged: {
        one: { verdict: "keep", reasons: [], note: "" },
        two: { verdict: "fix", reasons: ["key-wrong"], note: "" },
        three: { verdict: "drop", reasons: ["other"], note: "dup" },
      },
    });
    expect(state.saved.value).toEqual({ total: 3, judged: 3, keep: 1, fix: 1, drop: 1, assumed: 0 });
  });

  it("holds Finish back on a fix with no reason, and on Other with no note, and lists them", async () => {
    const { state, posted } = setup();
    state.pick("one", "keep");
    state.pick("two", "fix");
    state.pick("three", "drop");
    state.reason("three", "other");
    state.finish();
    await settle();
    expect(posted).toEqual([]);
    expect(state.held.value).toEqual(["two", "three"]);
    expect(state.current.value).toBe("two");
    // the list follows the edits: a reason, then the note
    state.reason("two", "unclear");
    expect(state.held.value).toEqual(["three"]);
    state.note("three", "see 1");
    expect(state.held.value).toEqual([]);
    state.finish();
    await settle();
    expect(posted).toHaveLength(1);
  });

  it("Finish with questions not judged asks first; Mark them Keep writes them assumed", async () => {
    const { state, posted } = setup();
    state.pick("one", "fix");
    state.reason("one", "unclear");
    state.finish();
    expect(state.dialog.value).toBe("finish");
    expect(posted).toEqual([]);
    state.confirm();
    await settle();
    expect(state.dialog.value).toBe("none");
    expect(posted[0]?.judged).toEqual({
      one: { verdict: "fix", reasons: ["unclear"], note: "" },
      two: { verdict: "keep", reasons: [], note: "", assumed: true },
      three: { verdict: "keep", reasons: [], note: "", assumed: true },
    });
    expect(state.saved.value).toMatchObject({ keep: 2, fix: 1, assumed: 2 });
  });

  it("Keep the rest asks first, with the same dialog, and writes nothing until it is confirmed", async () => {
    const { state, posted } = setup();
    state.keepRest();
    expect(state.dialog.value).toBe("rest");
    expect(posted).toEqual([]);
    state.confirm();
    await settle();
    expect(posted[0]?.judged).toMatchObject({
      one: { assumed: true },
      two: { assumed: true },
      three: { assumed: true },
    });
  });

  it("Keep the rest writes at once when nothing is left to keep, and holds back on an incomplete fix", async () => {
    const { state, posted } = setup();
    state.pick("one", "fix");
    state.keepRest();
    expect(state.held.value).toEqual(["one"]);
    expect(state.dialog.value).toBe("none");
    state.reason("one", "unclear");
    state.pick("two", "keep");
    state.pick("three", "keep");
    state.keepRest();
    await settle();
    expect(posted).toHaveLength(1);
  });

  it("writes an earlier verdict back unchanged when nothing touched it (G53)", async () => {
    const { state, posted } = setup(dataOf(true));
    state.pick("two", "keep");
    state.pick("three", "keep");
    state.finish();
    await settle();
    expect(posted[0]?.judged).toMatchObject({ one: { verdict: "fix", reasons: ["unclear"], note: "n" } });
  });

  it("shows what the server said when it does not take the review, and stays open", async () => {
    const { state } = setup(dataOf(), { ok: false, text: "this form is of another version of the quiz" });
    state.keepRest();
    state.confirm();
    await settle();
    expect(state.saved.value).toBeNull();
    expect(state.problem.value).toBe("this form is of another version of the quiz");
    expect(state.sending.value).toBe(false);
  });

  it("says the server cannot be reached when the post fails", async () => {
    const { state } = setup(dataOf(), new Error("down"));
    state.keepRest();
    state.confirm();
    await settle();
    expect(state.problem.value).toBe("the server cannot be reached");
  });

  it("sends once: a second Finish while it is sending, or after it was saved, does nothing", async () => {
    const { state, posted } = setup();
    state.keepRest();
    state.confirm();
    state.finish();
    state.keepRest();
    await settle();
    state.finish();
    expect(posted).toHaveLength(1);
  });
});

describe("the keys", () => {
  const key = (k: string, extra: Record<string, unknown> = {}) => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: null,
    preventDefault: () => undefined,
    ...extra,
  });
  const store = { look: { menu: { value: false } }, screen: { phone: { value: false } } } as never;

  it("1, 2 and 3 give Keep, Fix and Drop to the current question, and the same key again clears it", () => {
    const { state } = setup();
    const handle = keyHandler(state, store);
    handle(key("1"));
    expect(state.entries.value.one?.verdict).toBe("keep");
    handle(key("2"));
    expect(state.entries.value.one?.verdict).toBe("fix");
    handle(key("3"));
    expect(state.entries.value.one?.verdict).toBe("drop");
    handle(key("3"));
    expect(state.entries.value.one?.verdict).toBeNull();
    state.current.value = "two";
    handle(key("1"));
    expect(state.entries.value.two?.verdict).toBe("keep");
  });

  it("N moves to the next question not judged", () => {
    const { state } = setup();
    const handle = keyHandler(state, store);
    state.pick("one", "keep");
    state.pick("two", "keep");
    handle(key("n"));
    expect(state.current.value).toBe("three");
    state.pick("three", "keep");
    handle(key("N"));
    expect(state.current.value).toBe("three");
  });

  it("Q opens and closes the sidebar", () => {
    const { state } = setup();
    const handle = keyHandler(state, store);
    expect(state.sidebar.value).toBe(true);
    handle(key("q"));
    expect(state.sidebar.value).toBe(false);
    handle(key("Q"));
    expect(state.sidebar.value).toBe(true);
    handle(key("Escape"));
    expect(state.sidebar.value).toBe(false);
  });

  it("no key acts while typing in a note, with a modifier held, or after the review is saved", async () => {
    const { state } = setup();
    const handle = keyHandler(state, store);
    handle(key("1", { target: { tagName: "TEXTAREA" } }));
    handle(key("1", { ctrlKey: true }));
    handle(key("2", { metaKey: true }));
    handle(key("3", { altKey: true }));
    expect(state.entries.value.one?.verdict).toBeNull();
    state.keepRest();
    state.confirm();
    await settle();
    handle(key("3"));
    expect(state.entries.value.one?.verdict).toBe("keep");
  });
});
describe("the form's state with --since", () => {
  /** question two is asked again (it changed since the review); one and three are not */
  const sinceData = (): ReviewData => {
    const data = dataOf(true);
    data.earlier = {
      one: { verdict: "fix", reasons: ["unclear"], note: "n" },
      three: { verdict: "keep", reasons: [], note: "", assumed: true },
    };
    data.since = {
      reviewedAt: "2026-10-28T09:00:00+07:00",
      asked: ["two"],
      changed: {
        two: {
          earlier: { verdict: "keep", reasons: [], note: "" },
          before: null,
          after: "## Two?\n",
        },
      },
    };
    return data;
  };

  it("counts, asks and goes by the questions asked only, and keeps the quiz's numbers", () => {
    const { state } = setup(sinceData());
    expect(state.scope.map((q) => q.id)).toEqual(["two"]);
    expect(state.items.map((q) => q.id)).toEqual(["one", "two", "three"]);
    expect(state.current.value).toBe("two");
    expect(state.counts()).toEqual({ total: 1, judged: 0, keep: 0, fix: 0, drop: 0, assumed: 0 });
    expect(state.number("two")).toBe(2);
    expect(state.next()).toBe("two");
  });

  it("Keep the rest touches the question asked only, and the submit holds every question, the others as they were", async () => {
    const { state, posted } = setup(sinceData());
    state.keepRest();
    expect(state.dialog.value).toBe("rest");
    state.confirm();
    await settle();
    expect(posted[0]?.judged).toEqual({
      one: { verdict: "fix", reasons: ["unclear"], note: "n" },
      two: { verdict: "keep", reasons: [], note: "", assumed: true },
      three: { verdict: "keep", reasons: [], note: "", assumed: true },
    });
    // the saved card counts the whole review, as the command's output does
    expect(state.saved.value).toMatchObject({ total: 3, keep: 2, fix: 1, assumed: 2 });
  });

  it("a Fix with no reason holds Finish back; with one, Finish writes at once", async () => {
    const { state, posted } = setup(sinceData());
    state.pick("two", "fix");
    state.finish();
    expect(state.held.value).toEqual(["two"]);
    state.reason("two", "key-wrong");
    state.finish();
    await settle();
    expect(posted).toHaveLength(1);
    expect(state.saved.value).toMatchObject({ keep: 1, fix: 2 });
  });
});
