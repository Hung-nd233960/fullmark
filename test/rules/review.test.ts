import { describe, expect, it } from "vitest";
import { type Layers, resolveProfile } from "../../src/core/config/resolve";
import type { Quiz } from "../../src/core/ir";
import type { Issue } from "../../src/core/issue";
import { parse } from "../../src/core/parse";
import { shortDate } from "../../src/core/review/counts";
import { merge } from "../../src/core/review/merge";
import type { Review } from "../../src/core/review/schema";
import { reviewTarget } from "../../src/core/review/target";
import { runChecks } from "../../src/core/rules/check";
import { reviewFindings } from "../../src/core/rules/review";

const NONE: Layers = { user: null, project: null };

const quizText = (one = "- [x] right\n- [ ] wrong", two = "- [x] a\n- [ ] b", withTwo = true): string =>
  [
    "---",
    "title: T",
    "id: calc",
    "---",
    "",
    "## First {type=single id=one}",
    "",
    one,
    "",
    ...(withTwo ? ["## Second {type=single id=two}", "", two, ""] : []),
  ].join("\n");

const judge = (text: string, judged: Parameters<typeof merge>[1], old: Review | null = null): Review => {
  const blocks = new Map<string, string>();
  const quiz = parse(text, "q.md", { blocks }).quiz as Quiz;
  return merge(old, judged, reviewTarget(quiz, "a".repeat(64), blocks, "2026-10-28T10:00:00+07:00"));
};
const FIX = { verdict: "fix", reasons: ["unclear"], note: "" } as const;
const DROP = { verdict: "drop", reasons: ["duplicate"], note: "" } as const;
const KEEP = { verdict: "keep", reasons: [], note: "" } as const;

const run = (text: string, review: Review | null): Issue[] => {
  const parsed = parse(text, "q.md");
  const profile = resolveProfile("default", NONE).profile;
  if (!profile) throw new Error("profile");
  return runChecks({
    quiz: parsed.quiz,
    issues: parsed.issues,
    file: "q.md",
    profile,
    brief: null,
    briefIssues: [],
    contentFiles: null,
    review,
  }).issues.filter((i) => i.rule.startsWith("review."));
};
const ids = (issues: Issue[]) => issues.map((i) => `${i.rule}@${i.line}:${i.level}`);

describe("the review rules", () => {
  const original = quizText();

  it("review.fix: a fix that has not changed is an error on the question's heading", () => {
    const issues = run(original, judge(original, { one: FIX }));
    expect(ids(issues)).toEqual(["review.fix@6:error"]);
    expect(issues[0]?.message).toBe("one was marked fix on 28 Oct (unclear): the question has not changed since");
    expect(issues[0]?.fix).toMatch(/quiz review/);
  });

  it("a fix that changed passes, with the warning review.unconfirmed", () => {
    const issues = run(quizText("- [ ] right\n- [x] wrong"), judge(original, { one: FIX }));
    expect(ids(issues)).toEqual(["review.unconfirmed@6:warning"]);
    expect(issues[0]?.message).toBe(
      "one was marked fix on 28 Oct (unclear): the question has changed since, and has not been judged again",
    );
  });

  it("a fix whose question was removed passes", () => {
    const removed = original.replace("id=one", "id=three");
    expect(run(removed, judge(original, { one: FIX }))).toEqual([]);
  });

  it("review.drop: a drop is an error while the question is in the quiz, changed or not", () => {
    const review = judge(original, { two: DROP });
    expect(ids(run(original, review))).toEqual(["review.drop@11:error"]);
    expect(ids(run(quizText(undefined, "- [ ] a\n- [x] b"), review))).toEqual(["review.drop@11:error"]);
    expect(run(original, judge(original, { two: DROP }))[0]?.message).toBe(
      "two was marked drop on 28 Oct (duplicate): the question is still in the quiz",
    );
  });

  it("a drop whose question was removed passes", () => {
    expect(run(quizText(undefined, undefined, false), judge(original, { two: DROP }))).toEqual([]);
  });

  it("a keep is never a finding, changed or not", () => {
    const review = judge(original, { one: KEEP, two: { ...KEEP, assumed: true } });
    expect(run(original, review)).toEqual([]);
    expect(run(quizText("- [ ] x\n- [x] y", "- [ ] x\n- [x] y"), review)).toEqual([]);
  });

  it("an entry for a question no longer in the quiz is ignored", () => {
    const old = judge(original, { two: DROP, one: FIX });
    const without = quizText("- [x] right\n- [ ] wrong", "", false);
    // the review still holds `two` as a drop; the quiz has only `one`, unchanged, so only its fix shows
    expect(ids(run(without, old))).toEqual(["review.fix@6:error"]);
    const empty = quizText().replace("id=one", "id=uno").replace("id=two", "id=dos");
    expect(run(empty, old)).toEqual([]);
  });

  it("a changed fix judged again in a later run is no longer a finding", () => {
    const changed = quizText("- [ ] right\n- [x] wrong");
    const first = judge(original, { one: FIX });
    expect(ids(run(changed, first))).toEqual(["review.unconfirmed@6:warning"]);
    const again = judge(changed, { one: KEEP }, first);
    expect(run(changed, again)).toEqual([]);
    // judged fix again on the changed text: that text is unchanged since, so review.fix
    expect(ids(run(changed, judge(changed, { one: FIX }, first)))).toEqual(["review.fix@6:error"]);
  });

  it("names the reasons and the note", () => {
    const review = judge(original, { one: { verdict: "fix", reasons: ["key-wrong", "other"], note: "see 3" } });
    expect(run(original, review)[0]?.message).toBe(
      'one was marked fix on 28 Oct (key-wrong, other; "see 3"): the question has not changed since',
    );
  });

  it("does nothing without a review", () => {
    expect(run(original, null)).toEqual([]);
  });

  it("reviewFindings sorts the verdicts into the three rules", () => {
    const quiz = parse(quizText("- [ ] right\n- [x] wrong"), "q.md").quiz as Quiz;
    const found = reviewFindings(quiz, judge(original, { one: FIX, two: DROP }));
    expect([found.fix.length, found.drop.length, found.unconfirmed.length]).toEqual([0, 1, 1]);
  });

  it("shortDate keeps the written date", () => {
    expect(shortDate("2026-10-28T23:30:00-05:00")).toBe("28 Oct");
    expect(shortDate("2026-01-05T00:00:00Z")).toBe("5 Jan");
  });
});

describe("review.unconfirmed's hint (G50)", () => {
  const original = quizText();
  const changed = quizText("- [ ] right\n- [x] wrong");
  const review = judge(original, { one: FIX });
  const hint = (shown: { quiz: string; review: string } | null): string | undefined => {
    const found = reviewFindings(parse(changed, "q.md").quiz as Quiz, review, shown);
    return found.unconfirmed[0]?.fix;
  };

  it("names the real files when check knows them, and the placeholders otherwise", () => {
    expect(hint({ quiz: "quiz.md", review: "review.json" })).toBe(
      "run `quiz review quiz.md --since review.json` and judge the change",
    );
    expect(hint(null)).toBe("run `quiz review FILE --since REVIEW` and judge the change");
  });

  it("quotes a path with a space, so the hint can be copied", () => {
    expect(hint({ quiz: "my quiz.md", review: "r.json" })).toBe(
      'run `quiz review "my quiz.md" --since r.json` and judge the change',
    );
  });
});
