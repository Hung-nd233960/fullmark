import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type CheckOptions, listContent, runCheck } from "../src/cli/check";
import { briefYaml } from "./helpers/brief";
import { capture, quiz, tempTree } from "./helpers/cli";

const root = resolve(import.meta.dirname, "..");
const opts = (o: Partial<CheckOptions> = {}): CheckOptions => ({
  profile: null,
  config: null,
  strict: false,
  review: null,
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
const json = (lines: string[]) => lines.map((l) => JSON.parse(l) as Record<string, unknown>);

describe("every example checks clean under its profile", () => {
  const examples = readdirSync(join(root, "examples"))
    .filter((n) => existsSync(join(root, "examples", n, "quiz.md")))
    .map((n) => join(root, "examples", n, "quiz.md"));
  for (const file of examples) {
    it(file.slice(root.length + 1).replaceAll("\\", "/"), () => {
      const c = capture(root);
      expect(runCheck([file], opts(), c.io)).toBe(0);
      expect(c.err).toEqual([]);
      expect(c.out.at(-1)).toMatch(/: 0 errors, 0 warnings$/);
    });
  }
});

describe("the output", () => {
  it("names the profile and the config files on its first line", () => {
    const dir = tree({
      "quiz.md": quiz(),
      "fullmark.toml": '[profiles.practice]\nextends = "draft"\n',
      ".git/HEAD": "",
    });
    const c = capture(dir);
    expect(runCheck(["quiz.md"], opts({ profile: "practice" }), c.io)).toBe(0);
    expect(c.out[0]).toBe("profile practice (fullmark.toml:1, built-in) from --profile; config: fullmark.toml");
  });

  it("prints each issue as file:line: level rule: message, with its fix", () => {
    const dir = tree({ "quiz.md": quiz("- [x] only one") });
    const c = capture(dir);
    expect(runCheck(["quiz.md"], opts(), c.io)).toBe(1);
    expect(c.out).toEqual([
      "profile default (built-in) from the default; config: none",
      "quiz.md:5: error choice.count: a choice question needs at least two choices",
      "    fix: write each choice as - [ ] text, with - [x] for the right one",
      "quiz.md: 1 error, 0 warnings",
    ]);
  });

  it("--json: one object per file, with the profile, the config, the counts, the issues and the ignores", () => {
    const dir = tree({ "quiz.md": quiz("- [x] Paris\n- [ ] Paris") });
    const c = capture(dir);
    expect(runCheck(["quiz.md"], opts({ json: true }), c.io)).toBe(0);
    expect(c.err).toEqual([]);
    expect(json(c.out)).toEqual([
      {
        status: "ok",
        file: "quiz.md",
        profile: "default",
        config: [],
        errors: 0,
        warnings: 1,
        issues: [
          {
            rule: "choice.duplicate",
            level: "warning",
            file: "quiz.md",
            line: 8,
            message: "this choice repeats the one on line 7",
            fix: "rewrite or remove the repeated choice",
          },
        ],
        ignored: [],
      },
    ]);
  });
});

describe("several files", () => {
  it("three quizzes, one broken: exit 1, three JSON lines and a summary line", () => {
    const dir = tree({ "a.md": quiz(), "b.md": quiz("- [x] only one"), "c.md": quiz() });
    const c = capture(dir);
    expect(runCheck(["a.md", "b.md", "c.md"], opts({ json: true }), c.io)).toBe(1);
    const lines = json(c.out);
    expect(lines.map((l) => [l.file, l.status])).toEqual([
      ["a.md", "ok"],
      ["b.md", "failed"],
      ["c.md", "ok"],
      [undefined, "done"],
    ]);
    expect(lines.at(-1)).toEqual({ status: "done", ok: 2, failed: 1 });
  });

  it("the worst exit code wins: a missing file is 2, and the others are still checked", () => {
    const dir = tree({ "a.md": quiz("- [x] only one") });
    const c = capture(dir);
    expect(runCheck(["a.md", "nope.md"], opts({ json: true }), c.io)).toBe(2);
    expect(json(c.out).map((l) => l.status)).toEqual(["failed", "error", "done"]);
  });

  it("expands globs, and refuses a folder", () => {
    const dir = tree({ "q1.md": quiz(), "q2.md": quiz(), "sub/x.md": quiz() });
    const c = capture(dir);
    expect(runCheck(["q*.md"], opts({ plain: true }), c.io)).toBe(0);
    expect(c.out.at(-1)).toBe("2 done, 0 failed");
    const folder = capture(dir);
    expect(runCheck(["sub"], opts(), folder.io)).toBe(2);
    expect(folder.err[0]).toBe("sub: is a folder, not a quiz file");
  });
});

describe("--strict, fail-on and --review", () => {
  const warn = quiz("- [x] Paris\n- [ ] Paris");

  it("a warning does not fail, unless --strict or fail-on = warning", () => {
    const dir = tree({
      "w.md": warn,
      "sub/w.md": warn,
      "sub/fullmark.toml": '[check]\nfail-on = "warning"\n',
      ".git/HEAD": "",
    });
    expect(runCheck(["w.md"], opts(), capture(dir).io)).toBe(0);
    expect(runCheck(["w.md"], opts({ strict: true }), capture(dir).io)).toBe(1);
    expect(runCheck([join("sub", "w.md")], opts(), capture(dir).io)).toBe(1);
  });

  it("info never fails, even with --strict", () => {
    const dir = tree({ "w.md": warn });
    expect(runCheck(["w.md"], opts({ strict: true, profile: "draft" }), capture(dir).io)).toBe(0);
  });

  it("--review exits 2 and says it is not available yet", () => {
    const dir = tree({ "q.md": quiz() });
    const c = capture(dir);
    expect(runCheck(["q.md"], opts({ review: "review.json" }), c.io)).toBe(2);
    expect(c.err[0]).toContain("not available yet");
  });
});

describe("profiles", () => {
  it("--profile overrides the quiz, which overrides the brief, which overrides [check] profile", () => {
    const dir = tree({
      "fullmark.toml": '[check]\nprofile = "draft"\n',
      ".git/HEAD": "",
      "cfg/quiz.md": quiz(),
      "brief/quiz.md": quiz(),
      "brief/brief.yaml": briefYaml({ profile: "exam", count: 1 }),
      "front/quiz.md": quiz("- [x] a\n- [ ] b", "title: T\nprofile: exam"),
      "front/brief.yaml": briefYaml({ profile: "draft", count: 1 }),
    });
    const name = (file: string, o: Partial<CheckOptions> = {}) => {
      const c = capture(dir);
      runCheck([file], opts({ json: true, ...o }), c.io);
      return json(c.out)[0]?.profile;
    };
    expect(name(join("cfg", "quiz.md"))).toBe("draft");
    expect(name(join("brief", "quiz.md"))).toBe("exam");
    expect(name(join("front", "quiz.md"))).toBe("exam");
    expect(name(join("front", "quiz.md"), { profile: "default" })).toBe("default");
  });

  it("an unknown profile in the front matter is a check error on its line, and default is used", () => {
    const dir = tree({ "q.md": quiz("- [x] a\n- [ ] b", "title: T\nprofile: exma") });
    const c = capture(dir);
    expect(runCheck(["q.md"], opts({ json: true }), c.io)).toBe(1);
    const [r] = json(c.out);
    expect(r?.profile).toBe("default");
    expect(r?.issues).toEqual([
      {
        rule: "profile.unknown",
        level: "error",
        file: "q.md",
        line: 3,
        message: "unknown profile `exma`",
        fix: "did you mean `exam`?",
      },
    ]);
  });

  it("an unknown profile on the command line exits 2", () => {
    const dir = tree({ "q.md": quiz() });
    const c = capture(dir);
    expect(runCheck(["q.md"], opts({ profile: "nope" }), c.io)).toBe(2);
    expect(c.err.join("\n")).toBe("q.md: unknown profile `nope`; the profiles are: default, draft, exam, survey");
  });

  it("an unknown --profile close to a known one says so, and still names them all", () => {
    const dir = tree({ "q.md": quiz() });
    const c = capture(dir);
    expect(runCheck(["q.md"], opts({ profile: "exma" }), c.io)).toBe(2); // spellchecker:disable-line
    expect(c.err.join("\n")).toContain("(did you mean `exam`?); the profiles are: default, draft, exam, survey");
  });

  it("a front-matter profile that is only defined in the config is known", () => {
    const dir = tree({
      "fullmark.toml": '[profiles.practice]\nextends = "default"\n',
      ".git/HEAD": "",
      "q.md": quiz("- [x] a\n- [ ] b", "title: T\nprofile: practice"),
    });
    const c = capture(dir);
    expect(runCheck(["q.md"], opts({ json: true }), c.io)).toBe(0);
    expect(json(c.out)[0]?.profile).toBe("practice");
  });

  it("a survey gets the survey profile", () => {
    const dir = tree({ "s.md": quiz("- [ ] a\n- [ ] b", "title: T\nkind: survey") });
    const c = capture(dir);
    runCheck(["s.md"], opts({ json: true }), c.io);
    expect(json(c.out)[0]?.profile).toBe("survey");
  });
});

describe("the config", () => {
  it("is looked for upwards from the quiz and stops at a git root", () => {
    const dir = tree({
      "fullmark.toml": '[check]\nprofile = "draft"\n',
      "repo/.git/HEAD": "",
      "repo/deep/er/quiz.md": quiz(),
      "plain/deep/quiz.md": quiz(),
    });
    const run = (file: string) => {
      const c = capture(dir);
      runCheck([file], opts({ json: true }), c.io);
      return json(c.out)[0];
    };
    expect(run(join("repo", "deep", "er", "quiz.md"))?.profile).toBe("default");
    expect(run(join("plain", "deep", "quiz.md"))).toMatchObject({ profile: "draft", config: ["fullmark.toml"] });
  });

  it("--config replaces the nearest fullmark.toml", () => {
    const dir = tree({
      "fullmark.toml": '[check]\nprofile = "draft"\n',
      "other.toml": '[check]\nprofile = "exam"\n',
      "quiz.md": quiz(),
    });
    const c = capture(dir);
    runCheck(["quiz.md"], opts({ json: true, config: "other.toml" }), c.io);
    expect(json(c.out)[0]).toMatchObject({ profile: "exam", config: ["other.toml"] });
  });

  it("the user config offers personal profiles, from FULLMARK_CONFIG", () => {
    const dir = tree({
      "mine.toml": '[library]\npath = "x"\n\n[profiles.mine]\nrules."question.untagged" = "warning"\n',
      "quiz.md": quiz(),
    });
    const c = capture(dir, { FULLMARK_CONFIG: "mine.toml" });
    expect(runCheck(["quiz.md"], opts({ json: true, profile: "mine" }), c.io)).toBe(0);
    const [r] = json(c.out);
    expect(r?.warnings).toBe(1);
    expect(r?.config).toEqual(["mine.toml"]);
  });

  it("a config error exits 2 and names file:line, in the text and in --json", () => {
    const dir = tree({
      "fullmark.toml": '[profiles.p]\nrules."choice.count" = "off"\n',
      "quiz.md": quiz(),
    });
    const human = capture(dir);
    expect(runCheck(["quiz.md"], opts(), human.io)).toBe(2);
    expect(human.err).toEqual([
      "quiz.md: the config has errors",
      "fullmark.toml:2: `choice.count` is a fixed rule: no profile can change it",
      "    fix: fixed rules say whether a quiz can work at all; fix the quiz instead",
    ]);
    const machine = capture(dir);
    expect(runCheck(["quiz.md"], opts({ json: true }), machine.io)).toBe(2);
    expect(json(machine.out)[0]).toMatchObject({
      status: "error",
      errors: [{ file: "fullmark.toml", line: 2 }],
    });
  });

  it("[check] profile that does not exist is a config error at its line", () => {
    const dir = tree({ "fullmark.toml": '\n[check]\nprofile = "nope"\n', "quiz.md": quiz() });
    const c = capture(dir);
    expect(runCheck(["quiz.md"], opts(), c.io)).toBe(2);
    expect(c.err[1]).toMatch(/^fullmark\.toml:3: unknown profile `nope`/);
  });

  it("an unreadable FULLMARK_CONFIG is a config error", () => {
    const dir = tree({ "quiz.md": quiz() });
    const c = capture(dir, { FULLMARK_CONFIG: "missing.toml" });
    expect(runCheck(["quiz.md"], opts(), c.io)).toBe(2);
    expect(c.err.join("\n")).toContain("the config file does not exist");
  });
});

describe("a brief beside the quiz", () => {
  it("adds the brief rules: count, generated_by, and a brief that cannot be read", () => {
    const dir = tree({
      "a/quiz.md": quiz(),
      "a/brief.yaml": briefYaml({ count: 10 }),
      "b/quiz.md": quiz(),
      "b/brief.yaml": briefYaml({ count: "many" as never }),
    });
    const a = capture(dir);
    expect(runCheck([join("a", "quiz.md")], opts({ json: true }), a.io)).toBe(0);
    expect(issuesOf(a.out).map((i) => i.rule)).toEqual(["brief.count", "brief.generated-by"]);
    const b = capture(dir);
    runCheck([join("b", "quiz.md")], opts({ json: true }), b.io);
    const issues = json(b.out)[0]?.issues as { rule: string; file: string; line: number }[];
    expect(issues).toEqual([expect.objectContaining({ rule: "brief.invalid", file: "b/brief.yaml", line: 7 })]);
  });

  it("looks at content/ for brief.content-kinds", () => {
    const dir = tree({
      "q/quiz.md": quiz("- [x] a\n- [ ] b", "title: T\ngenerated_by: m"),
      "q/brief.yaml": briefYaml({ count: 1, content: { kinds: ["textbook"], kinds_other: "", elsewhere: "" } }),
      "q/content/README.md": "x",
      "q/content/notes.txt": "x",
    });
    expect(listContent(join(dir, "q"))).toEqual(["notes.txt"]);
    const c = capture(dir);
    runCheck([join("q", "quiz.md")], opts({ json: true }), c.io);
    expect(issuesOf(c.out).map((i) => i.rule)).toEqual(["brief.content-kinds"]);
  });

  it("an unknown profile named in the brief falls back, with a warning on the brief's line", () => {
    const dir = tree({
      "quiz.md": quiz("- [x] a\n- [ ] b", "title: T\ngenerated_by: m"),
      "brief.yaml": briefYaml({ count: 1, profile: "exma" }),
    });
    const c = capture(dir);
    expect(runCheck(["quiz.md"], opts({ json: true }), c.io)).toBe(0);
    const [r] = json(c.out);
    expect(r?.profile).toBe("default");
    expect(r?.issues).toEqual([
      expect.objectContaining({ rule: "brief.invalid", file: "brief.yaml", line: 17, level: "warning" }),
    ]);
  });
});

describe("the check fixtures", () => {
  it("every valid fixture checks without an error", () => {
    const dir = join(root, "test", "fixtures", "valid");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
      const c = capture(dir);
      expect(runCheck([f], opts({ json: true }), c.io), f).toBe(0);
    }
  });

  it("the ignore.invalid fixtures give exactly their rule and line", () => {
    const dir = join(root, "test", "fixtures", "invalid");
    for (const f of ["ignore-no-because.md", "ignore-fixed-rule.md"]) {
      const c = capture(dir);
      expect(runCheck([f], opts({ json: true }), c.io), f).toBe(1);
      expect(issuesOf(c.out).map((i) => [i.rule, i.line])).toEqual([["ignore.invalid", 5]]);
    }
  });
});

describe("the built bundle", () => {
  const cli = join(root, "dist", "cli.js");
  const env = (dir: string) => ({ ...process.env, FULLMARK_CONFIG: join(dir, "no-config.toml"), NO_COLOR: "1" });

  it("check: exit codes and JSON lines through the real program", () => {
    const dir = tree({ "a.md": quiz(), "b.md": quiz("- [x] only one") });
    const r = spawnSync("node", [cli, "check", "a.md", "b.md", "--json"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...env(dir), FULLMARK_CONFIG: join(dir, "none.toml") },
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("the config file does not exist");
    const empty = tree({ "no-config.toml": "", "a.md": quiz(), "b.md": quiz("- [x] only one"), "c.md": quiz() });
    const ok = spawnSync("node", [cli, "check", "a.md", "b.md", "c.md", "--json"], {
      cwd: empty,
      encoding: "utf8",
      env: { ...process.env, FULLMARK_CONFIG: join(empty, "no-config.toml") },
    });
    expect(ok.status).toBe(1);
    const lines = ok.stdout
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines).toHaveLength(4);
    expect(lines.at(-1)).toEqual({ status: "done", ok: 2, failed: 1 });
  });

  it("--help lists check and rules, and says --review is not available yet", () => {
    const out = execFileSync("node", [cli, "--help"], { encoding: "utf8" });
    expect(out).toContain("check");
    expect(out).toContain("rules");
    expect(execFileSync("node", [cli, "check", "--help"], { encoding: "utf8" })).toMatch(/not\s+available\s+yet/);
  });
});

function issuesOf(lines: string[]): { rule: string; file: string; line: number }[] {
  return (JSON.parse(lines[0] ?? "{}") as { issues?: { rule: string; file: string; line: number }[] }).issues ?? [];
}
