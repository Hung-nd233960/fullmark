import { describe, expect, it } from "vitest";
import { countWords, grade, normalise } from "../../src/core/grade";
import { attemptFor, quizOf } from "../helpers/grading";

const numeric = (extra = "") => `## Value? {type=numeric id=q${extra}}\n\n\`\`\`answer\nvalue: 2.5\n\`\`\``;
const short = (accept: string, extra = "") =>
  `## Name it. {type=short id=q${extra}}\n\n\`\`\`answer\naccept: [${accept}]\n\`\`\``;

const earned = (body: string, answer: Record<string, unknown> | null, front = "") =>
  grade(quizOf(body, front), attemptFor({ q: answer })).questions[0]?.earned;

describe("normalise", () => {
  it("drops a BOM, composes, collapses white space and folds case", () => {
    expect(normalise("\uFEFF  Hello\u00A0\t World  ")).toBe("hello world");
    expect(normalise("e\u0301")).toBe("\u00E9");
    expect(normalise("\u0110\u1ea1o h\u00e0m")).toBe("\u0111\u1ea1o h\u00e0m");
    expect(normalise("ABC", true)).toBe("ABC");
  });

  it("counts words the way a word counter does", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("  one  two\nthree\tfour ")).toBe(4);
    expect(countWords("\uFEFF")).toBe(0);
  });
});

describe("text answers, in any script", () => {
  it("folds the case of Đ, and reads composed and decomposed Vietnamese the same", () => {
    const body = short('"Đạo hàm"');
    expect(earned(body, { text: "đạo hàm" })).toBe(1);
    expect(earned(body, { text: "ĐẠO HÀM" })).toBe(1);
    // the same letters typed as base letter plus combining marks (a keyboard that does not compose)
    expect(earned(body, { text: "\u0110a\u0323o ha\u0300m".normalize("NFD") })).toBe(1);
    expect(earned(body, { text: "dao ham" })).toBe(0);
  });

  it("is unmoved by a leading BOM, and by white space of any kind", () => {
    const body = short('"two words"');
    expect(earned(body, { text: "\uFEFFtwo\u00A0\u00A0words" })).toBe(1);
    expect(earned(body, { text: "\uFEFF   " })).toBe(0);
  });

  it("keeps case when the question says so, patterns included", () => {
    expect(earned(short('"Mut"', " case=sensitive"), { text: "mut" })).toBe(0);
    expect(earned(short('"Mut"', " case=sensitive"), { text: "Mut" })).toBe(1);
  });

  it("matches a pattern against the whole answer, with \\d meaning ASCII digits only", () => {
    const body = "## N? {type=short id=q}\n\n```answer\npatterns: ['\\d+']\n```";
    expect(earned(body, { text: "42" })).toBe(1);
    expect(earned(body, { text: "42 apples" })).toBe(0);
    expect(earned(body, { text: "\u0663" })).toBe(0);
  });
});

describe("numbers follow the quiz's lang, never ui_lang", () => {
  it("a decimal comma is a number in a vi quiz, and wrong in an en quiz", () => {
    expect(earned(numeric(), { raw: "2,5" }, "lang: vi")).toBe(1);
    expect(earned(numeric(), { raw: "2.5" }, "lang: vi")).toBe(1);
    expect(earned(numeric(), { raw: "2,5" })).toBe(0);
    expect(earned(numeric(), { raw: "2.5" })).toBe(1);
  });

  it("ui_lang changes nothing about grading", () => {
    expect(earned(numeric(), { raw: "2,5" }, "lang: en\nui_lang: vi")).toBe(0);
    expect(earned(numeric(), { raw: "2,5" }, "lang: vi\nui_lang: en")).toBe(1);
  });

  it("never reads a thousands separator: 1.500 is 1.5, and 1,500 in vi is 1.5 too", () => {
    const body = "## N? {type=numeric id=q}\n\n```answer\nvalue: 1500\n```";
    expect(earned(body, { raw: "1.500" })).toBe(0);
    expect(earned(body, { raw: "1,500" }, "lang: vi")).toBe(0);
    expect(earned(body, { raw: "1500" })).toBe(1);
  });

  it("applies the same reading to numeric blanks and fields", () => {
    const blanks = "## B? {type=blanks id=q}\n\nIt is [[=2.5\u00b10.01]].";
    expect(earned(blanks, { blanks: ["2,5"] }, "lang: vi")).toBe(1);
    expect(earned(blanks, { blanks: ["2,5"] })).toBe(0);
    const fields = "## F? {type=fields id=q}\n\n```answer\nfields:\n  - label: x\n    value: 2.5\n```";
    expect(earned(fields, { fields: ["2,5"] }, "lang: vi")).toBe(1);
  });

  it("matches a fraction key to its decimal within rounding, and not a rougher one", () => {
    const body = "## N? {type=numeric id=q}\n\n```answer\nvalue: 1/3\n```";
    expect(earned(body, { raw: "0.333333333333" })).toBe(1);
    expect(earned(body, { raw: "1/3" })).toBe(1);
    expect(earned(body, { raw: "0.33" })).toBe(0);
  });
});

describe("the plan decides what counts", () => {
  const body = [
    "# One {id=one}",
    "",
    "## A? {type=single id=a tags=x,y}\n\n- [x] a\n- [ ] b",
    "## B? {type=single id=b points=3 tags=x}\n\n- [x] a\n- [ ] b",
    "# Two {id=two}",
    "",
    "## C? {type=truefalse id=c tags=y}\n\n```answer\nvalue: true\n```",
  ].join("\n\n");
  const quiz = quizOf(body, "pass_mark: 50");

  it("counts only the questions in the plan, in its order, and reports ids the quiz lacks", () => {
    const attempt = attemptFor({ a: { choice: 0 }, c: { value: true } }, ["c", "a", "gone"]);
    const g = grade(quiz, attempt);
    expect(g.questions.map((x) => x.id)).toEqual(["c", "a"]);
    expect(g.unknown).toEqual(["gone"]);
    expect(g.total).toMatchObject({ questions: 2, answered: 2, earned: 2, points: 2, pending: 0 });
  });

  it("scores per section and per tag, with a fixed order", () => {
    const attempt = attemptFor({ a: { choice: 0 }, b: { choice: 1 }, c: { value: false } }, ["a", "b", "c"]);
    const g = grade(quiz, attempt);
    expect(g.sections.map((s) => [s.id, s.earned, s.points])).toEqual([
      ["one", 1, 4],
      ["two", 0, 1],
    ]);
    expect(g.tags.map((t) => [t.tag, t.earned, t.points])).toEqual([
      ["x", 1, 4],
      ["y", 1, 2],
    ]);
    expect(g.total).toMatchObject({ earned: 1, points: 5 });
    expect(g.pass).toEqual({ mark: 50, passed: false });
  });

  it("a section-only plan leaves the other section out", () => {
    const attempt = attemptFor({ c: { value: true } }, ["c"]);
    const g = grade(quiz, attempt);
    expect(g.sections.map((s) => s.id)).toEqual(["two"]);
    expect(g.pass.passed).toBe(true);
  });

  it("an unanswered question scores 0 of its points, and counts as asked", () => {
    const g = grade(quiz, attemptFor({}, ["a", "b"]));
    expect(g.total).toMatchObject({ questions: 2, answered: 0, earned: 0, points: 4 });
  });

  it("does not depend on the order options were shown in: answers are source indices", () => {
    const plain = attemptFor({ a: { choice: 0 } }, ["a"]);
    const shuffled = { ...plain, plan: { ...plain.plan, optionOrder: { a: [1, 0] }, seed: "s" } };
    expect(grade(quiz, shuffled).questions).toEqual(grade(quiz, plain).questions);
  });

  it("is the same on every run", () => {
    const attempt = attemptFor({ a: { choice: 0 }, b: { choice: 0 } }, ["a", "b", "c"]);
    expect(JSON.stringify(grade(quiz, attempt))).toBe(JSON.stringify(grade(quiz, attempt)));
  });

  it("pass_mark is judged on the scored points, essays waiting for a grader left out", () => {
    const withEssay = quizOf(
      ["## A? {type=truefalse id=a}\n\n```answer\nvalue: true\n```", "## E {type=essay id=e points=10}"].join("\n\n"),
      "pass_mark: 100",
    );
    const g = grade(withEssay, attemptFor({ a: { value: true }, e: { text: "my essay" } }));
    expect(g.total).toMatchObject({ earned: 1, points: 1, pending: 10 });
    expect(g.pass.passed).toBe(true);
    const marked = grade(withEssay, attemptFor({ a: { value: true }, e: { text: "my essay" } }), { e: 4 });
    expect(marked.total).toMatchObject({ earned: 5, points: 11, pending: 0 });
    expect(marked.pass.passed).toBe(false);
  });
});

describe("essays and code", () => {
  const body = "## E {type=essay id=e points=4}\n\n## C {type=code id=c points=2}\n\n```answer\nlanguage: rust\n```";
  const quiz = quizOf(body);

  it("count words themselves, and wait for a grader", () => {
    const g = grade(quiz, attemptFor({ e: { text: "one two three", word_count: 99 }, c: { code: "fn f() {}" } }));
    expect(g.questions.map((x) => [x.status, x.earned, x.words])).toEqual([
      ["pending", null, 3],
      ["pending", null, null],
    ]);
  });

  it("takes a grader's marks, clamped to the points", () => {
    const attempt = attemptFor({ e: { text: "x" }, c: { code: "x" } });
    const g = grade(quiz, attempt, { e: 4, c: 1 });
    expect(g.questions.map((x) => [x.status, x.earned])).toEqual([
      ["correct", 4],
      ["partial", 1],
    ]);
    expect(grade(quiz, attempt, { e: 99, c: -3 }).questions.map((x) => x.earned)).toEqual([4, 0]);
  });

  it("an unanswered one stays unanswered whatever the grader says, and scores 0 in the totals", () => {
    const g = grade(quiz, attemptFor({ e: null, c: null }), { e: 4 });
    expect(g.questions.map((x) => [x.status, x.earned])).toEqual([
      ["unanswered", null],
      ["unanswered", null],
    ]);
    expect(g.total).toMatchObject({ earned: 0, points: 6, pending: 0 });
  });
});

describe("surveys", () => {
  it("have no score: every question is ungraded, or unanswered", () => {
    const survey = quizOf(
      "## A? {type=single id=a}\n\n- [ ] x\n- [ ] y\n\n## B? {type=scale id=b}\n\n## C? {type=essay id=c}",
      "kind: survey",
    );
    const g = grade(survey, attemptFor({ a: { choice: 1 }, b: { value: 3 }, c: null }));
    expect(g.survey).toBe(true);
    expect(g.questions.map((x) => x.status)).toEqual(["ungraded", "ungraded", "unanswered"]);
    expect(g.total).toEqual({ questions: 3, answered: 2, earned: 0, points: 0, pending: 0 });
    expect(g.pass).toEqual({ mark: null, passed: null });
  });
});
