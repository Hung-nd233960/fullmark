import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSheet } from "../../src/core/parse/sheet";

const rules = (text: string) => parseSheet(text, "materials/s.md").issues.map((i) => `${i.rule}@${i.line}`);

describe("parseSheet", () => {
  it("reads a sheet: its name, its text, its images", () => {
    const text =
      "# Formulas $x^2$\n\nSome text.\n\n## Area\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n### Circle\n\n![z](../assets/z.png)\n";
    const sheet = parseSheet(text, "materials/s.md");
    expect(sheet.issues).toEqual([]);
    expect(sheet.name).toBe("Formulas $x^2$");
    expect(sheet.source).toBe(text);
    expect(sheet.assets).toEqual([{ path: "../assets/z.png", line: 13 }]);
  });

  it("carries the sheet's path on every issue", () => {
    const issues = parseSheet("text first\n", "materials/s.md").issues;
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.file === "materials/s.md")).toBe(true);
  });

  it("reads a BOM and CRLF the same as LF", () => {
    const sheet = parseSheet("\uFEFF# Name\r\n\r\nBody.\r\n", "s.md");
    expect(sheet.issues).toEqual([]);
    expect(sheet.name).toBe("Name");
  });

  it("does not take a leading --- for front matter", () => {
    expect(rules("---\n\n# Name\n\nBody.\n")).toEqual(["materials.heading@1"]);
  });

  describe("materials.heading", () => {
    it("is raised when the sheet does not start with a # heading", () => {
      expect(rules("Some text.\n\n# Name\n")).toEqual(["materials.heading@1"]);
      expect(rules("\n\n## Name\n\nBody.\n")).toEqual(["materials.heading@3"]);
      expect(rules("")).toEqual(["materials.heading@1"]);
    });

    it("is raised for a second # heading, at its line", () => {
      expect(rules("# One\n\nBody.\n\n# Two\n\nMore.\n")).toEqual(["materials.heading@5"]);
    });

    it("lets ## to ###### follow", () => {
      expect(rules("# One\n\n## Two\n\n### Three\n\n#### Four\n\n###### Six\n\nBody.\n")).toEqual([]);
      const fixture = readFileSync(join(import.meta.dirname, "../fixtures/valid/materials/deep.md"), "utf8");
      expect(rules(fixture)).toEqual([]);
    });

    it("takes an underlined heading for text", () => {
      expect(rules("Name\n====\n\nBody.\n")).toEqual(["materials.heading@1"]);
    });
  });

  describe("materials.empty", () => {
    it("is a warning for a heading with nothing after it", () => {
      const issues = parseSheet("# Name\n\n\n", "s.md").issues;
      expect(issues.map((i) => [i.rule, i.level, i.line])).toEqual([["materials.empty", "warning", 1]]);
    });

    it("is not raised when there is text", () => {
      expect(rules("# Name\n\nx\n")).toEqual([]);
    });
  });

  describe("materials.question", () => {
    it("finds a {type=…} attribute", () => {
      expect(rules("# Name\n\n## Q {type=single id=q}\n\nBody.\n")).toEqual(["materials.question@3"]);
    });

    it("finds a choice marked [x] or [ ], in a list or numbered", () => {
      expect(rules("# Name\n\n- [x] a\n- [ ] b\n")).toEqual(["materials.question@3", "materials.question@4"]);
      expect(rules("# Name\n\n1. [X] a\n")).toEqual(["materials.question@3"]);
    });

    it("leaves an ordinary list and brackets in code alone", () => {
      expect(rules("# Name\n\n- a\n- [link](x.md)\n\n```\n- [x] not a choice\n```\n")).toEqual([]);
    });

    it("finds an answer block", () => {
      expect(rules("# Name\n\nBody.\n\n```answer\nvalue: 1\n```\n")).toEqual(["materials.question@5"]);
    });

    it("finds a blank outside code, in a table cell too, and not inside code", () => {
      expect(rules("# Name\n\nA [[b]] here.\n")).toEqual(["materials.question@3"]);
      expect(rules("# Name\n\n| a | b |\n|---|---|\n| [[x]] | 2 |\n")).toEqual(["materials.question@5"]);
      expect(rules("# Name\n\nUse `a[[0]]` and\n\n```\nlet [[x]] = 1;\n```\n")).toEqual([]);
    });

    it("allows maths and images, and says how to write an example", () => {
      expect(rules("# Name\n\n$$a = \frac12$$\n\n![chart](a.png)\n")).toEqual([]);
      expect(parseSheet("# N\n\n[[x]]\n", "s.md").issues[0]?.fix).toContain("write the example as text");
    });
  });

  describe("the Markdown rules of a quiz", () => {
    it("refuses raw HTML and an image without alt text", () => {
      expect(rules("# Name\n\nA <b>word</b>.\n")).toContain("markdown.raw-html@3");
      expect(rules("# Name\n\n![](a.png)\n")).toEqual(["asset.alt@3"]);
    });

    it("refuses containers", () => {
      expect(rules("# Name\n\n::: hint\nx\n:::\n")).toEqual(["syntax.container@3"]);
      expect(rules("# Name\n\n:::\n")).toEqual(["syntax.container@3"]);
    });
  });
});
