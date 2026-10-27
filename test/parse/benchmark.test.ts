import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../../src/core/parse";

const examples = resolve(import.meta.dirname, "..", "..", "examples");

describe("parse speed", () => {
  it("parses the largest example in well under 50 ms (a generous limit, to catch accidents)", () => {
    const files = readdirSync(examples).map((n) => join(examples, n, "quiz.md"));
    const largest = files.reduce((a, b) => (statSync(a).size >= statSync(b).size ? a : b));
    const text = readFileSync(largest, "utf8");
    parse(text, largest); // warm up: the first call compiles the parser
    const times: number[] = [];
    for (let i = 0; i < 7; i++) {
      const start = performance.now();
      const result = parse(text, largest);
      times.push(performance.now() - start);
      expect(result.issues).toEqual([]);
    }
    times.sort((a, b) => a - b);
    const median = times[3] ?? 0;
    console.log(
      `parse benchmark: ${largest.slice(examples.length + 1)} (${text.length} bytes): median ${median.toFixed(2)} ms`,
    );
    expect(median).toBeLessThan(50);
  });

  it("parses a 300-question quiz in well under a second", () => {
    const one = (n: number) =>
      `## Question ${n}, with $x_${n}$ {type=single id=q-${n}}\n\n- [x] a\n- [ ] b\n- [ ] c\n\n::: explanation\nBecause.\n:::\n`;
    const text = `---\ntitle: Big\n---\n\n${Array.from({ length: 300 }, (_, i) => one(i)).join("\n")}`;
    const start = performance.now();
    const result = parse(text, "big.md");
    const ms = performance.now() - start;
    expect(result.issues).toEqual([]);
    expect(ms).toBeLessThan(1000);
  });
});
