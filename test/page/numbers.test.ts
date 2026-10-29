import { describe, expect, it } from "vitest";
import { en } from "../../src/core/i18n";
import { decimal, num } from "../../src/page/results";
import { setup } from "../helpers/page";

describe("count strings in the singular and the plural (en)", () => {
  const t = en.page;
  it.each([
    ["scoreLine 1", t.scoreLine("1", "1"), "1 of 1 point"],
    ["scoreLine 2", t.scoreLine("1", "2"), "1 of 2 points"],
    ["scoreLine 2.5", t.scoreLine("2,5", "2.5"), "2,5 of 2.5 points"],
    ["wordsRange 1", t.wordsRange(1, 1, 5), "1 word, 1 to 5"],
    ["wordsRange 2", t.wordsRange(2, 1, 5), "2 words, 1 to 5"],
    ["words 1", t.words(1), "1 word"],
    ["words 2", t.words(2), "2 words"],
    ["questionsCount 1", t.questionsCount(1), "1 question"],
    ["questionsCount 2", t.questionsCount(2), "2 questions"],
    ["partQuestions 1", t.partQuestions(null, 1), "1 question"],
    ["partQuestions 2", t.partQuestions(null, 2), "2 questions"],
    ["pendingNote 1", t.pendingNote(1), "* 1 answer waits for a grader; the score covers the rest."],
    ["pendingNote 2", t.pendingNote(2), "* 2 answers wait for a grader; the score covers the rest."],
    ["timeLeftSaid 1", t.timeLeftSaid(1), "1 minute left"],
    ["timeLeftSaid 2", t.timeLeftSaid(2), "2 minutes left"],
  ])("%s", (_name, got, want) => {
    expect(got).toBe(want);
  });
});

describe("num", () => {
  it("prints a point in en and a comma in vi, at most two decimals", () => {
    expect(num(2.5)).toBe("2.5");
    expect(num(2.5, "vi")).toBe("2,5");
    expect(num(1 / 3, "vi")).toBe("0,33");
    expect(num(3, "vi")).toBe("3");
    expect(decimal(0.001, "vi")).toBe("0,001");
    expect(decimal(0.001)).toBe("0.001");
  });
});

const QUIZ = (front: string) =>
  [
    "---",
    "title: Marks",
    "id: marks",
    front,
    "---",
    "",
    "## One? {type=single id=q1 points=2.5}",
    "",
    "- [x] right",
    "- [ ] wrong",
    "",
  ].join("\n");

describe("numbers on the page", () => {
  it("uses the decimal comma on a vi page, in the card and the result", () => {
    const { store, id, html } = setup(QUIZ("ui_lang: vi"));
    store.start(id, { seed: "s" });
    store.dispatch(id, { type: "answer", question: "q1", answer: { choice: 0 } });
    expect(html()).toContain("2,5 điểm");
    store.submit(id);
    const page = html();
    expect(page).toContain("2,5 / 2,5");
    expect(page.replace(/data-[a-z-]+="[^"]*"/g, "")).not.toContain("2.5");
  });

  it("keeps the point on an en page", () => {
    const { store, id, html } = setup(QUIZ("ui_lang: en"));
    store.start(id, { seed: "s" });
    store.submit(id);
    expect(html()).toContain("0 / 2.5");
  });

  it("has no heading of its own on the results card, and the same card header in both phases", () => {
    const { store, id, html } = setup(QUIZ("ui_lang: en"));
    store.start(id, { seed: "s" });
    const head = (page: string) => /<header class="fm-question-head">(.*?)<\/header>/s.exec(page)?.[1] ?? "";
    const order = (h: string) => [h.indexOf("fm-question-number"), h.indexOf("fm-question-points")];
    expect(order(head(html())).every((n, i, a) => n >= 0 && n >= (a[i - 1] ?? -1))).toBe(true);
    expect(head(html())).toContain("fm-flag");
    store.dispatch(id, { type: "flag", question: "q1" });
    store.submit(id);
    const after = html();
    const h = head(after);
    expect(h.indexOf("fm-question-points")).toBeLessThan(h.indexOf("fm-flag-mark"));
    expect(after).not.toMatch(/<section class="fm-results"[^>]*>\s*<h2/);
  });
});

describe("accepted numbers", () => {
  const key = { raw: ["0.0481"], values: [0.0481], tolerance: 0.001, relTolerance: null };
  it("keep their precision and follow the interface language", async () => {
    const { acceptedNumber } = await import("../../src/page/questions/shared");
    expect(acceptedNumber(en.page, key, "en")).toBe("0.0481 ± 0.001");
    expect(acceptedNumber(en.page, key, "vi")).toBe("0,0481 ± 0,001");
  });
});
