import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { freshId, runNew } from "../src/cli/new";
import { runTemplateAdd, runTemplateList, runTemplateRemove } from "../src/cli/template";
import { capture, quiz, tempTree } from "./helpers/cli";

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
const TEMPLATES = "no-home/.config/fullmark/templates";

describe("template rm asks first", () => {
  const files = { [`${TEMPLATES}/mine/quiz.md`]: quiz() };

  it("removes the folder when the answer is yes, and keeps it when the answer is no", async () => {
    const dir = tree(files);
    const c = capture(dir);
    const no = await runTemplateRemove("mine", { yes: false, json: false }, { ...c.io, ask: async () => false });
    expect(no).toBe(2);
    expect(existsSync(join(dir, TEMPLATES, "mine"))).toBe(true);
    const yes = await runTemplateRemove("mine", { yes: false, json: false }, { ...c.io, ask: async () => true });
    expect(yes).toBe(0);
    expect(existsSync(join(dir, TEMPLATES, "mine"))).toBe(false);
  });
});

describe("new never overwrites, and writes nothing when it cannot write everything", () => {
  it("a file in the way of an asset leaves the quiz unwritten too", async () => {
    const dir = tree({ "demo/assets/cubic.png": "mine" });
    const c = capture(dir);
    expect(await runNew(["calculus", "demo"], { from: null, skeleton: false }, c.io)).toBe(2);
    expect(existsSync(join(dir, "demo", "quiz.md"))).toBe(false);
    expect(readFileSync(join(dir, "demo/assets/cubic.png"), "utf8")).toBe("mine");
  });
});

describe("a template keeps the ids it was stored with; a quiz started from it does not", () => {
  it("template add stores the quiz as given, and new drops the ids", async () => {
    const dir = tree({ "week.md": quiz("- [x] a\n- [ ] b", "title: Week\nid: week-3") });
    const c = capture(dir);
    expect(await runTemplateAdd("week.md", { as: "week", skeleton: false, replace: false, json: false }, c.io)).toBe(0);
    const stored = readFileSync(join(dir, TEMPLATES, "week/week.md"), "utf8");
    expect(stored).toContain("id: week-3");
    expect(stored).toContain("id=q}");
    expect(await runNew(["week", "out"], { from: null, skeleton: false }, c.io)).toBe(0);
    const made = readFileSync(join(dir, "out/week.md"), "utf8");
    expect(made).not.toContain("week-3");
    expect(made).not.toContain("id=q");
  });
});

describe("a new quiz gets its own id (owner, 2026-11-03)", () => {
  it("freshId: the folder for quiz.md, the file otherwise, slugged and a valid id", () => {
    expect(freshId("/x/demo", "quiz.md")).toBe("demo");
    expect(freshId("/x/demo", "Week 3.md")).toBe("week-3");
    expect(freshId("/x/demo", "3rd.md")).toBe("quiz-3rd");
    expect(freshId("/x/***", "quiz.md")).toBeNull();
    expect(freshId("/x/2024-midterm", "quiz.md")).toBe("quiz-2024-midterm");
    const long = `${"word-".repeat(14)}end`; // 73 characters
    expect(freshId("/x/demo", `${long}.md`)).toBe(`${"word-".repeat(12)}word`);
    expect(freshId("/x/demo", `${"a".repeat(70)}.md`)).toBe("a".repeat(64));
    expect(freshId("/x/日本語", "quiz.md")).toBeNull();
  });

  it("new TEMPLATE FOLDER uses the folder's name, new --from X.md the file's, --json prints the object", async () => {
    const dir = tree({ "src.md": quiz("- [x] a\n- [ ] b", "title: S\nid: src") });
    const c = capture(dir);
    expect(await runNew(["rust", "demo"], { from: null, skeleton: false }, c.io)).toBe(0);
    expect(readFileSync(join(dir, "demo/quiz.md"), "utf8")).toMatch(/^id: demo$/m);
    const j = capture(dir);
    expect(await runNew(["signals/week3.md"], { from: "src.md", skeleton: false, json: true }, j.io)).toBe(0);
    expect(readFileSync(join(dir, "signals/week3.md"), "utf8")).toMatch(/^id: week3$/m);
    expect(JSON.parse(j.out.join("\n"))).toEqual({ status: "written", file: "signals/week3.md", template: null });
    expect(j.err.join("\n")).toContain("quiz ids signals/week3.md");
    const s = capture(dir);
    expect(await runNew(["sk"], { from: "src.md", skeleton: true }, s.io)).toBe(0);
    expect(readFileSync(join(dir, "sk/src.md"), "utf8")).toMatch(/^id: src$/m);
  });

  it("without a PATH the id is the working folder's name (not a golden: the folder's name is random there)", async () => {
    const dir = tree({});
    const c = capture(dir);
    expect(await runNew(["blank"], { from: null, skeleton: false }, c.io)).toBe(0);
    const id = /^id: (.+)$/m.exec(readFileSync(join(dir, "quiz.md"), "utf8"))?.[1];
    expect(id).toBe(freshId(dir, "quiz.md"));
    expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("an existing .md target exits 2 and --json says so", async () => {
    const dir = tree({ "a.md": quiz(), "t.md": "mine" });
    const c = capture(dir);
    expect(await runNew(["t.md"], { from: "a.md", skeleton: false, json: true }, c.io)).toBe(2);
    expect(JSON.parse(c.out.join("\n")).status).toBe("error");
    expect(readFileSync(join(dir, "t.md"), "utf8")).toBe("mine");
  });
});

describe("template list shows folders that cannot be used", () => {
  it("lists a folder with no .md or two as invalid, with the reason, and new refuses it", async () => {
    const dir = tree({
      [`${TEMPLATES}/empty/assets/x.png`]: "x",
      [`${TEMPLATES}/two/a.md`]: quiz(),
      [`${TEMPLATES}/two/b.md`]: quiz(),
      [`${TEMPLATES}/fine/quiz.md`]: quiz(),
    });
    const c = capture(dir);
    expect(runTemplateList(true, c.io)).toBe(0);
    const rows = JSON.parse(c.out.join("\n")) as { name: string; invalid: string | null }[];
    expect(rows.filter((r) => r.invalid !== null).map((r) => r.name)).toEqual(["empty", "two"]);
    expect(rows.find((r) => r.name === "empty")?.invalid).toBe("no quiz .md at the top of the folder");
    expect(rows.find((r) => r.name === "two")?.invalid).toContain("2 .md files");
    expect(rows.find((r) => r.name === "fine")?.invalid).toBeNull();
    const h = capture(dir);
    runTemplateList(false, h.io);
    expect(h.out.join("\n")).toContain("(invalid: no quiz .md");
    const n = capture(dir);
    expect(await runNew(["empty", "out"], { from: null, skeleton: false }, n.io)).toBe(2);
    expect(n.err.join("\n")).toContain("cannot be used");
  });
});
