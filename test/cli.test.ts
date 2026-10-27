import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const cli = resolve(root, "dist", "cli.js");

describe("the CLI bundle", () => {
  it("prints the version", () => {
    const out = execFileSync("node", [cli, "--version"], { encoding: "utf8" });
    expect(out.trim()).toBe("fullmark 1.0.0-alpha.0");
  });

  it("lists the commands in --help", () => {
    const out = execFileSync("node", [cli, "--help"], { encoding: "utf8" });
    expect(out).toContain("Usage: quiz");
    expect(out).toContain("ids");
  });

  it("is one file with a shebang", () => {
    const first = readFileSync(cli, "utf8").split("\n")[0];
    expect(first).toBe("#!/usr/bin/env node");
  });
});
