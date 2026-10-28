import { describe, expect, it } from "vitest";
import { canonicalHash, canonicalJson } from "../../src/core/canonical";
import { bandPoints, decimalsOf, isMultiple, overallBand, sumMarks } from "../../src/core/rubric/arith";
import { resolveRubric, rubricHash } from "../../src/core/rubric/model";
import { PRESET_NAMES, PRESETS } from "../../src/core/rubric/presets";
import { quizOf } from "../helpers/grading";

const IELTS = { min: 0, max: 9, step: 0.5 } as const;
const band = (bands: number[], round: "ielts" | "nearest-step" | "down" = "ielts", weights = bands.map(() => 1)) =>
  overallBand(bands, weights, IELTS, round);

describe("exact decimals", () => {
  it("counts decimals", () => {
    expect([0, 1, 0.5, 0.25, 1e-7, 12.125].map(decimalsOf)).toEqual([0, 0, 1, 2, 7, 3]);
  });

  it("knows a multiple of a step without float noise", () => {
    expect(isMultiple(0.3, 0.1)).toBe(true);
    expect(isMultiple(0.35, 0.1)).toBe(false);
    expect(isMultiple(9, 0.5)).toBe(true);
    expect(isMultiple(9, 2)).toBe(false);
    expect(isMultiple(4.5, 0.5, 0.5)).toBe(true);
    expect(isMultiple(1, 0)).toBe(false);
  });

  it("adds marks exactly", () => {
    expect(sumMarks([0.1, 0.2])).toBe(0.3);
    expect(sumMarks([0.25, 0.5, 1.5])).toBe(2.25);
    expect(sumMarks([])).toBe(0);
  });
});

describe("IELTS rounding of the overall band", () => {
  it("rounds .25 up to .5 and .75 up to the next whole band", () => {
    expect(band([6, 6.5, 6.5, 6])).toBe(6.5); // 6.25
    expect(band([6, 7, 7, 7])).toBe(7); // 6.75
    expect(band([6, 6, 6, 6.5])).toBe(6); // 6.125
    expect(band([6, 6, 6.5, 6.5])).toBe(6.5); // 6.25 again, through a different mean
    expect(band([5.5, 6, 6, 6])).toBe(6); // 5.875
    expect(band([5.5, 5.5, 6, 6])).toBe(6); // 5.75
  });

  it("holds at the ends of the scale", () => {
    expect(band([0, 0, 0, 0])).toBe(0);
    expect(band([9, 9, 9, 9])).toBe(9);
    expect(band([9, 9, 9, 8.5])).toBe(9); // 8.875
    expect(band([0, 0, 0, 0.5])).toBe(0); // 0.125
    expect(band([0, 0, 0.5, 0.5])).toBe(0.5); // 0.25
  });

  it("takes a weighted mean", () => {
    expect(overallBand([7, 5], [2, 1], IELTS, "ielts")).toBe(6.5); // 6.333
    expect(overallBand([7, 5], [1, 3], IELTS, "ielts")).toBe(5.5); // 5.5
    expect(overallBand([8, 6], [0.5, 1.5], IELTS, "ielts")).toBe(6.5); // 6.5
  });
});

describe("the other rounding rules", () => {
  it("nearest-step counts from the scale's own start, a tie going up", () => {
    const scale = { min: 1, max: 5, step: 1 };
    expect(overallBand([2, 3], [1, 1], scale, "nearest-step")).toBe(3); // 2.5
    expect(overallBand([2, 2, 3], [1, 1, 1], scale, "nearest-step")).toBe(2); // 2.33
  });

  it("down goes to the step below", () => {
    expect(band([6, 6.5, 6.5, 6], "down")).toBe(6); // 6.25
    expect(band([6.5, 7, 7, 7], "down")).toBe(6.5); // 6.875
  });

  it("is not fooled by floats: 0.35 on a 0.1 step rounds up to 0.4", () => {
    const scale = { min: 0, max: 1, step: 0.1 };
    expect(overallBand([0.3, 0.4], [1, 1], scale, "nearest-step")).toBe(0.4);
    expect(0.35 / 0.1).toBeLessThan(3.5); // the trap this guards against
  });

  it("never leaves the scale", () => {
    expect(overallBand([9, 9], [1, 1], { min: 0, max: 9, step: 2 }, "nearest-step")).toBe(9);
  });
});

describe("band to points", () => {
  it("scales a band to the question's points, to two decimals, halves up", () => {
    expect(bandPoints(9, 6.5, 9)).toBe(6.5);
    expect(bandPoints(4, 6.5, 9)).toBe(2.89); // 2.8888
    expect(bandPoints(1, 0.5, 9)).toBe(0.06); // 0.0555
    expect(bandPoints(3, 0, 9)).toBe(0);
    expect(bandPoints(3, 9, 9)).toBe(3);
    expect(bandPoints(1, 4.5, 9)).toBe(0.5);
  });
});

describe("the worked examples of the design", () => {
  it("additive: 0.5 + 0.75 + 1 of 3 is 2.25", () => {
    expect(sumMarks([0.5, 0.75, 1])).toBe(2.25);
  });

  it("banded: four bands of 6.5 give 6.5 of 9", () => {
    expect(bandPoints(9, band([6.5, 6.5, 6.5, 6.5]), 9)).toBe(6.5);
  });

  it("holistic: a score of 3 of 4 is 3", () => {
    expect(sumMarks([3])).toBe(3);
  });
});

describe("presets", () => {
  it("are the four IELTS criteria, equally weighted, on bands 0 to 9 with IELTS rounding", () => {
    expect(PRESET_NAMES).toEqual(["ielts-writing-task1", "ielts-writing-task2"]);
    for (const name of PRESET_NAMES) {
      const p = PRESETS[name];
      expect(p.criteria).toHaveLength(4);
      expect(p.criteria.map((c) => c.weight)).toEqual([1, 1, 1, 1]);
      expect(p.scale).toEqual(IELTS);
      expect(p.round).toBe("ielts");
    }
    expect(PRESETS["ielts-writing-task1"].criteria.map((c) => c.id)).toEqual(["TA", "CC", "LR", "GRA"]);
    expect(PRESETS["ielts-writing-task2"].criteria.map((c) => c.id)).toEqual(["TR", "CC", "LR", "GRA"]);
  });
});

describe("resolving a rubric", () => {
  const rubricOf = (head: string, yaml: string) => {
    const q = quizOf(`## Q {${head} id=q}\n\n\`\`\`answer\n${yaml}\n\`\`\``).sections[0]?.questions[0];
    return q && (q.type === "essay" || q.type === "code") ? q.rubric : null;
  };

  it("a question with no rubric is holistic with no bullets", () => {
    expect(resolveRubric(null)).toEqual({ mode: "holistic", step: null, criteria: [] });
  });

  it("additive gets the default step and its maximums", () => {
    const r = resolveRubric(
      rubricOf("type=essay points=2", "rubric:\n  mode: additive\n  criteria:\n    - A (1 pts)\n    - B (1 pts)"),
    );
    expect(r).toEqual({
      mode: "additive",
      step: 0.5,
      criteria: [
        { id: "a", text: "A", max: 1 },
        { id: "b", text: "B", max: 1 },
      ],
    });
  });

  it("a preset expands, and banded defaults weight 1 and nearest-step", () => {
    const p = resolveRubric(rubricOf("type=essay points=9", "rubric:\n  preset: ielts-writing-task2"));
    expect(p).toMatchObject({ mode: "banded", round: "ielts", preset: "ielts-writing-task2" });
    const b = resolveRubric(
      rubricOf(
        "type=essay points=9",
        "rubric:\n  mode: banded\n  scale: {min: 0, max: 9, step: 1}\n  criteria:\n    - A",
      ),
    );
    expect(b).toMatchObject({ mode: "banded", round: "nearest-step", criteria: [{ id: "a", weight: 1 }] });
  });
});

describe("canonical JSON and the rubric hash", () => {
  it("sorts keys at every level and writes no white space", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: null, y: "x" }], c: undefined } })).toBe(
      '{"a":{"d":[1,{"y":"x","z":null}]},"b":1}',
    );
    expect(canonicalHash({ a: 1, b: 2 })).toBe(canonicalHash({ b: 2, a: 1 }));
    expect(canonicalHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  const rubricOf = (yaml: string) => {
    const q = quizOf(`## Q {type=essay points=2 id=q}\n\n\`\`\`answer\n${yaml}\n\`\`\``).sections[0]?.questions[0];
    return resolveRubric(q && q.type === "essay" ? q.rubric : null);
  };
  const base = "rubric:\n  mode: additive\n  criteria:\n    - Define it (1 pts)\n    - Use it (1 pts)";

  it("ignores layout, comments and the shorthand against the long form", () => {
    const longForm =
      "rubric:\n  # a comment\n  criteria:\n    - { text: Define it, points: 1, id: define-it }\n    - id: use-it\n      text: Use it\n      points: 1\n  mode: additive";
    expect(rubricHash(rubricOf(longForm))).toBe(rubricHash(rubricOf(base)));
    expect(rubricHash(rubricOf(base.replaceAll("\n", "\r\n")))).toBe(rubricHash(rubricOf(base)));
  });

  it("changes with a criterion's wording, points or the mode", () => {
    const h = rubricHash(rubricOf(base));
    expect(rubricHash(rubricOf(base.replace("Define it", "Define the term")))).not.toBe(h);
    expect(
      rubricHash(rubricOf(base.replace("Define it (1", "Define it (0.5").replace("Use it (1", "Use it (1.5"))),
    ).not.toBe(h);
    expect(rubricHash(rubricOf("rubric:\n  - Define it\n  - Use it"))).not.toBe(h);
  });
});
