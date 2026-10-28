import { describe, expect, it } from "vitest";
import { blanksInLinkText, parseBlankBody, scanBlanks } from "../../src/core/parse/blanks";
import { parseTaskMarker } from "../../src/core/parse/task-list";

describe("parseBlankBody", () => {
  it("reads a text blank with variants", () => {
    expect(parseBlankBody("cos x|cos(x)")).toEqual({ kind: "text", answers: ["cos x", "cos(x)"] });
    expect(parseBlankBody(" mut ")).toEqual({ kind: "text", answers: ["mut"] });
  });

  it("reads a numeric blank with ± or +- for the tolerance", () => {
    expect(parseBlankBody("=0.5±0.01")).toEqual({ kind: "numeric", value: 0.5, raw: "0.5", tolerance: 0.01 });
    expect(parseBlankBody("=0.5+-0.01")).toEqual({ kind: "numeric", value: 0.5, raw: "0.5", tolerance: 0.01 });
    expect(parseBlankBody("=-2")).toEqual({ kind: "numeric", value: -2, raw: "-2", tolerance: 0 });
    expect(parseBlankBody("=1e-3 ± 1e-4")).toMatchObject({ value: 0.001, tolerance: 0.0001 });
    expect(parseBlankBody("=1/3")).toMatchObject({ raw: "1/3" });
  });

  it("refuses an empty variant, a non-number and a negative tolerance", () => {
    expect(typeof parseBlankBody("a||b")).toBe("string");
    expect(typeof parseBlankBody("")).toBe("string");
    expect(typeof parseBlankBody("=abc")).toBe("string");
    expect(typeof parseBlankBody("=1±x")).toBe("string");
    expect(typeof parseBlankBody("=1±-0.1")).toBe("string");
    expect(typeof parseBlankBody("=")).toBe("string");
  });
});

describe("scanBlanks", () => {
  it("finds blanks with their lines", () => {
    const scan = scanBlanks("one [[a]]\ntwo [[=1±0.1]] and [[b|c]]", 10);
    expect(scan.problems).toEqual([]);
    expect(scan.blanks.map((b) => [b.kind, b.line])).toEqual([
      ["text", 10],
      ["numeric", 11],
      ["text", 11],
    ]);
  });

  it("skips code spans", () => {
    const scan = scanBlanks("the array `a[[0]]` and [[x]]", 1);
    expect(scan.blanks).toHaveLength(1);
    expect(scan.problems).toEqual([]);
  });

  it("reports a blank inside maths", () => {
    const scan = scanBlanks("Solve $a + [[b]]$ now.", 7);
    expect(scan.problems).toEqual([{ rule: "blanks.in-math", line: 7, message: expect.any(String) }]);
    expect(scan.blanks).toEqual([]);
  });

  it("reports any [[ in a display-maths block", () => {
    expect(scanBlanks("$$\nA[[i]]\n$$", 3, "math").problems.map((p) => p.rule)).toEqual(["blanks.in-math"]);
  });

  it("reports a blank that is never closed, and a malformed one", () => {
    expect(scanBlanks("A [[b is never closed.", 5).problems.map((p) => p.rule)).toEqual(["blanks.syntax"]);
    expect(scanBlanks("A [[=oops]] here", 5).problems.map((p) => p.rule)).toEqual(["blanks.syntax"]);
  });

  it("finds blanks inside fenced code, where nothing is skipped", () => {
    const scan = scanBlanks("let [[mut]] v = `x`;\n", 4, "code");
    expect(scan.blanks).toHaveLength(1);
  });
});

describe("parseTaskMarker", () => {
  it("reads [ ] and [x] (and [X]) and returns the text", () => {
    expect(parseTaskMarker("[ ] a")).toEqual({ checked: false, rest: "a" });
    expect(parseTaskMarker("[x] b")).toEqual({ checked: true, rest: "b" });
    expect(parseTaskMarker("[X] c")).toEqual({ checked: true, rest: "c" });
  });

  it("keeps the rest of a multi-line item", () => {
    expect(parseTaskMarker("[x] a\n  more")).toEqual({ checked: true, rest: "a\n  more" });
  });

  it("is null without a marker, or without a space after it", () => {
    expect(parseTaskMarker("plain")).toBeNull();
    expect(parseTaskMarker("[x]a")).toBeNull();
    expect(parseTaskMarker("[y] a")).toBeNull();
    expect(parseTaskMarker("[] a")).toBeNull();
  });
});

describe("escaped and linked blanks", () => {
  it("reads \\[[ as text", () => {
    expect(scanBlanks("a \\[[x]] b", 1).blanks).toEqual([]);
    expect(scanBlanks("a \\\\[[x]] b", 1).blanks).toHaveLength(1);
    expect(scanBlanks("a \\[[x]] [[y]]", 1).blanks).toHaveLength(1);
  });

  it("keeps a backslash in code literal", () => {
    expect(scanBlanks("\\[[x]]", 1, "code").blanks).toHaveLength(1);
  });

  it("finds blanks inside link text and alt text", () => {
    const hit = (t: string) => blanksInLinkText(t, scanBlanks(t, 1));
    expect(hit("a [see [[x]] here](u.md) [[y]]")).toEqual([0]);
    expect(hit("![alt [[x]]](p.png) and [[y]]")).toEqual([0]);
    expect(hit("plain [[x]] and [[y]]")).toEqual([]);
  });
});
