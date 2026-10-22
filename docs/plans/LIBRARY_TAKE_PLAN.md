# Plan: `quiz library take`, `share` and `path` (task 4 of `LIBRARY_PLAN.md`)

A work order for an agent: **two commits**. Written on 2026-10-22 at commit `a80b077`, quizmd 0.8.1. Do not bump the version.

Before anything else, read:

- the shell notes in your own setup;
- the rules at the top of `BUILD_PLAN.md`;
- `AGENTS.md` ("Job 3");
- `LIBRARY_PLAN.md` (`take`, `share`, `path` under "Commands", and "Agent contract");
- `src/quizmd/library/` in full (especially `quizzes.py`: `lookup`, `stage`, `build_staged`, `read_version`, `write_stage`, `source_note`, `read_results`, `qdir`);
- `src/quizmd/serve.py`, and `serve_loop` and `serve` in `src/quizmd/cli.py`;
- `tests/test_library.py` and `tests/test_serve.py` (the `Running` harness).

Reuse the existing helpers; do not duplicate them.

Never stage `FEEDBACK..md`. Never push. Python only through `uv run`; no new dependencies. Never touch the real config (`%APPDATA%\quizmd`) or the global git config; isolate as `tests/test_library.py` does.

## Commit A: `serve_loop` moves into core `serve.py` (refactor only)

`take` must reuse the serving loop, but `serve_loop` lives in `cli.py`, and the library must not import `cli.py` (the layering rule in `LIBRARY_PLAN.md`).

- Move `serve_loop` from `cli.py` (about line 239) into `src/quizmd/serve.py`, unchanged in behaviour and signature. Its imports (`sys`, `time`, `webbrowser`) move with it.
- `cli.py` imports it from `.serve`. Keep `serve`, `review` and `brief` working as they are.
- Tests that patch `webbrowser.open` or `time` through `quizmd.cli` must still work. If one patches `quizmd.cli.webbrowser`, the move breaks it. In that case keep a thin re-export, or patch where the test expects it, **without changing any test's expectation**. If that is impossible, stop and report.
- Run `uv run pytest -q tests/test_serve.py tests/test_review.py tests/test_brief.py` plus the e2e serve tests (`-k serve`).
- Commit:

  ```text
  Refactor: serve_loop lives in serve.py, so the library can serve without importing the CLI
  ```

## Commit B: `take`, `share`, `path`

### Shared: resolving a quiz and a version

Write a small helper in `commands.py`, `_resolve(command, name) -> tuple[Path, dict, dict] | int`: the library, the data and the entry, or an exit code.

- It uses the existing `_open_library` and `quizzes.lookup`.
- `NotFound` and `Ambiguous` exit 2 with their message.
- With no library it exits 2 with `NO_LIBRARY`. Unlike `register`, these commands are run by a person, so they do not exit 3.

`--version H` (on `share` only) accepts a full version hash or a unique prefix of at least 4 characters among that quiz's versions. Unknown or ambiguous exits 2, listing the versions as `hash (added)`.

### `take`

```text
quiz library take NAME [--no-open] [--timeout SECONDS] [--port N] [--json]
```

Signature for tests, mirroring `cli.serve`: `take(args, should_stop=lambda: False, ready=None) -> int`.

1. Resolve the quiz.
2. **Source changed:** if `quizzes.source_note(library, entry)` is not None, warn on stderr: `"<name>: the source changed since it was registered; taking the registered version. Run quiz library register <source> --update <name> to update it."`. With "(has errors)", say so instead of suggesting the command. Add the warning to the JSON `warnings`.
3. **Build** with `quizzes.stage(library, entry, entry["current"])` and `quizzes.build_staged(staged, expected_hash=entry["current"])`. A `QuizError` exits 1 with its message, which points to `quiz library status`. Keep the quiz id from the built quiz.
4. **Serve** with core `serve_loop` (commit A), using `once=True`, `open=not args.no_open`, `timeout=args.timeout` (default **0**: none) and `port=args.port`, with the autosave at `qdir/progress.json` and the results at `qdir/results/<YYYYMMDD-HHMMSS>.json`. The time is the start of `take`; `SubmitServer` already avoids overwriting with `unique_path`. Create `results/` first. Pass `quiz_hash=entry["current"]` and `quiz_id` from the built quiz. Info lines go to stdout, or to stderr with `--json`, as `serve` does.
5. **After an accepted submit:**
   - read the results file;
   - print `saved <relative path inside the library>`, then a score line:
     - `score: 7/10 (70%)`, from `score.earned`, `score.possible_auto` and `score.percent_auto`;
     - plus `, 3 points wait for AI grading` when `score.pending_points > 0` (check the exact field names in `results-v1.schema.json`);
     - or `answers saved (survey)` in survey mode;
   - commit with `git.commit(library, f"take: {name} ({score_short}, {hash[:7]})")`, where `score_short` is `70%` or `survey`. Pass the warnings through. `progress.json` is git-ignored, and autosave has already deleted it.
6. **No submit** (timeout or stop): exit 2. If `qdir/progress.json` exists, print `progress saved; run quiz library take <name> to resume`. No commit.
7. **`--json`:** `{"status": "submitted" | "timeout", "name", "id", "hash", "results": "<absolute path>" | null, "score": {"earned", "possible_auto", "percent_auto", "pending_points"} | null, "mode", "committed", "warnings": [...], "resume": bool}`.
8. Exit 0 on submit and 2 otherwise. A port in use exits 2 with the same message `serve` gives.

### `share`

```text
quiz library share NAME [-o DIR] [--version H] [--source]
```

- **Page** (default): stage the version, `build_staged(..., expected_hash=H)`, and write the HTML to `unique_path(DIR / f"{name}.html")`, where DIR defaults to the current folder and is created if missing. Print the path. Nothing in the library changes and nothing is committed.
- **`--source`:** write an editable folder at `DIR/<name>/`. If that exists, use `<name>-2`, `<name>-3` and so on, never writing into an existing folder.
  - Use `quizzes.read_version` and `quizzes.write_stage` to write the snapshot bytes under the version's **original file name** (`version_of(entry, H)["file"]`), not `quiz.md`. The quiz id can come from the file name, and renaming the file would change it.
  - Each asset goes to its reference path, plus `brief.yaml` when present.
  - The files are ordinary, **writable** files.
  - Print the folder and the follow-up: `edit it, then: quiz library register <folder>/<file> --update <name>`.
- `--json` is not needed in v1. Print one line: the path, then the hint for `--source`.

### `path`

```text
quiz library path [NAME]
```

Print the library root, or `qdir` of the quiz, as an absolute path with the OS's separators, so it can be pasted into Explorer. No library exits 2 with `NO_LIBRARY`; an unknown name exits 2.

### `status`: move `assets` into `counts`

Task 3 put the asset numbers in a top-level `assets` object, because a test pinned `counts` to four keys. Move them into `counts` as `assets` and `unused_assets`, remove the top-level object, keep the `assets: N` text line, and update that one assertion in `tests/test_library.py` (`test_status_of_a_healthy_library` and any other test that reads the top-level `assets`). This expectation change is authorised by this plan; no other expectation changes.

### `cli.py`

Add the `take`, `share` and `path` subparsers under `library`, dispatched lazily like the others. `cmd_library` passes no test hooks; tests call `commands.take(args, should_stop, ready)` directly.

### Tests

**`tests/test_library.py`:**

1. **`take`, in a thread** (as `Running` does; write a small `RunningTake` or generalise `Running` if that stays readable):
   - register the calculus example, delete its source folder, then take it;
   - the page served at the URL with the token has `QUIZMD_SUBMIT` with `autosave`;
   - post a valid progress body: `qdir/progress.json` exists;
   - post a valid results body (built with `test_report.make_results`, as `test_serve.py` does): `take` exits 0, the results file is in `qdir/results/`, `progress.json` is gone, and there is a commit `take: … (…%, …)`;
   - `list --json` shows 1 attempt and its score.
2. **Survey quiz:** the score line says `answers saved (survey)` and the commit says `survey`.
3. **No submit:** with a stop after a progress post, the exit is 2, the resume hint is printed, `progress.json` remains, there is no new commit, and `resume` is true in `--json`.
4. **Resume across `take` runs:** after test 3, a second `take` injects the saved progress into the page (`QUIZMD_SUBMIT.progress` not null).
5. **Source changed:** after editing the registered source (not deleted this time), the warning is printed, the page served is the **registered** version (the data block's `hash` equals `current`), and nothing new is registered.
6. **`share`:**
   - the HTML is written to `-o`, has no `QUIZMD_SUBMIT` and has the normal CSP (`default-src 'none';` with no `connect-src`);
   - it equals `quiz build` of the original source once the `built_at` value is removed from both;
   - a second share writes `-2`;
   - with the source folder deleted, images are still embedded.
7. **`share --version`** with a 4-character prefix of an old version gives that version's hash in the data block. An unknown prefix exits 2.
8. **`share --source`:**
   - the folder has the original file name, the assets at their paths and `brief.yaml`, and the files are writable;
   - `register <folder>/<file> --update <name>` gives `unchanged`;
   - a second `--source` writes `<name>-2`.
9. **`path`:**
   - with no name, the library root;
   - with a name, the quiz folder;
   - an unknown name exits 2;
   - no library exits 2.
10. `status --json`: `counts` has `assets` and `unused_assets`, and there is no top-level `assets`.

**`tests/e2e/test_browser.py`**, next to the serve tests: register the calculus example in an isolated library, `take` it in a thread, open the URL in Playwright, answer one question, Submit, and assert that the results file landed in the library and that `list --json` shows the attempt. Use the existing e2e helpers for answering, and the isolation fixture from `tests/test_library.py`. Move that fixture into a shared helper (`tests/helpers.py`, or a `conftest.py`) if the e2e test needs it, without changing what it sets.

### Docs for this commit

- `docs/GUIDE.md`: extend the `quiz library` row with take, share and path, so `test_guide_documents_every_command` stays green. Rebuild the HTML with `uv run python docs/build_docs.py`. The full section is task 6.
- `LIBRARY_PLAN.md`:
  - strike task 4 through;
  - note that `share --source` keeps the original file name, not `quiz.md`;
  - note that `assets` and `unused_assets` are in `counts`.
- `docs/PLANNED.md`, "Library": one struck line for take, share and path.
- Include this file in commit B.

### Verify, then commit

1. `uv run pytest -q`: all pass. Known flakes, rerun alone before treating them as failures:
   - `tests/e2e/test_panel.py::test_narrow_screen_keeps_progress_and_pills_in_the_header`;
   - Windows socket aborts (WinError 10053) under load.
2. `uv run ruff check`, `uv run ruff format --check`, `biome lint src/quizmd/static/quiz.js`: all clean.
3. **Manual check** with a scratch `QUIZMD_CONFIG` and git config:
   - `init`;
   - `register` a copy of the calculus example, then delete the copy;
   - run `take <name> --no-open --timeout 5` in the foreground and let it time out: exit 2, no commit;
   - `share <name> -o <scratch>/out`: open the file's text and check it has no `QUIZMD_SUBMIT`;
   - `share <name> --source -o <scratch>/src`, then `register <scratch>/src/<name>/<file> --update <name>`: `unchanged`;
   - `path <name>`.

   Confirm that `%APPDATA%\quizmd` does not exist.
4. Commit:

   ```text
   quiz library take, share and path: build on the spot, results and commits in the library, editable source export
   ```

End every commit message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Stop and report instead of guessing

- If commit A cannot keep every existing test's expectation.
- If the staged build of a registered quiz differs from `quiz build` of its source in anything other than `built_at`.
- If `take` needs any change to the page (`quiz.js`) or to the CSP.
- If any other existing test has to change its expectations.

Report: both commit hashes, the files changed in each, the test counts before and after, the lint results, the manual check output, the deviations with reasons, and anything left open.
