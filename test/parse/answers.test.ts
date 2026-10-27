import { describe, expect, it } from "vitest";
import { found, oneQuestion } from "./helpers";

/** A question of `head` with an answer block of `yaml`. The block's first line is line 7. */
const withAnswer = (head: string, yaml: string) => `## Q {${head} id=q}\n\n\`\`\`answer\n${yaml}\n\`\`\``;

describe("answer blocks", () => {
  it("reports YAML that does not parse, at the line the parser gives", () => {
    expect(found(withAnswer("type=numeric", "value: 1\nunit: [oops"))).toEqual(["syntax.yaml@9"]);
    expect(found(withAnswer("type=numeric", "- a\n- b"))).toEqual(["syntax.yaml@8"]);
  });

  it("reports an unknown key at its line, with a suggestion", () => {
    expect(found(withAnswer("type=numeric", "value: 1\nprecision: 2"))).toEqual(["syntax.unknown-key@9"]);
  });

  it("requires a block where the type needs one and forbids it where it takes none", () => {
    for (const type of ["truefalse", "numeric", "fields", "code", "short"]) {
      expect(found(`## Q {type=${type} id=q}\n\nText.`), type).toEqual(["question.answer-block@5"]);
    }
    for (const body of ["- [x] a\n- [ ] b", "1. a\n2. b", "- a :: b\n- c :: d", "A [[b]]."]) {
      const type = body.startsWith("- [x]")
        ? "single"
        : body.startsWith("1.")
          ? "ordering"
          : body.startsWith("- a")
            ? "matching"
            : "blanks";
      expect(found(`## Q {type=${type} id=q}\n\n${body}\n\n\`\`\`answer\nvalue: 1\n\`\`\``), type).toEqual([
        "question.answer-block@5",
      ]);
    }
  });

  it("allows an essay and a scale without a block", () => {
    expect(found("## Q {type=essay id=q}\n\nWrite.")).toEqual([]);
    expect(found("## Q {type=scale id=q}")).toEqual([]);
  });

  it("does not read a block that is not named answer", () => {
    expect(found("## Q {type=essay id=q}\n\n```yaml\nnot: an answer\n```")).toEqual([]);
  });
});

describe("truefalse", () => {
  it("reads true and false and rejects other words", () => {
    expect(oneQuestion(withAnswer("type=truefalse", "value: false"))).toMatchObject({ value: false });
    expect(found(withAnswer("type=truefalse", "value: maybe"))).toEqual(["syntax.value@8"]);
    expect(found(withAnswer("type=truefalse", "x: 1"))).toEqual(["question.answer-block@5", "syntax.unknown-key@8"]);
  });
});

describe("numeric", () => {
  it("reads value, values, the tolerances and the unit", () => {
    const q = oneQuestion(withAnswer("type=numeric", "values: [2, -2, 1/3]\ntolerance: 0.01\nunit: V"));
    expect(q.type === "numeric" && q.key).toEqual({
      values: [2, -2, 1 / 3],
      raw: ["2", "-2", "1/3"],
      tolerance: 0.01,
      relTolerance: null,
      unit: "V",
    });
    const rel = oneQuestion(withAnswer("type=numeric", "value: 1e-3\nrel_tolerance: 0.05"));
    expect(rel.type === "numeric" && [rel.key.values, rel.key.raw, rel.key.relTolerance]).toEqual([
      [0.001],
      ["1e-3"],
      0.05,
    ]);
  });

  it("keeps a number's spelling, a quoted number included", () => {
    const q = oneQuestion(withAnswer("type=numeric", 'value: "0.50"'));
    expect(q.type === "numeric" && q.key.raw).toEqual(["0.50"]);
  });

  it("reports a missing value, both forms, a value that is not a number, both tolerances, a negative tolerance", () => {
    expect(found(withAnswer("type=numeric", "unit: V"))).toEqual(["numeric.value@5"]);
    expect(found(withAnswer("type=numeric", "value: 1\nvalues: [1]"))).toEqual(["numeric.value@8"]);
    expect(found(withAnswer("type=numeric", "value: one"))).toEqual(["numeric.value@8"]);
    expect(found(withAnswer("type=numeric", "values: [1, x]"))).toEqual(["numeric.value@8"]);
    expect(found(withAnswer("type=numeric", "value: 1\ntolerance: 1\nrel_tolerance: 0.1"))).toEqual([
      "numeric.value@9",
    ]);
    expect(found(withAnswer("type=numeric", "value: 1\ntolerance: -1"))).toEqual(["numeric.value@9"]);
    expect(found(withAnswer("type=numeric", "value: 1,5"))).toEqual(["numeric.value@8"]);
  });
});

describe("short", () => {
  it("reads accept and patterns", () => {
    const q = oneQuestion(withAnswer("type=short case=sensitive", "accept: [a, b]\npatterns: ['^c$']"));
    expect(q.type === "short" && [q.key, q.case]).toEqual([{ accept: ["a", "b"], patterns: ["^c$"] }, "sensitive"]);
  });

  it("needs accept or patterns", () => {
    expect(found(withAnswer("type=short", "accept: []"))).toEqual(["short.key@5"]);
  });

  it("checks each pattern in u mode, with no lookbehind and no inline flags", () => {
    expect(found(withAnswer("type=short", 'patterns: ["(abc"]'))).toEqual(["short.regex@8"]);
    expect(found(withAnswer("type=short", 'patterns: ["(?<=a)b"]'))).toEqual(["short.regex@8"]);
    expect(found(withAnswer("type=short", 'patterns: ["(?i)b"]'))).toEqual(["short.regex@8"]);
    expect(found(withAnswer("type=short", 'patterns: ["(?P<n>a)"]'))).toEqual(["short.regex@8"]);
    expect(found(withAnswer("type=short", "patterns:\n  - ok\n  - '['"))).toEqual(["short.regex@10"]);
  });
});

describe("fields", () => {
  it("reads numeric, text and ungraded fields", () => {
    const q = oneQuestion(
      withAnswer(
        "type=fields points=3",
        "fields:\n  - label: A\n    accept: [x]\n  - label: B\n    value: 2\n  - label: Notes",
      ),
    );
    expect(q.type === "fields" && q.fields.map((f) => f.key?.kind ?? null)).toEqual(["text", "numeric", null]);
  });

  it("needs fields", () => {
    expect(found(withAnswer("type=fields", "fields: []"))).toEqual(["fields.empty@5"]);
    expect(found(withAnswer("type=fields", "other: 1"))).toEqual(["fields.empty@5", "syntax.unknown-key@8"]);
  });

  it("refuses a field with numeric and text keys", () => {
    expect(found(withAnswer("type=fields", "fields:\n  - label: A\n    value: 3\n    accept: [x]"))).toEqual([
      "fields.key@10",
    ]);
  });

  it("takes absolute points that add up, or none", () => {
    const two = "fields:\n  - label: A\n    value: 1\n    points: 1\n  - label: B\n    value: 2";
    expect(found(withAnswer("type=fields points=2", two))).toEqual(["fields.points@5"]);
    expect(found(withAnswer("type=fields points=3", `${two}\n    points: 1`))).toEqual(["fields.points@5"]);
    expect(found(withAnswer("type=fields points=2", `${two}\n    points: 1`))).toEqual([]);
    expect(found(withAnswer("type=fields points=2", two.replace("    points: 1\n", "")))).toEqual([]);
  });

  it("refuses points on a field with no key", () => {
    expect(
      found(
        withAnswer(
          "type=fields points=2",
          "fields:\n  - label: A\n    value: 1\n    points: 2\n  - label: N\n    points: 1",
        ),
      ),
    ).toEqual(["fields.points@13"]);
  });

  it("checks the pattern of a text field", () => {
    expect(found(withAnswer("type=fields", 'fields:\n  - label: x\n    patterns: ["["]'))).toEqual(["short.regex@10"]);
  });
});

describe("essay and code", () => {
  it("reads the word limits, treating 0 as no maximum", () => {
    const q = oneQuestion(withAnswer("type=essay", "min_words: 100\nmax_words: 0"));
    expect(q.type === "essay" && [q.minWords, q.maxWords]).toEqual([100, null]);
    expect(found(withAnswer("type=essay", "min_words: 100\nmax_words: 50"))).toEqual(["essay.words@8"]);
    expect(found(withAnswer("type=essay", "min_words: -1"))).toEqual(["syntax.value@8"]);
  });

  it("reads the sample answer and show_rubric", () => {
    const q = oneQuestion(withAnswer("type=essay", "sample_answer: |\n  Line one.\n  Line two.\nshow_rubric: false"));
    expect(q.type === "essay" && [q.sampleAnswer, q.showRubric]).toEqual(["Line one.\nLine two.", false]);
  });

  it("needs a language for code", () => {
    const q = oneQuestion(withAnswer("type=code", "language: rust\nstarter: |\n  fn f() {}\nsample_answer: x"));
    expect(q.type === "code" && [q.language, q.starter, q.sampleAnswer]).toEqual(["rust", "fn f() {}", "x"]);
    expect(found(withAnswer("type=code", "starter: x"))).toEqual(["code.language@5"]);
    expect(found(withAnswer("type=code", 'language: ""'))).toEqual(["code.language@8"]);
  });
});

describe("scale", () => {
  it("defaults to 1 to 5 and reads labels", () => {
    expect(oneQuestion("## Q {type=scale id=q}")).toMatchObject({ min: 1, max: 5, labels: [], graded: false });
    const q = oneQuestion(withAnswer("type=scale", "min: 0\nmax: 7\nlabels:\n  0: Never\n  7: Every day"));
    expect(q.type === "scale" && q.labels.map((l) => [l.value, l.text])).toEqual([
      [0, "Never"],
      [7, "Every day"],
    ]);
  });

  it("limits the range and the labels", () => {
    expect(found(withAnswer("type=scale", "min: 0\nmax: 11"))).toEqual(["scale.range@9"]);
    expect(found(withAnswer("type=scale", "min: 3\nmax: 3"))).toEqual(["scale.range@9"]);
    expect(found(withAnswer("type=scale", "labels:\n  9: High"))).toEqual(["scale.range@9"]);
  });
});

describe("rubrics", () => {
  it("parses a list of bullets as a holistic rubric", () => {
    const q = oneQuestion(withAnswer("type=essay points=3", "rubric:\n  - Defines it (1 pts)\n  - Uses it"));
    expect(q.type === "essay" && q.rubric).toMatchObject({
      mode: "holistic",
      criteria: [
        { id: "defines-it", text: "Defines it", points: 1, explicitId: false },
        { id: "uses-it", text: "Uses it", points: null },
      ],
    });
  });

  it("parses the additive form, with shorthand and long criteria", () => {
    const q = oneQuestion(
      withAnswer(
        "type=essay points=3",
        "rubric:\n  mode: additive\n  step: 0.25\n  criteria:\n    - Define it (0.5 pts)\n    - id: interp\n      text: Interpret the poles\n      points: 2.5",
      ),
    );
    expect(q.type === "essay" && q.rubric).toMatchObject({
      mode: "additive",
      step: 0.25,
      criteria: [
        { id: "define-it", text: "Define it", points: 0.5 },
        { id: "interp", text: "Interpret the poles", points: 2.5, explicitId: true },
      ],
    });
  });

  it("parses the banded form with a scale, rounding and weights", () => {
    const q = oneQuestion(
      withAnswer(
        "type=essay points=9",
        "rubric:\n  mode: banded\n  scale: {min: 0, max: 9, step: 0.5}\n  round: ielts\n  criteria:\n    - {id: tr, text: Task response, weight: 2}\n    - {id: cc, text: Coherence}",
      ),
    );
    expect(q.type === "essay" && q.rubric).toMatchObject({
      mode: "banded",
      scale: { min: 0, max: 9, step: 0.5 },
      round: "ielts",
      criteria: [
        { id: "tr", weight: 2 },
        { id: "cc", weight: null },
      ],
    });
  });

  it("parses a preset", () => {
    const q = oneQuestion(withAnswer("type=essay", "rubric:\n  preset: ielts-writing-task2"));
    expect(q.type === "essay" && q.rubric).toMatchObject({ preset: "ielts-writing-task2", mode: null, criteria: [] });
  });

  it("keeps inconsistent rubrics, which the grading slice judges", () => {
    expect(found(withAnswer("type=essay points=3", "rubric:\n  criteria:\n    - {id: a, text: A, points: 1}"))).toEqual(
      [],
    );
    expect(
      found(
        withAnswer("type=essay points=3", "rubric:\n  mode: additive\n  criteria:\n    - A (1 pts)\n    - A (1 pts)"),
      ),
    ).toEqual([]);
  });

  it("reports the shape of a rubric that cannot be read", () => {
    expect(found(withAnswer("type=essay", "rubric: nothing"))).toEqual(["syntax.value@8"]);
    expect(found(withAnswer("type=essay", "rubric:\n  mode: odd"))).toEqual(["syntax.value@9"]);
    expect(found(withAnswer("type=essay", "rubric:\n  modes: additive"))).toEqual(["syntax.unknown-key@9"]);
    expect(found(withAnswer("type=essay", "rubric:\n  criteria: text"))).toEqual(["syntax.value@9"]);
  });
});
