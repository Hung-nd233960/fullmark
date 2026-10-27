import { describe, expect, it } from "vitest";
import { found, oneQuestion, parseBody } from "./helpers";

describe("headings and attributes", () => {
  it("does not take braces in maths or code for the attribute block", () => {
    const q = oneQuestion("## Poles of $\\frac{1}{s+2}$ and `f{x}` {type=short id=q}\n\n```answer\naccept: [a]\n```");
    expect(q.prompt).toBe("Poles of $\\frac{1}{s+2}$ and `f{x}`");
    expect(q.id).toBe("q");
  });

  it("lets a prompt end in an escaped brace or in braces inside maths", () => {
    expect(oneQuestion("## Write the set \\{ {type=short id=q}\n\n```answer\naccept: [a]\n```").prompt).toBe(
      "Write the set \\{",
    );
    expect(oneQuestion("## Is $x \\in \\{1, 2\\}$ {type=truefalse id=q}\n\n```answer\nvalue: true\n```").prompt).toBe(
      "Is $x \\in \\{1, 2\\}$",
    );
  });

  it('reads quoted values, with \\" inside', () => {
    const q = oneQuestion(
      '## Q {type=short id=q source="Lecture 4, \\"slide\\" 12 {x}"}\n\n```answer\naccept: [a]\n```',
    );
    expect(q.source).toBe('Lecture 4, "slide" 12 {x}');
  });

  it("reports a trailing block that does not parse, never reading it as text", () => {
    expect(found("## Q {type=single id=q\n\n- [x] a\n- [ ] b")).toEqual([
      "question.type-missing@5",
      "question.id-missing@5",
    ]);
    expect(found("## Q {type=single id=}\n\n- [x] a\n- [ ] b")).toEqual(["syntax.attributes@5"]);
  });

  it("reports a name given twice, an unknown name, a bare name", () => {
    expect(found("## Q {type=single type=multi id=q}\n\n- [x] a\n- [ ] b")).toEqual(["syntax.attributes@5"]);
    expect(found("## Q {type=single id=q pts=3}\n\n- [x] a\n- [ ] b")).toEqual(["syntax.unknown-key@5"]);
    expect(found("## Q {type=single id=q flag}\n\n- [x] a\n- [ ] b")).toEqual(["syntax.unknown-key@5"]);
    expect(found("## Q {type=single id=q points}\n\n- [x] a\n- [ ] b")).toEqual(["syntax.attributes@5"]);
  });

  it("suggests the name that was meant", () => {
    const issue = parseBody("## Q {type=single id=q point=3}\n\n- [x] a\n- [ ] b").issues[0];
    expect(issue?.fix).toContain("points");
  });

  it("reports a missing type and a missing id", () => {
    expect(found("## Q {id=q}\n\nText.")).toEqual(["question.type-missing@5"]);
    expect(found("## Q {type=single}\n\n- [x] a\n- [ ] b")).toEqual(["question.id-missing@5"]);
    expect(found("## Q\n\nText.")).toEqual(["question.type-missing@5", "question.id-missing@5"]);
  });

  it("names the command that fixes a missing id", () => {
    const issue = parseBody("## Q {type=single}\n\n- [x] a\n- [ ] b").issues[0];
    expect(issue?.fix).toContain("quiz ids");
  });

  it("checks the id format and uniqueness", () => {
    expect(found("## Q {type=single id=Q_1}\n\n- [x] a\n- [ ] b")).toEqual(["question.id-format@5"]);
    expect(found("## Q {type=single id=a}\n\n- [x] a\n- [ ] b\n\n## R {type=single id=a}\n\n- [x] a\n- [ ] b")).toEqual(
      ["question.id-duplicate@10"],
    );
  });

  it("checks the values: points, tags, graded, case, type", () => {
    expect(found("## Q {type=single id=q points=0}\n\n- [x] a\n- [ ] b")).toEqual(["syntax.value@5"]);
    expect(found('## Q {type=single id=q tags="a b"}\n\n- [x] a\n- [ ] b')).toEqual(["syntax.value@5"]);
    expect(found("## Q {type=single id=q case=maybe}\n\n- [x] a\n- [ ] b")).toEqual(["syntax.value@5"]);
    expect(found("## Q {type=lottery id=q}\n\nText.")).toEqual(["syntax.value@5"]);
  });

  it("reads points, tags, shuffle and partial", () => {
    const q = oneQuestion("## Q {type=multi id=q points=2.5 tags=a,b shuffle=false partial=true}\n\n- [x] a\n- [ ] b");
    expect([q.points, q.tags, q.shuffle, q.partial]).toEqual([2.5, ["a", "b"], false, true]);
  });

  it("keeps check-ignore and because on the question, judged later by the registry", () => {
    const q = oneQuestion('## Q {type=single id=q check-ignore="a.b,c.d" because="why"}\n\n- [x] a\n- [ ] b');
    expect(q.ignore).toMatchObject({ rules: ["a.b", "c.d"], because: "why" });
    const bare = oneQuestion('## Q {type=single id=q check-ignore="a.b"}\n\n- [x] a\n- [ ] b');
    expect(bare.ignore).toMatchObject({ rules: ["a.b"], because: null });
  });

  it("reports an empty prompt", () => {
    expect(found("## {type=single id=q}\n\n- [x] a\n- [ ] b")).toEqual(["question.prompt-empty@5"]);
  });

  it("reports a heading deeper than ##", () => {
    expect(found("### Sub\n\n## Q {type=single id=q}\n\n- [x] a\n- [ ] b")).toEqual(["syntax.heading-level@5"]);
  });

  it("accepts a heading whose prompt holds blanks [[…]] and braces", () => {
    const q = oneQuestion("## The derivative of $\\sin x$ is [[cos x]] {type=blanks id=q}");
    expect(q.type === "blanks" && q.blanks).toHaveLength(1);
    expect(q.prompt).toBe("The derivative of $\\sin x$ is [[cos x]]");
  });
});

describe("choices", () => {
  it("needs a marker on every item", () => {
    expect(found("## Q {type=single id=q}\n\n- [x] a\n- b")).toEqual(["choice.marker@8"]);
  });

  it("counts the choices and the correct ones", () => {
    expect(found("## Q {type=single id=q}\n\n- [x] a")).toEqual(["choice.count@5"]);
    expect(found("## Q {type=single id=q}\n\nNo list.")).toEqual(["choice.count@5"]);
    expect(found("## Q {type=single id=q}\n\n- [ ] a\n- [ ] b")).toEqual(["choice.correct-count@5"]);
    expect(found("## Q {type=single id=q}\n\n- [x] a\n- [x] b")).toEqual(["choice.correct-count@5"]);
    expect(found("## Q {type=multi id=q}\n\n- [ ] a\n- [ ] b")).toEqual(["choice.correct-count@5"]);
    expect(found("## Q {type=multi id=q}\n\n- [x] a\n- [x] b")).toEqual([]);
  });

  it("keeps a code block under a choice, and lists in the prompt", () => {
    const q = oneQuestion(
      "## Which output? {type=single id=q}\n\n* data one\n* data two\n\n- [x] first\n  ```js\n  f(1)\n  ```\n- [ ] second",
    );
    expect(q.prompt).toBe("Which output?\n\n* data one\n* data two");
    expect(q.type === "single" && q.choices.map((c) => c.text)).toEqual(["first\n```js\nf(1)\n```", "second"]);
  });

  it('reads {input} and {input="…"} at the end of a choice', () => {
    const q = oneQuestion('## Q {type=single id=q}\n\n- [x] a\n- [ ] Other {input="What is it?"}\n- [ ] Else {input}');
    expect(q.type === "single" && q.choices.map((c) => c.input)).toEqual([
      null,
      { prompt: "What is it?" },
      { prompt: null },
    ]);
    expect(q.type === "single" && q.choices[1]?.text).toBe("Other");
  });

  it('allows {input} with a quoted \\" inside', () => {
    const q = oneQuestion('## Q {type=multi id=q}\n\n- [x] a\n- [ ] Other {input="Say \\"why\\""}');
    expect(q.type === "multi" && q.choices[1]?.input).toEqual({ prompt: 'Say "why"' });
  });

  it("reports {input} anywhere but the end of a choice, and bad prompts", () => {
    expect(found("## Q {type=single id=q input}\n\n- [x] a\n- [ ] b")).toEqual(["choice.input@5"]);
    expect(found("## Q {type=ordering id=q}\n\n1. a\n2. b {input}")).toEqual(["choice.input@8"]);
    expect(found("## Q {type=single id=q}\n\n- [x] a {input} more\n- [ ] b")).toEqual(["choice.input@7"]);
    expect(found('## Q {type=single id=q}\n\n- [x] a\n- [ ] b {input=""}')).toEqual(["choice.input@8"]);
    expect(found("## Q {type=single id=q}\n\n- [x] a\n- [ ] b {input=What is it?}")).toEqual(["choice.input@8"]);
    expect(found('## Q {type=single id=q}\n\n- [x] a\n- [ ] b {input="What}')).toEqual(["syntax.attributes@8"]);
  });

  it("leaves other trailing braces on a choice as text", () => {
    const q = oneQuestion("## Q {type=single id=q}\n\n- [x] the set {1, 2}\n- [ ] $\\frac{1}{2}$");
    expect(q.type === "single" && q.choices[0]?.text).toBe("the set {1, 2}");
  });

  it("does not look for {input} inside code", () => {
    expect(found("## Q {type=single id=q}\n\nUse `{input}` here.\n\n```\n{input}\n```\n\n- [x] a\n- [ ] b")).toEqual(
      [],
    );
  });
});

describe("blanks", () => {
  it("collects blanks from the heading, the body and fenced code", () => {
    const q = oneQuestion("## One [[a]] {type=blanks id=q}\n\nTwo [[=1±0.5]].\n\n```rust\nlet [[mut]] x;\n```");
    expect(q.type === "blanks" && q.blanks.map((b) => b.kind)).toEqual(["text", "numeric", "text"]);
  });

  it("reports no blanks, blanks in maths, malformed blanks and blanks in another type", () => {
    expect(found("## Q {type=blanks id=q}\n\nNo blanks here.")).toEqual(["blanks.none@5"]);
    expect(found("## Q {type=blanks id=q}\n\nSolve $a + [[b]]$ now.")).toEqual(["blanks.in-math@7"]);
    expect(found("## Q {type=blanks id=q}\n\nA [[b is never closed.")).toEqual(["blanks.syntax@7"]);
    expect(found("## Q {type=blanks id=q}\n\nA [[=x]] here.")).toEqual(["blanks.syntax@7"]);
    expect(found("## Q {type=short id=q}\n\nFill [[x]].\n\n```answer\naccept: [x]\n```")).toEqual(["blanks.outside@7"]);
  });

  it("reports a blank in display maths", () => {
    expect(found("## Q {type=blanks id=q}\n\n$$\na[[i]]\n$$\n\nAnd [[x]].")).toEqual(["blanks.in-math@8"]);
  });

  it("does not count [[ in a code span", () => {
    expect(found("## Q {type=blanks id=q}\n\nIndex `a[[0]]` is [[zero]].")).toEqual([]);
  });

  it("takes no answer block", () => {
    expect(found("## Q {type=blanks id=q}\n\nA [[b]].\n\n```answer\nx: 1\n```")).toEqual(["question.answer-block@5"]);
  });
});

describe("ordering and matching", () => {
  it("needs two distinct items", () => {
    expect(found("## Q {type=ordering id=q}\n\n1. only")).toEqual(["ordering.items@5"]);
    expect(found("## Q {type=ordering id=q}\n\nNo list")).toEqual(["ordering.items@5"]);
    expect(found("## Q {type=ordering id=q}\n\n1. a\n2. b\n3. a")).toEqual(["ordering.items@9"]);
  });

  it("reads pairs and distractors", () => {
    const q = oneQuestion("## Q {type=matching id=q}\n\n- a :: x\n- b :: y\n- :: z");
    expect(q.type === "matching" && [q.pairs.length, q.distractors.length]).toEqual([2, 1]);
  });

  it("reports a missing separator, an empty right-hand side, a repeated one, too few pairs", () => {
    expect(found("## Q {type=matching id=q}\n\n- a :: 1\n- b 2")).toEqual(["matching.pairs@8"]);
    expect(found("## Q {type=matching id=q}\n\n- a ::\n- b :: y")).toEqual(["matching.pairs@7"]);
    expect(found("## Q {type=matching id=q}\n\n- a :: x\n- b :: x")).toEqual(["matching.pairs@8"]);
    expect(found("## Q {type=matching id=q}\n\n- a :: x\n- :: y")).toEqual(["matching.pairs@5"]);
  });
});

describe("ungraded questions and surveys", () => {
  it("allows no [x] and no answer key when ungraded", () => {
    expect(found("## Q {type=single id=q graded=false}\n\n- [ ] a\n- [ ] b")).toEqual([]);
    expect(found("## Q {type=single id=q graded=false}\n\n- [x] a\n- [ ] b")).toEqual(["question.ungraded-key@7"]);
    expect(found("## Q {type=short id=q graded=false}\n\nText.")).toEqual([]);
    expect(found("## Q {type=short id=q graded=false}\n\n```answer\naccept: [x]\n```")).toEqual([
      "question.answer-block@5",
    ]);
    expect(found("## Q {type=essay id=q graded=false}\n\n```answer\nrubric:\n  - Clarity\n```")).toEqual([
      "question.ungraded-key@8",
    ]);
    expect(
      found("## Q {type=fields id=q graded=false}\n\n```answer\nfields:\n  - label: A\n    value: 3\n```"),
    ).toEqual(["question.ungraded-key@10"]);
  });

  it("refuses types that cannot be ungraded", () => {
    for (const type of ["truefalse", "numeric", "blanks", "matching", "code"]) {
      expect(parseBody(`## Q {type=${type} id=q graded=false}\n\nText.`).issues[0]?.rule, type).toBe(
        "question.ungraded",
      );
    }
  });

  it("scale is always ungraded, and takes no graded=", () => {
    expect(found("## Q {type=scale id=q}")).toEqual([]);
    expect(found("## Q {type=scale id=q graded=true}")).toEqual(["question.ungraded@5"]);
  });

  it("warns about points on an ungraded question", () => {
    const result = parseBody("## Q {type=single id=q graded=false points=3}\n\n- [ ] a\n- [ ] b");
    expect(result.issues.map((i) => [i.rule, i.level])).toEqual([["question.points-ignored", "warning"]]);
    expect(result.quiz).not.toBeNull();
  });

  it("makes every question of a survey ungraded", () => {
    const front = "title: T\nkind: survey";
    expect(found("## Q {type=single id=q}\n\n- [ ] a\n- [ ] b", front)).toEqual([]);
    expect(found("## Q {type=single id=q}\n\n- [x] a\n- [ ] b", front)).toEqual(["question.ungraded-key@8"]);
    expect(found("## Q {type=truefalse id=q}\n\n```answer\nvalue: true\n```", front)).toEqual(["question.ungraded@6"]);
    expect(found("## Q {type=single id=q graded=false}\n\n- [ ] a\n- [ ] b", front)).toEqual(["survey.forbidden@6"]);
    expect(found("# P {pick=1}\n\n## Q {type=single id=q}\n\n- [ ] a\n- [ ] b", front)).toEqual(["survey.forbidden@6"]);
  });
});
