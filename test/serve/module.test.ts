import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPage, type PageOptions } from "../../src/build/page";
import { build } from "../helpers/page";

/**
 * The browser half of the one-shot server and the served page (TECHNICAL_DESIGN.md, foundation 9): a `build` page is
 * the same with and without the server features and holds no server code; the served page adds the module, its hash
 * and `connect-src 'self'`, and nothing else.
 */
const root = resolve(import.meta.dirname, "..", "..");
const dist = join(root, "dist");
const runtime = readFileSync(join(dist, "page.js"), "utf8");
const css = readFileSync(join(dist, "page.css"), "utf8");
const serveModule = readFileSync(join(dist, "serve.js"), "utf8");
const options: PageOptions = { runtime, css, builtAt: "2026-10-28T10:00:00+07:00", version: "1.0.0-test" };
const quiz = build(
  ["---", "title: Tiny", "---", "", "## Pick {type=single id=a}", "", "- [x] Yes", "- [ ] No", ""].join("\n"),
);

const cspOf = (html: string): string => /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? "";

describe("a shared page carries no server code", () => {
  const plain = buildPage([quiz], options);

  it("has no connect-src, no module and no trace of the module's code", () => {
    expect(cspOf(plain)).not.toContain("connect-src");
    expect(plain.match(/<script>/g)).toHaveLength(1);
    expect(plain).not.toContain(serveModule);
    expect(plain).not.toContain("./submit");
    expect(plain).not.toContain("./progress");
    expect(plain).not.toContain("fetch(");
  });

  it("has a PageData with no `served`, and a runtime with nothing that emits `sent` or `send-failed`", () => {
    const data = /<script type="application\/json" id="fm-data">([\s\S]*?)<\/script>/.exec(plain)?.[1] ?? "";
    const parsed = JSON.parse(data) as Record<string, unknown>;
    for (const key of ["served", "section", "autosave", "saved", "focus"]) expect(parsed).not.toHaveProperty(key);
    // the page only listens for the two events; the module is the one that emits them
    expect(runtime).not.toMatch(/emit\(["']sent["']/);
    expect(runtime).not.toMatch(/emit\(["']send-failed["']/);
    expect(serveModule).toMatch(/emit\(.{0,12}["']send-failed["']/);
  });

  it("is the same bytes with the option absent or undefined", () => {
    expect(buildPage([quiz], { ...options, serveModule: undefined })).toBe(plain);
  });

  it("is not changed by the server's other half existing: `build` never reads dist/serve.js", () => {
    for (const dir of ["src/build", "src/cli"]) {
      for (const f of readdirSync(join(root, dir)).filter((x) => x.endsWith(".ts"))) {
        // the two commands that serve; `build-watch.ts` is only loaded for `--watch` and reads `reload.js`, below
        if (f === "serve.ts" || f === "build-watch.ts") continue;
        const text = readFileSync(join(root, dir, f), "utf8");
        expect(text, `${dir}/${f}`).not.toMatch(/from "\.\.\/serve|module-file|["\x27`]serve\.js["\x27`]/);
      }
    }
  });
});

describe("`build --watch --serve` never takes the one-shot module", () => {
  it("reads dist/reload.js only, and builds its served copy without `serveModule`", () => {
    const text = readFileSync(join(root, "src/cli/build-watch.ts"), "utf8");
    expect(text).toContain("readReloadModule");
    expect(text).not.toContain("readServeModule");
    expect(text).not.toContain("serveModule");
    expect(text).not.toMatch(/["\x27`]serve\.js["\x27`]/);
  });
});

describe("the served page", () => {
  const plain = buildPage([quiz], options);
  const served = buildPage([quiz], { ...options, serveModule });

  it("holds the module as a second script, hashed in the CSP, with connect-src 'self'", () => {
    expect(served.match(/<script>/g)).toHaveLength(2);
    expect(served).toContain(`<script>${serveModule}</script>`);
    const csp = cspOf(served);
    expect(csp).toContain("connect-src 'self'");
    const scripts = /script-src ([^;]*)/.exec(csp)?.[1]?.split(" ") ?? [];
    expect(scripts).toHaveLength(2);
  });

  it("differs from the shared page by the module, its hash, connect-src and `served: true`, and nothing else", () => {
    const withoutModule = served.replace(`<script>${serveModule}</script>\n`, "");
    const csp = cspOf(served);
    const base = cspOf(plain);
    const stripped = withoutModule.replace(csp, base).replace(',"served":true', "");
    expect(stripped).toBe(plain);
    expect(csp.replace(/ 'sha256-[^']*'(?=;)/, "").replace("; connect-src 'self'", "")).toBe(base);
  });

  it("refuses a module that would close its own script tag", () => {
    expect(() => buildPage([quiz], { ...options, serveModule: "x</script><script>y" })).toThrow(/closing script tag/);
  });
});

describe("what `quiz serve` asks of the page", () => {
  const dataOf = (html: string): Record<string, unknown> =>
    JSON.parse(/<script type="application\/json" id="fm-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "");
  const two = build(
    [
      "---",
      "title: Two parts",
      "---",
      "",
      "# Algebra",
      "",
      "## One {type=single id=a}",
      "",
      "- [x] Yes",
      "- [ ] No",
      "",
      "# Geometry",
      "",
      "## Two {type=single id=b}",
      "",
      "- [x] Yes",
      "- [ ] No",
      "",
    ].join("\n"),
  );

  it("`focus` ticks the box and `served` is set, and nothing else is added", () => {
    const data = dataOf(buildPage([two], { ...options, serveModule, served: { focus: true } }));
    expect(data.served).toBe(true);
    expect(data.focus).toBe(true);
    expect(data).not.toHaveProperty("section");
    expect(data).not.toHaveProperty("autosave");
  });

  it("`section` leaves that one section on the page, and the key still holds them all", () => {
    const data = dataOf(buildPage([two], { ...options, serveModule, served: { section: "geometry" } }));
    expect(data.section).toBe("geometry");
    const sections = (data.quizzes as { sections: { id: string }[] }[])[0]?.sections.map((x) => x.id);
    expect(sections).toEqual(["geometry"]);
  });

  it("`autosave` and `saved` go into the data only on a served page", () => {
    const saved = { v: 1 as const, startMs: null, attempt: { quizHash: two.hash ?? "", phase: "answering" as const } };
    const data = dataOf(
      buildPage([two], { ...options, serveModule, served: { autosave: true, saved: saved as never } }),
    );
    expect(data.autosave).toBe(true);
    expect(data).toHaveProperty("saved");
    const shared = dataOf(buildPage([two], { ...options, served: { autosave: true } }));
    expect(shared).not.toHaveProperty("served");
    expect(shared).not.toHaveProperty("autosave");
  });
});
