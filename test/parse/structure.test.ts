import { describe, expect, it } from "vitest";
import { found, parseBody } from "./helpers";

const Q = (id: string) => `## Q ${id} {type=single id=${id}}\n\n- [x] a\n- [ ] b`;

describe("sections", () => {
  it("makes one untitled section of a quiz with no # heading", () => {
    const quiz = parseBody(Q("a")).quiz;
    expect(quiz?.sections).toHaveLength(1);
    expect(quiz?.sections[0]).toMatchObject({ title: null, id: "", intro: "", passages: [] });
  });

  it("reads title, slugged id, id=, time and pick", () => {
    const quiz = parseBody(
      `# Part 2: Reading {id=reading time=20m pick=1}\n\n${Q("a")}\n\n${Q("b")}\n\n# Đạo hàm\n\n${Q("c")}`,
    ).quiz;
    expect(quiz?.sections.map((s) => [s.title, s.id, s.time, s.pick])).toEqual([
      ["Part 2: Reading", "reading", 1200, 1],
      ["Đạo hàm", "dao-ham", null, null],
    ]);
  });

  it("keeps the intro as Markdown, without its passages", () => {
    const quiz = parseBody(
      `# Reading {id=reading}\n\nRead the text, then answer.\n\n::: passage\nThe Fourier transform was first used...\n\nA second paragraph.\n:::\n\nGood luck.\n\n${Q("a")}`,
    ).quiz;
    const s = quiz?.sections[0];
    expect(s?.intro).toBe("Read the text, then answer.\n\nGood luck.");
    expect(s?.passages).toEqual([{ line: 10, text: "The Fourier transform was first used...\n\nA second paragraph." }]);
  });

  it("reports a duplicate section id at the second one, and a bad pick", () => {
    expect(found(`# P {id=p}\n\n${Q("a")}\n\n# O {id=p}\n\n${Q("b")}`)).toEqual(["section.id-duplicate@12"]);
    expect(found(`# Bank {pick=0}\n\n${Q("a")}`)).toEqual(["section.pick@5"]);
    expect(found(`# Bank {pick=2}\n\n${Q("a")}`)).toEqual(["section.pick@5"]);
    expect(found(`# Bank {pick=1}\n\n${Q("a")}`)).toEqual([]);
    expect(found(`# Bank {pick=x}\n\n${Q("a")}`)).toEqual(["syntax.value@5"]);
    expect(found(`# Bank {time=soon}\n\n${Q("a")}`)).toEqual(["syntax.value@5"]);
  });

  it("does not give a suffix to two sections with the same title: it is an error", () => {
    expect(found(`# Part\n\n${Q("a")}\n\n# Part\n\n${Q("b")}`)).toEqual(["section.id-duplicate@12"]);
  });

  it("reports text between the front matter and the first heading", () => {
    expect(found(`Some words first.\n\n${Q("a")}`)).toEqual(["syntax.preamble@5"]);
    expect(found(`\n\n\n# Part\n\n${Q("a")}`)).toEqual([]);
  });

  it("reports a quiz with no question at line 1", () => {
    expect(found("# Part\n\nJust an intro.")).toEqual(["quiz.empty@1"]);
    expect(found("")).toEqual(["quiz.empty@1"]);
  });
});

describe("containers", () => {
  it("reads hint and explanation, with their lines", () => {
    const q = parseBody(`${Q("a")}\n\n::: hint\nThink.\n:::\n\n::: explanation\nBecause $x$.\n\n- one\n:::`).quiz
      ?.sections[0]?.questions[0];
    expect(q?.hint).toEqual({ line: 11, text: "Think." });
    expect(q?.explanation).toEqual({ line: 15, text: "Because $x$.\n\n- one" });
    expect(q?.prompt).toBe("Q a");
  });

  it("reports a second hint or explanation", () => {
    expect(found(`${Q("a")}\n\n::: hint\n1\n:::\n\n::: hint\n2\n:::`)).toEqual(["question.container-twice@14"]);
  });

  it("reports an unknown, an unclosed and a misplaced container", () => {
    expect(found(`${Q("a")}\n\n::: note\nx\n:::`)).toEqual(["syntax.container@10"]);
    expect(found(`${Q("a")}\n\n::: hint\nnever closed`)).toEqual(["syntax.container@10"]);
    expect(found(`# P\n\n${Q("a")}\n\n::: passage\nx\n:::`)).toEqual(["syntax.container@12"]);
    expect(found(`# P\n\n::: hint\nx\n:::\n\n${Q("a")}`)).toEqual(["syntax.container@7"]);
    expect(found(`${Q("a")}\n\n:::`)).toEqual(["syntax.container@10"]);
  });

  it("does not let an unclosed container swallow the questions after it", () => {
    const result = parseBody(`${Q("a")}\n\n::: hint\nnever closed\n\n${Q("b")}`);
    expect(result.issues.map((i) => i.rule)).toEqual(["syntax.container"]);
  });

  it("does not read a heading inside a closed container as a question", () => {
    const result = parseBody(`${Q("a")}\n\n::: explanation\n## not a question\n:::`);
    expect(result.issues).toEqual([]);
    expect(result.quiz?.sections[0]?.questions).toHaveLength(1);
  });
});

describe("raw HTML and assets", () => {
  it("reports any HTML tag or comment, in a block or inline", () => {
    expect(found(`${Q("a")}\n\n<div>Hi</div>`)).toEqual(["markdown.raw-html@10"]);
    expect(found(`${Q("a")}\n\n<!-- a note -->`)).toEqual(["markdown.raw-html@10"]);
    expect(found(`## Q {type=short id=q}\n\nA <b>bold</b> word.\n\n\`\`\`answer\naccept: [x]\n\`\`\``)).toEqual([
      "markdown.raw-html@7",
      "markdown.raw-html@7",
    ]);
  });

  it("does not report angle brackets in maths, code or fences", () => {
    expect(
      found(
        "## Is $a<b>c$ true? {type=truefalse id=q}\n\n`<div>` and\n\n```html\n<p>x</p>\n```\n\n```answer\nvalue: true\n```",
      ),
    ).toEqual([]);
  });

  it("collects the images with their lines, audio included", () => {
    const result = parseBody(
      "## Look {type=single id=q}\n\n![chart](assets/c.png){width=300}\n\n![Track 1](track1.mp3)\n\n- [x] a\n- [ ] b",
    );
    expect(result.assets).toEqual([
      { path: "assets/c.png", line: 7 },
      { path: "track1.mp3", line: 9 },
    ]);
  });

  it("decodes a percent-encoded path", () => {
    const result = parseBody("## Look {type=single id=q}\n\n![x](my%20file.png)\n\n- [x] a\n- [ ] b");
    expect(result.assets[0]?.path).toBe("my file.png");
  });
});
