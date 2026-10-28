import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { QUALITY_RULES } from "../../src/core/rules/quality";
import { RULE_IDS } from "../../src/core/rules/registry";

const root = resolve(import.meta.dirname, "..", "..");
const contract: string[] = JSON.parse(readFileSync(join(root, "test", "data", "rule-ids.json"), "utf8"));

describe("rule ids are a contract", () => {
  it("none is removed or renamed", () => {
    expect(contract.filter((id) => !RULE_IDS.includes(id))).toEqual([]);
  });

  it("a new one is added to test/data/rule-ids.json on purpose", () => {
    expect(RULE_IDS.filter((id) => !contract.includes(id))).toEqual([]);
  });

  it("the contract file is sorted, without repeats", () => {
    expect([...contract].sort()).toEqual(contract);
    expect(new Set(contract).size).toBe(contract.length);
  });
});

describe("every rule has a fixture", () => {
  const invalid: Record<string, { rule: string }> = JSON.parse(
    readFileSync(join(root, "test", "fixtures", "invalid", "expected.json"), "utf8"),
  );
  const fromInvalid = new Set(Object.values(invalid).map((e) => e.rule));
  // judged by test/rules/check.test.ts and test/check-cli.test.ts: check raises it, no parser fixture holds it
  const byCheckTests = new Set(["config.ignored"]);
  const briefRules = new Set([
    "brief.count",
    "brief.mix",
    "brief.content-kinds",
    "brief.past-exams",
    "brief.generated-by",
    "brief.mode",
    "brief.invalid",
  ]);
  const qualityFixtures = new Set(QUALITY_RULES.map((r) => r.id));

  it("triggers each fixed rule (the rubric rules wait for the grading slice)", () => {
    const missing = RULE_IDS.filter(
      (id) =>
        !fromInvalid.has(id) &&
        !byCheckTests.has(id) &&
        !briefRules.has(id) &&
        !qualityFixtures.has(id) &&
        !id.startsWith("rubric."),
    );
    expect(missing).toEqual([]);
  });

  it("holds a fixture for each of the six rubric rules, kept pending until slice 1d", () => {
    for (const id of RULE_IDS.filter((r) => r.startsWith("rubric."))) expect(fromInvalid.has(id), id).toBe(true);
  });
});
