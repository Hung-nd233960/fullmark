import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const RETRYABLE = new Set(["EPERM", "EBUSY", "EACCES"]);

/** An I/O error with the file named, for exit code 2. */
export class WriteError extends Error {
  constructor(
    readonly file: string,
    cause: unknown,
  ) {
    super(`cannot write ${file}: ${(cause as Error).message ?? String(cause)}`);
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
