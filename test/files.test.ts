import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { expandInputs } from "../src/cli/files";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fullmark-files-"));
  for (const f of ["b.md", "a.md", "q1.md", "q22.md", "notes.txt", "deep/x/c.md", "deep/d.md"]) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    writeFileSync(join(dir, f), "");
  }
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe("expandInputs", () => {
  it("expands globs, sorted with a fixed comparison", () => {
    expect(expandInputs(["*.md"], dir).files).toEqual(["a.md", "b.md", "q1.md", "q22.md"]);
    expect(expandInputs(["q?.md"], dir).files).toEqual(["q1.md"]);
    expect(expandInputs(["[ab].md"], dir).files).toEqual(["a.md", "b.md"]);
  });

  it("expands ** across folders", () => {
    expect(expandInputs(["deep/**/*.md"], dir).files).toEqual(["deep/d.md", "deep/x/c.md"]);
  });

  it("keeps the order given and drops repeated names", () => {
    expect(expandInputs(["b.md", "*.md", "./b.md"], dir).files).toEqual(["b.md", "a.md", "q1.md", "q22.md"]);
  });

  it("reports a missing file, a folder and a glob with no match", () => {
    const r = expandInputs(["nope.md", "deep", "*.zip"], dir);
    expect(r.files).toEqual([]);
    expect(r.errors.map((e) => [e.input, e.message])).toEqual([
      ["nope.md", "no such file"],
      ["deep", "is a folder, not a quiz file"],
      ["*.zip", "no file matches"],
    ]);
  });

  it("lists files and errors together in the order the inputs were given", () => {
    const r = expandInputs(["a.md", "nope.md", "b.md", "deep", "*.zip"], dir);
    expect(r.items).toEqual([
      { file: "a.md" },
      { error: { input: "nope.md", message: "no such file" } },
      { file: "b.md" },
      { error: { input: "deep", message: "is a folder, not a quiz file" } },
      { error: { input: "*.zip", message: "no file matches" } },
    ]);
  });

  it("prints every path with / and relative to the working directory", () => {
    // the platform's own separator (a backslash on Windows) comes in; a slash goes out, on every platform
    expect(expandInputs([join("deep", "x", "c.md"), join(dir, "a.md")], dir).files).toEqual(["deep/x/c.md", "a.md"]);
  });

  it("does not let a glob match a folder", () => {
    expect(expandInputs(["d*"], dir).files).toEqual([]);
  });
});
