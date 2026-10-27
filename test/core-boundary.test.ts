import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const core = resolve(import.meta.dirname, "..", "src", "core");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

// Every module specifier in an import, export-from, dynamic import or require.
const specifier = /(?:from\s*|import\s*\(\s*|import\s+|require\s*\(\s*)["']([^"']+)["']/g;

describe("src/core boundary", () => {
  const files = sources(core);

  it("finds the core files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`imports no node:* module and nothing from library: ${file.slice(core.length + 1).replaceAll("\\", "/")}`, () => {
      const text = readFileSync(file, "utf8");
      const bad = [...text.matchAll(specifier)]
        .map((m) => m[1] ?? "")
        .filter((s) => s.startsWith("node:") || /(^|\/)library(\/|$)/.test(s));
      expect(bad).toEqual([]);
    });
  }
});
