import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runNew } from "../src/cli/new";
import { runTemplateAdd, runTemplateRemove } from "../src/cli/template";
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
