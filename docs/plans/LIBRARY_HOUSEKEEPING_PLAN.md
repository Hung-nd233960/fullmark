# Plan: `quiz library grade`, `stats`, `rename`, `rm` and release 0.9.1

A work order for an agent: **four commits in quizmd plus one in the private setup repo**. Written on 2026-10-22 at commit `b246671`, quizmd 0.9.0.

Before anything else, read:

- the shell notes in your own setup;
- `AGENTS.md` ("Job 3", especially "Working rules (every change)");
- `docs/plans/LIBRARY_PLAN.md` (the design; this plan adds four of its "later" commands);
- the tooling principles in your own setup;
- `src/quizmd/library/` in full, and in `src/quizmd/cli.py`: `cmd_grade`, `cmd_stats`, `cmd_library` and the `library` parser;
- `src/quizmd/stats.py`, `src/quizmd/report.py` (`load_results`, `regrade`);
- `tests/conftest.py` (the `lib` fixture) and `tests/test_library.py`.

Never push either repository. Python only through `uv run`; no new dependencies. Never touch the user's real library (`<your library>`) or real config, except to **read** them with `status` and `list` at the end. Use the `lib` fixture in tests and a scratch `QUIZMD_CONFIG`, `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_NOSYSTEM` for manual checks.

## The rule for all four commands

They are **wrappers**: they find files in the library and call core. No grading, scoring or stats logic goes in `quizmd.library`. Core must not import the library (`tests/test_layers.py`). The library may import core modules, but **not** `quizmd.cli`.

## Commit A: a core grade function the library can call

`cmd_grade` in `cli.py` does the whole job inline, and it writes the grades template next to the results file. The library needs the template and reports somewhere else (see commit B), so:

1. Move the body of `cmd_grade` into a new core function, for example `run_grade(results_path, quiz_path, grades_path, as_json, output, template_dir=None, prog="quiz grade") -> int` in a new module `src/quizmd/grade_run.py` (or in `report.py` if it reads better there). `template_dir=None` keeps today's behaviour (next to the results).
2. `cmd_grade` becomes a thin call to it. `prog` is used in the error prefixes, so the library's messages say `quiz library grade:`.
3. No behaviour change: every existing grade test passes unchanged.

## Commit B: `quiz library grade NAME` and `quiz library stats NAME`

Each quiz folder is `quizzes/<id>/`: `versions/<hash>.md` (+ `.assets.toml`, `.brief.yaml`, read-only), `results/<YYYYmmdd-HHMMSS>.json`, `progress.json`. Each results file records the version it was taken on in `quiz.hash`.

### Reports go to `quizzes/<id>/reports/`, never `results/`

`read_results` and `status` treat every `results/*.json` as an attempt. A `-report.json` or `-grades.json` there would count as an attempt and be flagged unreadable. So the wrapper writes **all** its output (report, grades template) into `quizzes/<id>/reports/`, created on demand. Add a test that `list` attempt counts and `status` stay correct after a `grade --json`.

### `quiz library grade NAME [--attempt STAMP] [--grades FILE] [--json]`

1. Resolve NAME with `_resolve`.
2. Pick the attempt: by default the newest (use `quizzes._when`); `--attempt` takes a file stem or a unique prefix of 4+ characters (mirror `_pick_version`: on no match or several, print the attempts and exit 2). No attempts: exit 2, `NAME has no attempts yet; take it with quiz library take NAME`.
3. Find the version from the results' `quiz.hash`. If the library has it, stage it with `quizzes.stage(...)` and grade against the staged `.md` (staging is needed: the media refs must resolve or `load_quiz` reports errors). If the version is missing, grade without a quiz and warn (core's "using the browser's grades" path).
4. Call the commit A function with `output=reports/<stem>-report.md` (or `.json`) and `template_dir=reports/`. Print what core prints (`wrote ...`).
5. Commit with `git.commit(library, f"grade: {name} {stem}")` (warnings as everywhere else). Only when it wrote something.
6. Exit codes as core grade.

The agent flow this enables (put it in `agents.md` and the skill): `quiz library grade NAME --json` → fill `reports/<stem>-grades.json` → `quiz library grade NAME --grades <that file> --json`.

### `quiz library stats NAME [--json]`

1. Resolve NAME; gather all readable results files of the quiz (oldest first, as core expects). None: exit 2 with the same message as grade.
2. If every attempt has the same `quiz.hash` and that version is stored, stage it and pass the loaded `Quiz` to `stats.collect`. Otherwise pass `quiz=None`, so each attempt keeps the grades it was taken with (never re-grade an old attempt against a newer answer key), and add a warning `attempts span N versions; using the grades each attempt was made with`.
3. If `stats.collect` raises `ResultsError` (for example, the quiz id changed between versions), print it with the `quiz library stats:` prefix and exit 2.
4. Output exactly as core: `stats.render` or JSON with `warnings`. No commit (nothing written).

### Tests (in `tests/test_library.py`, using `lib`)

Register a fixture quiz, write results files into `results/` the way `take` does (reuse an existing helper if there is one; otherwise build one with `score_attempt`). Cover: newest attempt by default; `--attempt` prefix, ambiguous and unknown; grade against an older version after `--update` (the report uses the old answer key); missing version → warning, still a report; `--json` writes the grades template into `reports/` when an essay needs grading; `--grades` round trip; a commit is made; `list` and `status` unchanged by the reports; stats single version, mixed versions (warning, `quiz=None`), no attempts.

## Commit C: `quiz library rename OLD NEW` and `quiz library rm NAME`

Folders and results are keyed by the **id**, so neither command moves files except `rm`'s delete.

### `rename OLD NEW [--json]`

1. Resolve OLD (name or id). NEW must match `quizzes.NAME_RE` (print `quizzes.NAME_RULE` otherwise) and must not equal any other entry's name **or id**. Exit 2 on either.
2. NEW equal to the current name: exit 0, `nothing to do`.
3. Change `name` in `library.toml` with `store.save`, commit `rename: OLD -> NEW`, print `renamed OLD to NEW`.
4. `--json`: `{"status": "renamed", "id", "old", "new", "committed", "warnings"}`.

### `rm NAME [--yes] [--force] [--json]` (user decision 2026-10-22: a real delete)

1. Resolve NAME. Count versions and attempts for the prompt.
2. **Safety checks, in this order, each exiting 2 with nothing deleted:**
   - The library is not its own git repository (`git.owns_repo` false, or git missing): `the delete cannot be undone because the library is not its own git repository; pass --force to delete anyway`. `--force` skips this check only.
   - The quiz folder has uncommitted changes (run `git status --porcelain -- quizzes/<id>`; add a helper in `git.py`): `quizzes/<id> has uncommitted changes; commit them first (git -C <library> commit -am ...) or pass --force`. `--force` skips this check too.
   - Confirmation: without `--yes`, if stdin is a TTY, ask `Delete NAME (ID): N versions, M attempts? [y/N]` (then a space) and stop with exit 1 (`nothing deleted`) unless the answer is `y` or `yes`. If stdin is not a TTY and `--yes` is missing: exit 2, `pass --yes to confirm`. Under `--json`, `--yes` is required (no prompt).
3. Delete: first remove the entry from `library.toml` (`store.save`), then the folder. The version files are read-only, so `shutil.rmtree` needs an error handler that calls `fsutil.make_writable` and retries (`onexc` on Python 3.12+, `onerror` before; check the project's minimum Python in `pyproject.toml`). If the folder delete fails half-way, report it and exit 1: `status` already flags a folder with no entry, and the message says to delete `quizzes/<id>` by hand.
4. Commit `rm: NAME (ID)`. Print `deleted NAME; recover it with git -C <library> revert HEAD` when committed. With `--force` and no repository, print `deleted NAME` only.
5. Assets the quiz used stay in `assets/` (`status` reports them as unused). Do not add a cleanup.
6. `--json`: `{"status": "deleted" | "refused" | "cancelled", "id", "name", "versions", "attempts", "committed", "warnings", "reason"}`.

**Agents never run `rm` or `rename` unless the user asked for that exact quiz.** Say so in `agents.md` and the skill, next to the rule about `init`.

### Tests

`rename`: happy path and commit; bad name; name taken; name equal to another quiz's id; lookup by the new name works and by the old name fails. `rm`: `--yes` deletes folder and entry and commits, and `git revert HEAD` brings both back; no repo → refused without `--force`, deleted with it; dirty folder → refused; non-TTY without `--yes` → exit 2 with nothing deleted; TTY prompt answered `n` → exit 1, nothing deleted (monkeypatch `sys.stdin.isatty` and `input`); read-only version files are deleted on Windows; `status` is healthy afterwards.

## Commit D: docs and release 0.9.1

1. Parser help lines for the four commands, in the `library` parser after `path`, with `--json`. `cmd_library` dispatches them.
2. `README.md`: "Seven commands" becomes eleven; add the four to the table or list; drop them from the "Later" line. `docs/GUIDE.md` and `docs/SPEC.md` 10a: same, plus the `reports/` folder in the layout. `docs/PLANNED.md`: strike the wrappers and `rename`/`rm`, pointing at this plan.
3. `src/quizmd/agents.md` and `skill/SKILL.md`: the grade flow above and the rule that agents never run `rm`/`rename` unasked. Run `uv run python scripts/sync_examples.py`; `tests/test_skill.py` checks every flag the skill names.
4. `docs/plans/README.md`: add this plan's row.
5. Version 0.9.1 in `pyproject.toml`, `src/quizmd/__init__.py`, and the `quizmd_version` example in `docs/SPEC.md`. Then `uv lock`.
6. Full suite (`uv run pytest -q`, about 5 minutes; known flakes are listed in `AGENTS.md`), ruff check and format, ty on the files you changed. Reinstall: `uv tool install --editable <path to this repo> --reinstall`; `quiz --version` says 0.9.1.
7. Manual check on a scratch library (scratch config and git config): register, write a fake attempt, `grade`, `stats`, `rename`, `rm --yes`, `git revert HEAD`, `status`. Then **read-only** on the real library: `quiz library status` and `quiz library list`.

## the private setup repo

the private tldr page for `quiz`: add one example each for `quiz library grade NAME` and `quiz library rm NAME --yes`. One commit, not pushed.

## Done means

Four quizmd commits and one the private setup repo commit, none pushed; full suite passes; `quiz --version` is 0.9.1; report anything you could not do or had to decide yourself.
