# Proposal: build logs and the paper record

**Status: proposal, not in v1 scope** (raised by the owner on 2026-11-03). v1 reports a build on stderr, and with `--json` as one JSON line per file and a summary ([COMMANDS.md](../COMMANDS.md), `quiz build`); `--watch` prints one line per rebuild. Builds are deterministic, so the inputs reproduce the output.

## Why v1 has no log file

- **What a log would say is already printed.** Errors and warnings go to stderr with the file, the line and the fix; `quiz build ... --json > build.jsonl` is a complete machine-readable record for CI or a script.
- **A file per build is clutter.** `--watch` rebuilds on every save: a log per rebuild would leave hundreds of files beside the quizzes. fullmark writes only what was asked for.
- **Two sources of truth.** A log file would repeat stderr and `--json`, and the two could drift.

## The ideas, for after v1

### 1. `--log FILE`: the `--json` lines, appended to a file

```text
quiz build FILE... --log build.jsonl
quiz build FILE --watch --serve --log watch.jsonl
```

Appends the same JSON lines `--json` prints (one per file or per rebuild, then the summary), each with a timestamp, while stderr stays human. Nothing is written unless asked, so `--watch` writes one file that grows, not a file per rebuild. A build file could take `log = "build.jsonl"` at its top level.

### 2. The paper record: proof of what was handed out

For an official exam a teacher may need to show, later, exactly which paper and key went out. With `--print`, an option (`--record`) writes beside the paper a small JSON file:

- the quiz file, its version (`quizHash`) and the short version printed on the paper;
- the options that shape the paper: `--seed` (the paper code), `--answers`, `--answer-sheet`, `--materials`, `--ui-lang`, `--fonts`, the profile;
- fullmark's version;
- the SHA-256 of the paper's bytes, and of the key when it is in the same file.

With it, `quiz build` can rebuild the same bytes and a teacher can check a paper against its record (a later `quiz verify PAPER RECORD` could do it). Several versions of one exam give one record each.

## Open questions

- Is `--log` needed at all, beyond `--json >` and `2>` in a shell? PowerShell's redirection writes UTF-16 by default, which may be the real reason to add it.
- Should the record also go into the paper itself, as a comment, so the file carries its own proof? The footer already prints the version and the paper code.
- Does the record need the quiz's text (or its hash only), so that a deleted or edited quiz can still be proven?

## Cost

`--log`: about half a day (an append-only writer over the existing JSON lines, its tests). The record: about a day with its tests; `quiz verify` another day.
