import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const cli = resolve(root, "dist", "cli.js");

describe("the CLI bundle", () => {
  beforeAll(() => {
    // Build once when the bundle is missing; `npm run check` before a release builds it fresh.
    if (!existsSync(cli)) execFileSync("npm", ["run", "build"], { cwd: root, shell: true, stdio: "ignore" });
  }, 120_000);

  it("prints the version", () => {
    const out = execFileSync("node", [cli, "--version"], { encoding: "utf8" });
    expect(out.trim()).toBe("fullmark 1.0.0-alpha.0");
  });

  it("lists no commands yet in --help", () => {
    const out = execFileSync("node", [cli, "--help"], { encoding: "utf8" });
    expect(out).toContain("Usage: quiz");
    expect(out).not.toContain("Commands:");
  });

  it("is one file with a shebang", () => {
    const first = readFileSync(cli, "utf8").split("\n")[0];
    expect(first).toBe("#!/usr/bin/env node");
  });
});
