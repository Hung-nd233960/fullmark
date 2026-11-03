import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { questionFilePath } from "../../src/cli/brief-questions";
import { defaultOf, parseQuestions, type QuestionFile } from "../../src/core/brief/questions";
import { BriefSchema, PURPOSES } from "../../src/core/ir";

const text = readFileSync(questionFilePath(), "utf8");
const file: QuestionFile = parseQuestions(text);

// the brief keys that are asked; `decided_by` records who chose the others, and `focus_tags` is never asked: it is
// always [] from `quiz brief` (it has no history to read)
const NOT_ASKED = new Set(["decided_by", "focus_tags"]);
const keyOf = (key: string): string => key.split(".")[0] as string;

/** The schema of the value a question writes. */
function shapeOf(key: string): { safeParse(v: unknown): { success: boolean } } {
  const shape = BriefSchema.shape as Record<string, { safeParse(v: unknown): { success: boolean } }>;
  if (key.startsWith("content.")) {
    const inner = (BriefSchema.shape.content.shape as Record<string, { safeParse(v: unknown): { success: boolean } }>)[
      key.slice("content.".length)
    ];
    if (!inner) throw new Error(`no content key ${key}`);
    return inner;
  }
  const one = shape[key];
  if (!one) throw new Error(`no brief key ${key}`);
  return one;
}

describe("the brief question file", () => {
  it("has one question for every asked key of BriefSchema, once", () => {
    const asked = Object.keys(BriefSchema.shape).filter((k) => !NOT_ASKED.has(k));
    const covered = new Set(file.questions.map((q) => keyOf(q.key)));
    expect([...covered].sort()).toEqual([...asked].sort());
    const keys = file.questions.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
    // content is asked in two questions and a follow-up: kinds (with kinds_other) and elsewhere
    const inContent = file.questions
      .filter((q) => q.key.startsWith("content."))
      .flatMap((q) => [q.key.slice(8), q["follow-up"]?.key ?? ""])
      .filter((k) => k !== "")
      .sort();
    expect(inContent).toEqual(Object.keys(BriefSchema.shape.content.shape).sort());
  });

  it("follows the order of the file table", () => {
    expect(file.questions.map((q) => q.key)).toEqual([
      "purpose",
      "scope",
      "content.kinds",
      "content.elsewhere",
      "count",
      "minutes",
      "mix",
      "difficulty",
      "mode",
      "language",
      "request",
      "weak_topics",
      "commitment",
      "profile",
    ]);
  });

  it("every choice value, and every default, is one the schema accepts", () => {
    for (const q of file.questions) {
      const schema = shapeOf(q.key);
      const boolean = q.key === "weak_topics";
      for (const c of q.choices ?? []) {
        const value = boolean ? c.value === "yes" : q.kind === "multi" ? [c.value] : c.value;
        expect(schema.safeParse(value).success, `${q.key}: ${c.value}`).toBe(true);
      }
      for (const purpose of PURPOSES) {
        const d = defaultOf(q, purpose);
        const value = boolean ? d === "yes" : d;
        expect(schema.safeParse(value).success, `${q.key} default for ${purpose}`).toBe(true);
      }
      if (q.kind === "number") {
        expect(schema.safeParse(q.min ?? 0).success, `${q.key} min`).toBe(true);
        if (q.max !== undefined) expect(schema.safeParse(q.max).success, `${q.key} max`).toBe(true);
      }
    }
  });

  it("has the choices of the schema, no more and no fewer", () => {
    const values = (key: string): string[] =>
      (file.questions.find((q) => q.key === key)?.choices ?? []).map((c) => c.value);
    expect(values("purpose")).toEqual([...PURPOSES]);
    expect(values("content.kinds")).toEqual([...BriefSchema.shape.content.shape.kinds.element.options]);
    expect(values("mix")).toEqual([...BriefSchema.shape.mix.element.options]);
    expect(values("difficulty")).toEqual([...BriefSchema.shape.difficulty.options]);
    expect(values("mode")).toEqual([...BriefSchema.shape.mode.options]);
    expect(values("language")).toEqual([...BriefSchema.shape.language.options]);
    expect(values("weak_topics")).toEqual(["yes", "no"]);
  });

  it("gives every text in en and vi (the schema refuses an empty or missing one)", () => {
    // parseQuestions would have thrown; check the walk finds texts everywhere a text can be
    let texts = 0;
    const walk = (v: unknown): void => {
      if (v === null || typeof v !== "object") return;
      const o = v as Record<string, unknown>;
      if ("en" in o || "vi" in o) {
        texts++;
        expect(typeof o.en === "string" && o.en.trim() !== "" && typeof o.vi === "string" && o.vi.trim() !== "").toBe(
          true,
        );
        return;
      }
      for (const x of Object.values(o)) walk(x);
    };
    walk(file);
    expect(texts).toBeGreaterThan(80);
    const missing = text.replace(/^(\s+)vi: .*$/m, "");
    expect(() => parseQuestions(missing)).toThrow(/not valid/);
  });

  it("rejects a duplicate key and an unknown section", () => {
    expect(() => parseQuestions(text.replace("section: quiz\n    min: 1", "section: nowhere\n    min: 1"))).toThrow(
      /no section/,
    );
    expect(() => parseQuestions(text.replace("key: minutes", "key: count"))).toThrow(/twice/);
  });

  it("the defaults per purpose are G16's table", () => {
    const mix = file.questions.find((q) => q.key === "mix");
    if (!mix) throw new Error("no mix");
    expect(defaultOf(mix, "self-study")).toEqual(["recall", "understanding", "calculation"]);
    expect(defaultOf(mix, "exam-prep")).toEqual(["understanding", "calculation", "essay"]);
    expect(defaultOf(mix, "classmates")).toEqual(["recall", "understanding"]);
    expect(defaultOf(mix, "survey")).toEqual([]);
    expect(defaultOf(mix, "survey", { mix: ["essay"] })).toEqual(["essay"]);
    const profile = file.questions.find((q) => q.key === "profile");
    if (!profile) throw new Error("no profile");
    expect(PURPOSES.map((p) => defaultOf(profile, p))).toEqual(["default", "exam", "default", "survey"]);
  });

  it("the scope needs four words and shows an example; only purpose, scope and commitment are human-only", () => {
    const scope = file.questions.find((q) => q.key === "scope");
    expect(scope?.["min-words"]).toBe(4);
    expect(scope?.example?.en).toBe("lectures 3 to 5, the Fourier transform");
    expect(file.questions.filter((q) => q["human-only"]).map((q) => q.key)).toEqual(["purpose", "scope", "commitment"]);
    expect(file.questions.filter((q) => q.optional).map((q) => q.key)).toEqual(["commitment"]);
  });
});

describe("the question file's schema covers the fields COMMANDS.md names (G22)", () => {
  it("accepts flag, optional, min, max, default-by-purpose, default-for, sections and a follow-up, and uses them", () => {
    expect(file.sections.map((s) => s.id).length).toBeGreaterThan(0);
    const q = (key: string) => file.questions.find((x) => x.key === key);
    expect(file.questions.every((x) => x.flag !== "")).toBe(true);
    expect(q("commitment")).toMatchObject({ optional: true, min: 0, max: 100 });
    expect(q("profile")?.["default-by-purpose"]).toBeDefined();
    expect(q("mix")?.choices?.some((c) => c["default-for"] !== undefined)).toBe(true);
    expect(q("content.kinds")?.["follow-up"]?.key).toBe("kinds_other");
  });
});
