import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { removeStaleTemps } from "../src/cli/atomic";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe("removeStaleTemps", () => {
  it("removes the two temp files of FILE and nothing else", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fm-temps-"));
    dirs.push(dir);
    const file = join(dir, "p.json");
    writeFileSync(file, "keep me");
    const gone = [".p.json.0123abcd.tmp", ".p.json.ffffffff.tmp"];
    const stay = [
      ".q.json.0123abcd.tmp", // another file's
      ".p.json.0123abc.tmp", // 7 hex
      ".p.json.0123abcde.tmp", // 9 hex
      ".p.json.4567ABCD.tmp", // upper-case hex (a different name: Windows folds case)
      ".p.json.0123abcd.tmp.bak",
      "p.json.0123abcd.tmp", // no leading dot
      ".pxjson.0123abcd.tmp", // the dot in the name is not a wildcard
    ];
    for (const n of [...gone, ...stay]) writeFileSync(join(dir, n), "x");
    mkdirSync(join(dir, ".p.json.89abcdef.tmp")); // a folder of that name
    await removeStaleTemps(file);
    for (const n of gone) expect(existsSync(join(dir, n))).toBe(false);
    for (const n of stay) expect(existsSync(join(dir, n))).toBe(true);
    expect(existsSync(join(dir, ".p.json.89abcdef.tmp"))).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("keep me");
    expect(readdirSync(dir)).toHaveLength(stay.length + 2);
  });

  it("is no error when the folder is missing or there is nothing to remove", async () => {
    await expect(removeStaleTemps(join(tmpdir(), "fm-temps-no-such-folder", "p.json"))).resolves.toBeUndefined();
  });
});
