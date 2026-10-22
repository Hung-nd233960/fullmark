# Plan: `quiz library` (one place for quizzes and results)

**Done in 0.9.0.** Tasks 1 to 7 are finished; what is left is under "v1 and later" and in `docs/PLANNED.md`.

A work list for an agent, one task per commit. Written on 2026-10-22 at quizmd 0.8.1 (unreleased: the version is set but not yet committed as a release). Follow the rules at the top of `BUILD_PLAN.md` (read `AGENTS.md` and the CLI guide first, grading lives twice, page changes rebuild the examples, UI rules the tests enforce, all localStorage through `store()`, strike items through in `docs/PLANNED.md`, never publish).

## Why

Each built page is an independent snapshot. Its runtime is frozen at build time, so fixes never reach older quizzes. Nothing records which quizzes exist, `results.json` files land wherever the browser saves them, and resume lives in one browser's localStorage. `quiz stats` and spaced repetition (in `docs/PLANNED.md`) both need a place where history is kept.

The library is that place, and it **owns** the quizzes. You (or an agent) write a quiz anywhere, including a scratchpad, and register it. The library keeps the source, its assets and its brief, builds the page on the spot whenever you take or share it, and files every result next to the version it was made with. The folder is plain text plus your images, on a drive you choose, under git.

## Workflow (decided)

1. An agent writes the brief; you fill in the human-only values (`quiz brief DIR --web`).
2. The agent writes `quiz.md` anywhere (a scratchpad is fine), runs `quiz check`, optionally `quiz review`.
3. The agent runs `quiz library register quiz.md --json` as the last step and gives you the `quiz library take NAME` line.
4. You take it. The result lands in the library, and the library commits it to git.
5. To change a quiz later: `quiz library share NAME --source -o DIR`, edit, then `quiz library register DIR/NAME/quiz.md --update NAME`.

## Releases

- **0.8.1**: autosave in core `serve` (task 1). It joins the work already in the 0.8.1 working tree.
- **0.9.0**: config and the library v1 (tasks 2 to 7).

## Layers (decided)

```text
quiz check | build | serve | grade | stats ...     core: files in, files out (unchanged)
quiz library init | status | register | list | take | share | path    library: owns one folder, calls core
```

- `quizmd.library` is a subpackage of quizmd, not a separate app or plugin. It must always match the runtime it builds with.
- **Imports go one way.** `library/` imports core modules; no core module imports `library/`. `cli.py` is the composition point and may import `library` lazily inside its handler. A test enforces this (task 5).
- The library calls core functions (`parse`, `build_html`, `SubmitServer`), never the CLI through a subprocess. Git is the one subprocess (see "Git").
- What the library needs from `serve` lands in core as a general `serve` feature (task 1), so plain `quiz serve` gains it too.
- Core works with no library and no config. Nothing is created until `quiz library init`.

## v1 and later

v1 has seven commands: `init`, `status`, `register` (with `--update`), `list`, `take`, `share` (with `--source`), `path`.

Deferred, each to be added only when the need shows up:

- `sync`: with library-owned sources it rarely fires; `register --update` covers it.
- `grade` and `stats`: core `quiz grade` and `quiz stats` already work on the files in the folder that `path` prints. Add wrappers once picking the matching snapshot by hand gets tedious.
- `rename` and `rm`: housekeeping.
- `quiz library --web`: a local page to see `list` and `status`, change quizzes and start a `take`. Parked in `docs/PLANNED.md` ("Library").
- Spaced repetition, tags or collections, several users, several libraries per machine, and importing old `results.json` files.

## File formats

- **TOML** for the files people may read or edit: the config, `library.toml` and the asset maps. Reading uses the stdlib `tomllib`; writing adds **`tomli-w`** (small, pure Python, maintained, the usual companion of `tomllib`). JSON would bring no real speed or stability gain at this scale.
- **JSON** stays for results and progress. These are machine data with JSON Schemas (`src/quizmd/schemas/`), and the page produces them.
- Write every file atomically (temp file in the same folder + `os.replace`).

## Config

One machine-wide file. It records which library this machine uses.

| OS | Location |
|---|---|
| Windows | `%APPDATA%\quizmd\config.toml` (the platform convention, for example `%APPDATA%\quizmd\config.toml`) |
| Linux | `$XDG_CONFIG_HOME/quizmd/config.toml`, otherwise `~/.config/quizmd/config.toml` |
| macOS | `~/Library/Application Support/quizmd/config.toml` |

- `QUIZMD_CONFIG` overrides the location (used by the tests). On Windows, an `XDG_CONFIG_HOME` set by the user is honoured too.
- No `platformdirs` dependency: the table above is a few lines in `library/config.py`.

```toml
[library]
path = "D:/quizzes"
```

- `QUIZMD_LIBRARY` overrides `library.path` for one shell or one test. Precedence: environment, then config.
- No library configured: `register` exits 3 (see "Agent contract"); `list`, `take`, `share` and `path` exit 2 with "No library on this machine; run `quiz library init [PATH]`."
- Unknown keys are kept on rewrite and ignored, so later settings can be added without breaking older files.

## Library folder

```text
<library>/
  .git/                            # made by init (see "Git")
  .gitignore                       # progress.json, *.tmp
  library.toml                     # the registry
  assets/<sha256>.<ext>            # every image or audio file, stored once, shared by versions and quizzes
  quizzes/<id>/
    versions/<hash>.md             # source snapshot of every version (read-only)
    versions/<hash>.assets.toml    # that version's assets: path as written in the .md -> sha256
    versions/<hash>.brief.yaml     # the brief, when one sat next to the source
    results/<YYYYMMDD-HHMMSS>.json # one file per finished attempt
    progress.json                  # in-progress attempt (autosave); deleted on submit; not in git
```

`library.toml`:

```toml
format = "quizmd-library"
version = 1
created = 2026-10-22T14:03:00

[[quiz]]
id = "k7f3q2"
name = "signals-week3"
title = "Signals, week 3"
source = "/tmp/scratch/quiz.md"  # where it was last registered from; informational
current = "a1b2c3d4e5f60718"
registered = 2026-10-22T14:03:00

[[quiz.versions]]
hash = "a1b2c3d4e5f60718"
file = "quiz.md"            # original file name, needed by the build (quiz id, source_file)
added = 2026-10-22T14:03:00
```

- **The library owns the source.** `source` only records where the file came from. A deleted source is normal (scratchpads) and is shown as information, never as a problem.
- **No HTML is stored.** A built page is 150 to 840 KB (KaTeX and images embedded), while its source is about 4 KB. A build takes well under a second, so `take` and `share` build the page in memory from the snapshot and its assets. Every page is built with the installed quizmd, so pages are never stale.
- **Snapshots are read-only.** Version files are written once and marked read-only on disk. Old attempts are graded against them, so a hand edit would silently change those grades. `status` re-hashes every snapshot and every asset and reports a mismatch as an error. Recovery is a human step (`git restore`).
- **The brief is kept.** If `brief.yaml` sits next to the source, it is stored with the version (a few hundred bytes), so a later edit or regrade knows what the quiz was for. `content/` (the study material) is not copied.
- Results and progress files are the source of truth for history; `library.toml` holds no scores. `list` reads them on demand, which takes milliseconds at personal scale. No SQLite.

## Git

The tool writes commits; only the user reads them. Versions come from the snapshots and hashes, never from git history; deleting `.git` changes nothing about how the library works.

| The tool does | Only the user does |
|---|---|
| `git init` in `quiz library init` (default; `--no-git` skips it) | restore, revert, check out an old state |
| write `.gitignore` (`progress.json`, `*.tmp`) | add a remote, push |
| after each command that writes (`init`, `register`, a result saved by `take`): `git add -A` and `git commit -m "<command>: <name> (<status>, <short hash>)"` | anything that reads history |
| `status`: repo or not, uncommitted changes, remote or none | |

- **A commit never fails a command.** If git is missing, the repo is mid-rebase, or the index is locked, the command still succeeds and prints one warning.
- **Adopting** an existing library leaves its git state alone. A library folder inside another repository gets no nested repo; `init` says so.
- **Never push.** A local repo protects against mistakes (a hand-edited snapshot, a broken file), not against losing the drive. `status` warns "no remote: this is not an off-machine backup" until the user adds one or keeps the folder in OneDrive.
- Commits use the user's git identity. If none is configured, skip the commit with a warning that names `git config user.name`.

## Identity

- **id**: 6 random lowercase base32 characters, fixed for the life of the quiz. Needed because the quiz's own `id` is often the file stem (`quiz`) and collides across folders.
- **name**: unique slug that you type. `-n` sets it; the default is the slugged front-matter `title`.
- **hash**: the existing `quiz.source_hash` (SHA-256 of the source, 16 hex chars), which results already record as `quiz.hash`. It identifies a **version**, not the quiz.
- **Assets**: at register, every file the source references is copied into `assets/` under its SHA-256, and the version's `.assets.toml` maps each reference to it. The same Markdown with a changed image counts as a change: the version hash stays the source hash, and the asset map is replaced (grading does not depend on assets). The build resolves assets by **staging** (decided in task 3): the snapshot is written under its original file name in a temp folder, each asset is copied to the path the Markdown uses, `brief.yaml` too, and the normal `load_quiz` and `build_html` run there. Core is unchanged. Therefore `register` requires **portable references**: relative, inside the quiz folder, no drive letter, no leading slash, no `..` above the folder (a library rule; `quiz check` still allows them).
- **Lookup** for every `NAME` argument: exact name, then exact id, then a unique id prefix of at least 3 characters. When the match is ambiguous, list the candidates and exit 2.

## Commands

```text
quiz library init [PATH] [--force] [--no-git] [--json]
quiz library status [--json] [--plain]
quiz library register FILE.md [-n NAME | --update NAME] [--strict] [--review REVIEW] [--json]
quiz library list [--json] [--plain]
quiz library take NAME [--no-open] [--timeout SECONDS] [--port N] [--json]
quiz library share NAME [-o DIR] [--version HASH] [--source]
quiz library path [NAME]
```

- **init**: make `PATH` the library (default: the current folder) and write `library.path` to the config.
  - **New folder** (missing, which is created, or empty): create `library.toml`, `assets/`, `quizzes/`, `.gitignore`, run `git init` and commit.
  - **A folder with other files** (not empty and not a library) is refused: exit 2, nothing written (not even the config), the message names the folder, suggests `<path>/quizmd-library` and lists up to 10 of the entries; `--json` gives `status: "refused"` and a `reason`. There is no override: `--force` is only for switching libraries.
  - **Existing library** (it already has a `library.toml`, for example a synced folder on a second machine): adopt it and only write the config.
  - **The machine already has a library** (the config points to an existing library elsewhere): warn, naming both paths, and exit 2 without changing anything. `--force` switches the config to the new path. The old library is left as it is.
  - Running init again on the configured path changes nothing and says so (exit 0).
- **status**: raw diagnostics, one line each, and also with no library configured. Exit 0 when healthy, 1 on problems, 2 when there is no library.
  - the quizmd version;
  - the config path, whether it exists, where `library.path` comes from (config or `QUIZMD_LIBRARY`);
  - the library path, whether it exists and is writable, `library.toml` format and version;
  - git: repo or not (with no repo and git available, the warning says how to add history: `git -C "<path>" init`; the next `register` or `take` then commits, and the tool never runs `git init` itself after `--no-git`), uncommitted changes, remote or none (the no-remote warning);
  - counts: quizzes, versions, attempts, in-progress attempts (`progress.json`);
  - problems: a snapshot or asset whose content does not match its hash, folders without an entry, entries without a folder, version files without a registry entry, missing files in `assets/`, unreadable result files.
- **register**: the last step of writing a quiz. It checks the file as `quiz check` does (refuses on errors; `--strict` refuses on warnings too; `--review REVIEW` applies the review check). It snapshots the source, its assets and its brief, and builds the page once in memory as a test (nothing from that build is stored). Which quiz the file belongs to is always explicit:
  - **No `--update`:** a new quiz. A name clash exits 1 and suggests a free name or `--update`. If the file's path was registered before, it also exits 1 and names that quiz: pass `--update NAME` to add a version, or `-n NEW` for a separate quiz. Scratchpad paths get reused, so a path alone never decides.
  - **`--update NAME`:** a new version of that quiz:
    - same hash and assets: `unchanged`, exit 0;
    - the current version has no attempts: replace it (`replaced`), so fixing a quiz before anyone took it does not pile up versions;
    - the current version has attempts: add a version (`new-version`);
    - same hash but a changed asset or brief, with attempts: rewrite that version's asset map and brief in place (`updated-assets`).
- **list**: one row per quiz with name, id, title, versions, attempts, last taken, last score (percent, or "survey"). An info column says **source changed** when the recorded source still exists and differs from `current`. With no library configured, it says so and points to `init` (exit 2).
- **take**: resolve, build the current version in memory and serve it. If the recorded source still exists and has changed, warn ("calc: the source changed since it was registered; taking the registered version. Run `quiz library register <source> --update calc` to update it.") and take the registered version. It serves through core `serve` with `--once`, `--out results/<stamp>.json` and `--autosave progress.json`, and opens the browser unless `--no-open`. The default timeout is 0 (none), because a person is taking it. On submit it prints the path and the score line, then commits. Results are validated as in `serve`.
- **share**: build the clean page (current version, or any `--version`) and write it to `DIR/<name>.html` (default: the current folder), never overwriting (`unique_path`). With `quiz build`, this is the only way to get a standalone HTML file; `take` and `serve` only serve a page.
  - `--source` writes `DIR/<name>/<original file name>` (not always `quiz.md`), its `assets/` (restored to the paths the Markdown uses) and `brief.yaml`, ready to edit and register with `--update`. Never overwrites: an existing `DIR/<name>/` gets a `-2` suffix.
- **path**: print the library root, or that quiz's folder. Results, snapshots and everything else are plain files there; no export command is needed for them.

## Terminal output

`status` and `list` print colored Rich tables when stdout is a terminal. They print plain text otherwise (pipes, agents, tests), and always with `--json`, `--plain` or a non-empty `NO_COLOR`. Rich is imported only on the colored path (`library/pretty.py`). Color is never the only signal: every state also carries a symbol or a word (`✓ ⚠ ✗ ℹ`, `83%`). Design in `LIBRARY_PRETTY_PLAN.md`.

## Agent contract

An agent writes a quiz and registers it as the last step, so the user can take it with one command. Per `Setups/common/claude/tooling-principles.md`:

- **The agent's loop is `check` → (`review`) → `register --json`.** No `build` is needed for the user's own quizzes; `build` stays for a file to hand to someone. The `.md` can live in the agent's scratchpad.
- **The library location is human-only.** `register` with no library configured exits **3** with `{"status": "needs_input", "missing": "library", "fix": "quiz library init PATH"}`. The agent asks the user where the library goes and never runs `init` itself. `init` without PATH would make the agent's current folder (often the project) the library.
- **The name has a safe default** (the slugged title), so it is not human-only. The JSON output says it was defaulted. On a clash `register` exits 1 and suggests a free name; the agent may pass `-n` with it and reports the name it chose.
- **Updating is explicit.** To change an existing quiz, the agent exports it with `share --source`, edits, and registers with `--update NAME`. It never guesses which quiz a file belongs to.
- **`register --json`** prints `{"status": "registered"|"replaced"|"new-version"|"unchanged", "id", "name", "name_defaulted", "hash", "version_count", "committed", "take": "quiz library take <name>"}`. The agent's final message gives the user that `take` line.
- **Safe to repeat.** Registering the same file again with `--update` is `unchanged`; registering after each fix during a review loop only replaces the untaken version.
- `init --force` is passed only after the user said yes to switching libraries. The agent never touches git beyond what the tool does.

## Core change: autosave in `serve` (0.8.1)

Resume today relies on localStorage, which is per origin. `serve` picks a free port each run, so every session is a new origin and in-progress answers are lost. Fix it server-side. A fixed port is then unnecessary; `--port` already exists for anyone who wants one.

```text
quiz serve FILE [--autosave PROGRESS.json] ...
```

- The server accepts `POST /progress` with the same origin and token checks as `/submit`, and with `MAX_BODY`. The body is `{"hash": ..., "saved": <ms>, "state": {...}}`, where `state` is the object `quiz.js` already keeps in localStorage under `quizmd:<hash>`. The server writes it atomically.
- On `GET /`, if the progress file exists and its `hash` matches the served quiz, the snippet carries it: `window.QUIZMD_SUBMIT = {url, token, progress}`. A file for another hash is ignored and left alone.
- In `quiz.js`, `save()` also posts the state, debounced like the localStorage write. On `pagehide`, use `fetch(..., {keepalive: true})`, not `sendBeacon`, which cannot send the token header. `loadSaved()` prefers `QUIZMD_SUBMIT.progress` when it is newer than the localStorage copy. The existing **Resume** prompt is reused.
- An accepted submit deletes the progress file. Restart from the page (which already clears `SKEY`) also posts an empty state, and the server deletes the file.
- A page from disk, or `serve` without `--autosave`, behaves exactly as today.

## Tasks

1. ~~**Autosave in core `serve` (0.8.1).** Commit or set aside the uncommitted 0.8.1 work in `quiz.js` first, so this task is its own commit. Files: `serve.py` (`/progress`, progress in the snippet, delete on submit), `cli.py` (`--autosave`), `quiz.js` (`save()`, `loadSaved()`, restart).~~ Done in 0.8.1.
   - Unit tests with `urllib`:
     - progress is written and replaced;
     - wrong token or origin gives 403;
     - a body over `MAX_BODY` is refused;
     - a progress file with another hash is not injected;
     - submit deletes the progress file;
     - without `--autosave`, `/progress` gives 404.
   - e2e: answer two questions, stop the server, start it again on another port, and the Resume prompt restores both answers. A page from disk is unchanged.
   - Rebuild the examples. Docs: the `serve` row in `README.md`, `guide.md` and `docs/GUIDE.md`, and `agents.md` (then sync).
2. ~~**Config, init, git and status.** Add `tomli-w` to the dependencies. `library/config.py` (location per OS, `QUIZMD_CONFIG`, `QUIZMD_LIBRARY`, read and atomic write keeping unknown keys), `library/store.py` (library root, `library.toml` read and write), `library/git.py` (init, commit, status; every failure becomes a warning), and `init` and `status` in `cli.py` under `quiz library`.~~ Done (commit B of `LIBRARY_INIT_PLAN.md`).
   - Tests with `QUIZMD_CONFIG` and `tmp_path`:
     - the config location for each OS (patch `sys.platform` and the environment);
     - init with no argument uses the current folder;
     - init in a folder with other files is refused (exit 2) and writes nothing, not even the config;
     - init on an existing library adopts it and leaves its git state alone;
     - a second init elsewhere exits 2 and leaves the config alone; with `--force` it switches;
     - init again on the same path is a no-op;
     - init makes a repo with one commit; `--no-git` makes none; inside another repo, no nested repo;
     - with git missing from `PATH`, init still succeeds and warns;
     - `status` with no config, with a config pointing nowhere, with a healthy library, with a folder without an entry, and with no remote (the warning);
     - unknown config keys survive a rewrite.
3. ~~**register and list.**~~ Done, `LIBRARY_REGISTER_PLAN.md`.
   (original notes:) Ids, slugs, lookup, source, asset and brief snapshots, read-only version files, the asset store, building a version in memory from the store, and a commit after each register. First decide how the build finds assets (a temp staging folder, or a resolver argument to `build_html`); keep the core change small and general.
   - Tests:
     - register writes the snapshot, the asset map, the assets, the brief and the entry, no HTML, and one commit;
     - version files are read-only;
     - an image used by two quizzes is stored once;
     - a new file registers; the same path again without `--update` exits 1 and names the quiz;
     - `--update` unchanged is `unchanged`; changed with no attempts is `replaced`; changed after an attempt is `new-version`;
     - a changed image with the same Markdown is detected;
     - no library configured exits 3 with the `needs_input` JSON (the same shape as `quiz brief --json`);
     - `--strict` and `--review` behave as in `quiz check`;
     - a name clash exits 1 and suggests a free name;
     - lookup by name, id and prefix; an ambiguous prefix exits 2;
     - a source with errors is refused;
     - `list --json` shows "source changed" only when the source exists and differs; a deleted source is not a problem;
     - `status` reports an edited snapshot (made writable first) and an edited asset as hash mismatches.
4. ~~**take, share, path.**~~ Done (`LIBRARY_TAKE_PLAN.md`). `share --source` keeps the original file name (for example `calculus-1.md`), not `quiz.md`, because the quiz id can come from the file name. `assets` and `unused_assets` are in `status`'s `counts`; there is no top-level `assets` object.
   - Tests:
     - after deleting the source folder, `take` and `share` still build, with images;
     - `share` writes a page with no server snippet and the normal CSP, equal to `quiz build` of the same source apart from the build time, and never overwrites;
     - `share --version` of an old version works;
     - `share --source` writes `quiz.md`, assets at their original paths and `brief.yaml`; registering that folder with `--update` gives `unchanged`;
     - `take` with a changed source warns and serves the registered version;
     - `path` prints the root and a quiz folder.
   - `take`: run it in a thread (as the `serve` tests do), post a valid result, and assert the file is in `results/`, `progress.json` is gone, a commit was made, and `list` shows one attempt with its score.
   - e2e: `take` the calculus example, Submit, and the result lands in the library.
5. ~~**Help grouping and layering test.**~~ Done in 0.9.0 (`LIBRARY_RELEASE_PLAN.md`, commit A).
   - `quiz --help` lists the file commands and the `library` group separately; `quiz library --help` lists its subcommands in the order above.
   - Parse every module under `src/quizmd/` except `library/` and `cli.py` with `ast`, and fail on any import of `quizmd.library`. Check that `cli.py` imports it only inside the library handler.
6. ~~**Docs and release.**~~ Done in 0.9.0 (`LIBRARY_RELEASE_PLAN.md`, commits B and C). The original list:
   - `guide.md` and `docs/GUIDE.md` (a short "Keep a library" section: init, register, take, share, editing with `share --source` and `--update`, and the backup note: a local repo is not an off-machine backup);
   - `agents.md` (then sync): the agent contract above;
   - `skill/SKILL.md` (same, one paragraph; `tests/test_skill.py` must pass);
   - a `tldr` page for `quiz library` in your private tldr pages (tooling principle 4);
   - `README.md`: the "Two layers" section and the "Library commands (planned, 0.9.0)" table already exist; drop "planned", match the table to what was built, and change "will do" to "does";
   - `docs/SPEC.md` (a library section: config, folder layout, `library.toml` format, git rules);
   - `docs/PLANNED.md` (add the library and strike it; list the deferred commands; note that spaced repetition now has a place for history);
   - `README.md` "Install": after pulling a version that adds a dependency (0.9.0 adds `tomli-w` and `rich`; mention Rich next to `tomli-w`, with the same reinstall note), run `uv tool install --editable <path to this repo> --reinstall`, or the installed `quiz` fails with `ModuleNotFoundError` (seen on 2026-10-22);
   - version 0.9.0.
7. **Verify:**
   - full `uv run pytest -q` passes;
   - ruff is clean;
   - ty adds no new diagnostics over its current baseline;
   - manual run with `QUIZMD_CONFIG` pointing to a scratch file, in a scratch folder:
     - `quiz library status` with no library, then `quiz library init`, then `status` again (repo, no-remote warning);
     - `quiz library init` a second time in another folder warns and exits 2;
     - copy the calculus example to a temp folder, `quiz library register <temp>/calculus-1.md -n calc`, then delete the temp folder;
     - `quiz library take calc`: answer, close the tab, `take` again, and it resumes; Submit;
     - `quiz library list` shows the attempt, and `git log` in the library shows the commits;
     - `quiz library share calc -o .` opens from disk with images;
     - `quiz library share calc --source -o .`, edit, `register --update calc`: `new-version`.

## Ask the user instead of guessing

- If autosave needs anything in the CSP beyond `connect-src 'self'`.
- Before adding any dependency other than `tomli-w` and `rich`.
- If marking snapshots read-only gets in the way of git or of syncing on Windows.
