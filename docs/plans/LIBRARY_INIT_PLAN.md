# Plan: lint cleanup, then `quiz library init` and `status` (task 2 of `LIBRARY_PLAN.md`)

A work order for an agent: **two commits**, in this order. Written on 2026-10-22 at commit `d91ca5a`, quizmd 0.8.1. Do not bump the version (task 6 of `LIBRARY_PLAN.md` sets 0.9.0).

Before anything else, read:

- the shell notes in your own setup (shell quirks; some tools are interactive and must not be run);
- the rules at the top of `BUILD_PLAN.md`;
- `AGENTS.md` ("Job 3");
- `LIBRARY_PLAN.md` in full (the design this implements: "Layers", "File formats", "Config", "Library folder", "Git", and `init` and `status` under "Commands").

Never stage `FEEDBACK..md` (the user's note). Never push. Run Python only through `uv run`. Never `pip install`.

## Commit A: lint cleanup

Both issues predate the autosave work. Fix them in their own commit so the library commit stays clean.

1. **ruff, tests:** `uv run ruff check tests` reports `I001` (import order) in `tests/e2e/test_browser.py` and `tests/e2e/test_panel.py`. Run `uv run ruff check --fix tests` and check with `git diff` that only import blocks moved.
2. **Biome, `src/quizmd/static/quiz.js`:** `biome lint src/quizmd/static/quiz.js` (Biome is on PATH, installed by winget; **not** `npx`) reports 8 warnings. Fix each by hand, not with `--fix`, so you see every change:
   - **6 × unused `catch (e)`** (lines about 314, 483, 710, 2235, 2694 and one more Biome lists): use the optional catch binding, `} catch {`. Every browser the page supports has it. Keep any comment inside the block.
   - **Unused `const byId`** (about line 339): confirm with a search that nothing reads it, then delete the line.
   - **Unused parameters** in `choiceRow(q, type, name, value, html)` (about line 1303, the unused one is `q`) and `buildAnswer(q, card, host)` (about line 1358, the unused one is `card`): **do not remove them**, because callers pass arguments by position. Rename to `_q` and `_card`, which Biome accepts. Re-check Biome's column numbers to be sure which parameter it means.
   - Afterwards `biome lint src/quizmd/static/quiz.js` reports **0 warnings**.
3. `uv run python scripts/sync_examples.py` (the page changed, so the examples rebuild).
4. `uv run pytest -q` (about 5 minutes; use a 600000 ms timeout). `tests/e2e/test_panel.py::test_narrow_screen_keeps_progress_and_pills_in_the_header` is a known flake under load: rerun it alone before treating it as a failure.
5. Commit:

   ```text
   Lint: optional catch bindings and unused names in quiz.js, import order in two e2e tests
   ```

## Commit B: config, `init`, git and `status`

### Package layout (new)

```text
src/quizmd/library/
  __init__.py      # docstring only: what the library is, and "core never imports this package"
  fsutil.py        # atomic_write_text(path, text): temp file in the same folder + os.replace, LF, UTF-8
  config.py        # where the config lives, read it, write it, which library this machine uses
  store.py         # the library folder: is_library, create, load library.toml
  git.py           # init, commit, status; every failure becomes a warning, never an exception
  commands.py      # init(args) and status(args): return an exit code, print text or JSON
```

`cli.py` defines the argparse parsers (it already defines every parser) and one handler, `cmd_library(args)`. **Only that handler imports the library**, lazily: `from .library import commands`. No other core module imports `quizmd.library` (task 5 adds the test that enforces this; keep it true now).

### Dependency

`uv add "tomli-w>=1.0"`. This updates `pyproject.toml` and `uv.lock`; commit both. Read TOML with the stdlib `tomllib` and write it with `tomli_w`. Add no other dependency.

### `config.py`

- `config_path() -> Path`, decided at call time, never at import (the tests patch the environment and `sys.platform`):
  1. `QUIZMD_CONFIG` set: that path.
  2. `XDG_CONFIG_HOME` set (any OS): `$XDG_CONFIG_HOME/quizmd/config.toml`.
  3. `sys.platform == "win32"`: `%APPDATA%\quizmd\config.toml`. When `APPDATA` is unset, use `~/AppData/Roaming`.
  4. `sys.platform == "darwin"`: `~/Library/Application Support/quizmd/config.toml`.
  5. Otherwise `~/.config/quizmd/config.toml`.
- `load_config() -> dict`: `{}` when the file is missing. On a TOML syntax error, raise `ConfigError` with the path and `tomllib`'s message.
- `save_config(data: dict)`: create the parent folders, write with `tomli_w.dumps` through `atomic_write_text`. **Unknown keys survive:** callers load the whole dict, change `data["library"]["path"]`, and save the whole dict.
- `configured_library() -> str | None`: `library.path` from the config, ignoring the environment.
- `library_location() -> tuple[Path | None, str]`: `(Path, "QUIZMD_LIBRARY")` when that variable is set and non-empty; otherwise `(Path, "config")` from the config; otherwise `(None, "none")`.
- Store paths as absolute POSIX strings (`path.resolve().as_posix()`, for example `D:/quizzes`). Compare paths with `Path(...).resolve()`, never as strings.

### `store.py`

- Constants: `LIBRARY_FILE = "library.toml"`, `FORMAT = "quizmd-library"`, `VERSION = 1`, `GITIGNORE = "progress.json\n*.tmp\n"`.
- `is_library(path) -> bool`: `path / LIBRARY_FILE` is a file.
- `create(path) -> None`:
  - make `path`, `path/assets`, `path/quizzes`;
  - write `library.toml` as `{format, version, created}`, where `created` is a local-time `datetime` to the second, which `tomli_w` writes as a TOML datetime;
  - **omit the `quiz` key** while there are no quizzes (readers treat it as missing = empty);
  - write `.gitignore` with `GITIGNORE`, never overwriting an existing one.
- `load(path) -> dict`: parse `library.toml`. Raise `LibraryError` with a clear message when it is missing, invalid TOML, has a `format` other than `FORMAT`, or a `version` newer than `VERSION` ("made by a newer quizmd; upgrade").

### `git.py`

Run git as `subprocess.run(["git", "-C", str(path), ...], capture_output=True, text=True, timeout=30, env=os.environ | {"GIT_TERMINAL_PROMPT": "0"})`. Never use `--no-verify`; hooks run as normal. No function raises: every failure (git missing, `CalledProcessError`, `OSError`, `TimeoutExpired`) becomes a warning string.

- `available() -> bool`: `shutil.which("git") is not None`. Tests patch `quizmd.library.git.shutil.which`.
- `toplevel(path) -> Path | None`: `rev-parse --show-toplevel`, resolved; `None` when the folder is not in a repository.
- **`owns_repo(library) -> bool`**: `toplevel(library) == library.resolve()`. **The tool commits only when this is true.** A library folder inside another repository (for example inside a project) must never cause a commit in that outer repository.
- `init(path) -> list[str]`, which returns warnings:
  - git missing: `["git is not installed; the library has no history"]`;
  - inside another repository: `["<path> is inside the git repository <toplevel>; no repository was made, and quizmd will not commit"]`;
  - otherwise `git init -q`.
- `commit(library, message) -> tuple[bool, list[str]]`, which returns `(committed, warnings)`:
  - when it does not own the repo or git is missing, return `(False, [])` silently (`status` reports why);
  - check the identity: `git config user.name` and `git config user.email`. When one is missing, return `(False, ["no git identity; run git config --global user.name \"...\" and user.email to let quizmd commit"])`;
  - otherwise `add -A`, then `commit -q -m message`. "Nothing to commit" (exit 1 with a clean tree) is `(False, [])`, not a warning. Any other failure is `(False, ["git commit failed: <first line of stderr>"])`.
- `status(library) -> dict`: `{"available", "repo": "own" | "outer" | "none", "toplevel", "dirty", "remote"}`.
  - `dirty`: `status --porcelain` is non-empty.
  - `remote`: `remote` prints anything.
  - `dirty` and `remote` are only computed for `"own"`.

### `commands.py`: `init(args) -> int`

`quiz library init [PATH] [--force] [--no-git] [--json]`, where PATH defaults to the current folder. Resolve PATH first, and read the configured library with `configured_library()`, which ignores `QUIZMD_LIBRARY`. Then the first case that applies:

| Case | Action | `status` | Exit |
|---|---|---|---|
| Configured == PATH and `is_library(PATH)` | change nothing; "already this machine's library" | `unchanged` | 0 |
| Configured != PATH, the configured path `is_library`, no `--force` | change nothing; name both paths; "pass --force to switch; the old library is left as it is" | `refused` | 2 |
| `is_library(PATH)` | adopt: write the config only; touch nothing in the folder, including git | `adopted` | 0 |
| otherwise | create (below), then write the config | `created` | 0 |

- A configured path that is no longer a library (deleted or moved) is not a reason to refuse. Note it in the warnings ("the previous library at X no longer exists") and go on.
- **Create:**
  - If PATH exists and is not empty, warn and list up to 10 of its entries ("…and N more"). Go on, and touch none of them.
  - Run `store.create`. Unless `--no-git`, run `git.init`, then `git.commit(PATH, "init: quizmd library")`.
- With `--force` on a switch, the old library is never modified.
- `QUIZMD_LIBRARY` set: warn that it overrides the config in this shell.
- A failure to write the folder or the config: print `quiz library init: <reason>` to stderr and exit 2.
- Text output: one line saying what happened and where, the config path, then `warning: ...` lines. `--json` prints `{"status", "path", "config", "git": {"repo", "committed"}, "warnings": [...]}` and nothing else on stdout; the human lines go to stderr in that case, as `serve --json` does.

### `commands.py`: `status(args) -> int`

`quiz library status [--json]` works with no library and no config.

- **Sections, one `key: value` line each:**
  - `quizmd`: the version;
  - `config`: the path, exists or not;
  - `library`: the path and its source (config or `QUIZMD_LIBRARY`), exists, writable (try creating and deleting a temp file in it), and the format and version of `library.toml`;
  - `git`: own repo, inside another repo, or none; uncommitted changes; remote or none;
  - `counts`: quizzes (entries in `library.toml`), versions (the sum of each entry's `versions`), attempts (`quizzes/*/results/*.json`), in progress (`quizzes/*/progress.json`).
- **Problems**, which make it exit 1:
  - the configured library folder is missing;
  - it is not writable;
  - `library.toml` is missing, invalid, or of another format or a newer version;
  - a folder in `quizzes/` without an entry;
  - an entry without a folder.

  Task 3 adds the snapshot and asset hash checks. Leave a one-line comment where they will go.
- **Warnings**, which do not change the exit code:
  - git is not installed;
  - not a repository ("no history");
  - inside another repository ("quizmd will not commit");
  - uncommitted changes;
  - **no remote: "no remote: the git history is not an off-machine backup"**;
  - `QUIZMD_LIBRARY` overrides the config.
- **Exit:** 2 when no library is configured, saying "No library on this machine; run `quiz library init [PATH]`". Otherwise 1 when there are problems and 0 when there are none.
- `--json`: `{"status": "ok" | "problems" | "no_library", "quizmd_version", "config": {"path", "exists"}, "library": {"path", "source", "exists", "writable", "format", "version"} | null, "git": {...} | null, "counts": {...} | null, "problems": [...], "warnings": [...]}`.

### `cli.py`

- A `library` subparser (help: "keep your quizzes and results in one folder; see quiz library --help") with its own subparsers `init` and `status`, and the options above. `quiz library` alone prints the library help and exits 2.
- `cmd_library(args)` imports `commands` lazily and calls `commands.init(args)` or `commands.status(args)`.
- Register it in the `set_defaults` list (about line 204 onward) like the others.

### Tests: `tests/test_library.py` (new, no browser)

Fixture `lib(monkeypatch, tmp_path)`:

- `QUIZMD_CONFIG=tmp_path/"cfg"/"config.toml"`; delete `QUIZMD_LIBRARY` and `XDG_CONFIG_HOME`;
- an isolated git config: `GIT_CONFIG_GLOBAL=tmp_path/"gitconfig"` (with `[user] name = Test`, `email = test@example.com`) and `GIT_CONFIG_NOSYSTEM=1`;
- `monkeypatch.chdir(tmp_path / "work")`.

Call `main([...])` and use `capsys`, as `tests/test_brief.py` does. Skip the git-dependent tests with `pytest.mark.skipif(shutil.which("git") is None, ...)`.

1. `config_path()`: `QUIZMD_CONFIG` wins. With it unset, check each OS: patch `sys.platform` to `win32` (with and without `APPDATA`), `darwin` and `linux` (with and without `XDG_CONFIG_HOME`), using a `monkeypatch`ed home.
2. `save_config` keeps unknown keys and tables, and writes atomically (no `.tmp` left behind).
3. `init` with no PATH makes the current folder the library: `library.toml` (format, version, `created`, no `quiz` key), `assets/`, `quizzes/`, `.gitignore`. The config holds the absolute POSIX path.
4. `init` in a non-empty folder warns, lists the entries, leaves them byte-for-byte unchanged and still creates the library.
5. `init` on an existing library elsewhere (made by `store.create`) adopts it: config written, nothing in the folder changed, no `.git` created.
6. A second `init` elsewhere exits 2 and leaves the config unchanged; with `--force` it switches, and the old library is unchanged.
7. `init` again on the configured path exits 0 with `unchanged`.
8. A configured library that was deleted does not block `init` elsewhere; it warns instead.
9. **Git:**
   - `init` makes a repository with exactly one commit, and `.gitignore` is tracked;
   - `--no-git` makes no `.git`;
   - inside an outer repository (`git init` a parent folder first) there is no nested `.git`, the outer repository gets **no new commit**, and there is a warning;
   - with `shutil.which` patched to `None`, init succeeds and warns;
   - with an empty git identity (an empty `GIT_CONFIG_GLOBAL`), init succeeds, makes no commit and warns with the `git config` hint.
10. `init --json` prints only JSON on stdout, with the documented keys.
11. **`status`:**
    - no config: exit 2, the message names `init`, and the JSON status is `no_library`;
    - configured path missing: exit 1 with a problem;
    - a healthy new library: exit 0, `repo: own`, a `no remote` warning, and counts all 0;
    - an extra folder `quizzes/abc123` with no entry: exit 1 with a problem naming it;
    - a `progress.json` and a results file in such a folder are counted;
    - `QUIZMD_LIBRARY` set to another library is used, with a warning;
    - a `library.toml` with `version = 99`: a problem saying to upgrade.
12. `main(["library"])` exits 2 (argparse's `SystemExit(2)` or the handler's own exit, either way 2).
13. **Import direction (temporary, until task 5):** `import quizmd.cli` does not put `quizmd.library` into `sys.modules`. Check it in a subprocess (`uv run python -c ...` or `sys.executable -c ...`) so other tests cannot interfere.

### Docs for this commit

User docs come in task 6. Here, only:

- `LIBRARY_PLAN.md`: strike task 2 through and note "done (commit B of `LIBRARY_INIT_PLAN.md`)". In the agent contract, keep `needs_input` with an underscore, the existing convention from `quiz brief --json`; it is already corrected.
- `docs/PLANNED.md`, "Library" section: one line, "~~Config, `quiz library init` and `status`~~: done."
- Include this file (`LIBRARY_INIT_PLAN.md`) in the commit.

### Verify, then commit

1. `uv run pytest -q`: all pass (the same known flake rule).
2. `uv run ruff check` and `uv run ruff format --check`: clean on the whole repository, now that commit A fixed the tests. Biome: still 0 warnings.
3. **Manual check, never touching the real config:** in a scratch folder, with `QUIZMD_CONFIG` set to a scratch path for that one command line:
   - `uv run quiz library status`: exit 2;
   - `uv run quiz library init <scratch>/lib`, then `status`: own repo, the no-remote warning;
   - `uv run quiz library init <scratch>/lib2`: refused, exit 2;
   - `git -C <scratch>/lib log --oneline`: one commit.

   Confirm that `%APPDATA%\quizmd\config.toml` was **not** created or changed.
4. Commit:

   ```text
   quiz library init and status: machine config (TOML), library folder, git history the tool writes but never reads
   ```

End every commit message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Stop and report instead of guessing

- If a design point in `LIBRARY_PLAN.md` contradicts this file.
- If git behaves differently on this machine than described (for example a global hook or a credential prompt) in a way the tests cannot isolate.
- If `uv add` fails (network) or wants to change anything other than `tomli-w`.
- If any existing test has to change its expectations.

Report: both commit hashes, the files changed in each, the test counts before and after, the Biome and ruff results, the manual check and its output, anything skipped or left open.
