import { describe, expect, it } from "vitest";
import { pageQuizOf } from "../../src/build/page";
import { quizCount, quizPoints, sectionPoints, wholeTime } from "../../src/page/start";
import { build, setup } from "../helpers/page";

const single = (id: string, points: number) =>
  `## Question ${id}? {type=single id=${id} points=${points}}\n\n- [x] right ${id}\n- [ ] wrong ${id}\n`;

const QUIZ = (front: string, bank: [number, number, number] = [2, 2, 2]) =>
  [
    "---",
    "title: Tiles",
    "id: tiles",
    front,
    "---",
    "",
    "# Signals {id=sig time=10m}",
    "",
    single("a", 1),
    single("b", 2),
    "# Bank {id=bank pick=2 time=5m}",
    "",
    single("c", bank[0]),
    single("d", bank[1]),
    single("e", bank[2]),
  ].join("\n");

describe("the start screen's numbers", () => {
  const page = pageQuizOf(build(QUIZ("pass_mark: 80")));

  it("counts a section's points, and a bank's as the draw times its average", () => {
    const [signals, bank] = page.sections;
    expect(sectionPoints(signals as never)).toBe(3);
    expect(sectionPoints(bank as never)).toBe(4);
    expect(quizCount(page)).toBe(4);
    expect(quizPoints(page)).toBe(7);
  });

  it("suggests the time limit, else the sum of the sections' times", () => {
    expect(wholeTime(page)).toBe(900);
    expect(wholeTime(pageQuizOf(build(QUIZ("time_limit: 20m"))))).toBe(1200);
  });
});

describe("the start screen", () => {
  it("shows two to four tiles, with the time limit and the pass mark only when set", () => {
    const tiles = (front: string) =>
      [
        ...setup(QUIZ(front))
          .html()
          .matchAll(/data-fact="(\w+)"/g),
      ].map((m) => m[1]);
    expect(tiles("")).toEqual(["questions", "points"]);
    expect(tiles("time_limit: 20m")).toEqual(["questions", "points", "time"]);
    expect(tiles("time_limit: 20m\npass_mark: 60")).toEqual(["questions", "points", "time", "pass"]);
  });

  it("leaves out the Points tile and the whole quiz's points when a bank mixes points", () => {
    const mixed = setup(QUIZ("", [1, 2, 3])).html();
    expect(mixed).not.toContain('data-fact="points"');
    expect(mixed).toContain('data-fact="questions"');
    expect(quizPoints(pageQuizOf(build(QUIZ("", [1, 2, 3]))))).toBeUndefined();
    expect(setup(QUIZ("")).html()).toContain('data-fact="points"');
  });

  it("names the feedback rule, and the timeout rule only for a timed quiz", () => {
    const rules = (front: string) =>
      [
        ...setup(QUIZ(front))
          .html()
          .matchAll(/data-rule="(\w+)"/g),
      ].map((m) => m[1]);
    expect(rules("")).toEqual(["feedback", "saved"]);
    expect(rules("time_limit: 20m")).toEqual(["feedback", "timeout", "saved"]);
    const instant = setup(QUIZ("feedback: instant")).html();
    expect(instant).toContain("Feedback after each answer");
    expect(setup(QUIZ("")).html()).toContain("Feedback at the end");
  });

  it("titles the parts as Part N · name and keeps the Start button", () => {
    const html = setup(QUIZ("")).html();
    expect(html).toContain("Part 1 · Signals");
    expect(html).toContain("Part 2 · Bank");
    expect(html).toContain('data-action="start"');
  });
});
