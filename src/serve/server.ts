import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { type Attempt, AttemptSchema, type Results, resultsOf } from "../core/attempt";

/** The body cap of a submit (TECHNICAL_DESIGN.md, foundation 4). */
export const MAX_BODY_BYTES = 10 * 1024 * 1024;

/** How a server ended. */
export type ServerOutcome =
  | { status: "submitted" }
  | { status: "timeout" }
  | { status: "interrupted" }
  | { status: "error"; message: string };

/** What a submit body holds once read: the quiz it is for and the value to keep, or the problem in plain words (400). */
export type SubmitRead<T> = { quizId: string; value: T } | string;

export type ServerOptions<T = Results> = {
  /** the pages by path under the token: `""` is `/<token>/`. The server holds them in memory and writes nothing */
  pages: Readonly<Record<string, string>>;
  /** the quizzes this server takes a submit for, by id, with the hash of the version served (400 for anything else) */
  quizIds: Readonly<Record<string, string>>;
  /**
   * Ends the server when it says so, given the ids accepted so far (TECHNICAL_DESIGN.md, "Seams for later features",
   * item 6). `serve`: the first accepted submit. A bundle server would say "both papers are in".
   */
  predicate(accepted: ReadonlySet<string>): boolean;
  /** 0 or absent: wait forever */
  timeoutMs?: number;
  /** 0 or absent: a free port */
  port?: number;
  /**
   * Reads the parsed body of a submit: the quiz id (one this server takes) and the value, or a plain-words problem.
   * Absent: the body is an attempt, as `serve` takes it (`attemptSubmitReader`). Every form runs on this one server.
   */
  readSubmit?(body: unknown): SubmitRead<T>;
  /**
   * Called with each valid submit. Returns a plain-words problem when the submit cannot be accepted after all (the
   * server answers 400 and keeps waiting). Throwing means the results could not be written: the server answers 500
   * and ends with `error`.
   */
  onSubmit(quizId: string, value: T): Promise<string | null> | string | null;
  /**
   * `--autosave`: called with each valid progress post (an attempt in `answering`), answered 204. Returns a plain-words
   * problem when it cannot be kept (400). Absent: the progress path does not exist (404).
   */
  onProgress?(quizId: string, results: Results): string | null;
  /** a timer, so a test never waits for a real one; it returns the function that cancels it */
  setTimer?: (fire: () => void, ms: number) => () => void;
};

export type RunningServer = {
  /** `http://127.0.0.1:<port>/<token>/` */
  url: string;
  port: number;
  /** resolves once the server has closed */
  done: Promise<ServerOutcome>;
  /** ends the server now, as Ctrl+C does: the outcome is `interrupted` */
  stop(): void;
};

const realTimer = (fire: () => void, ms: number): (() => void) => {
  const handle = setTimeout(fire, ms);
  return () => clearTimeout(handle);
};

/** The body of an attempt: `{quizId, attempt}` for a quiz in `quizIds` and the version served (what `serve` takes). */
export const attemptReader =
  (quizIds: Readonly<Record<string, string>>) =>
  (body: unknown): SubmitRead<Attempt> => {
    const { quizId, attempt } = (body ?? {}) as { quizId?: unknown; attempt?: unknown };
    if (typeof quizId !== "string" || !Object.hasOwn(quizIds, quizId)) {
      return "this server does not take a submit for that quiz";
    }
    const parsed = AttemptSchema.safeParse(attempt);
    if (!parsed.success) return "the body is not an attempt";
    if (parsed.data.quizHash !== quizIds[quizId]) return "the attempt was taken on another version of the quiz";
    return { quizId, value: parsed.data };
  };

/** A submit of `serve`: an attempt that is finished, kept as results. */
export const attemptSubmitReader =
  (quizIds: Readonly<Record<string, string>>) =>
  (body: unknown): SubmitRead<Results> => {
    const got = attemptReader(quizIds)(body);
    if (typeof got === "string") return got;
    if (got.value.phase !== "submitted") return "the attempt is not submitted";
    return { quizId: got.quizId, value: resultsOf(got.value) };
  };

export function refuse(res: ServerResponse, status: number, body = ""): void {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

/**
 * The one-shot server (TECHNICAL_DESIGN.md, section 7, foundation 4): 127.0.0.1 only, a random token in the path, the
 * `Host` and (on a POST) `Origin` checked, one POST path, a 10 MB cap. It takes each quiz id once and ends when
 * `predicate` says so, on the timeout, or on `stop()`. Everything but the token's own paths is refused.
 */
export async function startServer<T = Results>(options: ServerOptions<T>): Promise<RunningServer> {
  const token = randomBytes(32).toString("base64url");
  const tokenBytes = Buffer.from(token);
  const accepted = new Set<string>();
  let closing = false;
  let finish!: (outcome: ServerOutcome) => void;
  const done = new Promise<ServerOutcome>((resolve) => {
    finish = resolve;
  });
  let port = 0;
  const hostOk = (host: string | undefined): boolean => host === `127.0.0.1:${port}` || host === `localhost:${port}`;
  const originOk = (origin: string | undefined): boolean =>
    origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
  const tokenOk = (given: string): boolean => {
    const bytes = Buffer.from(given);
    return bytes.length === tokenBytes.length && timingSafeEqual(bytes, tokenBytes);
  };

  let cancelTimer: () => void = () => undefined;
  const server: Server = createServer();
  /** Closes for good once, after the response in flight is out; `done` resolves when the sockets are gone. */
  const close = (outcome: ServerOutcome): void => {
    if (closing) return;
    closing = true;
    cancelTimer();
    server.close(() => finish(outcome));
    server.closeIdleConnections();
    // a connection still open (a browser keeping alive) must not hold the process: give the last response a moment
    setImmediate(() => server.closeIdleConnections());
    setTimeout(() => server.closeAllConnections(), 200).unref();
  };

  /**
   * The body of a POST, within the cap. Too much is read and thrown away (up to twice the cap) before the 413 is sent:
   * answering at once with the client still writing resets the connection, and on Windows the reset discards the
   * answer before the client reads it.
   */
  const readBody = (req: IncomingMessage): Promise<Buffer | "too-large"> =>
    new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let over = Number(req.headers["content-length"] ?? "0") > MAX_BODY_BYTES;
      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          over = true;
          chunks.length = 0;
        }
        if (over) {
          if (size > 2 * MAX_BODY_BYTES) {
            resolve("too-large");
            req.destroy();
          }
        } else chunks.push(chunk);
      });
      req.on("end", () => resolve(over ? "too-large" : Buffer.concat(chunks)));
      req.on("error", () => resolve("too-large"));
      req.on("close", () => resolve(over ? "too-large" : Buffer.concat(chunks)));
    });

  /**
   * Reads and checks a POST body, which is the same for a submit and a progress post: within the cap, JSON, then
   * `read` (what the body must hold is the command's: a quiz this server takes, and the value). Null once the refusal
   * has been sent.
   */
  const readPost = async <T>(
    req: IncomingMessage,
    res: ServerResponse,
    read: (body: unknown) => SubmitRead<T>,
  ): Promise<{ quizId: string; value: T } | null> => {
    const raw = await readBody(req);
    if (raw === "too-large") {
      refuse(res, 413);
      return null;
    }
    if (closing) {
      refuse(res, 409, "this server has already taken its submit");
      return null;
    }
    let body: unknown;
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      refuse(res, 400, "the body is not JSON");
      return null;
    }
    const got = read(body);
    if (typeof got === "string") {
      refuse(res, 400, got);
      return null;
    }
    if (accepted.has(got.quizId)) {
      refuse(res, 409, "this quiz was already submitted");
      return null;
    }
    return got;
  };

  /** A progress post (`--autosave`): kept by `onProgress`, answered 204; nothing is accepted and the server goes on. */
  const progressReader = attemptReader(options.quizIds);
  const progress = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const read = await readPost(req, res, progressReader);
    if (read === null) return;
    if (read.value.phase !== "answering") return refuse(res, 400, "the attempt is not in progress");
    const problem = options.onProgress?.(read.quizId, resultsOf(read.value)) ?? null;
    if (problem !== null) return refuse(res, 400, problem);
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
  };

  const submitReader =
    options.readSubmit ?? (attemptSubmitReader(options.quizIds) as unknown as (b: unknown) => SubmitRead<T>);
  const submit = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const read = await readPost(req, res, submitReader);
    if (read === null) return;
    const { quizId, value } = read;
    // from here a second request for this id must wait its turn: claim it before the (async) write
    accepted.add(quizId);
    let problem: string | null;
    try {
      problem = await options.onSubmit(quizId, value);
    } catch (error) {
      accepted.delete(quizId);
      refuse(res, 500, "the results could not be written");
      close({ status: "error", message: (error as Error).message });
      return;
    }
    if (problem !== null) {
      accepted.delete(quizId);
      return refuse(res, 400, problem);
    }
    res.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
    res.end('{"status":"accepted"}');
    if (options.predicate(accepted)) close({ status: "submitted" });
  };

  server.on("request", (req, res) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    if (!hostOk(req.headers.host)) return refuse(res, 403);
    const path = (req.url ?? "").split("?")[0] ?? "";
    const [, first = "", ...rest] = path.split("/");
    if (!tokenOk(first)) return refuse(res, 403);
    if (req.method === "POST") {
      if (!originOk(req.headers.origin)) return refuse(res, 403);
      const target = rest.join("/");
      if (target !== "submit" && !(target === "progress" && options.onProgress !== undefined)) return refuse(res, 404);
      (target === "submit" ? submit : progress)(req, res).catch(() => {
        if (!res.headersSent) refuse(res, 500);
        else res.end();
      });
      return;
    }
    // the page's relative `./submit` resolves against the address, so the address must end in a slash
    if (req.method === "GET" && rest.length === 0) {
      res.writeHead(308, { "Cache-Control": "no-store", Location: `/${first}/`, "X-Content-Type-Options": "nosniff" });
      res.end();
      return;
    }
    const page = options.pages[rest.join("/")];
    if (req.method === "GET" && page !== undefined) {
      res.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(page);
      return;
    }
    refuse(res, 404);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  port = (server.address() as AddressInfo).port;
  // a listening server must not die of a stray socket error
  server.on("error", () => undefined);
  server.on("clientError", (_error, socket) => socket.destroy());

  if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
    cancelTimer = (options.setTimer ?? realTimer)(() => close({ status: "timeout" }), options.timeoutMs);
  }
  return {
    url: `http://127.0.0.1:${port}/${token}/`,
    port,
    done,
    stop: () => close({ status: "interrupted" }),
  };
}
