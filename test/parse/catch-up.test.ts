import { describe, expect, it } from "vitest";
import { found, oneQuestion, parseBody } from "./helpers";

const CHOICES = "- [x] a\n- [ ] b";

describe("question.trailing-text", () => {
  it("allows a hint and an explanation after the choices, in either order", () => {
    expect(found(`## Q {type=single id=q}\n\n${CHOICES}\n\n::: explanation\nE\n:::\n\n::: hint\nH\n:::`)).toEqual([]);
  });

  it("reports text after the choices, and keeps it out of the prompt", () => {
    expect(found(`## Q {type=single id=q}\n\n${CHOICES}\n\nMore words.`)).toEqual(["question.trailing-text@10"]);
  });

  it("reports text between the answer block and the explanation", () => {
    const body = "## Q {type=numeric id=q}\n\n```answer\nvalue: 1\n```\n\nOops.\n\n::: explanation\nE\n:::";
    expect(found(body)).toEqual(["question.trailing-text@11"]);
  });

  it("keeps the prompt to what comes before the answer", () => {
    const q = oneQuestion(`## Q {type=single id=q}\n\nBefore.\n\n${CHOICES}`);
    expect(q.prompt).toBe("Q\n\nBefore.");
  });

  it("does not also report raw HTML after the answer as trailing text", () => {
    expect(found(`## Q {type=single id=q}\n\n${CHOICES}\n\n<div>x</div>`)).toEqual(["markdown.raw-html@10"]);
  });
});

describe("asset.alt", () => {
  it("reports an image without alt text, and one with blank alt text", () => {
    expect(found(`## Q {type=single id=q}\n\n![](a.png)\n\n${CHOICES}`)).toEqual(["asset.alt@7"]);
    expect(found(`## Q {type=single id=q}\n\n![ ](a.png)\n\n${CHOICES}`)).toEqual(["asset.alt@7"]);
  });

  it("accepts alt text, and an image inside a code span is not an image", () => {
    expect(found(`## Q {type=single id=q}\n\n![chart](a.png) and \`![](b.png)\`\n\n${CHOICES}`)).toEqual([]);
  });
});

describe("syntax.preamble for a question before the first section", () => {
  it("reports it when the quiz has sections", () => {
    expect(found(`## A {type=single id=a}\n\n${CHOICES}\n\n# Part\n\n## B {type=single id=b}\n\n${CHOICES}`)).toEqual([
      "syntax.preamble@5",
    ]);
  });

  it("accepts a quiz with no sections at all", () => {
    expect(found(`## A {type=single id=a}\n\n${CHOICES}`)).toEqual([]);
  });
});

describe("one passage per section", () => {
  it("reports the second as syntax.container, on its own line", () => {
    const body = `# S\n\n::: passage\nOne\n:::\n\n::: passage\nTwo\n:::\n\n## Q {type=single id=q}\n\n${CHOICES}`;
    expect(found(body)).toEqual(["syntax.container@11"]);
    expect(parseBody(`# S\n\n::: passage\nOne\n:::\n\n## Q {type=single id=q}\n\n${CHOICES}`).quiz).not.toBeNull();
  });
});

describe("fields.empty for a graded question with no graded field", () => {
  it("reports it at the heading", () => {
    const body = "## Q {type=fields id=q}\n\n```answer\nfields:\n  - label: Notes\n```";
    expect(found(body)).toEqual(["fields.empty@5"]);
  });

  it("allows it when ungraded", () => {
    const body = "## Q {type=fields id=q graded=false}\n\n```answer\nfields:\n  - label: Notes\n```";
    expect(found(body)).toEqual([]);
  });
});
