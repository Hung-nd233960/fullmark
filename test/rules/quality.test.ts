import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Quiz } from "../../src/core/ir";
import { parse } from "../../src/core/parse";
import { QUALITY_RULES } from "../../src/core/rules/quality";
import { defaultOptions } from "../../src/core/rules/registry";

const dir = resolve(import.meta.dirname, "..", "fixtures", "quality");
const noBrief = { brief: null, contentFiles: null };

function load(name: string): Quiz {
  const result = parse(readFileSync(join(dir, name), "utf8"), name);
  expect(
    result.issues.filter((i) => i.level === "error"),
    name,
  ).toEqual([]);
  return result.quiz as Quiz;
}

describe("quality rules", () => {
  for (const rule of QUALITY_RULES) {
    it(`${rule.id}: found in its fixture, absent from the clean one`, () => {
      const options = defaultOptions(rule);
      const bad = rule.run(load(`${rule.id}.md`), noBrief, options);
      expect(bad.length, rule.id).toBeGreaterThan(0);
      for (const f of bad) {
        expect(f.line).toBeGreaterThanOrEqual(1);
        expect(f.message.length).toBeGreaterThan(5);
      }
      expect(rule.run(load(`${rule.id}.ok.md`), noBrief, options)).toEqual([]);
    });

    it(`${rule.id}: its example triggers it`, () => {
      const quiz = parse(rule.example, "example.md").quiz as Quiz;
      expect(quiz, rule.id).not.toBeNull();
      expect(rule.run(quiz, noBrief, defaultOptions(rule)).length, rule.id).toBeGreaterThan(0);
    });
  }

  it("reports each finding on the line of the offending item", () => {
    const find = (id: string) => QUALITY_RULES.find((r) => r.id === id);
    const run = (id: string, file: string) => {
      const rule = find(id);
      if (!rule) throw new Error(id);
      return rule.run(load(file), noBrief, defaultOptions(rule)).map((f) => f.line);
    };
    expect(run("choice.duplicate", "choice.duplicate.md")).toEqual([8]);
    expect(run("choice.all-none-above", "choice.all-none-above.md")).toEqual([9]);
    expect(run("explanation.short", "explanation.short.md")).toEqual([10]);
    expect(run("question.points-ignored", "question.points-ignored.md")).toEqual([5]);
    expect(run("answers.position-skew", "answers.position-skew.md")).toEqual([1]);
  });

  it("answers.position-skew skips a quiz that shuffles its choices, and honours its options", () => {
    const rule = QUALITY_RULES.find((r) => r.id === "answers.position-skew");
    if (!rule) throw new Error("missing");
    const skewed = load("answers.position-skew.md");
    const opts = (o: object) => rule.options.parse(o) as Record<string, unknown>;
    expect(rule.run(skewed, noBrief, opts({ "max-share": 0.9 }))).toEqual([]);
    expect(rule.run(skewed, noBrief, opts({ "min-questions": 9 }))).toEqual([]);
    const shuffled = { ...skewed, frontMatter: { ...skewed.frontMatter, shuffleChoices: true } };
    expect(rule.run(shuffled, noBrief, opts({}))).toEqual([]);
  });

  it("explanation.short counts words of any script, and honours min-words", () => {
    const rule = QUALITY_RULES.find((r) => r.id === "explanation.short");
    if (!rule) throw new Error("missing");
    const q = load("explanation.short.ok.md");
    expect(rule.run(q, noBrief, rule.options.parse({ "min-words": 20 }) as Record<string, unknown>)).toHaveLength(1);
    const vi = parse(
      "---\ntitle: T\nlang: vi\n---\n\n## Chọn một. {type=single id=q}\n\n- [x] a\n- [ ] b\n\n::: explanation\nĐáp án là a vì thứ tự chữ cái.\n:::\n",
      "vi.md",
    ).quiz as Quiz;
    expect(rule.run(vi, noBrief, rule.options.parse({ "min-words": 8 }) as Record<string, unknown>)).toEqual([]);
  });
});

describe("questions.type-order", () => {
  const rule = QUALITY_RULES.find((r) => r.id === "questions.type-order");
  if (!rule) throw new Error("missing");
  const S = (id: string) => `## S ${id}? {type=single id=${id}}\n\n- [x] a\n- [ ] b\n`;
  const M = (id: string) => `## M ${id}? {type=multi id=${id}}\n\n- [x] a\n- [x] b\n- [ ] c\n`;
  const T = (id: string) => `## T ${id}. {type=truefalse id=${id}}\n\n\`\`\`answer\nvalue: true\n\`\`\`\n`;
  const H = (id: string) => `## H ${id}? {type=short id=${id}}\n\n\`\`\`answer\naccept: [x]\n\`\`\`\n`;
  const C = (id: string) => `## C ${id}? {type=scale id=${id}}\n\n\`\`\`answer\nmin: 1\nmax: 3\n\`\`\`\n`;
  const mk = (front: string, body: string): Quiz => {
    const r = parse(`---\ntitle: T\n${front}\n---\n\n${body}`, "q.md");
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    return r.quiz as Quiz;
  };
  const run = (q: Quiz, o: object = {}) => rule.run(q, noBrief, rule.options.parse(o) as Record<string, unknown>);
  const lines = (q: Quiz, o: object = {}) => run(q, o).map((f) => f.line);

  it("is silent on a quiz that declares nothing", () => {
    expect(run(mk("", T("a") + S("b")))).toEqual([]);
    expect(run(mk("type_order: none", T("a") + S("b")))).toEqual([]);
  });

  it("says which question, after which type, and the order", () => {
    const [f] = run(mk("type_order: by-quiz", `${S("a")}\n${T("b")}\n${H("c")}\n${T("d")}`));
    expect(f?.message).toBe(
      "Question 4 (truefalse) comes after a short question; this quiz's order is single or multi, truefalse, matching or ordering, blanks, short, numeric or fields, code, essay",
    );
    expect(f?.fix).toBe("move it, or change `type_order`");
  });

  it("lets types mix inside a group, and types outside the order stand anywhere", () => {
    expect(
      run(mk("type_order: by-quiz", `${M("a")}\n${S("b")}\n${C("c")}\n${M("d")}\n${T("e")}\n${C("f")}\n${H("g")}`)),
    ).toEqual([]);
  });

  it("by-section: one finding per section, and a section starts afresh", () => {
    const q = mk(
      "type_order: by-section",
      `# A {id=a}\n\n${T("a1")}\n${S("a2")}\n${S("a3")}\n# B {id=b}\n\n${H("b1")}\n${T("b2")}\n${T("b3")}\n# C {id=c}\n\n${S("c1")}`,
    );
    expect(run(q)).toHaveLength(2);
    expect(run(q).map((f) => f.message.slice(0, 30))).toEqual([
      "Question 2 (single) comes afte",
      "Question 5 (truefalse) comes a",
    ]);
  });

  it("by-quiz: the order holds across sections, one finding for the quiz", () => {
    const q = mk("type_order: by-quiz", `# A {id=a}\n\n${H("a1")}\n# B {id=b}\n\n${S("b1")}\n${T("b2")}`);
    expect(run(q)).toHaveLength(1);
    expect(
      mk("type_order: by-section", `# A {id=a}\n\n${H("a1")}\n# B {id=b}\n\n${S("b1")}\n${T("b2")}`).sections,
    ).toHaveLength(2);
    expect(run(mk("type_order: by-section", `# A {id=a}\n\n${H("a1")}\n# B {id=b}\n\n${S("b1")}\n${T("b2")}`))).toEqual(
      [],
    );
  });

  it("a quiz with no sections is one section", () => {
    const body = `${H("a")}\n${S("b")}`;
    expect(run(mk("type_order: by-section", body))).toHaveLength(1);
    expect(run(mk("type_order: by-quiz", body))).toHaveLength(1);
  });

  it("uses the quiz's own order", () => {
    const q = mk("type_order:\n  by: by-quiz\n  order: [short, single]", `${S("a")}\n${H("b")}`);
    expect(run(q)).toHaveLength(1);
    expect(run(q)[0]?.message).toContain("this quiz's order is short, single");
  });

  it("an ignore accepts that question; the next one out of order shows", () => {
    const ignoring = T("t").replace(
      "{type=truefalse id=t}",
      '{type=truefalse id=t check-ignore="questions.type-order" because="on purpose"}',
    );
    const q = mk("type_order: by-quiz", `${S("a")}\n${H("h")}\n${ignoring}\n${S("s")}`);
    const found = run(q);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("Question 4 (single)");
  });

  it("require: a quiz that declares too little gets one finding at its type_order line, or line 1", () => {
    const body = S("a");
    expect(lines(mk("", body), { require: "by-section" })).toEqual([1]);
    expect(run(mk("", body), { require: "by-section" })[0]).toMatchObject({
      message: "this profile requires `type_order: by-section`; the quiz declares none",
      fix: "add `type_order: by-section` to the front matter",
    });
    expect(lines(mk("type_order: none", body), { require: "by-quiz" })).toEqual([3]);
    expect(lines(mk("type_order: by-section", body), { require: "by-quiz" })).toEqual([3]);
    expect(lines(mk("type_order: by-section", body), { require: "by-section" })).toEqual([]);
    expect(lines(mk("type_order: by-quiz", body), { require: "by-section" })).toEqual([]);
    expect(lines(mk("type_order: by-quiz", body), { require: "by-quiz" })).toEqual([]);
  });

  it("refuses a bad require", () => {
    expect(rule.options.safeParse({ require: "always" }).success).toBe(false);
    expect(rule.options.safeParse({ require: "by-quiz" }).success).toBe(true);
  });
});
