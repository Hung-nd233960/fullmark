import { request } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { Attempt } from "../../src/core/attempt";
import { emptyState } from "../../src/core/attempt";
import { MAX_BODY_BYTES, type RunningServer, type ServerOptions, startServer } from "../../src/serve/server";

/**
 * The one-shot server (TECHNICAL_DESIGN.md, foundation 4 and "Seams for later features", item 6). It binds port 0 on
 * 127.0.0.1 and is driven over real sockets; no test waits for a real timeout (the timer is injected).
 */
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

const attempt = (hash: string, phase: Attempt["phase"] = "submitted"): Attempt => ({
  quizHash: hash,
  plan: { source: "full", questions: ["q1"] },
  state: { ...emptyState(), answers: { q1: { choice: 0 } } },
  phase,
});

type Reply = { status: number; body: string; headers: Record<string, string | string[] | undefined> };

/** A request with the headers in the test's hands (`fetch` may not set `Host` or `Origin`). */
function send(
  server: RunningServer,
  options: {
    method?: string;
    path?: string;
    host?: string | null;
    origin?: string | null;
    body?: string | Buffer;
  } = {},
): Promise<Reply> {
  const url = new URL(server.url);
  const path = options.path ?? url.pathname;
  const headers: Record<string, string> = {};
  headers.Host = options.host === undefined ? `127.0.0.1:${server.port}` : (options.host ?? "");
  if (options.origin !== null && (options.method === "POST" || options.origin !== undefined)) {
    headers.Origin = options.origin ?? `http://127.0.0.1:${server.port}`;
  }
  if (options.body !== undefined) headers["Content-Length"] = String(Buffer.byteLength(options.body));
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port: server.port, path, method: options.method ?? "GET", headers, agent: false },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), headers: res.headers }),
        );
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}

const submitBody = (quizId: string, a: Attempt): string => JSON.stringify({ quizId, attempt: a });

let running: RunningServer[] = [];
async function start(overrides: Partial<ServerOptions> = {}): Promise<{ server: RunningServer; taken: string[] }> {
  const taken: string[] = [];
  const server = await startServer({
    pages: { "": "<!doctype html><p>quiz</p>" },
    quizIds: { quiz: HASH_A },
    predicate: (accepted) => accepted.has("quiz"),
    onSubmit: (id) => {
      taken.push(id);
      return null;
    },
    ...overrides,
  });
  running.push(server);
  return { server, taken };
}
afterEach(async () => {
  for (const s of running) {
    s.stop();
    await s.done;
  }
  running = [];
});

describe("the page and the token", () => {
  it("binds 127.0.0.1 on the port asked for (0: a free one) and puts the token in the path", async () => {
    const { server } = await start();
    expect(server.port).toBeGreaterThan(0);
    expect(server.url).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:${server.port}/[A-Za-z0-9_-]{43}/$`));
    const page = await send(server);
    expect(page.status).toBe(200);
    expect(page.body).toBe("<!doctype html><p>quiz</p>");
    expect(page.headers["cache-control"]).toBe("no-store");
    expect(String(page.headers["content-type"])).toContain("text/html");
  });

  it("refuses a wrong token, no token and a token of another length with 403 and no body", async () => {
    const { server } = await start();
    for (const path of ["/wrong/", "/", `${new URL(server.url).pathname.slice(0, -2)}x/`, "/favicon.ico"]) {
      const r = await send(server, { path });
      expect(r.status, path).toBe(403);
      expect(r.body, path).toBe("");
    }
  });

  it("refuses a wrong Host (DNS rebinding), also with the right token", async () => {
    const { server } = await start();
    for (const host of ["evil.example", `evil.example:${server.port}`, "127.0.0.1", `127.0.0.1:${server.port + 1}`]) {
      const r = await send(server, { host });
      expect(r.status, String(host)).toBe(403);
      expect(r.body).toBe("");
    }
    expect((await send(server, { host: `localhost:${server.port}` })).status).toBe(200);
  });

  it("is a 404 for any other path under the token, and for a method it does not take", async () => {
    const { server } = await start();
    const base = new URL(server.url).pathname;
    expect((await send(server, { path: `${base}other` })).status).toBe(404);
    expect((await send(server, { path: `${base}submit` })).status).toBe(404);
    expect((await send(server, { method: "PUT", path: base })).status).toBe(404);
    expect((await send(server, { method: "POST", path: `${base}other`, body: "{}" })).status).toBe(404);
  });
});

describe("the address without its trailing slash", () => {
  it("answers 308 to the address with the slash, so the page's ./submit resolves under the token", async () => {
    const { server } = await start();
    const bare = new URL(server.url).pathname.slice(0, -1);
    const r = await send(server, { path: bare });
    expect(r.status).toBe(308);
    expect(r.headers.location).toBe(`${bare}/`);
    expect(r.body).toBe("");
    // a wrong token is still 403, and a POST to the bare address is a 404, not a redirect
    expect((await send(server, { path: "/nope" })).status).toBe(403);
    expect((await send(server, { method: "POST", path: bare, body: "{}" })).status).toBe(404);
  });

  it("follows the redirect to the page with fetch", async () => {
    const { server } = await start();
    const bare = server.url.slice(0, -1);
    const r = await fetch(bare);
    expect(r.status).toBe(200);
    expect(r.url).toBe(server.url);
    expect(await r.text()).toBe("<!doctype html><p>quiz</p>");
  });
});

describe("the progress path (--autosave)", () => {
  const progress = (server: RunningServer, body: string, extra: { origin?: string | null } = {}) =>
    send(server, { method: "POST", path: `${new URL(server.url).pathname}progress`, body, ...extra });

  it("does not exist unless the command keeps progress: 404", async () => {
    const { server } = await start();
    expect((await progress(server, submitBody("quiz", attempt(HASH_A, "answering")))).status).toBe(404);
  });

  it("takes an attempt in progress with 204, hands it on, and goes on waiting", async () => {
    const kept: string[] = [];
    const { server, taken } = await start({
      onProgress: (id, results) => {
        kept.push(`${id}:${results.phase}:${results.format}`);
        return null;
      },
    });
    const r = await progress(server, submitBody("quiz", attempt(HASH_A, "answering")));
    expect(r.status).toBe(204);
    expect(r.body).toBe("");
    expect(kept).toEqual(["quiz:answering:fullmark-results"]);
    expect(taken).toEqual([]);
    // the server is still open: a submit is taken
    const done = await send(server, {
      method: "POST",
      path: `${new URL(server.url).pathname}submit`,
      body: submitBody("quiz", attempt(HASH_A)),
    });
    expect(done.status).toBe(200);
  });

  it("makes the same checks as a submit: Origin, Host, quiz id, version, an attempt, the cap", async () => {
    const kept: string[] = [];
    const { server } = await start({
      onProgress: (id) => {
        kept.push(id);
        return null;
      },
    });
    const good = submitBody("quiz", attempt(HASH_A, "answering"));
    expect((await progress(server, good, { origin: null })).status).toBe(403);
    expect((await progress(server, good, { origin: "http://evil.example" })).status).toBe(403);
    expect((await progress(server, "nope")).status).toBe(400);
    expect((await progress(server, submitBody("other", attempt(HASH_A, "answering")))).status).toBe(400);
    expect((await progress(server, submitBody("quiz", attempt(HASH_B, "answering")))).status).toBe(400);
    expect((await progress(server, JSON.stringify({ quizId: "quiz", attempt: {} }))).status).toBe(400);
    expect((await progress(server, submitBody("quiz", attempt(HASH_A, "submitted")))).status).toBe(400);
    expect((await progress(server, "x".repeat(MAX_BODY_BYTES + 1))).status).toBe(413);
    expect(kept).toEqual([]);
  });

  it("answers 400 with the reason when onProgress refuses, and 409 once the submit is in", async () => {
    let refuse: string | null = "no good";
    const { server } = await start({
      onProgress: () => refuse,
      quizIds: { quiz: HASH_A, other: HASH_A },
      predicate: (a) => a.size === 2,
    });
    const r = await progress(server, submitBody("quiz", attempt(HASH_A, "answering")));
    expect(r.status).toBe(400);
    expect(r.body).toBe("no good");
    refuse = null;
    expect((await progress(server, submitBody("quiz", attempt(HASH_A, "answering")))).status).toBe(204);
    await send(server, {
      method: "POST",
      path: `${new URL(server.url).pathname}submit`,
      body: submitBody("quiz", attempt(HASH_A)),
    });
    expect((await progress(server, submitBody("quiz", attempt(HASH_A, "answering")))).status).toBe(409);
  });
});

describe("the submit", () => {
  const post = (server: RunningServer, body: string | Buffer, extra: { origin?: string | null; host?: string } = {}) =>
    send(server, { method: "POST", path: `${new URL(server.url).pathname}submit`, body, ...extra });

  it("refuses a wrong or missing Origin with 403, and takes the right ones", async () => {
    const { server, taken } = await start();
    const body = submitBody("quiz", attempt(HASH_A));
    for (const origin of [
      "http://evil.example",
      `http://127.0.0.1:${server.port + 1}`,
      "null",
      `https://127.0.0.1:${server.port}`,
      null,
    ]) {
      const r = await post(server, body, { origin });
      expect(r.status, String(origin)).toBe(403);
    }
    expect(taken).toEqual([]);
    expect((await post(server, body, { origin: `http://localhost:${server.port}` })).status).toBe(200);
    await server.done;
    expect(taken).toEqual(["quiz"]);
  });

  it("refuses a wrong Host on a POST", async () => {
    const { server, taken } = await start();
    const r = await post(server, submitBody("quiz", attempt(HASH_A)), { host: "evil.example" });
    expect(r.status).toBe(403);
    expect(taken).toEqual([]);
  });

  it("takes a valid attempt, hands onSubmit the results-v2 document, and ends", async () => {
    let seen: unknown;
    const { server } = await start({
      onSubmit: (_id, results) => {
        seen = results;
        return null;
      },
    });
    const r = await post(server, submitBody("quiz", attempt(HASH_A)));
    expect(r.status).toBe(200);
    expect(await server.done).toEqual({ status: "submitted" });
    expect(seen).toMatchObject({ format: "fullmark-results", version: 2, quizHash: HASH_A, phase: "submitted" });
  });

  it("answers 400 and keeps waiting for a body that is not JSON, not an attempt, another quiz, another version or not submitted", async () => {
    const { server, taken } = await start();
    const bad: [string, string][] = [
      ["not JSON", "{nope"],
      ["no attempt", JSON.stringify({ quizId: "quiz" })],
      ["not an attempt", JSON.stringify({ quizId: "quiz", attempt: { quizHash: HASH_A } })],
      ["another quiz id", submitBody("other", attempt(HASH_A))],
      ["a prototype key as the id", submitBody("toString", attempt(HASH_A))],
      ["another version", submitBody("quiz", attempt(HASH_B))],
      ["not submitted", submitBody("quiz", attempt(HASH_A, "answering"))],
    ];
    for (const [name, body] of bad) expect((await post(server, body)).status, name).toBe(400);
    expect(taken).toEqual([]);
    // it still takes a good one
    expect((await post(server, submitBody("quiz", attempt(HASH_A)))).status).toBe(200);
    expect(await server.done).toEqual({ status: "submitted" });
  });

  it("answers 400 when onSubmit refuses the attempt, and keeps waiting", async () => {
    let first = true;
    const { server } = await start({
      onSubmit: () => {
        if (first) {
          first = false;
          return "answers that do not fit";
        }
        return null;
      },
    });
    const refused = await post(server, submitBody("quiz", attempt(HASH_A)));
    expect(refused.status).toBe(400);
    expect(refused.body).toBe("answers that do not fit");
    expect((await post(server, submitBody("quiz", attempt(HASH_A)))).status).toBe(200);
    expect(await server.done).toEqual({ status: "submitted" });
  });

  it("caps the body at 10 MB with 413, by its length and by what arrives", async () => {
    const { server, taken } = await start();
    const big = Buffer.alloc(MAX_BODY_BYTES + 1, 0x20);
    expect((await post(server, big)).status).toBe(413);
    expect(taken).toEqual([]);
    // just under the cap is read (and refused as a body, not as too large)
    const under = Buffer.alloc(MAX_BODY_BYTES, 0x20);
    expect((await post(server, under)).status).toBe(400);
  });

  it("never takes a second submit: the server is closing, and a repeat of an accepted id gets 409", async () => {
    const { server, taken } = await start({ quizIds: { one: HASH_A, two: HASH_A }, predicate: (a) => a.size === 2 });
    expect((await post(server, submitBody("one", attempt(HASH_A)))).status).toBe(200);
    expect((await post(server, submitBody("one", attempt(HASH_A)))).status).toBe(409);
    expect(taken).toEqual(["one"]);
    expect((await post(server, submitBody("two", attempt(HASH_A)))).status).toBe(200);
    expect(await server.done).toEqual({ status: "submitted" });
    expect(taken).toEqual(["one", "two"]);
  });

  it("ends with an error, after answering 500, when the results cannot be written", async () => {
    const { server } = await start({
      onSubmit: () => {
        throw new Error("disk full");
      },
    });
    expect((await post(server, submitBody("quiz", attempt(HASH_A)))).status).toBe(500);
    expect(await server.done).toEqual({ status: "error", message: "disk full" });
  });
});

describe("the seam: two quizzes, one server", () => {
  it("takes a submit for each quiz id and ends only when the predicate says both are in", async () => {
    const calls: string[] = [];
    let ended = false;
    const { server } = await start({
      quizIds: { first: HASH_A, second: HASH_B },
      predicate: (accepted) => accepted.has("first") && accepted.has("second"),
      onSubmit: (id) => {
        calls.push(id);
        return null;
      },
    });
    void server.done.then(() => {
      ended = true;
    });
    const path = `${new URL(server.url).pathname}submit`;
    const first = await send(server, { method: "POST", path, body: submitBody("first", attempt(HASH_A)) });
    expect(first.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(ended).toBe(false);
    // the second quiz's id with the first quiz's version is refused
    expect((await send(server, { method: "POST", path, body: submitBody("second", attempt(HASH_A)) })).status).toBe(
      400,
    );
    const second = await send(server, { method: "POST", path, body: submitBody("second", attempt(HASH_B)) });
    expect(second.status).toBe(200);
    expect(await server.done).toEqual({ status: "submitted" });
    expect(calls).toEqual(["first", "second"]);
  });
});

describe("the end", () => {
  it("times out when the injected timer fires, without waiting", async () => {
    let fire: (() => void) | undefined;
    let waited = 0;
    const { server } = await start({
      timeoutMs: 1_800_000,
      setTimer: (f, ms) => {
        fire = f;
        waited = ms;
        return () => undefined;
      },
    });
    expect(waited).toBe(1_800_000);
    fire?.();
    expect(await server.done).toEqual({ status: "timeout" });
  });

  it("sets no timer for a timeout of 0 (wait forever)", async () => {
    let set = false;
    await start({
      timeoutMs: 0,
      setTimer: () => {
        set = true;
        return () => undefined;
      },
    });
    expect(set).toBe(false);
  });

  it("cancels the timer when a submit ends it", async () => {
    let cancelled = false;
    const { server } = await start({
      timeoutMs: 5000,
      setTimer: () => () => {
        cancelled = true;
      },
    });
    await send(server, {
      method: "POST",
      path: `${new URL(server.url).pathname}submit`,
      body: submitBody("quiz", attempt(HASH_A)),
    });
    await server.done;
    expect(cancelled).toBe(true);
  });

  it("stop() is an interruption", async () => {
    const { server } = await start();
    server.stop();
    expect(await server.done).toEqual({ status: "interrupted" });
  });

  it("stops listening after it ends", async () => {
    const { server } = await start();
    server.stop();
    await server.done;
    await expect(send(server)).rejects.toThrow();
  });

  it("refuses to start on a port in use", async () => {
    const { server } = await start();
    await expect(
      startServer({ pages: {}, quizIds: {}, predicate: () => true, onSubmit: () => null, port: server.port }),
    ).rejects.toMatchObject({ code: "EADDRINUSE" });
  });
});
