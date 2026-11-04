import { describe, expect, it } from "vitest";
import type { Quiz } from "../../src/core/ir";
import { parse } from "../../src/core/parse";
import { reviewCounts, reviewRow } from "../../src/core/review/counts";
import { merge } from "../../src/core/review/merge";
import { reviewTarget } from "../../src/core/review/target";

const text = (a: string): string =>
  [
    "---",
    "title: T",
    "id: t",
    "---",
    "",
    "## A {type=single id=a}",
    "",
    a,
    "",
    "## B {type=single id=b}",
    "",
    "- [x] 1",
    "- [ ] 2",
    "",
    "## C {type=single id=c}",
    "",
    "- [x] 1",
    "- [ ] 2",
    "",
    "## D {type=single id=d}",
    "",
    "- [x] 1",
    "- [ ] 2",
    "",
  ].join("\n");

const judge = (source: string, judged: Parameters<typeof merge>[1]) => {
  const blocks = new Map<string, string>();
  const quiz = parse(source, "t.md", { blocks }).quiz as Quiz;
  return merge(null, judged, reviewTarget(quiz, "f".repeat(64), blocks, "2026-10-28T10:00:00+07:00"));
};

describe("reviewCounts", () => {
  const before = text("- [x] 1\n- [ ] 2");
  const review = judge(before, {
    a: { verdict: "fix", reasons: ["unclear"], note: "" },
    b: { verdict: "keep", reasons: [], note: "", assumed: true },
    c: { verdict: "drop", reasons: ["too-easy"], note: "" },
  });
  const quiz = (source: string) => parse(source, "t.md").quiz as Quiz;

  it("counts the verdicts over the quiz's questions, the changed fixes and the questions not judged", () => {
    expect(reviewCounts(quiz(text("- [ ] 1\n- [x] 2")), review)).toEqual({
      reviewedAt: "2026-10-28T10:00:00+07:00",
      keep: 1,
      assumed: 1,
      fix: 1,
      fixChanged: 1,
      drop: 1,
      unjudged: 1,
    });
    expect(reviewCounts(quiz(before), review).fixChanged).toBe(0);
  });

  it("leaves out entries for questions no longer in the quiz", () => {
    const without = before.replace(/## C[\s\S]*?(?=## D)/, "");
    const counts = reviewCounts(quiz(without), review);
    expect([counts.keep, counts.fix, counts.drop, counts.unjudged]).toEqual([1, 1, 0, 1]);
  });

  it("writes the row, with the parentheses only when they count something", () => {
    expect(reviewRow(reviewCounts(quiz(text("- [ ] 1\n- [x] 2")), review))).toBe(
      "Review    keep 1 (1 not looked at) · fix 1 (1 changed since) · drop 1 · not judged 1 · 28 Oct",
    );
    expect(reviewRow(reviewCounts(quiz(before), review))).toBe(
      "Review    keep 1 (1 not looked at) · fix 1 · drop 1 · not judged 1 · 28 Oct",
    );
  });
});
