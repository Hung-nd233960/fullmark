import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type WriteError, writeFileAtomic } from "../src/cli/atomic";
import { readFailure } from "../src/cli/paths";
import { PLAN_SOURCES } from "../src/core/attempt/schema";
import { en, vi } from "../src/core/i18n";

const cli = resolve(import.meta.dirname, "..", "dist", "cli.js");

describe("--plain", () => {
  it.each(["check", "rules", "grade", "ids"])("is accepted and listed by `%s --help`", (command) => {
    const out = execFileSync("node", [cli, command, "--help"], { encoding: "utf8" });
    expect(out).toContain("--plain");
  });
});

describe("plain words for a file that cannot be read or written", () => {
  it("names the cause without the operating system's message or path", () => {
    expect(readFailure({ code: "ENOENT" })).toBe("no such file");
    expect(readFailure({ code: "EISDIR" })).toBe("is a folder, not a file");
    expect(readFailure({ code: "EACCES" })).toBe("permission denied");
    expect(readFailure({ code: "EPERM" })).toBe("permission denied");
    expect(readFailure({ code: "EEXIST" })).toBe("a file is in the way");
    expect(readFailure({ code: "ENOTDIR" })).toBe("a file is in the way");
  });

  it("a write into a folder that is really a file fails in plain words", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fullmark-write-"));
    try {
      writeFileSync(join(dir, "blocker"), "x");
      const error = await writeFileAtomic(join(dir, "blocker", "report.md"), new Uint8Array()).catch((e) => e);
      expect((error as WriteError).message).toBe("a file is in the way");
      const folder = await writeFileAtomic(dir, new Uint8Array()).catch((e) => e);
      expect((folder as WriteError).message).toBe("is a folder, not a file");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the report's words for the attempt's source and the goal", () => {
  it("has a word for every source in both languages", () => {
    for (const m of [en.report, vi.report]) {
      expect(Object.keys(m.source).sort()).toEqual([...PLAN_SOURCES].sort());
      for (const source of PLAN_SOURCES) expect(m.source[source]).not.toBe("");
    }
    expect(vi.report.source.full).not.toBe(en.report.source.full);
  });

  it("words the goal as the results card does, never as passed or failed", () => {
    expect(en.report.goalLine(60, true, false)).toBe("Goal 60%: reached");
    expect(en.report.goalLine(60, false, false)).toBe("Goal 60%: not reached yet");
    expect(en.report.goalLine(60, true, true)).toBe("Goal 60%: reached*");
    expect(vi.report.goalLine(60, true, false)).toBe("Mục tiêu 60%: đã đạt");
    expect(vi.report.goalLine(60, false, true)).toBe("Mục tiêu 60%: chưa đạt*");
  });
});
