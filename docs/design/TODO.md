# Design gaps to settle

Gaps and contradictions in the 1.0 design docs, found while writing [USER_DESIGN.md](USER_DESIGN.md). Each item says where it is and, when there is one, the suggested fix. Remove an item when the docs are fixed.

## Small fixes

- [ ] **`library import` contradicts itself** ([COMMANDS.md](COMMANDS.md), `quiz library import`). The text says every quiz must pass `check` before anything is written; the exit codes say exit 1 means "a quiz refused (the others still import)". Suggested: all or nothing, as batch `library register` now is, and reword exit 1.
- [ ] **`serve` without `--once` in a terminal** ([COMMANDS.md](COMMANDS.md), `quiz serve`). `--once` is the default only when stdout is not a terminal, but nothing says what the server does after a submit when it is. `review`'s default is "as for serve", so it inherits the gap. Say whether it keeps accepting submits (and where each is written) until Ctrl+C or the timeout.
- [ ] **Timeout defaults** ([COMMANDS.md](COMMANDS.md)). `serve` waits 1800 s and `library take` waits forever; `review`, `brief --web` and `grade --web` state no default. State one for each.
- [ ] **Single-file `register` of unchanged content** ([COMMANDS.md](COMMANDS.md), `quiz library register`). Only the batch form defines `unchanged`, and the single-file `--json` lists only `registered`. Make one file behave like a batch of one: skipped as `unchanged`, exit 0.

## Needs a decision

- [ ] **Agent rules for 1.0.** The 0.x `AGENTS.md` had rules the 1.0 docs only partly restate: never run `library init` unasked, `rm` and `rename` only on request, never pass `--yes` or `--force`, `generated_by`, and what to do when the user cannot reach `127.0.0.1`. 1.0 states only the `--into` rule and the `fullmark.toml` rule. `quiz agent-guide` prints `AGENTS.md`, so it needs a section in the design, probably in [USER_DESIGN.md](USER_DESIGN.md). `generated_by` appears only in `brief.generated-by` and the files table, not in the rule catalogue.
- [ ] **`serve FILE` given a built page** ([COMMANDS.md](COMMANDS.md), `quiz serve`). `FILE` may be "a page built from it", but `--section` and exit 1 (check errors) need the source. Either drop the page form or say which options it refuses.
- [ ] **Surveys in the library.** Nothing says whether `library take`, `library grade` and `library stats` handle surveys; only `stats`' "Answers over time" table hints that they do.
- [ ] **`proposals/shelves.md` vs the freeze.** The proposal says to decide before v1 is frozen, but [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md) froze the v1 components on 2026-10-24, and shelves as lists would change the library format that keeps the `public` flag. Decide now or record that v1 keeps the flag.

## Dropped from USER_DESIGN.md until the design says so

These were 0.x behaviour, and the 1.0 docs don't mention them. Add them to the design if they stay.

- [ ] Agents read every page of the material as text and as an image.
- [ ] The agent ends its message after `register` with the command to start the quiz.
- [ ] `register --update` warns about an attempt in progress on the old version.
- [ ] Non-goal: no symbolic maths (`2x` and `x*2` are not compared as equal).
