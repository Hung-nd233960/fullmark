import { describe, expect, it } from "vitest";
import { findSpans, lineAt, matchCodeSpan, matchMath, spanAt } from "../../src/core/parse/spans";

describe("matchMath", () => {
  it("finds inline and display maths", () => {
    expect(matchMath("$x$ end", 0)).toBe(3);
    expect(matchMath("$$x^2$$ end", 0)).toBe(7);
    expect(matchMath("a $\\frac{1}{2}$ b", 2)).toBe(15);
  });

  it("does not treat currency as maths", () => {
    expect(matchMath("costs $5 and $6", 6)).toBe(-1);
    expect(matchMath("$ x$", 0)).toBe(-1);
    expect(matchMath("$x $", 0)).toBe(-1);
  });

  it("skips an escaped dollar inside maths", () => {
    expect(matchMath("$a\\$b$", 0)).toBe(6);
  });

  it("needs a closing dollar", () => {
    expect(matchMath("$x", 0)).toBe(-1);
    expect(matchMath("$$x$", 0)).toBe(-1);
  });
});

describe("matchCodeSpan", () => {
  it("matches backtick runs of the same length", () => {
    expect(matchCodeSpan("`a`", 0)).toBe(3);
    expect(matchCodeSpan("``a`b``", 0)).toBe(7);
    expect(matchCodeSpan("`a", 0)).toBe(-1);
  });
});

describe("findSpans", () => {
  it("lists code and maths in order, and ignores escaped openers", () => {
    const text = "see `f{x}` and $\\{1, 2\\}$ and \\$5 and \\`no`";
    const spans = findSpans(text);
    expect(spans.map((s) => s.kind)).toEqual(["code", "math"]);
    expect(text.slice(spans[0]?.start, spans[0]?.end)).toBe("`f{x}`");
  });

  it("spanAt finds the span holding a position", () => {
    const spans = findSpans("a `b` c");
    expect(spanAt(spans, 3)?.kind).toBe("code");
    expect(spanAt(spans, 0)).toBeUndefined();
    expect(spanAt(spans, 5)).toBeUndefined();
  });
});

describe("lineAt", () => {
  it("counts newlines before the offset", () => {
    expect(lineAt("a\nb\nc", 4, 10)).toBe(12);
    expect(lineAt("abc", 2, 7)).toBe(7);
  });
});
