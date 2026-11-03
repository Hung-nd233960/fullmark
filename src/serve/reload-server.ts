import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { refuse } from "./server";

/** How often a comment line keeps the stream open for a proxy or the browser (G30). */
export const KEEP_ALIVE_MS = 15_000;

export type ReloadServerOptions = {
  /** 0 or absent: a free port */
  port?: number;
  /** a timer, so a test never waits for a real one; it returns the function that cancels it */
  setTimer?: (fire: () => void, ms: number) => () => void;
};

export type ReloadServer = {
  /** `http://127.0.0.1:<port>/<token>/` */
  url: string;
  port: number;
  /**
   * The pages by path under the token: `""` is `/<token>/`, `quiz.html` is `/<token>/quiz.html`. The caller changes
   * this map as it rebuilds; the server only reads it. A path with no page answers 404, and `""` with none yet 503.
   */
  pages: Map<string, string>;
  /** sends one `reload` event, whose data is `path`, to every open stream */
  reload(path: string): void;
  /** streams open now */
  streams(): number;
  /** ends every stream and closes the server; resolves once the sockets are gone */
  stop(): Promise<void>;
};

const realTimer = (fire: () => void, ms: number): (() => void) => {
  const handle = setTimeout(fire, ms);
  return () => clearTimeout(handle);
};

/**
 * The reload server of `build --watch --serve` (COMMANDS.md; G30, G31). A sibling of the one-shot server (`startServer`),
 * not a mode of it: it has no quiz ids, no submit and no progress path, so nothing a learner posts can reach it, and it
 * writes nothing. What it shares is the rules: 127.0.0.1 only, a random token in the path, the `Host` checked, every
 * path outside the token's own refused. It runs until `stop()`.
 */
export async function startReloadServer(options: ReloadServerOptions = {}): Promise<ReloadServer> {
  const token = randomBytes(32).toString("base64url");
  const tokenBytes = Buffer.from(token);
  const pages = new Map<string, string>();
  const open = new Set<ServerResponse>();
  let port = 0;
  let stopped = false;
  const hostOk = (host: string | undefined): boolean => host === `127.0.0.1:${port}` || host === `localhost:${port}`;
  const tokenOk = (given: string): boolean => {
    const bytes = Buffer.from(given);
    return bytes.length === tokenBytes.length && timingSafeEqual(bytes, tokenBytes);
  };

  const server = createServer((req, res) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    if (!hostOk(req.headers.host)) return refuse(res, 403);
    const path = (req.url ?? "").split("?")[0] ?? "";
    const [, first = "", ...rest] = path.split("/");
    if (!tokenOk(first)) return refuse(res, 403);
    if (req.method !== "GET") return refuse(res, 404);
    const target = rest.join("/");
    if (rest.length === 0) {
      // the page's relative `./events` resolves against the address, so it must end in a slash
      res.writeHead(308, { "Cache-Control": "no-store", Location: `/${first}/`, "X-Content-Type-Options": "nosniff" });
      res.end();
      return;
    }
    if (target === "events") {
      res.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      res.write("retry: 1000\n\n");
      open.add(res);
      res.on("close", () => open.delete(res));
      return;
    }
    const page = pages.get(target);
    if (page !== undefined) {
      res.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(page);
      return;
    }
    if (target === "") return refuse(res, 503, "no page has been built yet: see the terminal");
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
  server.on("error", () => undefined);
  server.on("clientError", (_error, socket) => socket.destroy());

  // a comment line every 15 s, re-armed after each, so a test's timer fires it by hand
  const timer = options.setTimer ?? realTimer;
  let cancelBeat: () => void = () => undefined;
  const beat = (): void => {
    cancelBeat = timer(() => {
      for (const res of open) res.write(": keep-alive\n\n");
      if (!stopped) beat();
    }, KEEP_ALIVE_MS);
  };
  beat();

  return {
    url: `http://127.0.0.1:${port}/${token}/`,
    port,
    pages,
    reload(path) {
      for (const res of open) res.write(`event: reload\ndata: ${path}\n\n`);
    },
    streams: () => open.size,
    stop() {
      stopped = true;
      cancelBeat();
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
        for (const res of open) res.end();
        server.closeIdleConnections();
        setTimeout(() => server.closeAllConnections(), 200).unref();
      });
    },
  };
}
