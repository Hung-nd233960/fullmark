import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../src/core/parse";
import { SKELETON_RULES, SKELETON_TITLE, skeleton, withoutIdentity, withQuizId } from "../src/core/skeleton";

const root = resolve(import.meta.dirname, "..");
const rules = (text: string): string[] => parse(text, "quiz.md").issues.map((i) => i.rule);

describe("withoutIdentity: the same quiz with no id of its own", () => {
  const quiz = [
    "---",
    "title: Signals",
    "id: signals-week-3",
    "lang: en",
    "---",
    "",
    "# Part one {id=part-one time=10m}",
    "",
    "## What is $x$? {type=single id=q-abc123 points=2 tags=a}",
    "",
    "- [x] one",
    "- [ ] two",
    "",
    "## Another. {id=roc type=truefalse}",
    "",
    "```answer",
    "value: true",
    "```",
    "",
  ].join("\n");

  it("drops the front matter's id and every question's id, and keeps a section's", () => {
    const out = withoutIdentity(quiz);
    expect(out).not.toContain("signals-week-3");
    expect(out).toContain("# Part one {id=part-one time=10m}");
    expect(out).toContain("## What is $x$? {type=single points=2 tags=a}");
    expect(out).toContain("## Another. {type=truefalse}");
    expect(out).toContain("---\ntitle: Signals\nlang: en\n---");
  });

  it("changes nothing else, byte for byte: CRLF and a BOM stay", () => {
    const crlf = `﻿${quiz.replaceAll("\n", "\r\n")}`;
    const out = withoutIdentity(crlf);
    expect(out.startsWith("﻿---\r\ntitle: Signals\r\nlang: en\r\n---\r\n")).toBe(true);
    expect(out.replaceAll("\r\n", "\n")).toBe(`\ufeff${withoutIdentity(quiz)}`);
  });

  it("a quiz with no ids is returned as it is", () => {
    const plain = "---\ntitle: T\n---\n\n## Q {type=single}\n\n- [x] a\n- [ ] b\n";
    expect(withoutIdentity(plain)).toBe(plain);
    expect(withoutIdentity(withoutIdentity(quiz))).toBe(withoutIdentity(quiz));
  });

  it("an id key inside a block scalar or a comment is not the quiz's id", () => {
    const text =
      "---\ntitle: T\ndescription: |\n  id: not this\n# id: nor this\nid: this-one\n---\n\n## Q {type=single}\n\n- [x] a\n- [ ] b\n";
    const out = withoutIdentity(text);
    expect(out).toContain("  id: not this");
    expect(out).toContain("# id: nor this");
    expect(out).not.toContain("this-one");
  });
});

const FULL = [
  "---",
  "title: Everything",
  "description: |",
  "  A long description",
  "  over two lines.",
  "id: everything",
  "lang: en",
  "time_limit: 30m",
  "generated_by: claude-x",
  "materials:",
  "  - materials/formulas.md",
  "tags: [a, b]",
  "---",
  "",
  "# Reading {id=reading time=20m pick=2}",
  "",
  "Read the text, then answer.",
  "",
  "::: passage",
  "The Fourier transform was first used...",
  ":::",
  "",
  '## Which one? {type=single id=s1 points=2 tags=t1,t2 source="Lecture 4"}',
  "",
  "More of the prompt.",
  "",
  '- [ ] first {input="Why?"}',
  "- [x] second",
  "- [ ] third",
  "",
  "::: hint",
  "A hint.",
  ":::",
  "",
  "::: explanation",
  "Because.",
  ":::",
  "",
  "## Pick all. {type=multi id=m1}",
  "",
  "- [x] a",
  "- [x] b",
  "",
  "## True? {type=truefalse id=t1}",
  "",
  "```answer",
  "value: true",
  "```",
  "",
  "## Number {type=numeric id=n1}",
  "",
  "```answer",
  "value: 2",
  "tolerance: 0.1",
  "unit: m",
  "```",
  "",
  "## Short {type=short id=h1}",
  "",
  "```answer",
  "accept: [one, two]",
  "```",
  "",
  "## Fill [[a|b]] and [[=1±0.1]] {type=blanks id=b1}",
  "",
  "More [[c]].",
  "",
  "## Fields {type=fields id=f1 points=3}",
  "",
  "```answer",
  "fields:",
  '  - label: "X ($x$)"',
  "    value: 3",
  "    points: 2",
  "  - label: Name",
  "    accept: [bob]",
  "    points: 1",
  "  - label: Note",
  "```",
  "",
  "# Written {id=written}",
  "",
  "## Order {type=ordering id=o1}",
  "",
  "1. one",
  "2. two",
  "3. three",
  "",
  "## Match {type=matching id=g1 points=3}",
  "",
  "- a :: 1",
  "- b :: 2",
  "- :: 3",
  "",
  "## Essay {type=essay id=e1 points=6}",
  "",
  "```answer",
  "min_words: 120",
  "max_words: 0",
  "rubric:",
  "  mode: additive",
  "  criteria:",
  "    - Defines it (3 pts)",
  "    - Concludes (3 pts)",
  "sample_answer: |",
  "  A model answer.",
  "```",
  "",
  "## Code {type=code id=c1 points=3}",
  "",
  "```answer",
  "language: rust",
  "starter: |",
  "  fn f() {}",
  "rubric:",
  "  - Works",
  "  - Is short",
  "sample_answer: |",
  "  fn f() {}",
  "```",
  "",
  "## Scale {type=scale id=k1}",
  "",
  "```answer",
  "min: 1",
  "max: 5",
  "```",
  "",
].join("\n");

describe("skeleton: the structure kept, the content emptied (QUIZ_SYNTAX.md, section 9)", () => {
  const out = skeleton(FULL);

  it("front matter: kept except title (a placeholder), description, id, generated_by and the materials", () => {
    expect(out.split("\n").slice(0, 7)).toEqual([
      "---",
      `title: ${JSON.stringify(SKELETON_TITLE)}`,
      "lang: en",
      "time_limit: 30m",
      "tags: [a, b]",
      "---",
      "",
    ]);
    expect(out).not.toMatch(/everything|description|generated_by|materials|A long/);
  });

  it("sections: title, id, time, pick and instructions kept; the passage emptied", () => {
    expect(out).toContain("# Reading {id=reading time=20m pick=2}\n\nRead the text, then answer.\n\n::: passage\n:::");
    expect(out).not.toContain("Fourier");
    expect(out).toContain("# Written {id=written}");
  });

  it("questions: the attributes kept except id and source; prompt, hint and explanation gone", () => {
    expect(out).toContain("## {type=single points=2 tags=t1,t2}");
    expect(out).toContain("## {type=multi}");
    expect(out).not.toMatch(/Which one|More of the prompt|A hint|Because|Lecture 4/);
    expect(out).not.toMatch(/^## .*id=/m);
    expect(out).not.toContain("::: hint");
    expect(out).not.toContain("::: explanation");
  });

  it("choices: the number kept, every [x] cleared, the text gone, a follow-up kept as {input}", () => {
    expect(out).toContain("## {type=single points=2 tags=t1,t2}\n\n- [ ] {input}\n- [ ]\n- [ ]\n");
    expect(out).toContain("## {type=multi}\n\n- [ ]\n- [ ]\n");
  });

  it("true/false, numeric, short: the key emptied, the unit kept", () => {
    expect(out).toContain("## {type=truefalse}\n\n```answer\n```");
    expect(out).toContain("## {type=numeric}\n\n```answer\nvalue:\nunit: m\n```");
    expect(out).toContain("## {type=short}\n\n```answer\naccept: []\n```");
    expect(out).not.toContain("tolerance");
  });

  it("blanks: the number and kind of the blanks kept, everything else gone", () => {
    expect(out).toContain("## {type=blanks}\n\n[[]] [[=]] [[]]\n");
  });

  it("fields: labels and points kept, the keys emptied, an ungraded field stays ungraded", () => {
    expect(out).toContain(
      [
        "fields:",
        '  - label: "X ($x$)"',
        "    value:",
        "    points: 2",
        '  - label: "Name"',
        "    accept: []",
        "    points: 1",
        '  - label: "Note"',
      ].join("\n"),
    );
  });

  it("ordering and matching: the length kept, a pair told from a distractor", () => {
    expect(out).toContain("## {type=ordering}\n\n1.\n2.\n3.\n");
    expect(out).toContain("## {type=matching points=3}\n\n- ? ::\n- ? ::\n- ::\n");
  });

  it("rubrics kept whole, the sample answer and the starter gone", () => {
    expect(out).toContain(
      "min_words: 120\nmax_words: 0\nrubric:\n  mode: additive\n  criteria:\n    - Defines it (3 pts)\n    - Concludes (3 pts)\n```",
    );
    expect(out).toContain("language: rust\nrubric:\n  - Works\n  - Is short\n```");
    expect(out).not.toMatch(/sample_answer|starter|model answer|fn f/);
  });

  it("scale: kept whole", () => {
    expect(out).toContain("## {type=scale}\n\n```answer\nmin: 1\nmax: 5\n```");
  });

  it("fails check by design: an error for each emptied field and no other", () => {
    const found = rules(out);
    expect(found.filter((r) => r === "question.id-missing")).toHaveLength(12);
    expect(found.filter((r) => r === "question.prompt-empty")).toHaveLength(12);
    expect(found.filter((r) => !SKELETON_RULES.has(r))).toEqual([]);
    expect(parse(out, "quiz.md").quiz).toBeNull();
  });
});

describe("skeleton of every example", () => {
  const dir = join(root, "examples");
  for (const name of readdirSync(dir).filter((n) => existsSync(join(dir, n, "quiz.md")))) {
    it(name, () => {
      const source = readFileSync(join(dir, name, "quiz.md"), "utf8");
      const questions = (source.match(/^## /gm) ?? []).length;
      const found = rules(skeleton(source));
      expect(found.filter((r) => r === "question.prompt-empty")).toHaveLength(questions);
      expect(found.filter((r) => r === "question.id-missing")).toHaveLength(questions);
      expect(found.filter((r) => !SKELETON_RULES.has(r))).toEqual([]);
    });
  }
});

describe("withQuizId: a fresh quiz id after the front matter's last key", () => {
  const text = "---\ntitle: T\ntime_limit: 5m\n---\n\n## Q {type=single id=q}\n\n- [x] a\n- [ ] b\n";
  it("adds the id and changes nothing else", () => {
    const out = withQuizId(text, "demo");
    expect(out).toBe(text.replace("time_limit: 5m\n", "time_limit: 5m\nid: demo\n"));
    expect(parse(out, "quiz.md").quiz?.frontMatter.id).toBe("demo");
  });
  it("keeps CRLF line endings and leaves a quiz that has an id alone", () => {
    const crlf = text.replaceAll("\n", "\r\n");
    expect(withQuizId(crlf, "demo")).toContain("time_limit: 5m\r\nid: demo\r\n---");
    const has = text.replace("title: T", "title: T\nid: mine");
    expect(withQuizId(has, "demo")).toBe(has);
  });
  it("goes before blank lines that end the front matter", () => {
    const gap = text.replace("5m\n---", "5m\n\n---");
    expect(withQuizId(gap, "demo")).toContain("5m\nid: demo\n\n---");
  });
});
