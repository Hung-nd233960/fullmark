import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type GradingCase = { name?: string; id?: string } & Record<string, unknown>;

const file = resolve(import.meta.dirname, "data", "grading_cases.json");
const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
const cases: GradingCase[] = Array.isArray(raw) ? raw : ((raw as { cases?: GradingCase[] }).cases ?? []);

describe("grading cases from 0.x (todo until slice 1d defines results-v2 answers)", () => {
  it("loads the cases", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  cases.forEach((c, i) => {
    it.todo(String(c.name ?? c.id ?? `case ${i + 1}`));
  });
});
