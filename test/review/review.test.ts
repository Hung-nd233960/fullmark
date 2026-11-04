import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/core/hash";
import type { Quiz } from "../../src/core/ir";
import { parse } from "../../src/core/parse";
import { merge, serialiseReview } from "../../src/core/review/merge";
import { readReview, reviewProblems } from "../../src/core/review/read";
import type { Review, ReviewEntry } from "../../src/core/review/schema";
import { reviewTarget } from "../../src/core/review/target";

const H = (n: number): string => n.toString(16).padStart(64, "0");

const QUIZ = [
  "---",
  "title: Đạo hàm",
  "id: calc",
  "---",
  "",
  "# Part {id=p}",
  "",
  "## First question {type=single id=one}",
  "",
  "- [x] Có",
  "- [ ] Không",
  "",
  "## Second question {type=essay id=two points=4}",
  "",
  "Explain.",
  "",
].join("\n");

const entry = (e: Partial<ReviewEntry> = {}): ReviewEntry => ({
  verdict: "keep",
  reasons: [],
  note: "",
  hash: H(1),
  ...e,
});

const review = (questions: Record<string, ReviewEntry> = { one: entry() }): Review => ({
  format: "fullmark-review",
  version: 2,
  quizId: "calc",
  quizHash: H(9),
  reviewedAt: "2026-10-28T10:00:00+07:00",
  questions,
});

const text = (r: unknown): string => JSON.stringify(r);
const problems = (r: unknown): string[] => {
  const read = readReview(text(r));
  return read.ok ? [] : read.problems;
};
const withEntry = (e: object, id = "one") => ({ ...review(), questions: { [id]: e } });

describe("readReview", () => {
  it("reads a review of keep, fix and drop, and ignores unknown keys", () => {
    const r = review({
      one: entry({ assumed: true }),
      two: entry({ verdict: "fix", reasons: ["key-wrong", "other"], note: "see 3", source: "x\n" }),
      three: entry({ verdict: "drop", reasons: ["duplicate"], source: "y\n" }),
    });
    const read = readReview(text({ ...r, later: 1 }));
    expect(read).toEqual({ ok: true, review: r });
  });

  it("refuses text that is not JSON", () => {
    const read = readReview("{ not json");
    expect(read.ok).toBe(false);
    expect(!read.ok && read.problems[0]).toMatch(/^not a review file: it is not valid JSON/);
  });

  it("refuses JSON that is not an object", () => {
    expect(readReview("[1]")).toEqual({ ok: false, problems: ["not a review file: it is not a JSON object"] });
  });

  it("refuses a 0.x review (version 1, no format) with the way on", () => {
    const read = readReview(text({ version: 1, quiz: "x", items: [], problems: [] }));
    expect(read.ok).toBe(false);
    expect(!read.ok && read.problems).toEqual([
      "a fullmark 0.x review: 1.0 does not read it; judge the quiz again with `quiz review` (0.x reviews judged 0.x quizzes)",
    ]);
  });

  it("refuses another format and another version", () => {
    expect(problems({ ...review(), format: "review" })).toEqual([
      'not a review file: its format is not "fullmark-review"',
    ]);
    expect(problems({ ...review(), version: 3 })).toEqual([
      "unsupported review version 3: this fullmark reads version 2",
    ]);
  });

  it("lists a missing or wrongly typed field", () => {
    const { quizId: _quizId, ...rest } = review();
    expect(problems(rest).join("\n")).toMatch(/quizId/);
    expect(problems({ ...review(), quizHash: "abc" }).join("\n")).toMatch(/quizHash.*SHA-256/);
    expect(problems({ ...review(), reviewedAt: "yesterday" }).join("\n")).toMatch(/reviewedAt.*ISO/);
    expect(problems({ ...review(), questions: [] }).join("\n")).toMatch(/questions/);
    const { note: _note, ...noNote } = entry();
    expect(problems(withEntry(noNote)).join("\n")).toMatch(/questions\.one\.note/);
    expect(problems(withEntry({ ...entry(), hash: 5 })).join("\n")).toMatch(/questions\.one\.hash/);
  });

  it("lists every problem, not the first", () => {
    const bad = {
      ...review(),
      quizHash: "x",
      reviewedAt: "y",
      questions: { a: entry({ verdict: "drop" }), b: entry({ verdict: "fix", reasons: ["other"] }) },
    };
    expect(problems(bad)).toHaveLength(4);
  });

  it("refuses an unknown verdict and an unknown reason", () => {
    expect(problems(withEntry({ ...entry(), verdict: "maybe" })).join("\n")).toMatch(/questions\.one\.verdict/);
    expect(problems(withEntry(entry({ verdict: "fix", reasons: ["typo" as never], source: "s" }))).join("\n")).toMatch(
      /questions\.one\.reasons/,
    );
  });

  it("refuses a reason given with the wrong verdict", () => {
    const fixWithDrop = problems(withEntry(entry({ verdict: "fix", reasons: ["duplicate"], source: "s" })));
    expect(fixWithDrop).toEqual(['questions.one.reasons: the reason "duplicate" does not go with fix']);
    const dropWithFix = problems(withEntry(entry({ verdict: "drop", reasons: ["key-wrong"], source: "s" })));
    expect(dropWithFix).toEqual(['questions.one.reasons: the reason "key-wrong" does not go with drop']);
    const dropWithRubric = problems(withEntry(entry({ verdict: "drop", reasons: ["rubric-loose"], source: "s" })));
    expect(dropWithRubric).toHaveLength(1);
  });

  it("wants reasons empty for keep and not empty for fix and drop", () => {
    expect(problems(withEntry(entry({ reasons: ["other"], note: "n" })))).toEqual([
      "questions.one.reasons: a keep has no reasons",
      'questions.one.reasons: the reason "other" does not go with keep',
    ]);
    expect(problems(withEntry(entry({ verdict: "fix", source: "s" })))).toEqual([
      "questions.one.reasons: a fix needs at least one reason",
    ]);
    expect(problems(withEntry(entry({ verdict: "drop", source: "s" })))).toEqual([
      "questions.one.reasons: a drop needs at least one reason",
    ]);
  });

  it("wants a note with the reason other", () => {
    const fix = entry({ verdict: "fix", reasons: ["other"], note: "  ", source: "s" });
    expect(problems(withEntry(fix))).toEqual(['questions.one.note: the reason "other" needs a note']);
    expect(problems(withEntry({ ...fix, verdict: "drop" }))).toEqual([
      'questions.one.note: the reason "other" needs a note',
    ]);
  });

  it("refuses assumed on a fix or a drop, and source on a keep", () => {
    expect(problems(withEntry(entry({ verdict: "fix", reasons: ["unclear"], assumed: true, source: "s" })))).toEqual([
      "questions.one.assumed: only a keep can be assumed",
    ]);
    expect(problems(withEntry(entry({ verdict: "drop", reasons: ["off-scope"], assumed: true, source: "s" })))).toEqual(
      ["questions.one.assumed: only a keep can be assumed"],
    );
    expect(problems(withEntry(entry({ source: "s" })))).toEqual(["questions.one.source: a keep has no source"]);
  });
});

describe("reviewProblems", () => {
  const quiz = parse(QUIZ, "calc.md").quiz as Quiz;
  const rubric = (id: string) => review({ [id]: entry({ verdict: "fix", reasons: ["rubric-loose"], source: "s" }) });

  it("refuses a rubric reason on a question that is not an essay or code", () => {
    expect(reviewProblems(rubric("one"), quiz)).toEqual([
      'questions.one.reasons: the reason "rubric-loose" is for essays and code, and one is a single question',
    ]);
  });

  it("accepts it on an essay, and does not judge a question no longer in the quiz", () => {
    expect(reviewProblems(rubric("two"), quiz)).toEqual([]);
    expect(reviewProblems(rubric("gone"), quiz)).toEqual([]);
  });
});

describe("the question's block", () => {
  it("hashes to the question's hash, with the id left out", () => {
    const blocks = new Map<string, string>();
    const quiz = parse(QUIZ, "calc.md", { blocks }).quiz as Quiz;
    const qs = quiz.sections.flatMap((s) => s.questions);
    expect(qs).toHaveLength(2);
    for (const q of qs) {
      const source = blocks.get(q.hash) as string;
      expect(sha256Hex(source)).toBe(q.hash);
      expect(source).not.toContain("id=");
    }
    expect(blocks.get(qs[0]?.hash as string)).toBe("## First question {type=single}\n\n- [x] Có\n- [ ] Không\n");
  });

  it("is not added to the IR", () => {
    const plain = parse(QUIZ, "calc.md").quiz;
    const withBlocks = parse(QUIZ, "calc.md", { blocks: new Map() }).quiz;
    expect(withBlocks).toEqual(plain);
  });
});

describe("merge", () => {
  const blocks = new Map<string, string>();
  const quiz = parse(QUIZ, "calc.md", { blocks }).quiz as Quiz;
  const target = (at = "2026-11-04T09:00:00+07:00") => reviewTarget(quiz, H(7), blocks, at);
  const hashOf = (id: string) => quiz.sections.flatMap((s) => s.questions).find((q) => q.id === id)?.hash as string;

  it("replaces the entries judged and keeps every other, also those of questions no longer in the quiz", () => {
    const old = review({
      one: entry({ hash: H(1) }),
      two: entry({ verdict: "drop", reasons: ["too-easy"], source: "old" }),
      gone: entry({ verdict: "fix", reasons: ["unclear"], source: "history" }),
    });
    const merged = merge(old, { one: { verdict: "fix", reasons: ["key-wrong"], note: "" } }, target());
    expect(merged.quizHash).toBe(H(7));
    expect(merged.reviewedAt).toBe("2026-11-04T09:00:00+07:00");
    expect(merged.quizId).toBe("calc");
    expect(merged.questions.one).toEqual({
      verdict: "fix",
      reasons: ["key-wrong"],
      note: "",
      hash: hashOf("one"),
      source: blocks.get(hashOf("one")),
    });
    expect(merged.questions.two).toEqual(old.questions.two);
    expect(merged.questions.gone).toEqual(old.questions.gone);
  });

  it("gives a keep no source, and records assumed only when it was assumed", () => {
    const merged = merge(
      null,
      {
        one: { verdict: "keep", reasons: [], note: "", assumed: true },
        two: { verdict: "keep", reasons: [], note: "fine" },
      },
      target(),
    );
    expect(merged.questions.one).toEqual({
      verdict: "keep",
      reasons: [],
      note: "",
      hash: hashOf("one"),
      assumed: true,
    });
    expect(merged.questions.two).toEqual({ verdict: "keep", reasons: [], note: "fine", hash: hashOf("two") });
  });

  it("drops the assumed marker when the question is judged later", () => {
    const first = merge(null, { one: { verdict: "keep", reasons: [], note: "", assumed: true } }, target());
    const second = merge(first, { one: { verdict: "keep", reasons: [], note: "" } }, target());
    expect(second.questions.one).not.toHaveProperty("assumed");
  });

  it("refuses to judge a question the quiz does not have", () => {
    expect(() => merge(null, { nope: { verdict: "keep", reasons: [], note: "" } }, target())).toThrow(/nope/);
  });

  it("writes the same bytes for the same inputs, however the keys were ordered, and the bytes read back", () => {
    const judged = {
      two: { verdict: "drop", reasons: ["duplicate"], note: "" },
      one: { verdict: "fix", reasons: ["unclear", "key-wrong"], note: "n" },
    } as const;
    const flipped = { one: judged.one, two: judged.two };
    const a = serialiseReview(merge(null, judged, target()));
    const b = serialiseReview(merge(null, flipped, target()));
    expect(a).toBe(b);
    expect(a.endsWith("}\n")).toBe(true);
    const keys = Object.keys(JSON.parse(a) as object);
    expect(keys).toEqual([...keys].sort());
    expect(a.indexOf('"one"')).toBeLessThan(a.indexOf('"two"'));
    const read = readReview(a);
    expect(read.ok).toBe(true);
    expect(read.ok && serialiseReview(read.review)).toBe(a);
  });
});
