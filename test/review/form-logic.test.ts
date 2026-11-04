import { describe, expect, it } from "vitest";
import {
  blank,
  countsOf,
  type Entries,
  type Item,
  incompleteIds,
  judgedMap,
  keepTheRest,
  nextNotJudged,
  notJudged,
  pickVerdict,
  reasonsFor,
  toggleReason,
} from "../../src/review/logic";

/** The rules of the form between its parts (COMMANDS.md, `quiz review`, "The form"), with no DOM. */
const items: Item[] = [
  { id: "a", type: "single" },
  { id: "b", type: "essay" },
  { id: "c", type: "numeric" },
  { id: "d", type: "code" },
];
const judged = (v: Entries[string]["verdict"], extra: Partial<Entries[string]> = {}): Entries[string] => ({
  ...blank(),
  verdict: v,
  ...extra,
});

describe("choosing a verdict", () => {
  it("clears the verdict that is chosen again, and keeps the note", () => {
    const fixed = { ...judged("fix", { reasons: ["unclear"], note: "why" }) };
    expect(pickVerdict(fixed, "fix")).toEqual({ verdict: null, reasons: [], note: "why", assumed: false });
  });

  it("clears the reasons and keeps the note when another verdict is chosen", () => {
    const fixed = judged("fix", { reasons: ["unclear", "other"], note: "why" });
    expect(pickVerdict(fixed, "drop")).toEqual({ verdict: "drop", reasons: [], note: "why", assumed: false });
  });

  it("makes a kept-without-looking question a looked-at one when the verdict is chosen by hand", () => {
    expect(pickVerdict(judged("keep", { assumed: true }), "fix").assumed).toBe(false);
    expect(pickVerdict(blank(), "keep")).toEqual({ verdict: "keep", reasons: [], note: "", assumed: false });
  });

  it("toggles a reason on and off", () => {
    const once = toggleReason(judged("fix"), "unclear");
    expect(once.reasons).toEqual(["unclear"]);
    expect(toggleReason(once, "other").reasons).toEqual(["unclear", "other"]);
    expect(toggleReason(once, "unclear").reasons).toEqual([]);
  });
});

describe("the reasons offered", () => {
  it("are the board's, in its order, for each verdict", () => {
    expect(reasonsFor("fix", "single")).toEqual(["key-wrong", "unclear", "other"]);
    expect(reasonsFor("drop", "single")).toEqual(["duplicate", "off-scope", "too-easy", "other"]);
  });

  it("add the rubric reasons for essays and code, before Other", () => {
    for (const type of ["essay", "code"]) {
      expect(reasonsFor("fix", type)).toEqual([
        "key-wrong",
        "unclear",
        "rubric-loose",
        "points-misallocated",
        "criterion-unclear",
        "other",
      ]);
    }
    expect(reasonsFor("drop", "essay")).toEqual(["duplicate", "off-scope", "too-easy", "other"]);
  });
});

describe("what holds Finish back", () => {
  it("is a fix or a drop with no reason, or Other with no note", () => {
    const entries: Entries = {
      a: judged("fix"),
      b: judged("drop", { reasons: ["other"], note: "   " }),
      c: judged("fix", { reasons: ["unclear"] }),
      d: judged("keep"),
    };
    expect(incompleteIds(items, entries)).toEqual(["a", "b"]);
    expect(incompleteIds(items, { ...entries, a: judged("fix", { reasons: ["unclear"] }) })).toEqual(["b"]);
    expect(incompleteIds(items, { ...entries, b: judged("drop", { reasons: ["other"], note: "dup of 3" }) })).toEqual([
      "a",
    ]);
  });

  it("does not count a question not judged as incomplete", () => {
    expect(incompleteIds(items, {})).toEqual([]);
  });

  it("is not met by a rubric reason on a question that is neither essay nor code", () => {
    expect(incompleteIds(items, { a: judged("fix", { reasons: ["rubric-loose"] }) })).toEqual(["a"]);
  });
});

describe("the questions not judged", () => {
  const entries: Entries = { a: judged("keep"), c: judged("drop", { reasons: ["duplicate"] }) };

  it("are listed in order, and counted apart from the judged", () => {
    expect(notJudged(items, entries)).toEqual(["b", "d"]);
    expect(countsOf(items, entries)).toEqual({ total: 4, judged: 2, keep: 1, fix: 0, drop: 1, assumed: 0 });
  });

  it("N goes to the next one not judged after the current one, wrapping round, and to none when all are judged", () => {
    expect(nextNotJudged(items, entries, "a")).toBe("b");
    expect(nextNotJudged(items, entries, "b")).toBe("d");
    expect(nextNotJudged(items, entries, "d")).toBe("b");
    expect(nextNotJudged(items, entries, null)).toBe("b");
    expect(nextNotJudged(items, keepTheRest(items, entries), "a")).toBeNull();
  });

  it("Keep the rest marks them keep, assumed, and leaves the judged alone", () => {
    const rest = keepTheRest(items, entries);
    expect(rest.b).toEqual({ verdict: "keep", reasons: [], note: "", assumed: true });
    expect(rest.d).toEqual(rest.b);
    expect(rest.a).toBe(entries.a);
    expect(rest.c).toBe(entries.c);
    expect(countsOf(items, rest)).toMatchObject({ judged: 4, keep: 3, assumed: 2, drop: 1 });
  });
});

describe("the body of the submit", () => {
  it("is one entry for every question, and none while a question is not judged", () => {
    const entries: Entries = {
      a: judged("keep", { assumed: true }),
      b: judged("fix", { reasons: ["rubric-loose"], note: "n" }),
      c: judged("keep", { reasons: ["unclear"] }),
    };
    expect(judgedMap(items, entries)).toBeNull();
    const all = judgedMap(items, { ...entries, d: judged("drop", { reasons: ["too-easy"] }) });
    expect(all).toEqual({
      a: { verdict: "keep", reasons: [], note: "", assumed: true },
      b: { verdict: "fix", reasons: ["rubric-loose"], note: "n" },
      // a keep carries no reasons, whatever the entry held
      c: { verdict: "keep", reasons: [], note: "" },
      d: { verdict: "drop", reasons: ["too-easy"], note: "" },
    });
  });
});
