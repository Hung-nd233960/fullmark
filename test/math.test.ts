import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lazyParseTex } from "../src/build/tex";
import { checkFile } from "../src/cli/check";
import { parse } from "../src/core/parse";
import { mathParts } from "../src/core/parse/tex";
import { capture } from "./helpers/cli";

const quiz = (body: string) => `---\ntitle: T\n---\n\n## Q {type=single id=q}\n\n${body}\n\n- [x] a\n- [ ] b\n`;
const opts = { profile: null, config: null, strict: false, review: null, json: true, plain: true };

describe("mathParts", () => {
  it("strips the dollar signs and tells display from inline", () => {
    expect(mathParts("$x^2$")).toEqual({ tex: "x^2", display: false });
    expect(mathParts("$$x^2$$")).toEqual({ tex: "x^2", display: true });
    expect(mathParts("$$\nx^2\n$$\n")).toEqual({ tex: "x^2", display: true });
  });
});

describe("math.syntax", () => {
  const parseTex = lazyParseTex();
  const rules = (text: string) =>
    parse(text, "q.md", { parseTex }).issues.map((i) => `${i.rule}@${i.line}: ${i.message}`);

  it("is raised for each span KaTeX rejects, at the span's line, with KaTeX's message and no prefix", () => {
    const issues = rules(quiz("Good $x^2$ and bad $\\nosuchmacro$.\nNext $\\frac{1}$ line."));
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatch(/^math\.syntax@7: the maths does not parse: Undefined control sequence: \\nosuchmacro/);
    expect(issues[0]).not.toContain("KaTeX parse error");
    expect(issues[1]).toMatch(/^math\.syntax@8: /);
  });

  it("checks display maths, and maths in a choice and in a table cell", () => {
    expect(rules(quiz("$$\n\\badmacro\n$$"))).toEqual([expect.stringMatching(/^math\.syntax@7: /)]);
    expect(rules(quiz("| a |\n|---|\n| $\\badmacro$ |"))).toEqual([expect.stringMatching(/^math\.syntax@9: /)]);
    expect(rules(quiz("x").replace("- [ ] b", "- [ ] $\\badmacro$"))).toEqual([
      expect.stringMatching(/^math\.syntax@10:/),
    ]);
  });

  it("leaves code, dollar prices and valid maths alone", () => {
    expect(rules(quiz("It costs $5 and $6. Code `$\\badmacro$` and\n\n```\n$\\badmacro$\n```"))).toEqual([]);
    expect(rules(quiz("Fine: $\\frac{a}{b} + \\sqrt{2}$ and $$\\int_0^1 x\\,dx$$"))).toEqual([]);
  });

  it("is not raised when no parser is given", () => {
    expect(parse(quiz("$\\badmacro$"), "q.md").issues).toEqual([]);
  });
});

describe("KaTeX loads only for maths", () => {
  const folder = mkdtempSync(join(tmpdir(), "fm-math-"));
  mkdirSync(join(folder, "materials"));
  writeFileSync(join(folder, "plain.md"), quiz("No maths here, only `code` and $5 prices."));
  writeFileSync(join(folder, "maths.md"), quiz("With $x^2$."));
  writeFileSync(
    join(folder, "sheet.md"),
    "---\ntitle: T\nmaterials:\n  - materials/s.md\n---\n\n## Q {type=single id=q}\n\n- [x] a\n- [ ] b\n",
  );
  writeFileSync(join(folder, "materials", "s.md"), "# S\n\nBad $\\oops$.\n");

  const run = (file: string) => {
    let loads = 0;
    const parseTex = lazyParseTex(() => {
      loads++;
      return { renderToString: () => "" };
    });
    const c = capture(folder);
    const r = checkFile(file, opts, { ...c.io, parseTex });
    return { loads, r };
  };

  it("does not load the module for a quiz without maths", () => {
    const { loads, r } = run("plain.md");
    expect(loads).toBe(0);
    expect(r.status).toBe("ok");
  });

  it("loads it once for a quiz with maths", () => {
    expect(run("maths.md").loads).toBe(1);
  });

  it("checks a sheet's maths through the quiz, at the sheet's line", () => {
    const c = capture(folder);
    const r = checkFile("sheet.md", opts, c.io);
    expect(r.status).toBe("failed");
    if (r.status === "error") throw new Error("unexpected");
    expect(r.issues.map((i) => `${i.rule}@${i.file}:${i.line}`)).toEqual(["math.syntax@materials/s.md:3"]);
  });
});
