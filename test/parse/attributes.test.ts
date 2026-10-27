import { describe, expect, it } from "vitest";
import { findTrailingBlock, parseAttributes } from "../../src/core/parse/attributes";

/** Parses what is between the braces of a one-line `{…}`. */
function attrs(inner: string) {
  const result = parseAttributes(inner, 0, inner.length);
  if (!result.ok) return result;
  return result.pairs.map((p) => [p.name, p.value]);
}

describe("parseAttributes: the grammar of QUIZ_SYNTAX.md section 4", () => {
  it("reads name=value pairs separated by spaces", () => {
    expect(attrs("type=single points=2 tags=a,b id=roc-causal")).toEqual([
      ["type", "single"],
      ["points", "2"],
      ["tags", "a,b"],
      ["id", "roc-causal"],
    ]);
  });

  it("reads a quoted value with spaces, =, braces and the two escapes", () => {
    expect(attrs('source="Lecture 4, slide 12" a="x=y {z}" b="say \\"hi\\"" c="back\\\\slash"')).toEqual([
      ["source", "Lecture 4, slide 12"],
      ["a", "x=y {z}"],
      ["b", 'say "hi"'],
      ["c", "back\\slash"],
    ]);
  });

  it("keeps any other backslash in a quoted value as it is", () => {
    expect(attrs('source="C:\\temp"')).toEqual([["source", "C:\\temp"]]);
  });

  it("allows input as the one bare name", () => {
    expect(attrs("input")).toEqual([["input", null]]);
    expect(attrs('input="What is it?"')).toEqual([["input", "What is it?"]]);
  });

  it("allows extra spaces and an empty block", () => {
    expect(attrs("  type=single   id=q  ")).toEqual([
      ["type", "single"],
      ["id", "q"],
    ]);
    expect(attrs("")).toEqual([]);
  });

  it("refuses an unterminated quote, a missing value and an unquoted value holding = or a quote", () => {
    expect(attrs('input="What')).toMatchObject({ ok: false, reason: expect.stringContaining("never closed") });
    expect(attrs("id=")).toMatchObject({ ok: false });
    expect(attrs("a=b=c")).toMatchObject({ ok: false });
    expect(attrs('a=b"c')).toMatchObject({ ok: false });
    expect(attrs('a="b"c')).toMatchObject({ ok: false });
    expect(attrs("=x")).toMatchObject({ ok: false });
    expect(attrs("a? b")).toMatchObject({ ok: false });
  });

  it("reports the offsets of each pair, for removing one", () => {
    const line = "{type=x id=q-1}";
    const result = parseAttributes(line, 1, line.length - 1);
    expect(result.ok && result.pairs.map((p) => line.slice(p.start, p.end))).toEqual(["type=x", "id=q-1"]);
  });
});

describe("findTrailingBlock: where attributes start and end", () => {
  const inner = (line: string) => {
    const b = findTrailingBlock(line);
    return b ? line.slice(b.inner[0], b.inner[1]) : null;
  };

  it("takes the last block at the end of the line, trailing spaces ignored", () => {
    expect(inner("What is it? {type=single id=q}")).toBe("type=single id=q");
    expect(inner("What is it? {type=single}   ")).toBe("type=single");
    expect(findTrailingBlock("What {type=single}")?.before).toBe("What");
  });

  it("is not fooled by braces in maths", () => {
    expect(inner("Poles of $\\frac{1}{s+2}$ {type=numeric}")).toBe("type=numeric");
    expect(findTrailingBlock("Poles of $\\frac{1}{s+2}$")).toBeNull();
    expect(findTrailingBlock("Is $x \\in \\{1, 2\\}$ true {type=truefalse}")?.before).toBe(
      "Is $x \\in \\{1, 2\\}$ true",
    );
  });

  it("is not fooled by braces in code spans", () => {
    expect(inner("Call `f{x}` now {type=short}")).toBe("type=short");
    expect(findTrailingBlock("Call `f{x}`")).toBeNull();
  });

  it("ignores an escaped brace, so a prompt can end in a literal {", () => {
    expect(findTrailingBlock("The set is \\{")).toBeNull();
    expect(findTrailingBlock("The set is \\{1, 2\\}")).toBeNull();
    expect(inner("The set is \\{ {type=short}")).toBe("type=short");
  });

  it("follows quotes, so a quoted value may hold braces", () => {
    expect(inner('Q {type=short source="see {x} on p. 3"}')).toBe('type=short source="see {x} on p. 3"');
    expect(inner('Q {type=short source="a \\"}\\" b"}')).toBe('type=short source="a \\"}\\" b"');
  });

  it("finds a block whose quote never closes, so the parse can report it", () => {
    const line = 'Other {input="What}';
    expect(inner(line)).toBe('input="What');
  });

  it("is null when the line does not end with a block", () => {
    expect(findTrailingBlock("No block here")).toBeNull();
    expect(findTrailingBlock("{type=single} and more")).toBeNull();
    expect(findTrailingBlock("An open { brace")).toBeNull();
  });

  it("does not take an image's {width=…} for a block", () => {
    expect(findTrailingBlock("Look ![chart](assets/c.png){width=300}")).toBeNull();
    expect(inner("Look ![chart](assets/c.png){width=300} {type=single}")).toBe("type=single");
  });

  it("gives the offsets of the braces", () => {
    const b = findTrailingBlock("ab {c=d}");
    expect(b).toMatchObject({ start: 3, end: 7, inner: [4, 7] });
  });
});
