import { randomBytes } from "node:crypto";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { readFailure } from "./paths";

const RETRYABLE = new Set(["EPERM", "EBUSY", "EACCES"]);

/**
 * An I/O error with the file named, for exit code 2. `message` is plain words with no path (see `readFailure`):
 * the caller names the file with `shownPath`.
 */
export class WriteError extends Error {
  constructor(
    readonly file: string,
    cause: unknown,
  ) {
    super(readFailure(cause));
  }
}

/**
 * Writes a file atomically (TECHNICAL_DESIGN.md, "Files, formats and safe writes"): to a temporary file in the same
 * folder, then renamed over the old one, so a crash leaves the old file or the new one. On Windows a rename can fail
 * briefly while an editor or an antivirus holds the file; it is retried for up to a second.
 */
export async function writeFileAtomic(file: string, data: Uint8Array): Promise<void> {
  const temp = join(dirname(file), `.${basename(file)}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    if (await isFolder(file)) throw Object.assign(new Error("is a folder"), { code: "EISDIR" });
    await mkdir(dirname(file), { recursive: true });
    await writeFile(temp, data);
    const deadline = Date.now() + 1000;
    for (;;) {
      try {
        await rename(temp, file);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? "";
        if (!RETRYABLE.has(code) || Date.now() >= deadline) throw error;
        await new Promise((r) => setTimeout(r, 25));
      }
    }
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw new WriteError(file, error);
  }
}

const isFolder = (path: string): Promise<boolean> =>
  stat(path).then(
    (s) => s.isDirectory(),
    () => false,
  );

/**
 * Removes the temporary files an earlier run left beside `file`, killed during `writeFileAtomic`: in its folder, the
 * files named exactly `.<basename of file>.<8 lower-case hex>.tmp` and nothing else. A file that cannot be removed is
 * left, and so is a missing folder: this is never an error. `file` itself is not touched.
 */
export async function removeStaleTemps(file: string): Promise<void> {
  const folder = dirname(file);
  const prefix = `.${basename(file)}.`;
  const isTemp = (name: string): boolean =>
    name.startsWith(prefix) && name.endsWith(".tmp") && /^[0-9a-f]{8}$/.test(name.slice(prefix.length, -4));
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries
      .filter((e) => e.isFile() && isTemp(e.name))
      .map((e) => rm(join(folder, e.name), { force: true }).catch(() => undefined)),
  );
}
