# Plan: finish the library and release 0.9.0 (tasks 5 to 7 of `LIBRARY_PLAN.md`)

A work order for an agent: **three commits in quizmd plus one in the private setup repo**. Written on 2026-10-22 at commit `7b3f710`, quizmd 0.8.1.

Before anything else, read:

- the shell notes in your own setup;
- the rules at the top of `BUILD_PLAN.md`;
- `AGENTS.md` ("Job 3");
- `LIBRARY_PLAN.md` in full: the design and the remaining tasks 5 to 7;
- the tooling principles in your own setup: the agent contract follows it;
- `src/quizmd/library/` and `src/quizmd/cli.py` (the parser, about line 849 onward);
- `skill/SKILL.md`, `src/quizmd/agents.md`, `README.md`, `docs/GUIDE.md`, `docs/SPEC.md`;
- the private tldr page for `quiz`.

Never stage `FEEDBACK..md`. Never push either repository. Python only through `uv run`; no new dependencies. Never touch the user's real library (`<your library>`) or the real config (`%APPDATA%\quizmd\config.toml`) except to **read** them with `status` and `list`. Use a scratch `QUIZMD_CONFIG`, `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_NOSYSTEM` for everything else.

## Commit A: `init` refuses busy folders; `status` explains how to add history

Both are user decisions from 2026-10-22.

1. **`init` refuses a folder that has other files.** Today a non-empty folder that is not a library gets a warning, and the library files are added beside the existing ones. Change it:
   - exit **2**;
   - write nothing, not even the config;
   - print `quiz library init: <path> is not empty and is not a library; use a new or empty folder, for example <path>/quizmd-library` (POSIX path);
   - list up to 10 of the entries, as the warning does today;
   - with `--json`, `status: "refused"`, plus a `reason`.

   An **empty** folder, a **missing** folder (created) and an **existing library** (adopted) keep working as now. There is no `--force` override for this. `--force` stays only for switching from another configured library.
   - **Authorised expectation change:** the existing test for "init in a non-empty folder warns and creates" becomes "refuses, writes nothing, leaves the config unchanged". No other expectation changes.
   - Update `LIBRARY_PLAN.md` ("Commands", `init`) to match.
2. **`status` hints how to add git history.** When `repo` is `none` and git is available, the warning becomes: `not a git repository: the library has no history; to add it, run: git -C "<path>" init` (the path in the OS's form). The Rich output shows the same text.
   - After that, the next `register` or `take` commits, because the folder is its own repository (`owns_repo`). Add a test for this: a library made with `--no-git`, then `git init` by hand, then `register` makes a commit.
   - **Do not** add a flag that runs `git init` for the user. The user decided to keep that a manual step.
3. **Help grouping (task 5).** `quiz --help` lists the core commands and the library separately. argparse cannot group subcommands, so:
   - keep every subparser exactly as registered (`sub.choices` unchanged, so `tests/test_skill.py` and `tests/test_docs.py` keep finding them);
   - give `add_subparsers` `metavar="COMMAND"` and a `help=argparse.SUPPRESS`-free layout;
   - set the top-level parser's `description` (with `RawDescriptionHelpFormatter`) to a generated two-section list.

   The list is generated from one `COMMAND_GROUPS` mapping in `cli.py` (`{"Files": [...], "Library": ["library"]}`), using each subparser's own `help` text so nothing is written twice. A test asserts that every name in `sub.choices` appears in exactly one group. `quiz library --help` keeps its own listing, in the order `init, status, register, list, take, share, path`. If argparse prints the subcommand list twice (once from the description and once from the positional), suppress the positional's listing; check the real output, and paste it in the report.
4. **Layering test (task 5).** `tests/test_layers.py`:
   - parse every `.py` under `src/quizmd/` with `ast`, except `library/` and `cli.py`, and fail on any `import quizmd.library`, `from quizmd.library`, `from .library` or `from . import library`;
   - for `cli.py`, allow `library` imports only inside a function body (no module-level import);
   - move the existing subprocess import-direction test from `tests/test_library.py` here, unchanged (moving it is not an expectation change).
5. Commit:

   ```text
   library: init refuses busy folders, status says how to add git history; quiz --help groups core and library commands; layering test
   ```

## Commit B: docs, agent guide, skill, release 0.9.0 (task 6)

Facts to state correctly everywhere: the library commands (7), exit codes (0/1/2/3), and that the tool commits but never pushes. Rich and tomli-w are the two new dependencies. `share --source` keeps the original file name. Results hold the learner's answers and the snapshots hold answer keys, so **any remote must be private**.

1. **`README.md`:**
   - "Two layers": drop "planned for 0.9.0".
   - "Library commands (planned, 0.9.0)" becomes "Library commands", with the table matching what was built: `--plain`; `init` refusing busy folders; `share --source` with the original file name.
   - "Install": after pulling a version that adds a dependency (0.9.0 adds `tomli-w` and `rich`), run `uv tool install --editable <path to this repo> --reinstall`, or the installed `quiz` fails with `ModuleNotFoundError`.
   - One short "Backups" paragraph: local git history; push only to a private remote; a `post-commit` hook can push automatically, and quizmd never pushes.
2. **`docs/GUIDE.md`: a "Keep a library" section** (`src/quizmd/guide.md` is the authoring syntax reference and needs only one pointer line). Cover:
   - init (where, refusing busy folders, adopting a synced folder);
   - register (`-n`, `--update`, the outside-the-folder rule);
   - take (resume, results, commit);
   - list and status (colors, `--plain`);
   - share and `share --source`, and editing a quiz;
   - git and backups.

   Then run `uv run python docs/build_docs.py`.
3. **`src/quizmd/agents.md`** (then run `uv run python scripts/sync_examples.py` to copy it to the root `AGENTS.md`). Add a "Job 4: the library" section with the agent contract from `LIBRARY_PLAN.md`:
   - check whether a library exists with `quiz library status --json` (`status` is `no_library` or not);
   - the loop is `check` → (`review`) → `register --json`;
   - on exit **3**, ask the user where the library goes, and **never run `init` yourself**;
   - a name clash: use the suggested name and report it;
   - change a quiz with `share --source`, edit, then `register --update NAME`;
   - end with the `take` line from the JSON;
   - grading: results live in `quiz library path NAME`/results; use core `quiz grade` with the matching snapshot (`versions/<hash>.md`, where the hash is the results' `quiz.hash`);
   - never push, never edit files inside the library by hand.
4. **`skill/SKILL.md`:**
   - "Make a quiz", step 6 (Build): if `quiz library status --json` reports a library, register instead of building (`quiz library register quiz.md --json`) and give the user the `take` line. With no library, build as today, and mention once that `quiz library init PATH` exists.
   - One sentence under "Start from a brief": the `.md` can live in a scratch folder when it will be registered.

   `uv run pytest -q tests/test_skill.py` must pass: it fails when the skill names a command or flag the CLI lacks.
5. **`docs/SPEC.md`:**
   - a "Library" section: layers and the import rule, the config locations and precedence, the folder layout, the `library.toml` format (with `file` per version), snapshots read-only and hash-checked, the asset store, staging, the git rules (commit only when the library owns its repository, never push), and the exit-3 contract;
   - update the `quizmd_version` example (line about 504) to `0.9.0`.
6. **`docs/PLANNED.md`:** the "Library" section shows v1 done; list the deferred commands (`sync`, the `grade`/`stats` wrappers, `rename`, `rm`, `--web`), and note that spaced repetition now has a place for history.
7. **`LIBRARY_PLAN.md`:** strike tasks 5 and 6 through. Mark the plan "done in 0.9.0" at the top.
8. **Version 0.9.0:** `pyproject.toml`, `src/quizmd/__init__.py`, then `uv lock` (only the project's own version line in `uv.lock` may change). Rebuild the examples (`uv run python scripts/sync_examples.py`), because the pages embed the version, and rebuild the docs HTML.
9. Commit:

   ```text
   Version 0.9.0: the library (init, status, register, list, take, share, path), docs, agent guide and skill
   ```

## Commit C (in your private setup repo): the tldr page

Extend `tldr/pages/quiz.page.md` in its existing style: a `- description:` line, a blank line, then a backticked command with `{{placeholders}}`. Add, after the existing entries:

- make a folder this machine's quiz library (refuses folders with other files): `quiz library init {{D:\path\to\quizmd-library}}`;
- show the library's health, git state and counts: `quiz library status`;
- add a quiz to the library (exit 3 when there is no library): `quiz library register {{path/to/quiz.md}} --json`;
- add a new version of a quiz you edited: `quiz library register {{path/to/quiz.md}} --update {{name}}`;
- list the quizzes with attempts and last score: `quiz library list`;
- take a quiz; the result is saved in the library: `quiz library take {{name}}`;
- write a standalone page to share: `quiz library share {{name}} -o {{path/to/dir}}`;
- export the editable source of a quiz: `quiz library share {{name}} --source -o {{path/to/dir}}`;
- print the library folder, or a quiz's folder: `quiz library path {{name}}`.

Check `git -C your private setup repo status` first. If anything else is uncommitted there, do not include it and mention it in the report. Commit only that file:

```text
tldr quiz: the library commands (quizmd 0.9.0)
```

Do not push.

## Commit D? No: task 7 is verification, with no commit

1. `uv run pytest -q`: all pass. Known flakes, rerun alone: the narrow-screen panel test and Windows socket aborts (WinError 10053).
2. Clean: `uv run ruff check`, `uv run ruff format --check`, `biome lint src/quizmd/static/quiz.js`, `ty check src/quizmd/library src/quizmd/serve.py`.
3. **Manual run** with a scratch config and git config, in a scratch folder (this is `LIBRARY_PLAN.md` task 7):
   - `quiz library status`: no library, exit 2;
   - `init` a busy folder: refused, exit 2, config unchanged;
   - `init <scratch>/lib`: created, one commit;
   - a second `init` elsewhere: refused, exit 2;
   - copy the calculus example to a temp folder, `register` it (`-n calc`), delete the temp folder;
   - `take calc --no-open --timeout 5`: exit 2, no commit;
   - post one progress body and one results body to a `take` started in the background (or run the e2e test for it), then `list --plain` shows the attempt, and `git log` shows the take commit;
   - `share calc -o out` opens from disk with images (check the text for `data:image`);
   - `share calc --source -o src`, edit one explanation, `register src/calc/<file> --update calc`: `new-version` (an attempt exists);
   - `quiz --help`: the two groups.

   Paste the outputs.
4. Also run `quiz library status --plain` and `list --plain` against the user's real library (read only), and paste them.

## Stop and report instead of guessing

- If grouping the help needs anything beyond argparse (no new dependency).
- If any existing test expectation other than the one authorised in commit A must change.
- If `uv lock` changes anything beyond the project version.
- If the private setup repo has unrelated uncommitted changes in `tldr/pages/quiz.page.md` itself.

Report:

- the three quizmd commit hashes and the the private setup repo hash;
- the files changed in each;
- the test counts;
- the lint and ty results;
- the manual run and `quiz --help` outputs;
- deviations with reasons;
- anything left open.
