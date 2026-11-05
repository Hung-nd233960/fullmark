import { describe, expect, it } from "vitest";
import { reviewEn, reviewVi } from "../../src/core/i18n/review";
import { ringOf } from "../../src/page/map";
import { blank, type Entries } from "../../src/review/logic";
import { chosenPart, type Part, partStats } from "../../src/review/parts";

/** The counts behind the stacked map's rings and heading lines (COMMANDS.md, `quiz review`, "The sidebar"; G67). */
const entry = (verdict: Entries[string]["verdict"]): Entries[string] => ({ ...blank(), verdict });
const entries: Entries = {
  a: entry("keep"),
  b: entry("fix"),
  c: entry("drop"),
  d: entry(null),
  e: entry("fix"),
  f: entry("keep"),
};

describe("a part's counts", () => {
  it("count the part's questions, those judged, and the fix and drop among them", () => {
    expect(partStats(["a", "b", "c", "d"], entries, null)).toEqual({ total: 4, judged: 3, fix: 1, drop: 1 });
  });

  it("cover the questions asked only with --since, not the earlier verdicts of the others", () => {
    const asked = new Set(["a", "d"]);
    expect(partStats(["a", "b", "c", "d"], entries, asked)).toEqual({ total: 2, judged: 1, fix: 0, drop: 0 });
  });

  it("are all zero for a part none of whose questions is asked again", () => {
    expect(partStats(["b", "c"], entries, new Set(["a"]))).toEqual({ total: 0, judged: 0, fix: 0, drop: 0 });
  });

  it("make a ring that is the empty track, then an arc, then a disc when every asked question is judged", () => {
    const none = partStats(["b", "c"], entries, new Set(["a"]));
    expect(ringOf(none.judged, none.total)).toEqual({ dash: `0 ${ringOf(0, 1).dash.split(" ")[1]}`, done: false });
    const some = partStats(["a", "d"], entries, new Set(["a", "d"]));
    expect(ringOf(some.judged, some.total).done).toBe(false);
    expect(ringOf(some.judged, some.total).dash.startsWith("0 ")).toBe(false);
    const all = partStats(["a", "b"], entries, new Set(["a", "b"]));
    expect(ringOf(all.judged, all.total).done).toBe(true);
  });
});

describe("the part the stacked map shows", () => {
  const parts: Part[] = [
    { id: "p1", title: "One", number: 1, ids: ["a", "b"] },
    { id: "p2", title: "Two", number: 2, ids: ["c", "d"] },
  ];
  it("is the one chosen, else the one holding the current question, else the first", () => {
    expect(chosenPart(parts, "p2", "a")?.id).toBe("p2");
    expect(chosenPart(parts, null, "d")?.id).toBe("p2");
    expect(chosenPart(parts, null, "zzz")?.id).toBe("p1");
    expect(chosenPart(parts, "gone", "a")?.id).toBe("p1");
  });
});

describe("the words of the stacked map", () => {
  it("give a part's line with the fix and drop only when not zero", () => {
    expect(reviewEn.partStats(6, 12, 3, 1)).toBe("6 of 12 judged · 3 fix · 1 drop");
    expect(reviewEn.partStats(6, 12, 0, 0)).toBe("6 of 12 judged");
    expect(reviewEn.partStats(0, 4, 0, 1)).toBe("0 of 4 judged · 1 drop");
    expect(reviewVi.partStats(6, 12, 3, 1)).toBe("đã xét 6 / 12 · 3 sửa · 1 bỏ");
  });

  it("say that nothing is asked again for a part with no question asked (G67)", () => {
    expect(reviewEn.partStats(0, 0, 0, 0)).toBe("nothing asked again");
    expect(reviewEn.partTab(1, "Signals", 0, 0, 0, 0)).toBe("Part 1, Signals: nothing asked again");
    expect(reviewVi.partStats(0, 0, 0, 0)).toBe("không hỏi lại câu nào");
    expect(reviewVi.partTab(1, "Signals", 0, 0, 0, 0)).toBe("Phần 1, Signals: không hỏi lại câu nào");
  });

  it("name a part with its counts, and without a title when it has none", () => {
    expect(reviewEn.partTab(2, "Fourier transform", 6, 12, 3, 1)).toBe(
      "Part 2, Fourier transform: 6 of 12 judged, 3 fix, 1 drop",
    );
    expect(reviewEn.partTab(3, null, 0, 4, 0, 0)).toBe("Part 3: 0 of 4 judged");
    expect(reviewVi.partTab(2, "Fourier", 6, 12, 0, 1)).toBe("Phần 2, Fourier: đã xét 6 / 12, 1 bỏ");
  });
});
