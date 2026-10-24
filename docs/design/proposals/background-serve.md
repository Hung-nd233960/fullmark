# Proposal: `--background` for the one-shot server

**Status: proposal, not in v1 scope.** The seam it needs is in v1 ([DESIGN.md](../DESIGN.md), section 7, "Seams for later features"): with `--json`, every one-shot server prints `{"status": "listening", "url", "port", "pid"}` as soon as it is up, before it waits for a submit.

## The idea

Run the server like `nohup`: fullmark keeps running, but not in the foreground, and the prompt comes back at once. In bash, `&` or `nohup` already does this; PowerShell has no clean equivalent (`&` makes a job that dies with the session, `Start-Process` with redirection is clumsy), so the flag is mostly for Windows.

```text
quiz serve FILE --background [the usual serve options]
```

- The parent starts a detached copy of itself with the same arguments minus `--background` (`detached: true`, `windowsHide: true`, stdio to a log file), waits for its `listening` line, prints that line plus `"results"` and `"log"`, and exits 0.
- The copy runs as `serve` does today: it exits on a submit or on `--timeout`, writing the results to `--out`.
- Applies to every one-shot server command (`serve`, `review`, `brief --web`, `grade --web`, `library take`).
- The log goes under `%TEMP%\fullmark\` (or `$TMPDIR/fullmark/`), cleaned like `replay` pages.

## What the caller gives up

The exit code and the final JSON line. Completion is the `--out` file appearing; a timeout shows only in the log. A caller that needs the outcome runs `serve` in the foreground, or in its own background runner, as agents do.

## Cost once the seam exists

Spawning the copy, forwarding the first line, the log file. A test on each OS that the parent returns, the copy survives the terminal closing, and a submit writes the results. About half a day.
