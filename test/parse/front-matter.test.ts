import { describe, expect, it } from "vitest";
import { parse } from "../../src/core/parse";
import { found, parseBody } from "./helpers";

const Q = "## Q {type=single id=q}\n\n- [x] a\n- [ ] b";

describe("front matter", () => {
  it("applies the defaults of QUIZ_SYNTAX.md section 2", () => {
    const fm = parseBody(Q).quiz?.frontMatter;
    expect(fm).toEqual({
      title: "T",
      description: null,
      id: "test",
      kind: "quiz",
      lang: "en",
      uiLang: "en",
      profile: "default",
      profileGiven: false,
      timeLimit: null,
      onTimeout: "submit",
      feedback: "end",
      passMark: null,
      shuffleQuestions: false,
      shuffleChoices: false,
      partial: true,
      theme: "auto",
      font: "system",
      look: "free",
      tags: [],
      generatedBy: null,
    });
  });

  it("makes the default id from the file name, slugged", () => {
    expect(
      parse("---\ntitle: T\n---\n\n## Q {type=single id=q}\n\n- [x] a\n- [ ] b\n", "D:\\quizzes\\Đạo hàm 1.md").quiz
        ?.frontMatter.id,
    ).toBe("dao-ham-1");
    expect(
      parse("---\ntitle: T\n---\n\n## Q {type=single id=q}\n\n- [x] a\n- [ ] b\n", "a/b/Signals.md").quiz?.frontMatter
        .id,
    ).toBe("signals");
  });

  it("reads every key", () => {
    const fm = parseBody(
      Q,
      [
        "title: 'Signals: the Laplace transform'",
        "description: |",
        "  Two lines",
        "  of text",
        "id: laplace",
        "kind: quiz",
        "lang: vi",
        "profile: exam",
        "time_limit: 1h30m",
        "on_timeout: warn",
        "feedback: instant",
        "pass_mark: 50",
        "shuffle_questions: true",
        "shuffle_choices: true",
        "partial: false",
        "theme: oled",
        "font: readable",
        "look: locked",
        "tags: [a, b]",
        "generated_by: claude-opus-4",
      ].join("\n"),
    ).quiz?.frontMatter;
    expect(fm).toMatchObject({
      title: "Signals: the Laplace transform",
      description: "Two lines\nof text\n",
      id: "laplace",
      lang: "vi",
      uiLang: "vi",
      profile: "exam",
      timeLimit: 5400,
      onTimeout: "warn",
      feedback: "instant",
      passMark: 50,
      shuffleQuestions: true,
      partial: false,
      theme: "oled",
      font: "readable",
      look: "locked",
      tags: ["a", "b"],
      generatedBy: "claude-opus-4",
    });
  });

  it("lets ui_lang differ from lang, and gives a survey the survey profile", () => {
    expect(parseBody(Q, "title: T\nlang: en\nui_lang: vi").quiz?.frontMatter).toMatchObject({
      lang: "en",
      uiLang: "vi",
    });
    const survey = parseBody("## Q {type=single id=q}\n\n- [ ] a\n- [ ] b", "title: T\nkind: survey").quiz;
    expect(survey?.frontMatter.profile).toBe("survey");
  });

  it("reports no front matter, an unclosed one, bad YAML and a missing title at their lines", () => {
    expect(
      parse("## Q {type=single id=q}\n\n- [x] a\n- [ ] b\n", "t.md").issues.map((i) => `${i.rule}@${i.line}`),
    ).toEqual(["syntax.front-matter@1"]);
    expect(parse("---\ntitle: T\n\n## Q {type=single id=q}\n", "t.md").issues[0]).toMatchObject({
      rule: "syntax.front-matter",
      line: 1,
    });
    expect(found(Q, "title: [oops")).toEqual(["syntax.front-matter@2"]);
    expect(found(Q, "description: x")).toEqual(["syntax.front-matter@1"]);
    expect(found(Q, "title: A\ntitle: B")[0]).toBe("syntax.front-matter@3");
  });

  it("reports unknown keys, with a suggestion, and the reserved key", () => {
    expect(found(Q, "title: T\ntime_limt: 5m")).toEqual(["syntax.unknown-key@3"]);
    expect(parseBody(Q, "title: T\ntime_limt: 5m").issues[0]?.fix).toContain("time_limit");
    expect(found(Q, "title: T\nreference: sheet.md")).toEqual(["syntax.reserved@3"]);
    expect(parseBody(Q, "title: T\nreference: sheet.md").issues[0]?.message).toContain("reserved for a later version");
  });

  it("reports values outside their set or range", () => {
    for (const bad of [
      "feedback: later",
      "kind: poll",
      "lang: fr",
      "time_limit: soon",
      "on_timeout: never",
      "pass_mark: 101",
      "pass_mark: x",
      "shuffle_choices: maybe",
      "look: sticky",
      "tags: a",
      'generated_by: "  "',
    ]) {
      expect(found(Q, `title: T\n${bad}`), bad).toEqual(["syntax.value@3"]);
    }
  });

  it("reports an unknown theme and font with their own rules", () => {
    expect(found(Q, "title: T\ntheme: neon")).toEqual(["theme.unknown@3"]);
    expect(found(Q, "title: T\nfont: comic")).toEqual(["theme.unknown-font@3"]);
  });

  it("forbids pass_mark, partial and feedback: instant in a survey", () => {
    const body = "## Q {type=single id=q}\n\n- [ ] a\n- [ ] b";
    expect(found(body, "title: T\nkind: survey\npass_mark: 50")).toEqual(["survey.forbidden@4"]);
    expect(found(body, "title: T\nkind: survey\npartial: true")).toEqual(["survey.forbidden@4"]);
    expect(found(body, "title: T\nkind: survey\nfeedback: instant")).toEqual(["survey.forbidden@4"]);
    expect(found(body, "title: T\nkind: survey\nfeedback: end")).toEqual([]);
  });
});
