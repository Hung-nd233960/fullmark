import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type RulesOptions, runRules } from "../src/cli/rules";
import { RULES } from "../src/core/rules/registry";
import { capture, quiz, tempTree } from "./helpers/cli";

const opts = (o: Partial<RulesOptions> = {}): RulesOptions => ({
  profile: null,
  for: null,
  config: null,
  json: false,
  plain: true,
  ...o,
});

let trees: { done(): void }[] = [];
afterEach(() => {
  for (const t of trees) t.done();
  trees = [];
});
const tree = (files: Record<string, string>) => {
  const t = tempTree(files);
  trees.push(t);
  return t.dir;
};

type Row = {
  id: string;
  kind: string;
  level: string;
  options: Record<string, unknown>;
  origin: string;
  description: string;
};
const rowsOf = (out: string[]) => (JSON.parse(out[0] ?? "{}") as { rules: Row[] }).rules;

const CONFIG = `
[profiles.signals-exam]
extends = "exam"
rules."brief.count" = { tolerance = 0.05 }
rules."question.untagged" = "warning"

[[profiles.signals-exam.checks]]
id = "custom.two-essays"
kind = "count"
where = { type = "essay" }
max = 2
message = "The real exam has two essays at most."
`;

describe("quiz rules", () => {
  it("--json: the profile, its chain, the config and every rule with kind, level, options, origin and description", () => {
    const dir = tree({});
    const c = capture(dir);
    expect(runRules(null, opts({ json: true }), c.io)).toBe(0);
    const body = JSON.parse(c.out[0] ?? "{}") as { profile: string; chain: string[]; config: string[]; rules: Row[] };
    expect(body).toMatchObject({ profile: "default", chain: ["default"], config: [] });
    expect(body.rules.map((r) => r.id)).toEqual(RULES.map((r) => r.id));
    expect(body.rules.find((r) => r.id === "choice.correct-longest")).toEqual({
      id: "choice.correct-longest",
      kind: "quality",
      level: "warning",
      options: { "min-length": 40, ratio: 1.8 },
      origin: "built-in",
      description: "the right choice is much longer than every wrong one",
    });
    expect(body.rules.find((r) => r.id === "choice.count")).toMatchObject({ kind: "fixed", level: "error" });
  });

  it("--profile shows the rules under that profile", () => {
    const c = capture(tree({}));
    runRules(null, opts({ json: true, profile: "exam" }), c.io);
    const rows = rowsOf(c.out);
    expect(rows.find((r) => r.id === "explanation.short")).toMatchObject({
      level: "error",
      options: { "min-words": 8 },
      origin: "profile exam",
    });
  });

  it("the plain listing starts with the profile line and the chain, one rule per line", () => {
    const c = capture(tree({}));
    expect(runRules(null, opts({ profile: "exam" }), c.io)).toBe(0);
    expect(c.out[0]).toBe("profile exam (built-in) from --profile; config: none");
    expect(c.out[1]).toBe("profile chain: exam extends default");
    expect(c.out.some((l) => /^choice\.correct-longest\s+quality\s+error\s+the right choice/.test(l))).toBe(true);
    expect(c.out.some((l) => l.trim() === "options: min-length=40, ratio=1.8")).toBe(true);
  });

  it("RULE: the rule in full, with what it catches, why, an example and the fix", () => {
    const c = capture(tree({}));
    expect(runRules("choice.correct-longest", opts(), c.io)).toBe(0);
    const text = c.out.join("\n");
    expect(text).toContain("choice.correct-longest  (quality rule)");
    expect(text).toContain("level: warning  (built-in, under profile default)");
    expect(text).toContain("min-length = 40  (built-in)");
    expect(text).toContain("What it catches:");
    expect(text).toContain("Why it matters:");
    expect(text).toContain("An example that triggers it:");
    expect(text).toContain("How to fix it:");
  });

  it("RULE --json adds why, example and fix", () => {
    const c = capture(tree({}));
    runRules("choice.count", opts({ json: true }), c.io);
    const [row] = (JSON.parse(c.out[0] ?? "{}") as { rules: Record<string, unknown>[] }).rules;
    expect(row).toMatchObject({ id: "choice.count", kind: "fixed" });
    expect(Object.keys(row ?? {})).toEqual(expect.arrayContaining(["why", "example", "fix", "summary"]));
  });

  it("an unknown rule exits 2 with a suggestion", () => {
    const c = capture(tree({}));
    expect(runRules("choice.duplicat", opts(), c.io)).toBe(2); // spellchecker:disable-line
    expect(c.err).toEqual(["unknown rule `choice.duplicat`", "did you mean `choice.duplicate`?"]); // spellchecker:disable-line
  });

  it("an unknown profile exits 2", () => {
    const c = capture(tree({}));
    expect(runRules(null, opts({ profile: "exma" }), c.io)).toBe(2); // spellchecker:disable-line
    expect(c.err.join("\n")).toContain("did you mean `exam`?");
  });

  it("a malformed config exits 2 with file:line", () => {
    const dir = tree({ "fullmark.toml": "[check]\nprofile = 3\n" });
    const c = capture(dir);
    expect(runRules(null, opts(), c.io)).toBe(2);
    expect(c.err[1]).toBe("fullmark.toml:2: `profile` must be the name of a profile, in quotes");
  });
});

describe("quiz rules --for FILE", () => {
  const files = {
    "fullmark.toml": CONFIG,
    ".git/HEAD": "",
    "q/quiz.md": quiz("- [x] a\n- [ ] b", "title: T\nprofile: signals-exam"),
  };

  it("resolves the profile as check would, with the chain and where each value came from", () => {
    const dir = tree(files);
    const c = capture(dir);
    expect(runRules(null, opts({ for: join("q", "quiz.md"), json: true }), c.io)).toBe(0);
    const body = JSON.parse(c.out[0] ?? "{}") as { profile: string; chain: string[]; config: string[]; rules: Row[] };
    expect(body.profile).toBe("signals-exam");
    expect(body.chain).toEqual(["signals-exam", "exam", "default"]);
    expect(body.config).toEqual(["fullmark.toml"]);
    const by = (id: string) => body.rules.find((r) => r.id === id);
    expect(by("brief.count")).toMatchObject({ level: "error", options: { tolerance: 0.05 }, origin: "profile exam" });
    expect(by("question.untagged")).toMatchObject({ level: "warning", origin: "fullmark.toml:5" });
    expect(by("custom.two-essays")).toMatchObject({
      kind: "custom",
      level: "error",
      origin: "fullmark.toml:7",
      description: "The real exam has two essays at most.",
    });
    expect(by("explanation.short")).toMatchObject({
      level: "error",
      options: { "min-words": 8 },
      origin: "profile exam",
    });
    expect(by("choice.duplicate")).toMatchObject({ level: "error", origin: "profile exam" });
    expect(by("quiz.no-time-limit")).toMatchObject({ level: "off", origin: "built-in" });
  });

  it("the plain listing shows the origin of each rule", () => {
    const dir = tree(files);
    const c = capture(dir);
    runRules(null, opts({ for: join("q", "quiz.md") }), c.io);
    expect(c.out[1]).toBe("profile chain: signals-exam extends exam extends default");
    expect(c.out.find((l) => l.startsWith("custom.two-essays"))).toMatch(/\[fullmark\.toml:7\]$/);
    expect(c.out.find((l) => l.startsWith("choice.count"))).toMatch(/\[built-in\]$/);
  });

  it("a custom rule can be shown in full", () => {
    const dir = tree(files);
    const c = capture(dir);
    expect(runRules("custom.two-essays", opts({ for: join("q", "quiz.md") }), c.io)).toBe(0);
    expect(c.out[0]).toBe("custom.two-essays  (custom rule)");
  });

  it("a quiz with no profile of its own is held to default; a missing file exits 2", () => {
    const dir = tree({ "q.md": quiz() });
    const c = capture(dir);
    runRules(null, opts({ for: "q.md", json: true }), c.io);
    expect((JSON.parse(c.out[0] ?? "{}") as { profile: string }).profile).toBe("default");
    expect(runRules(null, opts({ for: "nope.md" }), capture(dir).io)).toBe(2);
  });
});

describe("build.size", () => {
  it("is registered with its options, and says that build checks it", () => {
    const c = capture(tree({}));
    expect(runRules("build.size", opts({ json: true }), c.io)).toBe(0);
    const [row] = rowsOf(c.out);
    expect(row).toMatchObject({ id: "build.size", kind: "quality", level: "warning" });
    expect(row?.options).toEqual({ "warn-mb": 20, "max-mb": 100 });
    expect(row?.description).toContain("`build`");
  });

  it("can be set by a profile, and check accepts the config", () => {
    const dir = tree({
      "fullmark.toml": '[profiles.big]\nextends = "default"\nrules."build.size" = { level = "error", warn-mb = 5 }\n',
      ".git/HEAD": "",
      "q.md": quiz(),
    });
    const c = capture(dir);
    expect(runRules("build.size", opts({ json: true, profile: "big" }), c.io)).toBe(0);
    expect(rowsOf(c.out)[0]).toMatchObject({ level: "error", options: { "warn-mb": 5, "max-mb": 100 } });
  });

  it("is made an error by the exam profile and softened by draft, like any quality rule on in default", () => {
    for (const [profile, level] of [
      ["exam", "error"],
      ["draft", "info"],
      ["survey", "warning"],
    ] as const) {
      const c = capture(tree({}));
      runRules("build.size", opts({ json: true, profile }), c.io);
      expect(rowsOf(c.out)[0]?.level, profile).toBe(level);
    }
  });
});
