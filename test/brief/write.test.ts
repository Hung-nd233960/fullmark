import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { questionFilePath } from "../../src/cli/brief-questions";
import { defaultOf, parseQuestions } from "../../src/core/brief/questions";
import { type BriefAnswers, briefOf, PROFILE_OF_PURPOSE, writeBrief } from "../../src/core/brief/write";
import { PURPOSES } from "../../src/core/ir";
import { readBrief } from "../../src/core/rules/brief-read";

const user = <T>(value: T) => ({ value, by: "user" as const });
const dflt = <T>(value: T) => ({ value, by: "default" as const });

const ANSWERS: BriefAnswers = {
  purpose: user("exam-prep"),
  scope: user("lectures 3 to 5, the Fourier transform"),
  kinds: dflt([]),
  kindsOther: dflt(""),
  elsewhere: dflt(""),
  count: dflt(20),
  minutes: dflt(0),
  mix: dflt(["understanding", "calculation", "essay"]),
  difficulty: dflt("like-the-exam"),
  mode: dflt("at-the-end"),
  language: dflt("en"),
  request: dflt(""),
  weakTopics: dflt(false),
  commitment: dflt(0),
};

describe("the brief writer", () => {
  it("writes every key, in the file table's order, with decided_by for each", () => {
    const text = writeBrief(ANSWERS);
    expect(text).toBe(`purpose: exam-prep
scope: "lectures 3 to 5, the Fourier transform"
content:
  kinds: []
  kinds_other: ""
  elsewhere: ""
count: 20
minutes: 0
mix:
  - understanding
  - calculation
  - essay
difficulty: like-the-exam
mode: at-the-end
language: en
request: ""
weak_topics: false
commitment: 0
focus_tags: []
profile: "exam"
decided_by:
  purpose: user
  scope: user
  content: default
  count: default
  minutes: default
  mix: default
  difficulty: default
  mode: default
  language: default
  request: default
  weak_topics: default
  commitment: default
  focus_tags: default
  profile: default
`);
  });

  it("is read back by check's reader without a finding, to the same values", () => {
    const text = writeBrief(ANSWERS);
    const read = readBrief(text, "brief.yaml");
    expect(read.issues).toEqual([]);
    expect(read.brief).toEqual(briefOf(ANSWERS));
  });

  it("gives the same bytes for lists given in any order, with repeats", () => {
    const a = writeBrief({ ...ANSWERS, kinds: user(["notes", "textbook", "other"]), mix: user(["essay", "recall"]) });
    const b = writeBrief({
      ...ANSWERS,
      kinds: user(["other", "textbook", "notes", "notes"]),
      mix: user(["recall", "essay", "recall"]),
    });
    expect(a).toBe(b);
    expect(parse(a).content.kinds).toEqual(["textbook", "notes", "other"]);
    expect(parse(a).mix).toEqual(["recall", "essay"]);
  });

  it("records who decided: the user's word beats the agent's, which beats a default (content joins three answers)", () => {
    const text = writeBrief({
      ...ANSWERS,
      purpose: { value: "self-study", by: "agent" },
      kinds: dflt(["notes"]),
      kindsOther: { value: "", by: "agent" },
      elsewhere: user("the course wiki"),
    });
    const by = parse(text).decided_by;
    expect(by.purpose).toBe("agent");
    expect(by.content).toBe("user");
    expect(writeBrief({ ...ANSWERS, kindsOther: { value: "", by: "agent" } })).toContain("  content: agent\n");
    expect(Object.keys(by)).toEqual([
      "purpose",
      "scope",
      "content",
      "count",
      "minutes",
      "mix",
      "difficulty",
      "mode",
      "language",
      "request",
      "weak_topics",
      "commitment",
      "focus_tags",
      "profile",
    ]);
  });

  it("resolves the profile from the purpose, as a default, unless it is given", () => {
    for (const purpose of PURPOSES) {
      const brief = parse(writeBrief({ ...ANSWERS, purpose: user(purpose) }));
      expect(brief.profile).toBe(PROFILE_OF_PURPOSE[purpose]);
      expect(brief.decided_by.profile).toBe("default");
    }
    const given = parse(writeBrief({ ...ANSWERS, profile: user("survey") }));
    expect([given.profile, given.decided_by.profile]).toEqual(["survey", "user"]);
  });

  it("agrees with the question file about the profile of each purpose", () => {
    const file = parseQuestions(readFileSync(questionFilePath(), "utf8"));
    const profile = file.questions.find((q) => q.key === "profile");
    if (!profile) throw new Error("no profile question");
    for (const purpose of PURPOSES) expect(defaultOf(profile, purpose)).toBe(PROFILE_OF_PURPOSE[purpose]);
  });

  it("always writes focus_tags as an empty list, even with weak topics", () => {
    const brief = parse(writeBrief({ ...ANSWERS, weakTopics: user(true) }));
    expect(brief.weak_topics).toBe(true);
    expect(brief.focus_tags).toEqual([]);
  });

  it("keeps Vietnamese and every YAML edge in text answers, quoted", () => {
    const scopes = [
      "Chương 3: Phép biến đổi Fourier #2",
      "  leading and trailing  ",
      "key: value",
      "- not a list item",
      "'single' and \"double\" quotes \\ backslash",
      "tab\there",
      "yes",
      "null",
      "123",
      "{braces} [brackets] *star &amp !bang %pct @at `tick`",
      "line one\nline two\n\nafter a blank line\n",
      "crlf\r\nline",
      "sep and\u0085nel",
      "---",
      "emoji 🙂 and 日本語",
    ];
    for (const scope of scopes) {
      const text = writeBrief({ ...ANSWERS, scope: user(scope), request: user(scope), elsewhere: user(scope) });
      const read = readBrief(text, "brief.yaml");
      expect(read.issues, JSON.stringify(scope)).toEqual([]);
      expect(read.brief?.scope).toBe(scope);
      expect(read.brief?.request).toBe(scope);
      expect(read.brief?.content.elsewhere).toBe(scope);
    }
  });

  it("writes a multi-line request on one line, with escapes, so the file stays line-per-key", () => {
    const text = writeBrief({ ...ANSWERS, request: user("Focus on proofs.\nNo tricks.") });
    expect(text).toContain('request: "Focus on proofs.\\nNo tricks."\n');
    expect(text).toMatch(/\nrequest: "[^\n]*"\nweak_topics: /);
  });

  it("refuses a value the schema would not accept", () => {
    expect(() => writeBrief({ ...ANSWERS, count: user(0) })).toThrow();
    expect(() => writeBrief({ ...ANSWERS, commitment: user(101) })).toThrow();
    expect(() => writeBrief({ ...ANSWERS, minutes: user(-1) })).toThrow();
  });
});
