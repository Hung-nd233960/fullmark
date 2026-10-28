import type { Io } from "./ids";

/**
 * A command-level failure (COMMANDS.md, Common options, `--json`): `{"status": "error", "message"}` on stdout, with
 * `"file"` when it concerns one input and `"errors"` for a malformed config; the human text goes to stderr in every
 * mode. `details` are extra human lines (one problem each) that the JSON object does not repeat.
 */
export function fail(
  io: Io,
  json: boolean,
  message: string,
  extra: { file?: string; errors?: unknown[] } = {},
  details: string[] = [],
): void {
  if (json) {
    io.out(
      JSON.stringify({
        status: "error",
        ...(extra.file !== undefined ? { file: extra.file } : {}),
        message,
        ...(extra.errors ? { errors: extra.errors } : {}),
      }),
    );
  }
  io.err(extra.file !== undefined ? `${extra.file}: ${message}` : message);
  for (const d of details) io.err(d);
}
