import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type BriefOptions, runBrief } from "../../src/cli/brief";
import { readBrief } from "../../src/core/rules/brief-read";
import { capture, tempTree } from "../helpers/cli";

let trees: { done(): void }[] = [];
afterEach(() => {
  for (const t of trees) t.done();
  trees = [];
});
const tree = (files: Record<string, string> = {}) => {
  const t = tempTree(files);
  trees.push(t);
  return t.dir;
};

const NONE: BriefOptions = {
  purpose: null,
  scope: null,
  kinds: null,
  kindsOther: null,
  elsewhere: null,
  count: null,
  minutes: null,
  mix: null,
  difficulty: null,
  mode: null,
  weakTopics: null,
  commitment: null,
  language: null,
  request: null,
  profile: null,
  config: null,
  acceptDefaults: false,
  web: false,
  tui: false,
  json: true,
};
const SCOPE = "lectures 3 to 5, the Fourier transform";
const GIVEN: BriefOptions = { ...NONE, purpose: "exam-prep", scope: SCOPE };

async function run(dir: string, opts: Partial<BriefOptions>, files?: Record<string, string>) {
  const c = capture(dir);
  const code = await runBrief("d", { ...GIVEN, ...opts }, c.io);
  const json = c.out.length > 0 ? JSON.parse(c.out[0] as string) : null;
  return { code, json, err: c.err.join("\n"), dir, files };
}

describe("quiz brief through flags", () => {
  it("writes brief.yaml and an empty content/, which check's reader takes without a finding", async () => {
    const dir = tree();
    const r = await run(dir, {});
    expect(r.code).toBe(0);
    expect(r.json).toMatchObject({ status: "written", brief: "d/brief.yaml", warnings: [] });
    const text = readFileSync(join(dir, "d/brief.yaml"), "utf8");
    expect(readBrief(text, "brief.yaml").issues).toEqual([]);
    expect(existsSync(join(dir, "d/content"))).toBe(true);
  });

  it("the same answers in another order, with lists in another order, write the same bytes", async () => {
    const a = tree();
    const b = tree();
    await run(a, { kinds: "notes,textbook", mix: "essay,recall", count: "12" });
    await run(b, { mix: "recall,essay", count: "12", kinds: " textbook , notes ,notes" });
    expect(readFileSync(join(a, "d/brief.yaml"), "utf8")).toBe(readFileSync(join(b, "d/brief.yaml"), "utf8"));
  });

  it("records user for flags, default for the rest, and agent for --accept-defaults", async () => {
    const dir = tree();
    const r = await run(dir, { purpose: null, acceptDefaults: true, count: "5" });
    expect(r.code).toBe(0);
    const brief = readBrief(readFileSync(join(dir, "d/brief.yaml"), "utf8"), "brief.yaml").brief;
    expect(brief?.purpose).toBe("self-study");
    expect(brief?.decided_by).toMatchObject({ purpose: "agent", scope: "user", count: "user", minutes: "default" });
    expect(brief?.mix).toEqual(["recall", "understanding", "calculation"]);
    expect(r.json.defaults_applied).toContain("purpose");
    expect(r.json.defaults_applied).not.toContain("count");
  });

  it("takes the defaults of the purpose, and the profile from it", async () => {
    const dir = tree();
    await run(dir, { purpose: "survey" });
    const brief = readBrief(readFileSync(join(dir, "d/brief.yaml"), "utf8"), "brief.yaml").brief;
    expect([brief?.mix, brief?.profile]).toEqual([[], "survey"]);
  });

  it("a missing purpose or scope exits 3, names what is missing and writes nothing", async () => {
    for (const [opts, missing] of [
      [{ purpose: null, scope: null }, ["purpose", "scope"]],
      [{ scope: null }, ["scope"]],
      [{ purpose: null }, ["purpose"]],
      [{ purpose: null, scope: null, acceptDefaults: true }, ["scope"]],
      [{ scope: "   " }, ["scope"]],
    ] as const) {
      const dir = tree();
      const r = await run(dir, opts);
      expect(r.code, JSON.stringify(opts)).toBe(3);
      expect(r.json).toMatchObject({ status: "needs_input", missing });
      expect(r.json.how).toContain("--web");
      expect(existsSync(join(dir, "d"))).toBe(false);
    }
  });

  it("a bad value exits 2 naming the allowed ones, and writes nothing", async () => {
    const bad: [Partial<BriefOptions>, RegExp][] = [
      [{ purpose: "fun" }, /--purpose must be one of: self-study, exam-prep, classmates, survey/],
      [{ kinds: "notes,videos" }, /--kinds takes a comma list of: lecture-slides.*"videos"/],
      [{ kinds: "notes", kindsOther: "x" }, /--kinds-other needs `other` in --kinds/],
      [{ kindsOther: "x" }, /--kinds-other needs `other` in --kinds/],
      [{ count: "0" }, /--count must be a whole number, 1 or more/],
      [{ count: "2.5" }, /--count/],
      [{ minutes: "-1" }, /--minutes/],
      [{ mix: "recall,poetry" }, /--mix takes a comma list of: recall, understanding, calculation, code, essay/],
      [{ difficulty: "hard" }, /--difficulty must be one of: warm-up, like-the-exam, harder/],
      [{ mode: "exam" }, /--mode must be one of: each-question, at-the-end, timed-exam/],
      [{ weakTopics: "maybe" }, /--weak-topics must be one of: yes, no/],
      [{ commitment: "101" }, /--commitment must be a whole number, from 0 to 100/],
      [{ language: "fr" }, /--language must be one of: en, vi/],
      [{ profile: "nope" }, /unknown profile `nope`.*the profiles are:/],
    ];
    for (const [opts, message] of bad) {
      const dir = tree();
      const r = await run(dir, opts);
      expect(r.code, JSON.stringify(opts)).toBe(2);
      expect(r.json.status).toBe("error");
      expect(r.json.message, JSON.stringify(opts)).toMatch(message);
      expect(existsSync(join(dir, "d")), JSON.stringify(opts)).toBe(false);
    }
  });

  it("--kinds-other with other is written", async () => {
    const dir = tree();
    await run(dir, { kinds: "other", kindsOther: "a video lecture" });
    const brief = readBrief(readFileSync(join(dir, "d/brief.yaml"), "utf8"), "brief.yaml").brief;
    expect(brief?.content).toEqual({ kinds: ["other"], kinds_other: "a video lecture", elsewhere: "" });
  });

  it("a short scope is written with brief.vague (key, words, example) and exit 0", async () => {
    const dir = tree();
    const r = await run(dir, { scope: "signals" });
    expect(r.code).toBe(0);
    expect(r.json.warnings).toEqual([
      {
        rule: "brief.vague",
        key: "scope",
        words: 1,
        example: SCOPE,
        message: expect.stringContaining("--scope has 1 word; 4 or more"),
      },
    ]);
    expect(r.err).toContain("brief.vague");
    expect(readFileSync(join(dir, "d/brief.yaml"), "utf8")).toContain('scope: "signals"');
    // the example follows --language
    const vi = await run(tree(), { scope: "tín hiệu", language: "vi" });
    expect(vi.json.warnings[0].example).toBe("bài giảng 3 đến 5, phép biến đổi Fourier");
  });

  it("--weak-topics yes warns brief.no-history and still writes focus_tags: []", async () => {
    const dir = tree();
    const r = await run(dir, { weakTopics: "yes" });
    expect(r.code).toBe(0);
    expect(r.json.warnings.map((w: { rule: string }) => w.rule)).toEqual(["brief.no-history"]);
    const brief = readBrief(readFileSync(join(dir, "d/brief.yaml"), "utf8"), "brief.yaml").brief;
    expect([brief?.weak_topics, brief?.focus_tags]).toEqual([true, []]);
  });

  it("never overwrites: an existing brief.yaml exits 2 before anything else, and content/ is kept", async () => {
    const dir = tree({ "d/brief.yaml": "mine\n", "d/content/a.md": "keep" });
    const r = await run(dir, { scope: null });
    expect(r.code).toBe(2);
    expect(r.json.message).toBe("d/brief.yaml already exists: edit it, or delete it to start again");
    expect(readFileSync(join(dir, "d/brief.yaml"), "utf8")).toBe("mine\n");
    // a content/ that exists is kept as it is when there is no brief
    const other = tree({ "d/content/a.md": "keep" });
    expect((await run(other, {})).code).toBe(0);
    expect(readFileSync(join(other, "d/content/a.md"), "utf8")).toBe("keep");
  });

  it("--web exits 2, not available yet (3h)", async () => {
    for (const opts of [{ web: true }]) {
      const dir = tree();
      const r = await run(dir, opts);
      expect(r.code).toBe(2);
      expect(r.json.message).toContain("not available yet");
      expect(existsSync(join(dir, "d"))).toBe(false);
    }
  });

  it("a file in the way of DIR exits 2", async () => {
    const dir = tree({ d: "a file" });
    const r = await run(dir, {});
    expect(r.code).toBe(2);
    expect(r.json.status).toBe("error");
  });

  it("without --json the outcome is human text on stdout", async () => {
    const dir = tree();
    const c = capture(dir);
    expect(await runBrief("d", { ...GIVEN, json: false }, c.io)).toBe(0);
    expect(c.out[0]).toBe("wrote d/brief.yaml and d/content/");
  });
});

describe("the machine config's defaults per purpose", () => {
  const withConfig = (toml: string) => {
    const dir = tree({ "config.toml": toml });
    const c = capture(dir, { FULLMARK_CONFIG: "config.toml" });
    return { dir, c };
  };

  it("replace the defaults of one purpose, recorded as defaults, and a flag still wins", async () => {
    const { dir, c } = withConfig(
      '[brief.purpose.exam-prep]\nmix = ["calculation", "essay"]\ncount = 30\nminutes = 90\n[brief.purpose.survey]\ncount = 5\n',
    );
    expect(await runBrief("d", { ...GIVEN, minutes: "45" }, c.io)).toBe(0);
    const brief = readBrief(readFileSync(join(dir, "d/brief.yaml"), "utf8"), "brief.yaml").brief;
    expect([brief?.count, brief?.minutes, brief?.mix]).toEqual([30, 45, ["calculation", "essay"]]);
    expect(brief?.decided_by).toMatchObject({ count: "default", minutes: "user", mix: "default" });
    // another purpose keeps the built-in defaults
    const other = tree();
    expect(await runBrief("d", { ...GIVEN, purpose: "self-study" }, capture(other).io)).toBe(0);
    expect(readFileSync(join(other, "d/brief.yaml"), "utf8")).toContain("count: 20");
  });

  it("an error names config.toml and its line, and nothing is written", async () => {
    const cases: [string, number, RegExp][] = [
      ["[brief.purpose.exam]\ncount = 3\n", 1, /unknown purpose `exam`/],
      ['[brief.purpose.exam-prep]\nlanguage = "vi"\n', 2, /unknown key `language`/],
      ['[brief.purpose.exam-prep]\nmix = ["essay", "poetry"]\n', 2, /"poetry".*not one of/],
      ["[brief.purpose.exam-prep]\ncount = 2.5\n", 2, /`count` must be a whole number/],
      ["[brief.purpose.exam-prep]\nminutes = -1\n", 2, /`minutes` must be a number, 0 or more/],
      ['[brief.purpose.exam-prep]\nmode = "exam"\n', 2, /`mode` must be one of/],
    ];
    for (const [toml, line, message] of cases) {
      const { dir, c } = withConfig(toml);
      expect(await runBrief("d", GIVEN, c.io), toml).toBe(2);
      const error = JSON.parse(c.out[0] as string);
      expect(error.errors[0], toml).toMatchObject({ file: "config.toml", line });
      expect(error.errors[0].message, toml).toMatch(message);
      expect(existsSync(join(dir, "d"))).toBe(false);
    }
  });
});

describe("decisions pinned from 3g's review", () => {
  it("G20: --accept-defaults leaves commitment as default, since 0 is no goal", async () => {
    const dir = tree();
    await run(dir, { purpose: null, acceptDefaults: true });
    const brief = readBrief(readFileSync(join(dir, "d/brief.yaml"), "utf8"), "brief.yaml").brief;
    expect(brief?.commitment).toBe(0);
    expect(brief?.decided_by).toMatchObject({ purpose: "agent", commitment: "default" });
  });
});
