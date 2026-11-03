import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { type BriefOptions, runBrief } from "../../src/cli/brief";
import { loadQuestions } from "../../src/cli/brief-questions";
import { readBrief } from "../../src/core/rules/brief-read";
import { capture, tempTree } from "../helpers/cli";
import { fakeTerminal, KEY, pick, typed } from "../helpers/tui";

/**
 * `quiz brief --tui` driven in process: the form reads and draws through streams that report themselves as a terminal
 * (test/helpers/tui.ts). The byte-identity test at the end is the slice's criterion: the form and the equivalent flags
 * write the same bytes, `decided_by` included.
 */
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
const VI_SCOPE = "bài giảng 3 đến 5, phép biến đổi Fourier";
const questions = loadQuestions();

/** The prompts of the form in the question file's order, one key string each; `over` changes some. */
type Step =
  | "purpose"
  | "scope"
  | "kinds"
  | "other"
  | "elsewhere"
  | "count"
  | "minutes"
  | "mix"
  | "difficulty"
  | "mode"
  | "language"
  | "request"
  | "weak"
  | "commitment"
  | "profile";
const ORDER: Step[] = [
  "purpose",
  "scope",
  "kinds",
  "elsewhere",
  "count",
  "minutes",
  "mix",
  "difficulty",
  "mode",
  "language",
  "request",
  "weak",
  "commitment",
  "profile",
];
function walk(over: Partial<Record<Step, string>>, tail: string[] = [KEY.enter]): string[] {
  const steps: string[] = [];
  for (const step of ORDER) {
    steps.push(over[step] ?? (step === "scope" ? typed(SCOPE) : KEY.enter));
    if (step === "kinds" && over.other !== undefined) steps.push(over.other);
  }
  return [...steps, ...tail];
}

async function viaForm(
  script: string[],
  flags: Partial<BriefOptions> = {},
  files: Record<string, string> = {},
  more: Partial<BriefOptions> = {},
) {
  const dir = tree(files);
  const term = fakeTerminal(script);
  const c = capture(dir);
  const code = await runBrief("d", { ...NONE, ...flags, ...more, tui: true }, { ...c.io, tui: term });
  return {
    dir,
    code,
    term,
    c,
    text: existsSync(join(dir, "d/brief.yaml")) ? readFileSync(join(dir, "d/brief.yaml"), "utf8") : null,
  };
}
async function viaFlags(flags: Partial<BriefOptions>, files: Record<string, string> = {}) {
  const dir = tree(files);
  const c = capture(dir);
  const code = await runBrief("d", { ...NONE, ...flags }, c.io);
  return {
    dir,
    code,
    c,
    text: existsSync(join(dir, "d/brief.yaml")) ? readFileSync(join(dir, "d/brief.yaml"), "utf8") : null,
  };
}

describe("quiz brief --tui: the form", () => {
  it("asks every question in the question file's words, in steps, and ends on a summary", async () => {
    const r = await viaForm(walk({ purpose: pick(1) }));
    expect(r.code).toBe(0);
    const drawn = r.term.drawn();
    for (const q of questions.questions) {
      expect(drawn, q.key).toContain(q.label.en);
      expect(drawn, q.key).toContain(q.help.en);
    }
    for (const q of questions.questions.filter((x) => x.choices))
      for (const c of q.choices ?? []) expect(drawn, `${q.key} ${c.value}`).toContain(c.label.en);
    expect(drawn).toContain("Step 1/2: About the material");
    expect(drawn).toContain("Step 2/2: The quiz");
    expect(drawn).toContain("Your answers");
    // the defaults are marked on the summary
    expect(drawn).toContain("How many questions?: 20 (default)");
    expect(drawn).toContain("What is the quiz for?: Exam preparation");
  });

  it("draws on its own output, so stdout holds only the result line", async () => {
    const r = await viaForm(walk({}));
    expect(r.c.out).toHaveLength(1);
    expect(JSON.parse(r.c.out[0] as string)).toMatchObject({ status: "written", brief: "d/brief.yaml", warnings: [] });
    expect(r.c.err.join("\n")).not.toContain("What is the quiz for?");
  });

  it("without --json the outcome is the human text on stdout", async () => {
    const r = await viaForm(walk({}), {}, {}, { json: false });
    expect(r.c.out[0]).toBe("wrote d/brief.yaml and d/content/");
  });

  it("speaks Vietnamese with --language vi, and takes Vietnamese text", async () => {
    const r = await viaForm(walk({ scope: typed(VI_SCOPE) }), { language: "vi" });
    expect(r.code).toBe(0);
    const drawn = r.term.drawn();
    expect(drawn).toContain("Bước 1/2: Về tài liệu");
    for (const q of questions.questions) expect(drawn, q.key).toContain(q.label.vi);
    expect(r.text).toContain(`scope: "${VI_SCOPE}"`);
    expect(r.text).toContain("language: vi");
  });

  it("asks again for a scope under its minimum, showing the example, and writes no warning", async () => {
    const r = await viaForm(walk({ scope: typed("signals") + typed(SCOPE) }));
    expect(r.code).toBe(0);
    expect(r.term.drawn()).toContain(`for example "${SCOPE}"`);
    expect(JSON.parse(r.c.out[0] as string).warnings).toEqual([]);
    expect(r.text).toContain(`scope: "${SCOPE}"`);
  });

  it("asks again for a number out of range, and for a profile that does not exist", async () => {
    const r = await viaForm(
      walk({
        count: typed("many") + typed("0") + typed("12"),
        commitment: typed("101") + typed("80"),
        profile: typed("nope") + typed("exam"),
      }),
    );
    expect(r.code).toBe(0);
    expect(r.text).toContain("count: 12\n");
    expect(r.text).toContain("commitment: 80\n");
    expect(r.text).toContain('profile: "exam"\n');
  });

  it("an empty scope is not accepted (human-only), but an empty commitment is: no goal", async () => {
    const r = await viaForm(walk({ scope: typed("") + typed(SCOPE), commitment: typed("") }));
    expect(r.code).toBe(0);
    expect(r.term.drawn()).toContain("An answer is needed.");
    expect(r.text).toContain("commitment: 0\n");
    expect(r.text).toContain("commitment: default");
  });

  it("pre-fills from flags: the scope is in the box, and kept it is the user's word", async () => {
    const r = await viaForm(walk({ scope: KEY.enter }), { scope: SCOPE, count: "20" });
    expect(r.code).toBe(0);
    expect(r.term.drawn()).toContain(SCOPE);
    const brief = readBrief(r.text as string, "brief.yaml").brief;
    expect(brief?.decided_by).toMatchObject({ scope: "user", count: "user", minutes: "default" });
  });

  it("the follow-up box opens when other is picked, and only then", async () => {
    const withOther = await viaForm(
      walk({ kinds: `${KEY.down.repeat(5)}${KEY.space}${KEY.enter}`, other: typed("a field journal") }),
    );
    expect(withOther.text).toContain('kinds_other: "a field journal"');
    expect(withOther.term.drawn()).toContain(
      questions.questions.find((x) => x.key === "content.kinds")?.["follow-up"]?.label.en,
    );
    const without = await viaForm(walk({ kinds: `${KEY.space}${KEY.enter}` }));
    expect(without.text).toContain('kinds_other: ""');
    expect(without.term.drawn()).not.toContain(
      questions.questions.find((x) => x.key === "content.kinds")?.["follow-up"]?.label.en,
    );
  });

  it("the summary goes back to any question, and a changed purpose refills the defaults still at their default", async () => {
    // purpose self-study; count changed to 12; back to the purpose, now survey; write
    const r = await viaForm(walk({ count: typed("12") }, [pick(1), pick(3), KEY.enter]));
    expect(r.code).toBe(0);
    const brief = readBrief(r.text as string, "brief.yaml").brief;
    expect(brief?.purpose).toBe("survey");
    expect(brief?.mix).toEqual([]);
    expect(brief?.profile).toBe("survey");
    expect(brief?.count).toBe(12);
    expect(brief?.decided_by).toMatchObject({ purpose: "user", count: "user", mix: "default", profile: "default" });
    expect(r.term.prompts()).toBe(14 + 3);
  });

  it("uses the machine config's defaults of the purpose, and writes what flags with that config write", async () => {
    const files = { "config.toml": '[brief.purpose.exam-prep]\nmix = ["calculation", "essay"]\ncount = 30\n' };
    const dir = tree(files);
    const term = fakeTerminal(walk({ purpose: pick(1) }));
    const c = capture(dir, { FULLMARK_CONFIG: "config.toml" });
    expect(await runBrief("d", { ...NONE, tui: true }, { ...c.io, tui: term })).toBe(0);
    expect(term.drawn()).toContain("How many questions?: 30 (default)");
    const text = readFileSync(join(dir, "d/brief.yaml"), "utf8");
    const other = tree(files);
    const f = capture(other, { FULLMARK_CONFIG: "config.toml" });
    expect(await runBrief("d", { ...NONE, purpose: "exam-prep", scope: SCOPE }, f.io)).toBe(0);
    expect(text).toBe(readFileSync(join(other, "d/brief.yaml"), "utf8"));
    expect(text).toContain("count: 30\n");
  });
});

describe("quiz brief --tui: the exits", () => {
  it("Ctrl+C at a question writes nothing and exits 2 with cancelled", async () => {
    const r = await viaForm([KEY.enter, KEY.ctrlC]);
    expect(r.code).toBe(2);
    expect(JSON.parse(r.c.out[0] as string)).toEqual({ status: "cancelled" });
    expect(r.text).toBeNull();
    expect(existsSync(join(r.dir, "d"))).toBe(false);
  });

  it("Ctrl+C on the summary writes nothing either", async () => {
    const r = await viaForm(walk({}, [KEY.ctrlC]));
    expect(r.code).toBe(2);
    expect(r.text).toBeNull();
    expect(existsSync(join(r.dir, "d"))).toBe(false);
  });

  it("a stopped signal between prompts cancels too", async () => {
    // the abort of a SIGINT: the next prompt returns cancelled at once
    const { askForm } = await import("../../src/cli/brief-tui");
    const controller = new AbortController();
    controller.abort();
    const term = fakeTerminal([]);
    const result = await askForm({
      questions,
      lang: "en",
      prefill: {},
      overridesOf: () => ({}),
      profileProblem: () => null,
      input: term.input,
      output: term.output,
      signal: controller.signal,
    });
    expect(result).toBe("cancelled");
  });

  it("without a terminal it exits 2 with the message, and asks nothing", async () => {
    const dir = tree();
    const c = capture(dir);
    const plain = { input: new PassThrough(), output: new PassThrough() };
    const code = await runBrief("d", { ...NONE, tui: true }, { ...c.io, tui: plain });
    expect(code).toBe(2);
    expect(JSON.parse(c.out[0] as string).message).toBe(
      "--tui needs an interactive terminal: use --web, or give the answers as flags",
    );
    expect(existsSync(join(dir, "d"))).toBe(false);
  });

  it("an existing brief.yaml exits 2 before the form opens", async () => {
    const r = await viaForm(walk({}), {}, { "d/brief.yaml": "old" });
    expect(r.code).toBe(2);
    expect(r.term.prompts()).toBe(0);
    expect(readFileSync(join(r.dir, "d/brief.yaml"), "utf8")).toBe("old");
  });

  it("a bad flag value exits 2 before the form opens", async () => {
    const r = await viaForm(walk({}), { count: "many" });
    expect(r.code).toBe(2);
    expect(r.term.prompts()).toBe(0);
    expect(r.text).toBeNull();
  });

  it("G26: a bad flag wins over a missing terminal, and an existing brief.yaml too", async () => {
    const plain = { input: new PassThrough(), output: new PassThrough() };
    const bad = tree();
    const a = capture(bad);
    expect(await runBrief("d", { ...NONE, tui: true, purpose: "exam" }, { ...a.io, tui: plain })).toBe(2);
    expect(JSON.parse(a.out[0] as string).message).toContain('"exam"');
    expect(JSON.parse(a.out[0] as string).message).not.toContain("interactive terminal");
    const old = tree({ "d/brief.yaml": "old" });
    const b = capture(old);
    expect(await runBrief("d", { ...NONE, tui: true }, { ...b.io, tui: plain })).toBe(2);
    expect(JSON.parse(b.out[0] as string).message).toContain("already exists");
  });

  it("G29: an output that reports 0 columns, or none, is drawn at 80", async () => {
    const { withWidth } = await import("../../src/cli/brief-tui");
    const zero = fakeTerminal([]);
    zero.output.columns = 0;
    expect((withWidth(zero.output) as unknown as { columns: number }).columns).toBe(80);
    const none = fakeTerminal([]);
    (none.output as { columns?: number }).columns = undefined;
    expect((withWidth(none.output) as unknown as { columns: number }).columns).toBe(80);
    const real = fakeTerminal([]);
    expect(withWidth(real.output)).toBe(real.output);
    // and the form, run on a 0-column stream, still draws its steps on lines of their own
    const term = fakeTerminal([]);
    term.output.columns = 0;
    const controller = new AbortController();
    controller.abort();
    const { askForm } = await import("../../src/cli/brief-tui");
    await askForm({
      questions,
      lang: "en",
      prefill: {},
      overridesOf: () => ({}),
      profileProblem: () => null,
      input: term.input,
      output: term.output,
      signal: controller.signal,
    });
    // clack at width 0 draws one character per line; at 80 the intro line is whole
    expect(term.drawn()).toMatch(/[A-Za-z]{6,}/);
  });

  it("--accept-defaults and --web with --tui exit 2", async () => {
    for (const opts of [{ acceptDefaults: true }, { web: true }]) {
      const r = await viaForm(walk({}), {}, {}, opts);
      expect(r.code).toBe(2);
      expect(r.term.prompts()).toBe(0);
    }
  });
});

describe("the same answers through the form and through flags write the same bytes (and the same decided_by)", () => {
  type Case = {
    name: string;
    script: string[];
    form?: Partial<BriefOptions>;
    flags: Partial<BriefOptions>;
    files?: Record<string, string>;
  };
  const cases: Case[] = [
    ...(["self-study", "exam-prep", "classmates", "survey"] as const).map((purpose, i) => ({
      name: `purpose ${purpose}, defaults for the rest`,
      script: walk({ purpose: pick(i) }),
      flags: { purpose, scope: SCOPE },
    })),
    {
      name: "Vietnamese: the language answered in the form",
      script: walk({
        purpose: pick(2),
        scope: typed(VI_SCOPE),
        language: pick(1),
        request: typed("ôn kỹ phần chuỗi: Fourier # 2"),
      }),
      flags: { purpose: "classmates", scope: VI_SCOPE, language: "vi", request: "ôn kỹ phần chuỗi: Fourier # 2" },
    },
    {
      name: "Vietnamese: language given as a flag and kept",
      script: walk({ scope: typed(VI_SCOPE) }),
      form: { language: "vi", purpose: "self-study" },
      flags: { purpose: "self-study", scope: VI_SCOPE, language: "vi" },
    },
    {
      name: "other with its text, and notes",
      script: walk({
        kinds: `${KEY.down.repeat(2)}${KEY.space}${KEY.down.repeat(3)}${KEY.space}${KEY.enter}`,
        other: typed("a field journal: week 4"),
      }),
      flags: { purpose: "self-study", scope: SCOPE, kinds: "notes,other", kindsOther: "a field journal: week 4" },
    },
    {
      name: "the purpose changed on the way back",
      script: walk({ count: typed("12"), mode: pick(1) }, [pick(1), pick(1), KEY.enter]),
      flags: { purpose: "exam-prep", scope: SCOPE, count: "12", mode: "timed-exam" },
    },
    {
      name: "weak topics yes (and its warning)",
      script: walk({ weak: pick(-1) }),
      flags: { purpose: "self-study", scope: SCOPE, weakTopics: "yes" },
    },
    {
      name: "several answers changed, mix and minutes among them",
      script: walk({
        minutes: typed("37.5"),
        mix: `${KEY.space}${KEY.down.repeat(3)}${KEY.space}${KEY.enter}`,
        difficulty: pick(1),
        commitment: typed("75"),
        elsewhere: typed("the library's reserve copy"),
      }),
      flags: {
        purpose: "self-study",
        scope: SCOPE,
        minutes: "37.5",
        mix: "understanding,calculation,code".replace(
          "understanding,calculation,code",
          "calculation,understanding,code",
        ),
        difficulty: "harder",
        commitment: "75",
        elsewhere: "the library's reserve copy",
      },
    },
    {
      name: "a flag pre-fill kept, equal to its default",
      script: walk({ scope: KEY.enter }),
      form: { scope: SCOPE, count: "20", profile: "default" },
      flags: { purpose: "self-study", scope: SCOPE, count: "20", profile: "default" },
    },
  ];
  for (const c of cases) {
    it(c.name, async () => {
      const form = await viaForm(c.script, c.form ?? {}, c.files);
      const flags = await viaFlags(c.flags, c.files);
      expect(form.code).toBe(0);
      expect(flags.code).toBe(0);
      expect(form.text).toBe(flags.text);
      const a = JSON.parse(form.c.out[0] as string);
      const b = JSON.parse(flags.c.out[0] as string);
      expect(a.defaults_applied).toEqual(b.defaults_applied);
      expect(a.warnings).toEqual(b.warnings);
      expect(readBrief(form.text as string, "brief.yaml").issues).toEqual([]);
    });
  }
});
