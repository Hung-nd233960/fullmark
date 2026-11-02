import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALLOWED, generate, problems } from "../scripts/notices.mjs";
import { ACKNOWLEDGEMENTS, NOTICE_PACKAGES } from "../src/build/notices-data";

/**
 * What fullmark owes the packages it ships (TECHNICAL_DESIGN.md, section 3, "Licences"): every package in the CLI
 * bundle and in the page runtime has a notice, made by `npm run notices` from the bundles themselves, never by hand.
 */
const root = resolve(import.meta.dirname, "..");
const fresh = generate();

describe("THIRD_PARTY_NOTICES.md", () => {
  it("equals a fresh run: a dependency change without `npm run notices` fails here", async () => {
    const run = await fresh;
    expect(readFileSync(join(root, "THIRD_PARTY_NOTICES.md"), "utf8")).toBe(run.text);
    expect(readFileSync(join(root, "src/build/notices-data.ts"), "utf8")).toBe(run.module);
    expect(ACKNOWLEDGEMENTS).toBe(run.text);
  });

  it("starts with fullmark's own licence, then the components sorted by name", () => {
    const text = readFileSync(join(root, "THIRD_PARTY_NOTICES.md"), "utf8");
    expect(text.indexOf(readFileSync(join(root, "LICENSE"), "utf8").trim())).toBeGreaterThan(0);
    expect(text.indexOf("## fullmark")).toBeLessThan(text.indexOf("## Components"));
    const names = NOTICE_PACKAGES.map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("holds no development tool", () => {
    const names = NOTICE_PACKAGES.map((p) => p.name);
    for (const tool of ["vitest", "@playwright/test", "@biomejs/biome", "tsup", "esbuild", "typescript"]) {
      expect(names).not.toContain(tool);
    }
  });
});

describe("every component has a licence file and a licence on the allow-list", () => {
  it("is true of everything shipped now", async () => {
    expect(problems((await fresh).data)).toEqual([]);
  });

  it("names a package whose licence is outside the list or whose licence file is missing", () => {
    const data = {
      packages: [
        {
          name: "good",
          title: "good",
          version: "1.0.0",
          licence: "MIT",
          copyright: "Copyright (c) A",
          text: 0,
          where: ["cli"] as ("cli" | "page" | "maths" | "code" | "font")[],
        },
        {
          name: "odd",
          title: "odd",
          version: "2.1.0",
          licence: "GPL-3.0",
          copyright: "Copyright (c) B",
          text: 0,
          where: ["cli"] as ("cli" | "page" | "maths" | "code" | "font")[],
        },
        {
          name: "bare",
          title: "bare",
          version: "3.0.0",
          licence: "ISC",
          copyright: "Copyright (c) C",
          text: 1,
          where: ["page"] as ("cli" | "page" | "maths" | "code" | "font")[],
        },
      ],
      texts: [
        { licence: "MIT", body: "Permission is hereby granted" },
        { licence: "ISC", body: "" },
      ],
    };
    expect(problems(data)).toEqual([
      `odd 2.1.0: licence "GPL-3.0" is not one of ${ALLOWED.join(", ")}`,
      "bare 3.0.0: no licence text found in its package",
    ]);
    expect(ALLOWED).toEqual(["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "OFL-1.1"]);
  });
});

describe("the built CLI", () => {
  const dist = join(root, "dist");
  it("has a notice for every package esbuild bundled into a chunk", () => {
    const bundled = new Set<string>();
    for (const file of readdirSync(dist).filter((f) => f.endsWith(".js") && f !== "page.js")) {
      for (const m of readFileSync(join(dist, file), "utf8").matchAll(
        /^\/\/ node_modules\/((?:@[^/\n]+\/)?[^/\n]+)\//gm,
      )) {
        bundled.add(m[1] as string);
      }
    }
    expect(bundled.size).toBeGreaterThan(10);
    const noticed = new Set(NOTICE_PACKAGES.map((p) => p.name));
    expect([...bundled].filter((name) => !noticed.has(name))).toEqual([]);
  });

  it("`quiz --acknowledgements` prints the text of THIRD_PARTY_NOTICES.md", () => {
    const r = spawnSync(process.execPath, [join(dist, "cli.js"), "--acknowledgements"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(readFileSync(join(root, "THIRD_PARTY_NOTICES.md"), "utf8"));
  });
});
