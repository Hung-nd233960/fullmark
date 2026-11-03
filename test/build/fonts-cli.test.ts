import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type BuildOptions, runBuild } from "../../src/cli/build";
import { capture, quiz, tempTree } from "../helpers/cli";

const base: BuildOptions = {
  profile: null,
  config: null,
  strict: false,
  output: null,
  builtAt: "2026-10-28T10:00:00+07:00",
  fonts: null,
  uiLang: null,
  plain: true,
  json: false,
  open: false,
  buildFile: null,
  print: false,
  seed: null,
  answerSheet: false,
  answers: null,
  materials: null,
  later: [],
  version: "1.0.0-test",
};

let trees: { done(): void }[] = [];
afterEach(() => {
  for (const t of trees) t.done();
  trees = [];
});

/** Builds `front` with the given options; returns the exit code, the page, the output lines and the files written. */
async function run(front: string, opts: Partial<BuildOptions> = {}, config?: string) {
  const t = tempTree({
    "quiz.md": quiz("- [x] a\n- [ ] b", front),
    ...(config === undefined ? {} : { "machine.toml": config }),
  });
  trees.push(t);
  const c = capture(t.dir, config === undefined ? {} : { FULLMARK_CONFIG: join(t.dir, "machine.toml") });
  const code = await runBuild(["quiz.md"], { ...base, ...opts }, c.io);
  let html: string | null = null;
  try {
    html = readFileSync(join(t.dir, "quiz.html"), "utf8");
  } catch {
    html = null;
  }
  return { code, html, out: c.out, err: c.err };
}

const families = (html: string | null): string[] =>
  [...new Set((html ?? "").match(/@font-face\{font-family:"[^"]+"/g) ?? [])].map((f) => f.slice(24, -1)).sort();

describe("build --fonts", () => {
  const front = "title: T\nfont: serif";
  it("quiz (the default) embeds the quiz's font", async () => {
    expect(families((await run(front)).html)).toEqual(["Source Serif 4"]);
    expect(families((await run(front, { fonts: "quiz" })).html)).toEqual(["Source Serif 4"]);
  });
  it("all embeds the three", async () => {
    expect(families((await run(front, { fonts: "all" })).html)).toEqual(["Be Vietnam Pro", "Lexend", "Source Serif 4"]);
  });
  it("none embeds nothing and is smaller", async () => {
    const none = await run(front, { fonts: "none" });
    expect(families(none.html)).toEqual([]);
    expect(none.code).toBe(0);
    expect((none.html ?? "").length).toBeLessThan(((await run(front)).html ?? "").length);
  });
  it("a value that is not one of the three exits 2 and writes nothing", async () => {
    const r = await run(front, { fonts: "some" });
    expect(r.code).toBe(2);
    expect(r.err.join("\n")).toContain("--fonts some");
    expect(r.html).toBeNull();
  });
  it("the same quiz and --fonts give the same bytes, for each value", async () => {
    for (const fonts of ["quiz", "all", "none"]) {
      expect((await run(front, { fonts })).html).toBe((await run(front, { fonts })).html);
    }
  });
});

describe("the default from config.toml", () => {
  const front = "title: T\nfont: sans";
  it("`fonts` in the machine config is the default", async () => {
    expect(families((await run(front, {}, 'fonts = "all"\n')).html)).toHaveLength(3);
    expect(families((await run(front, {}, 'fonts = "none"\n')).html)).toEqual([]);
  });
  it("the flag beats the config", async () => {
    expect(families((await run(front, { fonts: "none" }, 'fonts = "all"\n')).html)).toEqual([]);
  });
  it("a bad value is a config error with its line", async () => {
    const r = await run(front, {}, '# c\nfonts = "lots"\n');
    expect(r.code).toBe(2);
    expect(r.err.join("\n")).toMatch(/machine\.toml:2/);
    expect(r.err.join("\n")).toContain("`fonts` must be");
  });
});

describe("build.font-not-embedded", () => {
  it("warns for --fonts none, look: locked and a font other than system", async () => {
    const r = await run("title: T\nfont: serif\nlook: locked", { fonts: "none" });
    expect(r.code).toBe(0);
    expect(r.out.join("\n")).toMatch(/warning build\.font-not-embedded: .*Source Serif 4.*system font will stand in/);
    expect(r.html).not.toBeNull();
  });
  it("is an error that writes nothing under --strict", async () => {
    const r = await run("title: T\nfont: serif\nlook: locked", { fonts: "none", strict: true });
    expect(r.code).toBe(1);
    expect(r.html).toBeNull();
  });
  it("is silent for a free look, for system, and when the font is embedded", async () => {
    for (const [front, fonts] of [
      ["title: T\nfont: serif", "none"],
      ["title: T\nfont: system\nlook: locked", "none"],
      ["title: T\nfont: serif\nlook: locked", "quiz"],
    ] as const) {
      expect((await run(front, { fonts })).out.join("\n")).not.toContain("font-not-embedded");
    }
  });
});
