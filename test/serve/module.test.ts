import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPage, type PageOptions } from "../../src/build/page";
import { serveMessages, serveMessagesFor } from "../../src/serve/messages";
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
    expect(plain).not.toContain("data-fm-serve");
    expect(plain).not.toContain("./submit");
    expect(plain).not.toContain("fetch(");
  });

  it("is the same bytes with the option absent or undefined", () => {
    expect(buildPage([quiz], { ...options, serveModule: undefined })).toBe(plain);
  });

  it("is not changed by the server's other half existing: `build` never reads dist/serve.js", () => {
    for (const dir of ["src/build", "src/cli"]) {
      for (const f of readdirSync(join(root, dir)).filter((x) => x.endsWith(".ts"))) {
        if (f === "serve.ts") continue;
        const text = readFileSync(join(root, dir, f), "utf8");
        expect(text, `${dir}/${f}`).not.toMatch(/from "\.\.\/serve|module-file|["\x27`]serve\.js["\x27`]/);
      }
    }
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
    expect(served).toContain("data-fm-serve");
  });

  it("differs from the shared page by the module, its hash and connect-src, and nothing else", () => {
    const withoutModule = served.replace(`<script>${serveModule}</script>\n`, "");
    const csp = cspOf(served);
    const base = cspOf(plain);
    const stripped = withoutModule.replace(csp, base);
    expect(stripped).toBe(plain);
    expect(csp.replace(/ 'sha256-[^']*'(?=;)/, "").replace("; connect-src 'self'", "")).toBe(base);
  });

  it("refuses a module that would close its own script tag", () => {
    expect(() => buildPage([quiz], { ...options, serveModule: "x</script><script>y" })).toThrow(/closing script tag/);
  });
});

describe("the module's messages", () => {
  it("has the same keys in English and Vietnamese, and picks by the page's lang", () => {
    expect(Object.keys(serveMessages.vi)).toEqual(Object.keys(serveMessages.en));
    expect(serveMessagesFor("vi")).toBe(serveMessages.vi);
    expect(serveMessagesFor("vi-VN")).toBe(serveMessages.vi);
    expect(serveMessagesFor("en")).toBe(serveMessages.en);
    expect(serveMessagesFor("")).toBe(serveMessages.en);
  });
  it("names Download results as the page's own button is named", async () => {
    const { en, vi } = await import("../../src/core/i18n");
    expect(serveMessages.en.failed).toContain(en.page.download);
    expect(serveMessages.vi.failed).toContain(vi.page.download);
  });
});
