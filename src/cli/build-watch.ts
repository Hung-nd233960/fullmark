import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { buildIndex, type IndexEntry, withReload } from "../build/reload";
import { readReloadModule } from "../serve/module-file";
import { type ReloadServer, startReloadServer } from "../serve/reload-server";
import {
  type BuildOptions,
  buildOne,
  type FileResult,
  jsonLine,
  type RunContext,
  runtimeFolder,
  systemOpen,
  type WatchIo,
} from "./build";
import { type Job, type PlanItem, planBuildFile } from "./build-file";
import { EXIT, type ExitCode } from "./exit-codes";
import { fail } from "./fail";
import { readFailure, shownPath } from "./paths";
import { createWatcher, realFolderWatch, realWatchClock } from "./watcher";

/**
 * `quiz build --watch [--serve]` (COMMANDS.md; G6, G30 to G33): the first build, then a rebuild of the quizzes that
 * each burst of changes touches, until Ctrl+C. A rebuild that fails prints its errors and keeps the page on disk and in
 * the server as they were. Loaded only for `--watch`, so a plain `build` never reads the watcher or the server.
 */

/** The watcher's key for the build file; a page's key is its target path. */
const BUILD_KEY = "\0build-file";

/** What the run knows about one page: how its last build went, and what is served. */
type PageState = {
  job: Job;
  /** `quiz.html`, unique among the pages: where it is served when there are several */
  name: string;
  /** the quiz's title, from the last good build or the file name before one */
  title: string;
  /** the served copy of the last good build */
  html: string | null;
  failed: boolean;
};

const defaultInterrupt = (handler: () => void): (() => void) => {
  process.once("SIGINT", handler);
  return () => {
    process.off("SIGINT", handler);
  };
};

/** `quiz.html`, `quiz-2.html`, ...: each page's name under the token, unique. */
function namesOf(jobs: readonly Job[]): string[] {
  const used = new Set<string>();
  return jobs.map((job) => {
    const base = basename(job.target);
    let name = base;
    for (let n = 2; used.has(name); n++) name = base.replace(/(\.html?)$/i, `-${n}$1`);
    used.add(name);
    return name;
  });
}

export async function runWatch(args: {
  patterns: readonly string[];
  opts: BuildOptions;
  io: WatchIo;
  items: PlanItem[];
  context: RunContext;
}): Promise<ExitCode> {
  const { patterns, opts, io } = args;
  const clock = io.now ?? (() => new Date());
  const open = io.open ?? systemOpen;

  // an input that cannot be used stops the run before anything is watched, as it stops no one else's build
  let bad = false;
  for (const item of args.items) {
    if ("error" in item) {
      fail(io, opts.json, item.error.message, { file: item.error.input });
      bad = true;
    }
  }
  if (bad) return EXIT.usage;
  const first = args.items.flatMap((i) => ("job" in i ? [i.job] : []));

  let reloadJs: string | null = null;
  if (opts.serve) {
    reloadJs = readReloadModule(io.runtimeDir ?? runtimeFolder());
    if (reloadJs === null) {
      fail(io, opts.json, "the reload code is missing next to the program: run `npm run build`");
      return EXIT.usage;
    }
  }
  let server: ReloadServer | null = null;
  if (opts.serve) {
    const port = opts.port === null ? 0 : Number(opts.port);
    try {
      server = await startReloadServer({ port, ...(io.setTimer ? { setTimer: io.setTimer } : {}) });
    } catch (error) {
      const e = error as NodeJS.ErrnoException;
      fail(
        io,
        opts.json,
        `cannot start the server${port ? ` on port ${port}` : ""}: ${e.code === "EADDRINUSE" ? "the port is in use" : readFailure(error)}`,
      );
      return EXIT.usage;
    }
    if (opts.json) {
      io.out(JSON.stringify({ status: "listening", url: server.url, port: server.port, pid: process.pid }));
    }
    io.err(`serving at ${server.url}`);
  }

  const pages = new Map<string, PageState>();
  const covered = new Map<string, string[]>();
  const ui = opts.uiLang === "vi" ? "vi" : "en";
  let jobs: Job[] = [];

  const watcher = createWatcher({
    watch: io.folderWatch ?? realFolderWatch,
    clock: io.watchClock ?? realWatchClock,
    onChange: async (keys) => {
      await running;
      await change(keys);
    },
  });

  /** what the watcher watches for one page: its source and everything its quiz hash covers, as of the last load */
  const watchPage = (job: Job): void =>
    watcher.set(
      job.target,
      [job.abs, ...(covered.get(job.target) ?? [])].map((f) => resolve(f)),
    );

  /** what the server serves, from what the pages are now */
  const publish = (): void => {
    if (server === null || reloadJs === null) return;
    server.pages.clear();
    const states = jobs.flatMap((j) => pages.get(j.target) ?? []);
    if (states.length === 1) {
      const only = states[0] as PageState;
      if (only.html !== null) server.pages.set("", only.html);
      return;
    }
    const entries: IndexEntry[] = states.map((p) => ({
      title: p.title,
      file: p.job.file,
      href: p.html === null ? null : p.name,
      failed: p.failed,
    }));
    server.pages.set("", buildIndex(entries, ui, reloadJs));
    for (const p of states) if (p.html !== null) server.pages.set(p.name, p.html);
  };

  const keyOf = (p: PageState): string => (jobs.length > 1 ? p.name : "");

  /** Builds one page and tells everyone how it went; returns whether it was a good build. */
  const buildPage = async (job: Job, firstRound: boolean): Promise<boolean> => {
    const state = pages.get(job.target) as PageState;
    const started = clock().getTime();
    const context: RunContext = {
      ...args.context,
      several: jobs.length > 1,
      builtAt: opts.builtAt ?? clock().toISOString(),
      onLoaded: (j, loaded) => covered.set(j.target, loaded.covered),
    };
    const r: FileResult = await buildOne(job, context);
    const seconds = ((clock().getTime() - started) / 1000).toFixed(1);
    const good = r.status === "built" && r.page !== undefined;
    state.failed = !good;
    if (good) {
      state.title = r.title ?? state.title;
      state.html = reloadJs === null ? "" : withReload(new TextDecoder().decode(r.page), reloadJs);
    }
    watchPage(job);
    report(r, state, firstRound, seconds);
    return good;
  };

  /** `build`'s output for the first build; for a rebuild one line on stderr, or the errors and what was kept */
  const report = (r: FileResult, state: PageState, firstRound: boolean, seconds: string): void => {
    const several = jobs.length > 1;
    if (opts.json) io.out(JSON.stringify(jsonLine(r, several, false)));
    const good = r.status === "built";
    if (firstRound && !opts.json) {
      for (const line of r.out) io.out(line);
      for (const line of r.err) io.err(line);
      return;
    }
    // a built file's `out` ends with its "wrote" line, which the one line below replaces
    const details = good ? r.out.slice(0, -1) : r.out;
    for (const line of details) io.err(line);
    for (const line of r.err) io.err(line);
    if (good) {
      const kb = Math.round((r.bytes ?? 0) / 1000);
      io.err(`${firstRound ? "built" : "rebuilt"} ${r.output} · ${kb} KB · ${seconds} s`);
    } else {
      io.err(
        `${shownPath(state.job.abs, io.cwd)}: ${state.html !== null || existsSync(state.job.target) ? "kept the last good page" : "no page written yet"}`,
      );
    }
  };

  /** A round of builds, then what is served and who is told. */
  const round = async (todo: readonly Job[], firstRound: boolean): Promise<void> => {
    const rebuilt: PageState[] = [];
    for (const job of todo) {
      if (await buildPage(job, firstRound)) rebuilt.push(pages.get(job.target) as PageState);
    }
    publish();
    // one `reload` per good rebuild, none for a failed one
    if (server !== null && !firstRound) for (const p of rebuilt) server.reload(keyOf(p));
  };

  /** The jobs of a build file, read again: a build file that no longer parses fails every page and keeps the old entries. */
  const replan = (): Job[] | null => {
    if (opts.buildFile === null) return null;
    const plan = planBuildFile(opts.buildFile, patterns, opts, io.cwd);
    if (!plan.ok) {
      if (opts.json) {
        io.out(
          JSON.stringify({
            status: "error",
            ...(plan.file ? { file: plan.file } : {}),
            message: plan.message,
            ...(plan.errors ? { errors: plan.errors } : {}),
          }),
        );
      }
      io.err(plan.file ? `${plan.file}: ${plan.message}` : plan.message);
      for (const d of plan.details) io.err(d);
      io.err("kept the last good pages");
      return null;
    }
    for (const item of plan.items) if ("error" in item) io.err(`${item.error.input}: ${item.error.message}`);
    return plan.items.flatMap((i) => ("job" in i ? [i.job] : []));
  };

  const adopt = (next: readonly Job[]): void => {
    const names = namesOf(next);
    const keep = new Set(next.map((j) => j.target));
    for (const [target] of pages) {
      if (!keep.has(target)) {
        pages.delete(target);
        covered.delete(target);
        watcher.remove(target);
      }
    }
    next.forEach((job, i) => {
      const old = pages.get(job.target);
      pages.set(job.target, {
        job,
        name: names[i] as string,
        title: old?.title ?? basename(job.file),
        html: old?.html ?? null,
        failed: old?.failed ?? false,
      });
      if (old === undefined) watchPage(job);
    });
    jobs = [...next];
  };

  const change = async (keys: string[]): Promise<void> => {
    try {
      if (keys.includes(BUILD_KEY)) {
        const next = replan();
        if (next === null) return;
        adopt(next);
        await round(jobs, false);
        return;
      }
      await round(
        jobs.filter((j) => keys.includes(j.target)),
        false,
      );
    } finally {
      io.roundDone?.();
    }
  };

  // the build file is watched from the start; its entries are read again whenever it changes
  if (opts.buildFile !== null) watcher.set(BUILD_KEY, [resolve(io.cwd, opts.buildFile)]);
  adopt(first);
  const started = new Promise<void>((done) => done()).then(async () => {
    await round(jobs, true);
    io.roundDone?.();
    if (server !== null) io.err("watching for changes (Ctrl+C to stop)");
    else io.err(`watching ${jobs.length} file${jobs.length === 1 ? "" : "s"} for changes (Ctrl+C to stop)`);
    // `--open` opens one page, once, after the first build: the served address (with several files, the index), else
    // the file; several files without `--serve` have no one page to open (G35)
    if (opts.open) {
      if (jobs.length > 1 && server === null) {
        io.err(`--open opens one page; built ${[...pages.values()].filter((p) => !p.failed).length}`);
      } else {
        const state = pages.get((jobs[0] as Job).target) as PageState;
        const target =
          server !== null
            ? jobs.length > 1 || state.html !== null
              ? server.url
              : null
            : state.failed
              ? null
              : state.job.target;
        if (target !== null) {
          try {
            await open(target);
          } catch (error) {
            const e = error as { code?: string; message?: string };
            io.err(
              `warning: cannot open the page: ${e.code === "ENOENT" ? "the system's opener was not found" : (e.message ?? "unknown error")}`,
            );
          }
        }
      }
    }
  });
  const running: Promise<void> = started;

  // Ctrl+C is the user's normal way out: the rebuild in flight finishes, then everything closes and the exit is 0
  const stopped = new Promise<void>((done) => {
    const remove = (io.onInterrupt ?? defaultInterrupt)(() => {
      remove();
      done();
    });
  });
  await stopped;
  watcher.close();
  await running;
  await watcher.idle();
  if (server !== null) await server.stop();
  if (opts.json) io.out(JSON.stringify({ status: "stopped" }));
  io.err("stopped");
  return EXIT.done;
}
