import { describe, expect, it } from "vitest";
import { type DiffLine, lineDiff } from "../../src/core/review/diff";

const same = (text: string): DiffLine => ({ kind: "same", text });
const del = (text: string): DiffLine => ({ kind: "del", text });
const add = (text: string): DiffLine => ({ kind: "add", text });

describe("lineDiff", () => {
  it("equal texts are all unchanged lines", () => {
    expect(lineDiff("a\nb\nc\n", "a\nb\nc\n")).toEqual([same("a"), same("b"), same("c")]);
  });

  it("a line changed is the old line removed, then the new one added, between the lines that stayed", () => {
    expect(lineDiff("one\ntwo\nthree\n", "one\n2\nthree\n")).toEqual([
      same("one"),
      del("two"),
      add("2"),
      same("three"),
    ]);
  });

  it("lines added and lines removed, apart", () => {
    expect(lineDiff("a\nb\nc\nd\n", "a\nc\nd\ne\n")).toEqual([same("a"), del("b"), same("c"), same("d"), add("e")]);
  });

  it("a block replaced whole: every old line out, every new line in", () => {
    expect(lineDiff("x\ny\n", "p\nq\nr\n")).toEqual([del("x"), del("y"), add("p"), add("q"), add("r")]);
  });

  it("one final newline ends the last line: with or without it the lines are the same", () => {
    expect(lineDiff("a\nb\n", "a\nb")).toEqual([same("a"), same("b")]);
    expect(lineDiff("a\nb", "a\nb\n")).toEqual([same("a"), same("b")]);
    // a second one is a blank line, which is a line
    expect(lineDiff("a\n", "a\n\n")).toEqual([same("a"), add("")]);
  });

  it("nothing against something, and something against nothing", () => {
    expect(lineDiff("", "a\nb\n")).toEqual([add("a"), add("b")]);
    expect(lineDiff("a\nb\n", "")).toEqual([del("a"), del("b")]);
    expect(lineDiff("", "")).toEqual([]);
  });

  it("keeps a repeated line where the longest common subsequence puts it", () => {
    expect(lineDiff("a\na\nb\n", "a\nb\nb\n")).toEqual([same("a"), del("a"), same("b"), add("b")]);
  });

  it("is a diff: the unchanged and removed lines are the old text, the unchanged and added the new", () => {
    const before = "## Q {type=numeric}\n\n```answer\nvalue: 0.371\ntolerance: 0.001\n```\n";
    const after = "## Q {type=numeric}\n\nRound it.\n\n```answer\nvalue: 0.371\ntolerance: 0.0005\n```\n";
    const d = lineDiff(before, after);
    expect(d.filter((l) => l.kind !== "add").map((l) => l.text)).toEqual(before.trimEnd().split("\n"));
    expect(d.filter((l) => l.kind !== "del").map((l) => l.text)).toEqual(after.trimEnd().split("\n"));
  });
});
