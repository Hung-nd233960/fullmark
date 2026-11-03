import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type BuildOptions, runBuild, type WatchIo } from "../../src/cli/build";
import { DEBOUNCE_MS } from "../../src/cli/watcher";
import { base } from "../helpers/build";
import { capture, quiz, tempTree } from "../helpers/cli";
import { fakes } from "../helpers/watch";

/**
 * `quiz build --watch` driven in process: the file system watch, its clock, Ctrl+C and the opener are injected, so a test
 * saves a file, tells the fake watch about it and moves the fake clock. The files are real (a temporary folder); nothing
 * here waits for a timer or for a file-system event. A test polls only for the promises of a rebuild to settle.
 */
const dist = resolve(import.meta.dirname, "../../dist");
const TIME = "2026-10-28T10:00:00+07:00";

let trees: { done(): void }[] = [];
let stops: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const stop of stops) await stop();
  stops = [];
  for (const t of trees) t.done();
  trees = [];
});

const settle = (): Promise<void> => new Promise((done) => setImmediate(done));
/** polls (by yielding, never by a timer) until `ready()`; gives up after a bounded number of turns */
async function until(ready: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error(`gave up waiting for ${what}`);
    await settle();
  }
}

type Run = {
  dir: string;
  out: string[];
  err: string[];
  opened: string[];
  fake: ReturnType<typeof fakes>;
  /** the lines of stderr since the last `mark()` */
  since(): string[];
  /** writes a file and runs what a save does: the watch reports it, 100 ms pass, the rebuild settles */
  save(file: string, text: string, report?: string): Promise<void>;
  /** the watch reports a change of a file that is already as the test left it */
  touch(file: string): Promise<void>;
  /** the watch reports a change of `name` in a subfolder of the quiz's folder ("" for the folder itself) */
  touchIn(folder: string, name: string): Promise<void>;
  interrupt(): Promise<number>;
  exit: Promise<number>;
};

async function watching(
  files: Record<string, string>,
  patterns: string[],
  extra: Partial<BuildOptions> = {},
  io: Partial<WatchIo> = {},
): Promise<Run> {
  const t = tempTree({ ".git/keep": "", ...files });
  trees.push(t);
  const c = capture(t.dir);
  const fake = fakes();
  const opened: string[] = [];
  let interrupt: () => void = () => undefined;
  const watchIo: WatchIo = {
    ...c.io,
    runtimeDir: dist,
    now: () => new Date(0),
    folderWatch: fake.watch,
    watchClock: fake.clock,
    onInterrupt: (handler) => {
      interrupt = handler;
      return () => undefined;
    },
    open: (path) => void opened.push(path),
    roundDone: () => void rounds++,
    ...io,
  };
  let rounds = 0;
  const exit = runBuild(patterns, { ...base, builtAt: TIME, watch: true, ...extra }, watchIo) as Promise<number>;
  let mark = 0;
  const run: Run = {
    dir: t.dir,
    out: c.out,
    err: c.err,
    opened,
    fake,
    since: () => {
      const lines = c.err.slice(mark);
      mark = c.err.length;
      return lines;
    },
    async save(file, text, report = file) {
      writeFileSync(join(t.dir, file), text);
      const before = rounds;
      const dir = join(t.dir, report.includes("/") ? report.slice(0, report.lastIndexOf("/")) : "");
      fake.touch(dir, report.slice(report.lastIndexOf("/") + 1));
      fake.advance(DEBOUNCE_MS);
      await until(() => rounds > before, `the rebuild after saving ${file}`);
    },
    async touch(file) {
      const before = rounds;
      fake.touch(t.dir, file);
      fake.advance(DEBOUNCE_MS);
      await until(() => rounds > before, `the rebuild after ${file} changed`);
    },
    async touchIn(folder, name) {
      const before = rounds;
      fake.touch(join(t.dir, folder), name);
      fake.advance(DEBOUNCE_MS);
      await until(() => rounds > before, `the rebuild after ${name} changed`);
    },
    async interrupt() {
      interrupt();
      return exit;
    },
    exit,
  };
  stops.push(async () => {
    interrupt();
    await exit;
  });
  await until(() => rounds > 0 && c.err.some((l) => l.startsWith("watching")), "the first build");
  run.since();
  return run;
}

const text = (dir: string, file: string): string => readFileSync(join(dir, file), "utf8");

describe("build --watch", () => {
  it("builds first, then rebuilds when the quiz is saved, and the page is the page `build` writes", async () => {
    const r = await watching({ "q.md": quiz() }, ["q.md"]);
    expect(r.out).toEqual(["q.md: wrote q.html"]);
    const first = text(r.dir, "q.html");
    // the same input through `build` gives the same bytes (only the served copy carries the reload code)
    const plain = capture(r.dir);
    await runBuild(["q.md"], { ...base, builtAt: TIME, output: "plain.html" }, { ...plain.io, runtimeDir: dist });
    expect(text(r.dir, "plain.html")).toBe(first);
    expect(first).not.toContain("EventSource");

    await r.save("q.md", quiz("- [ ] a\n- [x] b"));
    expect(r.since()).toEqual([expect.stringMatching(/^rebuilt q\.html · \d+ KB · 0\.0 s$/)]);
    expect(text(r.dir, "q.html")).not.toBe(first);
    await runBuild(["q.md"], { ...base, builtAt: TIME, output: "plain.html" }, { ...plain.io, runtimeDir: dist });
    expect(text(r.dir, "plain.html")).toBe(text(r.dir, "q.html"));
  });

  it("a save with errors prints them and keeps the last good page; the next good save rebuilds", async () => {
    const r = await watching({ "q.md": quiz() }, ["q.md"]);
    const good = text(r.dir, "q.html");
    await r.save("q.md", quiz("- [x] a\n- [x] b", "title: T", "Q {type=single}"));
    const lines = r.since();
    expect(lines.join("\n")).toMatch(/q\.md:\d+: error/);
    expect(lines.at(-1)).toBe("q.md: kept the last good page");
    expect(text(r.dir, "q.html")).toBe(good);
    await r.save("q.md", quiz());
    expect(r.since().at(-1)).toMatch(/^rebuilt q\.html/);
    expect(text(r.dir, "q.html")).toBe(good);
  });

  it("with --json, one line per build to stdout and the human lines to stderr", async () => {
    const r = await watching({ "q.md": quiz() }, ["q.md"], { json: true });
    expect(r.out.map((l) => JSON.parse(l).status)).toEqual(["built"]);
    await r.save("q.md", quiz("- [x] a", "title: T", "Q {type=single}"));
    await r.save("q.md", quiz());
    const lines = r.out.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines.map((l) => l.status)).toEqual(["built", "failed", "built"]);
    expect(lines[1]).toMatchObject({ output: null, bytes: null });
    expect(await r.interrupt()).toBe(0);
    expect(JSON.parse(r.out.at(-1) as string)).toEqual({ status: "stopped" });
  });

  it("watches the files the quiz hash covers: an image, and one the quiz starts to use", async () => {
    const png = "x";
    const r = await watching({ "q.md": quiz("- [x] a ![a](img/a.png)\n- [ ] b"), "img/a.png": png, "img/b.png": png }, [
      "q.md",
    ]);
    expect(r.fake.folders.has(r.dir)).toBe(true);
    expect(r.fake.folders.has(join(r.dir, "img"))).toBe(true);
    const before = text(r.dir, "q.html");
    // an unrelated file in a watched folder does nothing
    r.fake.touch(r.dir, "notes.txt");
    expect(r.fake.live()).toBe(0);
    // the image changes: a rebuild (the hash covers its bytes)
    writeFileSync(join(r.dir, "img/a.png"), "y");
    await r.touchIn("img", "a.png");
    expect(text(r.dir, "q.html")).not.toBe(before);
    r.since();
    // b.png is not used yet: nothing; the quiz starts to use it, and from then on it is watched
    r.fake.touch(join(r.dir, "img"), "b.png");
    expect(r.fake.live()).toBe(0);
    await r.save("q.md", quiz("- [x] a ![a](img/a.png) ![b](img/b.png)\n- [ ] b"));
    const used = text(r.dir, "q.html");
    r.since();
    writeFileSync(join(r.dir, "img/b.png"), "z");
    await r.touchIn("img", "b.png");
    expect(text(r.dir, "q.html")).not.toBe(used);
  });

  it("a file the failed build could not find is watched, so creating it rebuilds", async () => {
    const r = await watching({ "q.md": quiz("- [x] a ![g](gone.png)\n- [ ] b") }, ["q.md"]);
    expect(existsSync(join(r.dir, "q.html"))).toBe(false);
    expect(r.out.join("\n")).toMatch(/asset\.missing/);
    writeFileSync(join(r.dir, "gone.png"), "x");
    await r.touchIn("", "gone.png");
    expect(existsSync(join(r.dir, "q.html"))).toBe(true);
  });

  it("a saved materials sheet rebuilds the quiz", async () => {
    const r = await watching(
      { "q.md": quiz("- [x] a\n- [ ] b", "title: T\nmaterials:\n  - sheet.md"), "sheet.md": "# Sheet\n\nHello\n" },
      ["q.md"],
    );
    const before = text(r.dir, "q.html");
    await r.save("sheet.md", "# Sheet\n\nHello again\n");
    expect(text(r.dir, "q.html")).not.toBe(before);
  });

  it("an editor that saves by rename is seen: the folder reports the name it was renamed to", async () => {
    const r = await watching({ "q.md": quiz() }, ["q.md"]);
    writeFileSync(join(r.dir, ".q.md.swp"), "temporary");
    r.fake.touch(r.dir, ".q.md.swp");
    expect(r.fake.live()).toBe(0);
    await r.save("q.md", quiz("- [ ] a\n- [x] b"));
    expect(r.since().at(-1)).toMatch(/^rebuilt/);
  });

  it("a deleted FILE is a failed rebuild, not an exit, and it comes back when the file does", async () => {
    const r = await watching({ "q.md": quiz() }, ["q.md"]);
    const good = text(r.dir, "q.html");
    rmSync(join(r.dir, "q.md"));
    await r.touch("q.md");
    expect(r.since().join("\n")).toMatch(/q\.md.*(cannot|no such)/i);
    expect(text(r.dir, "q.html")).toBe(good);
    await r.save("q.md", quiz());
    expect(r.since().at(-1)).toMatch(/^rebuilt/);
  });

  it("with several files, a save rebuilds only the quiz it touches, and each JSON line names its file", async () => {
    const r = await watching(
      { "a.md": quiz("- [x] a\n- [ ] b", "title: A"), "b.md": quiz("- [x] a\n- [ ] b", "title: B") },
      ["a.md", "b.md"],
      { json: true },
    );
    expect(r.out.map((l) => JSON.parse(l))).toEqual([
      expect.objectContaining({ status: "built", file: "a.md", output: "a.html" }),
      expect.objectContaining({ status: "built", file: "b.md", output: "b.html" }),
    ]);
    await r.save("b.md", quiz("- [ ] a\n- [x] b", "title: B"));
    expect(r.out).toHaveLength(3);
    expect(JSON.parse(r.out[2] as string)).toMatchObject({ file: "b.md", status: "built" });
  });

  it("--open opens the file once, after the first build, and never after a rebuild", async () => {
    const r = await watching({ "q.md": quiz() }, ["q.md"], { open: true });
    expect(r.opened).toEqual([join(r.dir, "q.html")]);
    await r.save("q.md", quiz("- [ ] a\n- [x] b"));
    expect(r.opened).toHaveLength(1);
  });

  it("--open with several files opens nothing and says so", async () => {
    const r = await watching({ "a.md": quiz(), "b.md": quiz() }, ["a.md", "b.md"], { open: true });
    expect(r.opened).toEqual([]);
    expect(r.err).toContain("--open opens one page; built 2");
  });

  it("--open with several files and --serve opens the index once (G35)", async () => {
    const r = await watching({ "a.md": quiz(), "b.md": quiz() }, ["a.md", "b.md"], { open: true, serve: true });
    expect(r.opened).toHaveLength(1);
    expect(r.opened[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[^/]+\/$/);
    expect(r.err).not.toContain("--open opens one page; built 2");
  });

  it("--print rebuilds the paper", async () => {
    const r = await watching({ "q.md": quiz() }, ["q.md"], { print: true });
    const paper = text(r.dir, "q-print.html");
    expect(paper).toContain("script-src 'none'");
    await r.save("q.md", quiz("- [ ] a\n- [x] b"));
    expect(text(r.dir, "q-print.html")).not.toBe(paper);
    expect(existsSync(join(r.dir, "q.html"))).toBe(false);
  });

  it("Ctrl+C exits 0, closes every watch, and writes nothing more", async () => {
    const r = await watching({ "q.md": quiz() }, ["q.md"]);
    expect(r.fake.folders.size).toBeGreaterThan(0);
    expect(await r.interrupt()).toBe(0);
    expect(r.fake.folders.size).toBe(0);
    expect(r.err.at(-1)).toBe("stopped");
  });

  it("an input that cannot be used stops the run before anything is watched", async () => {
    const t = tempTree({ ".git/keep": "" });
    trees.push(t);
    const c = capture(t.dir);
    const fake = fakes();
    const code = await runBuild(["nope.md"], { ...base, watch: true }, {
      ...c.io,
      runtimeDir: dist,
      folderWatch: fake.watch,
      watchClock: fake.clock,
    } as WatchIo);
    expect(code).toBe(2);
    expect(fake.folders.size).toBe(0);
  });

  it("a first build with errors still watches, and the fix builds", async () => {
    const r = await watching({ "q.md": quiz("- [x] a", "title: T", "Q {type=single}") }, ["q.md"]);
    expect(existsSync(join(r.dir, "q.html"))).toBe(false);
    await r.save("q.md", quiz());
    expect(existsSync(join(r.dir, "q.html"))).toBe(true);
  });
});

describe("build --watch with a build file", () => {
  const files = {
    "a.md": quiz("- [x] a\n- [ ] b", "title: A"),
    "b.md": quiz("- [x] a\n- [ ] b", "title: B"),
    "build.toml": 'out = "site"\n\n[[build]]\nfiles = ["a.md"]\n',
  };

  it("reads the entries again when the build file changes, and builds what it newly lists", async () => {
    const r = await watching(files, [], { buildFile: "build.toml" });
    expect(existsSync(join(r.dir, "site/a.html"))).toBe(true);
    expect(existsSync(join(r.dir, "site/b.html"))).toBe(false);
    await r.save("build.toml", 'out = "site"\n\n[[build]]\nfiles = ["a.md", "b.md"]\n');
    expect(existsSync(join(r.dir, "site/b.html"))).toBe(true);
    // b is watched from now on
    const before = text(r.dir, "site/b.html");
    await r.save("b.md", quiz("- [ ] a\n- [x] b", "title: B"));
    expect(text(r.dir, "site/b.html")).not.toBe(before);
  });

  it("a build file that no longer parses is a failed rebuild; the old entries stay watched and built", async () => {
    const r = await watching(files, [], { buildFile: "build.toml" });
    const good = text(r.dir, "site/a.html");
    await r.save("build.toml", "this is = not [ toml");
    const lines = r.since();
    expect(lines.join("\n")).toContain("build.toml");
    expect(lines.at(-1)).toBe("kept the last good pages");
    expect(text(r.dir, "site/a.html")).toBe(good);
    await r.save("a.md", quiz("- [ ] a\n- [x] b", "title: A"));
    expect(text(r.dir, "site/a.html")).not.toBe(good);
  });
});

describe("build --watch: the options", () => {
  const run = async (extra: Partial<BuildOptions>) => {
    const t = tempTree({ ".git/keep": "", "q.md": quiz() });
    trees.push(t);
    const c = capture(t.dir);
    const code = await runBuild(["q.md"], { ...base, ...extra }, { ...c.io, runtimeDir: dist });
    return { code, err: c.err, out: c.out };
  };

  it("--serve without --watch exits 2", async () => {
    const r = await run({ serve: true });
    expect(r.code).toBe(2);
    expect(r.err).toEqual(["--serve needs --watch"]);
  });

  it("--port without --serve exits 2, with or without --watch", async () => {
    for (const watch of [false, true]) {
      const r = await run({ watch, port: "8123" });
      expect(r.code).toBe(2);
      expect(r.err).toEqual(["--port needs --serve"]);
    }
  });

  it("a port that is not a port number exits 2", async () => {
    for (const port of ["0", "70000", "abc"]) {
      const r = await run({ watch: true, serve: true, port });
      expect(r.code).toBe(2);
      expect(r.err[0]).toBe(`--port ${port} is not a port number (1 to 65535)`);
    }
  });
});
