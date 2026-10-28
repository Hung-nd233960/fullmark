import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runCheck } from "../src/cli/check";
import { runIds } from "../src/cli/ids";
import { loadQuiz } from "../src/cli/load";
import { capture, tempTree } from "./helpers/cli";

const root = resolve(import.meta.dirname, "..");
const valid = join(root, "test", "fixtures", "valid", "with-materials.md");
const opts = { profile: null, config: null, strict: false, review: null, json: true, plain: true };

const QUIZ = (materials: string[]) =>
  `---\ntitle: T\nmaterials:\n${materials.map((m) => `  - ${m}`).join("\n")}\n---\n\n## Q {type=single id=q}\n\n- [x] a\n- [ ] b\n`;
const PNG = new Uint8Array([137, 80, 78, 71, 1]);

describe("loading sheets", () => {
  it("reads the valid fixture: two sheets in order, a sheet-relative and a quiz-shared image", () => {
    const loaded = loadQuiz(valid);
    expect(loaded.issues).toEqual([]);
    expect(loaded.sheets.map((s) => [s.path, s.name])).toEqual([
      ["materials/formulas.md", "Formulas"],
      ["materials/constants.md", "Constants"],
    ]);
    expect(loaded.sheets[0]?.source).toContain("$x^2$");
    expect(loaded.assets.map((a) => a.path).sort()).toEqual(["assets/gradient.png", "materials/img/local.png"]);
    expect(loaded.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("has no sheets when there is no `materials`", () => {
    const t = tempTree({ "q.md": QUIZ([]).replace("materials:\n", "") });
    expect(loadQuiz(join(t.dir, "q.md")).sheets).toEqual([]);
    t.done();
  });

  it("empties `sheets` when a sheet has an error, and reports it at the sheet's path and line", () => {
    const t = tempTree({ "q.md": QUIZ(["m/a.md"]), "m/a.md": "# A\n\nx\n\n# B\n" });
    const loaded = loadQuiz(join(t.dir, "q.md"));
    expect(loaded.sheets).toEqual([]);
    expect(loaded.quiz).toBeNull();
    expect(loaded.issues.map((i) => [i.rule, i.file.endsWith("m/a.md"), i.line])).toEqual([
      ["materials.heading", true, 5],
    ]);
    t.done();
  });

  it("refuses a sheet whose image leaves the quiz folder", () => {
    const t = tempTree({ "sub/q.md": QUIZ(["a.md"]), "sub/a.md": "# A\n\n![x](../outside.png)\n" });
    const loaded = loadQuiz(join(t.dir, "sub", "q.md"));
    expect(loaded.issues.map((i) => i.rule)).toEqual(["asset.outside"]);
    expect(loaded.hash).toBeNull();
    t.done();
  });

  it("raises materials.empty as a warning, and does not fail the quiz", () => {
    const t = tempTree({ "q.md": QUIZ(["a.md"]), "a.md": "# Only a heading\n" });
    const loaded = loadQuiz(join(t.dir, "q.md"));
    expect(loaded.issues.map((i) => [i.rule, i.level])).toEqual([["materials.empty", "warning"]]);
    expect(loaded.quiz).not.toBeNull();
    expect(loaded.sheets).toHaveLength(1);
    t.done();
  });

  it("accepts a sheet in a subfolder written with ./ and ..", () => {
    const t = tempTree({
      "q.md": QUIZ(["./m/../m/a.md"]),
      "m/a.md": "# A\n\n![x](../img/x.png)\n",
    });
    writeFileSync(join(t.dir, "q.md"), QUIZ(["./m/../m/a.md"]));
    const dir = join(t.dir, "img");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "x.png"), PNG);
    const loaded = loadQuiz(join(t.dir, "q.md"));
    expect(loaded.issues).toEqual([]);
    expect(loaded.sheets[0]?.path).toBe("m/a.md");
    expect(loaded.assets.map((a) => a.path)).toEqual(["img/x.png"]);
    t.done();
  });
});

describe("letter case in paths", () => {
  it("is asset.missing for an image whose case differs, and the fix names the file", () => {
    const t = tempTree({
      "q.md": `---\ntitle: T\n---\n\n## Q {type=single id=q}\n\n![p](assets/normal.png)\n\n- [x] a\n- [ ] b\n`,
    });
    mkdirSync(join(t.dir, "Assets"), { recursive: true });
    writeFileSync(join(t.dir, "Assets", "Normal.png"), PNG);
    const loaded = loadQuiz(join(t.dir, "q.md"));
    expect(loaded.issues.map((i) => i.rule)).toEqual(["asset.missing"]);
    expect(loaded.issues[0]?.fix).toBe("the file is `Assets/Normal.png`; paths match letter case exactly");
    expect(loaded.hash).toBeNull();
    t.done();
  });

  it("is materials.missing for a sheet", () => {
    const t = tempTree({ "q.md": QUIZ(["m/Sheet.md"]), "m/sheet.md": "# S\n\nx\n" });
    const loaded = loadQuiz(join(t.dir, "q.md"));
    expect(loaded.issues.map((i) => i.rule)).toEqual(["materials.missing"]);
    expect(loaded.issues[0]?.fix).toContain("`m/sheet.md`");
    t.done();
  });
});

describe("the quiz hash covers the sheets", () => {
  const hashOf = (files: Record<string, string | Uint8Array>) => {
    const t = tempTree({});
    for (const [p, c] of Object.entries(files)) {
      const full = join(t.dir, p);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, c);
    }
    const hash = loadQuiz(join(t.dir, "q.md")).hash;
    t.done();
    return hash;
  };
  const base = { "q.md": QUIZ(["m/a.md"]), "m/a.md": "# A\n\nText.\n\n![i](i.png)\n", "m/i.png": PNG };

  it("changes when a sheet or an image a sheet uses changes", () => {
    const h = hashOf(base);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOf({ ...base, "m/a.md": "# A\n\nText!\n\n![i](i.png)\n" })).not.toBe(h);
    expect(hashOf({ ...base, "m/i.png": new Uint8Array([1, 2, 3]) })).not.toBe(h);
  });

  it("is the same for a sheet with CRLF or a BOM", () => {
    const h = hashOf(base);
    expect(hashOf({ ...base, "m/a.md": "﻿# A\r\n\r\nText.\r\n\r\n![i](i.png)\r\n" })).toBe(h);
  });
});

describe("check and ids", () => {
  it("reports a sheet's problem at the sheet's path, with --json and without", () => {
    const t = tempTree({ "q.md": QUIZ(["m/a.md"]), "m/a.md": "# A\n\nA [[b]] here.\n" });
    const json = capture(t.dir);
    expect(runCheck(["q.md"], opts, json.io)).toBe(1);
    const issues = (JSON.parse(json.out[0] ?? "{}") as { issues: { rule: string; file: string; line: number }[] })
      .issues;
    expect(issues.map((i) => [i.rule, i.file, i.line])).toEqual([["materials.question", "m/a.md", 3]]);
    const plain = capture(t.dir);
    expect(runCheck(["q.md"], { ...opts, json: false }, plain.io)).toBe(1);
    expect(plain.out.join("\n")).toContain("m/a.md:3: error materials.question");
    t.done();
  });

  it("reports materials.empty as a warning and exits 0", () => {
    const t = tempTree({ "q.md": QUIZ(["m/a.md"]), "m/a.md": "# A\n" });
    const c = capture(t.dir);
    expect(runCheck(["q.md"], opts, c.io)).toBe(0);
    const issues = (JSON.parse(c.out[0] ?? "{}") as { issues: { rule: string; level: string }[] }).issues;
    expect(issues.map((i) => [i.rule, i.level])).toEqual([["materials.empty", "warning"]]);
    t.done();
  });

  it("leaves a sheet untouched when `ids` runs", async () => {
    const t = tempTree({
      "q.md": QUIZ(["m/a.md"]).replace("id=q", ""),
      "m/a.md": "# A\n\n## Heading\n\nText.\n",
    });
    const before = readFileSync(join(t.dir, "m", "a.md"), "utf8");
    const c = capture(t.dir);
    await runIds(["q.md"], { dryRun: false, json: true, plain: true }, c.io);
    expect(readFileSync(join(t.dir, "m", "a.md"), "utf8")).toBe(before);
    t.done();
  });
});
