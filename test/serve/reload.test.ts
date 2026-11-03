import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildPage } from "../../src/build/page";
import { buildPaper } from "../../src/build/paper";
import { buildIndex, type IndexEntry, withReload } from "../../src/build/reload";
import { KEEP_ALIVE_MS, type ReloadServer, startReloadServer } from "../../src/serve/reload-server";
import { build } from "../helpers/page";

/**
 * The reload code and the pages that carry it (G31, G33): `dist/reload.js` is a few hundred bytes of its own; a built
 * page and a paper stay without it and without any server code; the served copy adds the script, its hash and
 * `connect-src 'self'` and nothing else; the reload server follows the one-shot server's rules and writes nothing.
 */
const root = resolve(import.meta.dirname, "..", "..");
const dist = join(root, "dist");
const runtime = readFileSync(join(dist, "page.js"), "utf8");
const css = readFileSync(join(dist, "page.css"), "utf8");
const serveModule = readFileSync(join(dist, "serve.js"), "utf8");
const reload = readFileSync(join(dist, "reload.js"), "utf8");
const options = { runtime, css, builtAt: "2026-10-28T10:00:00+07:00", version: "1.0.0-test" };
const quiz = build(
  ["---", "title: Tiny", "---", "", "## Pick {type=single id=a}", "", "- [x] Yes", "- [ ] No", ""].join("\n"),
);
const cspOf = (html: string): string => /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? "";

describe("dist/reload.js", () => {
  it("is its own small bundle: no submit, no autosave, no `sent`", () => {
    expect(reload.length).toBeLessThan(400);
    expect(reload).toContain("EventSource");
    expect(reload).toContain("./events");
    expect(reload).toContain("location.reload");
    for (const word of ["./submit", "./progress", "fetch", "send-failed", "fullmark"])
      expect(reload).not.toContain(word);
    expect(reload).not.toContain("</script");
    // and it is not the one-shot module
    expect(reload).not.toBe(serveModule);
    expect(serveModule).not.toContain("EventSource");
  });
});

describe("the served copy of a page", () => {
  const plain = buildPage([quiz], options);
  const served = withReload(plain, reload);

  it("adds the script, its hash and connect-src 'self', and changes nothing else", () => {
    expect(served).toContain(`<script>${reload}</script>`);
    const csp = cspOf(served);
    expect(csp).toContain("connect-src 'self'");
    // two script hashes now: the page's and the reload code's
    expect(csp.match(/script-src ([^;]*)/)?.[1]?.split(" ")).toHaveLength(2);
    // taking the three additions out gives the page back, byte for byte
    const back = served
      .replace(`<script>${reload}</script>\n`, "")
      .replace(/ 'sha256-[^']*'; /, "; ")
      .replace("; connect-src 'self'", "");
    expect(cspOf(back)).not.toContain("connect-src");
    const hashes = (html: string) => cspOf(html).match(/script-src ([^;]*)/)?.[1];
    expect(hashes(back)).not.toBe(hashes(served));
  });

  it("the hash in the CSP is the reload code's", async () => {
    const { sha256 } = await import("@noble/hashes/sha2.js");
    const { utf8ToBytes } = await import("@noble/hashes/utils.js");
    const { toBase64 } = await import("../../src/core/keyblob");
    expect(cspOf(served)).toContain(`'sha256-${toBase64(sha256(utf8ToBytes(reload)))}'`);
  });

  it("a `build` page holds none of it, and no server code either", () => {
    expect(plain).not.toContain("EventSource");
    expect(plain).not.toContain(reload);
    expect(plain).not.toContain(serveModule);
    expect(plain).not.toContain("./events");
    expect(plain).not.toContain("./submit");
    expect(cspOf(plain)).not.toContain("connect-src");
    expect(plain.match(/<script>/g)).toHaveLength(1);
  });

  it("a served page holds no submit or autosave code: the page has no `served`, and the module is not added", () => {
    expect(served).not.toContain(serveModule);
    expect(served).not.toContain("./submit");
    expect(served).not.toContain("./progress");
    const data = /<script type="application\/json" id="fm-data">([\s\S]*?)<\/script>/.exec(served)?.[1] ?? "";
    for (const key of ["served", "autosave", "saved"]) expect(JSON.parse(data)).not.toHaveProperty(key);
    expect(served.match(/<script>/g)).toHaveLength(2);
  });

  it("is deterministic, and refuses what `build` did not write", () => {
    expect(withReload(plain, reload)).toBe(served);
    expect(() => withReload("<html></html>", reload)).toThrow(/not a page that build wrote/);
    expect(() => withReload(served, reload)).toThrow(/CSP/);
    expect(() => withReload(plain, "</script>")).toThrow(/closing script tag/);
  });

  it("serves a printed paper too: its script-src 'none' becomes the reload code's hash", () => {
    const paper = buildPaper(
      { quiz: quiz.quiz, hash: quiz.hash, assets: [], sheets: [] },
      { css: "p{}", seed: null, answerSheet: false, answers: "none", materials: true },
    ).html;
    expect(cspOf(paper)).toContain("script-src 'none'");
    const copy = withReload(paper, reload);
    expect(cspOf(copy)).toMatch(/script-src 'sha256-[^']*';/);
    expect(cspOf(copy)).not.toContain("'none'; style");
    expect(copy).toContain(`<script>${reload}</script>`);
  });
});

describe("the index of several pages", () => {
  const entries: IndexEntry[] = [
    { title: "Signals & <Systems>", file: "signals/a.md", href: "a.html", failed: false },
    { title: "Rust", file: "rust.md", href: "rust.html", failed: true },
    { title: "quiz.md", file: "quiz.md", href: null, failed: false },
  ];
  const golden = (name: string, text: string): void => {
    const file = join(root, "test", "golden-fn", name);
    if (process.env.FULLMARK_GOLDEN_UPDATE === "1") writeFileSync(file, text);
    else expect(existsSync(file)).toBe(true);
    expect(text).toBe(readFileSync(file, "utf8"));
  };

  it("matches its golden in English and Vietnamese", () => {
    // a fixed script, so the golden does not move when the bundler's output does
    const script = 'new EventSource("./events");';
    golden("index-en.html", buildIndex(entries, "en", script));
    golden("index-vi.html", buildIndex(entries, "vi", script));
  });

  it("lists the titles in order as links, with the file names and the failure note, escaped", () => {
    const html = buildIndex(entries, "en", reload);
    expect(html).toContain('<a href="a.html">Signals &amp; &lt;Systems&gt;</a>');
    expect(html.indexOf("a.html")).toBeLessThan(html.indexOf("rust.html"));
    expect(html).toContain("signals/a.md");
    expect(html).toContain("last build failed: see the terminal");
    expect(html.match(/last build failed/g)).toHaveLength(1);
    // a quiz that never built has no link
    expect(html).toContain("<strong>quiz.md</strong>");
    expect(html).toContain('<html lang="en">');
    expect(buildIndex(entries, "vi", reload)).toContain('<html lang="vi">');
  });

  it("has both themes, no script but the reload code, and a CSP that names exactly that code and its style", () => {
    const html = buildIndex(entries, "en", reload);
    expect(html).toContain("prefers-color-scheme:dark");
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain(`<script>${reload}</script>`);
    const csp = cspOf(html);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp.match(/script-src ('sha256-[^']*')(;| )/)).not.toBeNull();
    expect(csp.match(/style-src ('sha256-[^']*')(;| )/)).not.toBeNull();
  });
});

// -- the reload server -----------------------------------------------------------------------------------------------

type Reply = { status: number; body: string; headers: Record<string, string | string[] | undefined> };
function send(
  server: ReloadServer,
  options: { method?: string; path?: string; host?: string | null } = {},
): Promise<Reply> {
  const path = options.path ?? new URL(server.url).pathname;
  const headers: Record<string, string> = {};
  if (options.host !== null) headers.Host = options.host ?? `127.0.0.1:${server.port}`;
  return new Promise((done, fail) => {
    const req = request(
      { host: "127.0.0.1", port: server.port, path, method: options.method ?? "GET", headers, agent: false },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          done({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), headers: res.headers }),
        );
      },
    );
    req.on("error", fail);
    req.end();
  });
}

/** Opens the event stream and gives back what has arrived, without waiting for a timer. */
function stream(server: ReloadServer): Promise<{ text(): string; settled(n: number): Promise<void>; close(): void }> {
  const url = new URL(server.url);
  return new Promise((ready, fail) => {
    let text = "";
    const req = request(
      {
        host: "127.0.0.1",
        port: server.port,
        path: `${url.pathname}events`,
        headers: { Host: `127.0.0.1:${server.port}` },
        agent: false,
      },
      (res) => {
        res.setEncoding("utf8");
        res.on("data", (c: string) => {
          text += c;
        });
        ready({
          text: () => text,
          async settled(n) {
            const deadline = Date.now() + 5000;
            while (text.split("\n\n").length - 1 < n && Date.now() < deadline)
              await new Promise((d) => setImmediate(d));
          },
          close: () => req.destroy(),
        });
      },
    );
    req.on("error", fail);
    req.end();
  });
}

let running: ReloadServer[] = [];
afterEach(async () => {
  for (const s of running) await s.stop();
  running = [];
});
const start = async (o: Parameters<typeof startReloadServer>[0] = {}): Promise<ReloadServer> => {
  const s = await startReloadServer(o);
  running.push(s);
  return s;
};

describe("the reload server", () => {
  it("serves the page at /<token>/ and refuses what is outside it, as `serve` does", async () => {
    const s = await start();
    s.pages.set("", "<p>index</p>");
    s.pages.set("a.html", "<p>a</p>");
    expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[\w-]{43}\/$/);
    const ok = await send(s);
    expect([ok.status, ok.body]).toEqual([200, "<p>index</p>"]);
    expect(ok.headers["cache-control"]).toBe("no-store");
    expect(ok.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect((await send(s, { path: `${new URL(s.url).pathname}a.html` })).body).toBe("<p>a</p>");
    expect((await send(s, { path: new URL(s.url).pathname.slice(0, -1) })).status).toBe(308);
    expect((await send(s, { path: "/" })).status).toBe(403);
    expect((await send(s, { path: "/wrong-token/" })).status).toBe(403);
    expect((await send(s, { path: `${new URL(s.url).pathname}nope.html` })).status).toBe(404);
    expect((await send(s, { path: `${new URL(s.url).pathname}../../etc/passwd` })).status).toBe(404);
    // no submit, no progress: nothing a learner posts is taken
    for (const target of ["submit", "progress", "events"]) {
      expect((await send(s, { method: "POST", path: `${new URL(s.url).pathname}${target}` })).status).toBe(404);
    }
    expect((await send(s, { method: "PUT" })).status).toBe(404);
  });

  it("checks Host: another name, another port or none is refused", async () => {
    const s = await start();
    s.pages.set("", "x");
    for (const host of ["evil.example", `127.0.0.1:${s.port + 1}`, `localhost`]) {
      expect((await send(s, { host })).status, host).toBe(403);
    }
    expect((await send(s, { host: `localhost:${s.port}` })).status).toBe(200);
  });

  it("answers 503 for the root until a page has been built", async () => {
    const s = await start();
    expect((await send(s)).status).toBe(503);
    s.pages.set("", "x");
    expect((await send(s)).status).toBe(200);
  });

  it("streams one `reload` event, with the page's path, to every open stream; none unless told", async () => {
    const s = await start();
    const a = await stream(s);
    const b = await stream(s);
    await a.settled(1);
    expect(a.text()).toBe("retry: 1000\n\n");
    expect(s.streams()).toBe(2);
    s.reload("");
    s.reload("a.html");
    await a.settled(3);
    await b.settled(3);
    expect(a.text()).toBe("retry: 1000\n\nevent: reload\ndata: \n\nevent: reload\ndata: a.html\n\n");
    expect(b.text()).toBe(a.text());
    a.close();
    b.close();
  });

  it("sends a comment line every 15 s, on the injected timer", async () => {
    const fires: { fire: () => void; ms: number; live: boolean }[] = [];
    const s = await start({
      setTimer(fire, ms) {
        const t = { fire, ms, live: true };
        fires.push(t);
        return () => {
          t.live = false;
        };
      },
    });
    const a = await stream(s);
    await a.settled(1);
    const beat = fires.filter((f) => f.live);
    expect(beat.map((f) => f.ms)).toEqual([KEEP_ALIVE_MS]);
    // a timer that has fired is spent
    const first = beat[0] as { fire: () => void; live: boolean };
    first.live = false;
    first.fire();
    await a.settled(2);
    expect(a.text()).toContain(": keep-alive\n\n");
    // re-armed
    expect(fires.filter((f) => f.live)).toHaveLength(1);
    a.close();
  });

  it("stop() ends the streams and the server", async () => {
    const s = await start();
    const a = await stream(s);
    await a.settled(1);
    await s.stop();
    await expect(send(s)).rejects.toThrow();
  });
});
