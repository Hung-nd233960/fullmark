import { describe, expect, it } from "vitest";
import { formatDuration, summarise, summaryLines } from "../src/core/inspect";
import { parse } from "../src/core/parse";

const summary = (text: string) => {
  const quiz = parse(text, "quiz.md").quiz;
  if (!quiz) throw new Error("the fixture does not parse");
  return summarise(quiz, "9f3a".padEnd(64, "0"));
};

const BANK = `---
title: Bank
id: bank
time_limit: 1h30m
---

# Fixed {id=fixed}

## A {type=single id=a points=2 tags=x}

- [x] one
- [ ] two
- [ ] three

# Drawn {id=drawn pick=2 time=10m}

## B {type=single id=b points=2 tags=x,y}

- [ ] one
- [x] two
- [ ] three

## C {type=multi id=c points=4}

- [x] one
- [x] two
- [ ] three
- [ ] four

## D {type=essay id=d points=6 tags=y}
`;

describe("summarise", () => {
  const s = summary(BANK);

  it("counts the questions in the file, and the points of the questions drawn: a bank's pick, not its pool", () => {
    expect(s.questions).toBe(4);
    // fixed 2; drawn: 2 of 3 questions worth 2 + 4 + 6 = 12 in all, so 8
    expect(s.sections.map((x) => [x.id, x.questions, x.points, x.pick, x.time])).toEqual([
      ["fixed", 1, 2, null, null],
      ["drawn", 3, 8, 2, 600],
    ]);
    expect(s.points).toBe(10);
  });

  it("splits types, tags and the untagged the same way, so each adds up to the total", () => {
    expect(s.types.map((t) => [t.type, t.count, t.points])).toEqual([
      ["single", 2, 3.333333],
      ["multi", 1, 2.666667],
      ["essay", 1, 4],
    ]);
    expect(s.tags).toEqual([
      { tag: "x", count: 2, points: 3.333333 },
      { tag: "y", count: 2, points: 5.333333 },
      { tag: null, count: 1, points: 2.666667 },
    ]);
  });

  it("counts the correct choices of single and multi questions by letter, in source order, zeros kept", () => {
    expect(s.positions).toEqual({ A: 2, B: 2, C: 0, D: 0 });
  });

  it("names the quiz by id, title, hash and the first 4 characters of the hash", () => {
    expect(s.quiz).toEqual({ id: "bank", title: "Bank", hash: "9f3a".padEnd(64, "0"), short: "9f3a" });
    expect(s.timeLimit).toBe(5400);
  });

  it("prints the lines of COMMANDS.md: the first item of a row spells out its unit", () => {
    const lines = summaryLines(s);
    expect(lines[0]).toBe("bank · Bank · version 9f3a");
    expect(lines[1]).toBe("4 questions · 10 points · 2 sections · time limit 1h30m");
    expect(lines).toContain("Sections  fixed 1 question, 2 points · drawn 3, 8, pick 2, 10m");
    expect(lines).toContain("Positions A 2 · B 2 · C 0 · D 0");
  });
});

describe("formatDuration", () => {
  it("writes the forms time_limit is read in", () => {
    expect([90, 2700, 5400, 3600, 0].map(formatDuration)).toEqual(["1m30s", "45m", "1h30m", "1h", "0s"]);
  });
});
