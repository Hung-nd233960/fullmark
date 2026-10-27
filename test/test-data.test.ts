import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const invalidDir = join(root, "test", "fixtures", "invalid");
const validDir = join(root, "test", "fixtures", "valid");

type Expected = Record<string, { rule: string | null; line: number; note?: string }>;
const expected: Expected = JSON.parse(readFileSync(join(invalidDir, "expected.json"), "utf8"));
const invalidNames = readdirSync(invalidDir)
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.slice(0, -3))
  .sort();

/** The rule ids of QUIZ_SYNTAX.md section 8a, read from the table's first column. */
function syntaxRules(): string[] {
  const doc = readFileSync(join(root, "docs", "design", "QUIZ_SYNTAX.md"), "utf8");
  const start = doc.indexOf("## 8a. Errors");
  const end = doc.indexOf("\n## 9.", start);
  const rows = doc
    .slice(start, end)
    .split("\n")
    .filter((l) => l.startsWith("| `"));
  return rows.flatMap((row) => [...(row.split("|")[1] ?? "").matchAll(/`([a-z.*-]+)`/g)].map((m) => m[1] ?? ""));
}

describe("invalid fixtures", () => {
  it("expected.json covers every fixture and nothing else", () => {
    expect(Object.keys(expected).sort()).toEqual(invalidNames);
  });

  it("every expected line points into its file", () => {
    for (const name of invalidNames) {
      const lines = readFileSync(join(invalidDir, `${name}.md`), "utf8").split("\n");
      const line = expected[name]?.line ?? 0;
      expect(line, name).toBeGreaterThanOrEqual(1);
      expect(line, name).toBeLessThanOrEqual(lines.length);
    }
  });

  it("every rule named is a rule of QUIZ_SYNTAX.md section 8a", () => {
    const known = new Set(syntaxRules());
    for (const [name, e] of Object.entries(expected)) {
      if (e.rule === null) {
        expect(e.note, `${name} has rule null and needs a note saying why`).toBeTruthy();
        continue;
      }
      const ok = known.has(e.rule) || (e.rule.startsWith("rubric.") && known.has("rubric.*"));
      expect(ok, `${name}: ${e.rule}`).toBe(true);
    }
  });

  it("every rule of section 8a has a fixture", () => {
    const used = new Set(Object.values(expected).map((e) => e.rule));
    const missing = syntaxRules().filter((r) =>
      r === "rubric.*" ? ![...used].some((u) => u?.startsWith("rubric.")) : !used.has(r),
    );
    expect(missing).toEqual([]);
  });

  it("the rubric rules of TECHNICAL_DESIGN.md section 6 each have a fixture", () => {
    const used = new Set(Object.values(expected).map((e) => e.rule));
    for (const r of ["mode-missing", "sum", "step", "scale", "weights", "duplicate-id"]) {
      expect(used.has(`rubric.${r}`), r).toBe(true);
    }
  });
});

/** Every Markdown file of a quiz (examples, template, valid fixtures) and the images it names. */
function quizFiles(): string[] {
  const out: string[] = [];
  for (const dir of ["examples", "templates"]) {
    for (const name of readdirSync(join(root, dir))) {
      const file = join(root, dir, name, "quiz.md");
      if (existsSync(file)) out.push(file);
    }
  }
  for (const f of readdirSync(validDir)) if (f.endsWith(".md")) out.push(join(validDir, f));
  return out;
}

describe("valid quizzes", () => {
  const files = quizFiles();

  it("finds six examples, the blank template and four fixtures", () => {
    expect(files.length).toBe(11);
  });

  for (const file of files) {
    const label = file.slice(root.length + 1).replaceAll("\\", "/");
    it(`${label}: assets exist, no 0.x syntax is left`, () => {
      const text = readFileSync(file, "utf8");
      const noCode = text.replace(/`[^`\n]*`/g, "");
      for (const m of noCode.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
        expect(existsSync(join(dirname(file), m[1] ?? "")), `${label}: ${m[1]}`).toBe(true);
      }
      expect(text).not.toMatch(/^> \[!/m);
      expect(text).not.toMatch(/\bmulti_scoring\b|\bshow_reference\b|\bshow_sample\b|^mode:/m);
      // every question heading carries type= and id=
      for (const h of text.matchAll(/^## .*$/gm)) {
        expect(h[0], `${label}: ${h[0]}`).toMatch(/\{[^}]*\btype=\w+[^}]*\}$/);
        expect(h[0], `${label}: ${h[0]}`).toMatch(/\{[^}]*\bid=[a-z][a-z0-9-]*[^}]*\}$/);
      }
    });
  }
});
