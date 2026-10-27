import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../../src/core/parse";
import { FIXED_RULES } from "../../src/core/rules/fixed";
import { findRule, RULE_IDS, RULES } from "../../src/core/rules/registry";

const root = resolve(import.meta.dirname, "..", "..");

/** The rule ids of QUIZ_SYNTAX.md section 8a, read from the table's first column. */
function syntaxRules(): string[] {
  const doc = readFileSync(join(root, "docs", "design", "QUIZ_SYNTAX.md"), "utf8");
  const start = doc.indexOf("## 8a. Errors");
  const end = doc.indexOf("\n## 9.", start);
  return doc
    .slice(start, end)
    .split("\n")
    .filter((l) => l.startsWith("| `"))
    .flatMap((row) => [...(row.split("|")[1] ?? "").matchAll(/`([a-z.*-]+)`/g)].map((m) => m[1] ?? ""));
}

const RUBRIC_RULES = ["mode-missing", "sum", "step", "scale", "weights", "duplicate-id"].map((r) => `rubric.${r}`);

describe("the registry", () => {
  it("has every fixed rule of QUIZ_SYNTAX.md section 8a", () => {
    const wanted = syntaxRules().flatMap((id) => (id === "rubric.*" ? RUBRIC_RULES : [id]));
    expect(wanted.length).toBeGreaterThan(50);
    expect(wanted.filter((id) => findRule(id)?.kind !== "fixed")).toEqual([]);
  });

  it("has no id twice, and every id is lower-case words joined by . and -", () => {
    expect(new Set(RULE_IDS).size).toBe(RULE_IDS.length);
    for (const id of RULE_IDS) expect(id, id).toMatch(/^[a-z]+(-[a-z]+)*\.[a-z]+(-[a-z]+)*$/);
  });

  it("describes every rule: a summary, why it matters, an example and a fix", () => {
    for (const r of RULES) {
      for (const field of ["summary", "why", "example", "fix"] as const) {
        expect(r[field].trim().length, `${r.id}: ${field}`).toBeGreaterThan(5);
      }
    }
  });

  it("gives every fixed rule raised by the parser an example that triggers it", () => {
    for (const r of FIXED_RULES.filter((f) => f.raisedBy === "parser")) {
      const rules = parse(r.example, "example.md").issues.map((i) => i.rule);
      expect(rules, `${r.id}: ${r.example}`).toContain(r.id);
    }
  });
});
