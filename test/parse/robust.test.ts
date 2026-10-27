import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { planIds } from "../../src/core/ids";
import { parse } from "../../src/core/parse";

const root = resolve(import.meta.dirname, "..", "..");

function samples(): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  for (const dir of ["examples", "templates"]) {
    for (const n of readdirSync(join(root, dir))) {
      out.push({ name: `${dir}/${n}`, text: readFileSync(join(root, dir, n, "quiz.md"), "utf8") });
    }
  }
  for (const dir of ["valid", "invalid"]) {
    const base = join(root, "test", "fixtures", dir);
    for (const f of readdirSync(base))
      if (f.endsWith(".md")) out.push({ name: `${dir}/${f}`, text: readFileSync(join(base, f), "utf8") });
  }
  return out;
}

describe("the parser never throws", () => {
  it("on any truncation of any example or fixture", () => {
    let runs = 0;
    for (const { name, text } of samples()) {
      for (let cut = 0; cut <= text.length; cut += 29) {
        const part = text.slice(0, cut);
        expect(() => parse(part, "t.md"), `${name} cut at ${cut}`).not.toThrow();
        expect(() => planIds(part), `${name} cut at ${cut}`).not.toThrow();
        runs++;
      }
    }
    expect(runs).toBeGreaterThan(500);
  }, 30_000);

  it("on odd input", () => {
    for (const text of [
      "",
      "\n",
      "---",
      "---\n---\n",
      "---\ntitle: T\n---\n## ",
      "﻿",
      "{{{{",
      "---\n[[\n---\n::: x",
      "\r\r\r",
    ]) {
      expect(() => parse(text, "t.md"), JSON.stringify(text)).not.toThrow();
    }
  });
});
