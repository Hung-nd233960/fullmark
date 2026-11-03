import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A command loads only what it uses (TECHNICAL_DESIGN.md, section 7, "CLI startup"). tsup splits `dist/` into chunks
 * with the commands' lazy `import()` as the boundaries; this reads the chunks' static `import` lines (the ones Node
 * runs at load) and checks that `--version`, `--acknowledgements`, `check`, `rules`, `ids`, `grade`, `inspect`, `new` and `template` never reach the page builder, the
 * page renderer (Preact and the components) or the Markdown-to-HTML path of `build`.
 */
const dist = resolve(import.meta.dirname, "..", "dist");
const files = readdirSync(dist).filter((f) => f.endsWith(".js"));

/** esbuild leaves a `// path` comment above each module it bundles. */
const BUILD_ONLY = [
  "// node_modules/preact/",
  "// node_modules/preact-render-to-string/",
  "// node_modules/@preact/signals",
  "// src/page/",
  "// src/build/render.ts",
  "// src/build/page.ts",
  "// src/cli/build.ts",
];

/** The one-shot server (`src/serve/`): only the commands that serve load it. */
const SERVE_ONLY = ["// src/serve/"];

function entry(prefix: string): string {
  const name = files.find((f) => f === `${prefix}.js` || (f.startsWith(`${prefix}-`) && f.endsWith(".js")));
  if (!name) throw new Error(`dist/${prefix}*.js not found: run npm run build`);
  return name;
}

/** The file and every file it imports statically, however deep. Dynamic `import()` is not followed. */
function closure(start: string): string[] {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(join(dist, file), "utf8");
    for (const m of text.matchAll(
      /^(?:import|export)\b[^"';]*?\bfrom\s*"\.\/([^"]+\.js)"|^import\s*"\.\/([^"]+\.js)"/gm,
    )) {
      queue.push((m[1] ?? m[2]) as string);
    }
  }
  return [...seen];
}

function textOf(list: string[]): string {
  return list.map((f) => readFileSync(join(dist, f), "utf8")).join("\n");
}

describe("what each command loads", () => {
  it("the build command does hold the page builder (so the check below is not empty)", () => {
    const text = textOf(closure(entry("build")));
    for (const marker of BUILD_ONLY) expect(text, marker).toContain(marker);
  });

  it("the replay command holds the page builder, and `replay --help` (main) does not", () => {
    const text = textOf(closure(entry("replay-command")));
    for (const marker of BUILD_ONLY) expect(text, marker).toContain(marker);
  });

  it("the serve command holds the page builder and the server (so the checks below are not empty)", () => {
    const text = textOf(closure(entry("serve")));
    for (const marker of [...BUILD_ONLY, ...SERVE_ONLY]) expect(text, marker).toContain(marker);
  });

  it("the build and replay commands never load the server", () => {
    for (const name of ["build", "replay-command"]) {
      const text = textOf(closure(entry(name)));
      for (const marker of SERVE_ONLY) expect(text, `${name}: ${marker}`).not.toContain(marker);
    }
  });

  for (const name of ["main", "check", "rules", "ids", "grade", "acknowledgements", "inspect", "new", "template"]) {
    it(`${name} never loads the one-shot server`, () => {
      const text = textOf(closure(entry(name)));
      for (const marker of SERVE_ONLY) expect(text, marker).not.toContain(marker);
    });

    it(`${name} never reaches the page builder, the renderer or the build's Markdown-to-HTML path`, () => {
      const list = closure(entry(name));
      expect(list.some((f) => f.startsWith("build-"))).toBe(false);
      const text = textOf(list);
      for (const marker of BUILD_ONLY) expect(text, marker).not.toContain(marker);
    });
  }
});
