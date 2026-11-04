import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CheckIo } from "../../src/cli/check";

export type Captured = { io: CheckIo; out: string[]; err: string[] };

/** An `Io` that records its output, with a machine of its own so that the tests never read the real config. */
export function capture(cwd: string, env: Record<string, string | undefined> = {}): Captured {
  const out: string[] = [];
  const err: string[] = [];
  const io: CheckIo = {
    out: (t) => out.push(t),
    err: (t) => err.push(t),
    errRaw: () => undefined,
    cwd,
    tty: false,
    machine: { cwd, env, platform: "linux", home: join(cwd, "no-home") },
  };
  return { io, out, err };
}

/** A temporary folder with the given files (path to text); removed with `done()`. */
export function tempTree(files: Record<string, string>): { dir: string; done(): void } {
  const dir = mkdtempSync(join(tmpdir(), "fullmark-cli-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return { dir, done: () => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) };
}

export const quiz = (body = "- [x] a\n- [ ] b", front = "title: T", head = "Q {type=single id=q}") =>
  `---\n${front}\n---\n\n## ${head}\n\n${body}\n`;
