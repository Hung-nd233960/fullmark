# Plan: `quiz library register` and `list` (task 3 of `LIBRARY_PLAN.md`)

A work order for an agent: **two commits**. Written on 2026-10-22 at commit `3cea819`, quizmd 0.8.1. Do not bump the version.

Before anything else, read:

- the shell notes in your own setup (shell quirks; interactive tools that must not be run);
- the rules at the top of `BUILD_PLAN.md`;
- `AGENTS.md` ("Job 3");
- `LIBRARY_PLAN.md` in full, especially "Library folder", "Identity", `register` and `list` under "Commands", and "Agent contract";
- the library code from task 2, `src/quizmd/library/` (all six files, about 560 lines), and `tests/test_library.py`. Reuse its helpers and its test fixture; do not duplicate them.

Never stage `FEEDBACK..md`. Never push. Python only through `uv run`; no new dependencies. Never touch the real config (`%APPDATA%\quizmd`) or the global git config: isolate with `QUIZMD_CONFIG`, `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_NOSYSTEM`, as `tests/test_library.py` already does.

## Facts about the code (verified)

- **Hash.** `parser.py:358`: `source_hash = sha256(text.encode("utf-8")).hexdigest()[:16]`, where `text` comes from `read_source()` (`parser.py:502`), which strips a BOM and turns CRLF into LF. Copying the source **bytes** therefore gives the same hash, and `status` recomputes it with `read_source` + the same formula. Put that formula in one helper; do not copy it inline.
- **Quiz id and file name.** `parser.py:353`: `quiz_id = meta.id or stem`, and `quiz.source_file` is the file name. Results record `quiz.id`, and `serve` rejects results whose id differs. A snapshot must therefore be **built under its original file name**, so the id and `source_file` match what the learner would get from the source. Store the original file name per version.
- **Assets.**
  - `render.py:79-98` (`Renderer._image`) reads every image and audio file as `base_dir / src`.
  - `validate.py:32` (`media_refs`) lists the references outside code.
  - `validate.py:415` (`_check_media`) errors on missing files, remote URLs and unsupported types. It **allows absolute Windows paths and `..`**.
- **Check.** `cli.py`'s `cmd_check` (about line 78) runs `load_quiz`, then `review_findings` when `--review` is given, then `brief_findings` from a `brief.yaml` beside the source, then applies `--strict`. `register` must behave identically.
- **needs-input convention.** `brief.py:273` (`needs_input`) and `EXIT_NEEDS_INPUT = 3`: the status is `"needs_input"`, with an underscore.

## Decisions for this task

1. **How a version is built: staging, no core change.** To build version H, make a `tempfile.TemporaryDirectory()`, write the snapshot bytes there under the version's original file name, copy each asset from the store to its reference path inside that folder, copy the brief as `brief.yaml` when there is one, then `load_quiz(staged)` and `build_html(quiz, staged.parent)`. `Renderer` and `validate` stay untouched.
2. **Therefore `register` requires portable references.** Every media reference must be a relative path that stays inside the source's folder: no drive letter, no leading `/` or `\`, and no `..` segment after normalising. Otherwise exit 1 with `file:line: error: <ref> is outside the quiz folder; move it under the quiz folder (for example assets/) to register this quiz`. This is a library rule, not a change to `quiz check`. Templates and agent-written quizzes already use `assets/`.
3. **One shared check.** Move the body of `cmd_check` that produces findings into a core function, so `register` reuses it without importing `cli.py`. For example, `quizmd/checking.py` with `check_file(path, review_path=None) -> CheckResult` (quiz, findings, text, and an error string for usage problems). `cmd_check` becomes a thin printer around it, and its output must stay byte-for-byte the same (the existing tests prove it). `checking.py` is core, so it must not import `quizmd.library`.
4. **The test build happens before anything is written.** Stage the exact bytes that will be stored, build, and refuse on build errors. Only then write to the library. Nothing is half-written on failure.
5. **Attempts per version** are results files in `quizzes/<id>/results/*.json` whose `quiz.hash` equals that version's hash. Unreadable files count as no attempt and are reported by `status`.

## Commit A: the shared check (refactor only)

- Add `src/quizmd/checking.py` (decision 3) and make `cmd_check` use it. No behaviour change: `uv run pytest -q tests/test_validate.py tests/test_review.py tests/test_brief.py tests/test_docs.py` and the full suite pass unchanged.
- Commit message:

  ```text
  Refactor: quiz check's findings come from checking.check_file, so the library can reuse them
  ```

## Commit B: `register`, `list`, and the `status` checks

### New module: `src/quizmd/library/quizzes.py`

Registry model and operations. Keep `store.py` for the folder and `library.toml` I/O; add `save(path, data)` to `store.py` (atomic, `tomli_w`) if it is not there.

- **`library.toml` entries.** Following `LIBRARY_PLAN.md`, plus `file` per version:

  ```toml
  [[quiz]]
  id = "k7f3q2"
  name = "signals-week3"
  title = "Signals, week 3"
  source = "~/signals/quiz.md"   # absolute POSIX path; informational
  current = "a1b2c3d4e5f60718"
  registered = 2026-10-22T14:03:00

  [[quiz.versions]]
  hash = "a1b2c3d4e5f60718"
  file = "quiz.md"            # original file name: the build needs it (quiz id, source_file)
  added = 2026-10-22T14:03:00
  ```

- **ids:** `new_id(existing)`: 6 characters from `abcdefghijklmnopqrstuvwxyz234567` via `secrets`, retried until unique.
- **names:**
  - `slugify(title)`: NFKD normalise and drop combining marks (Vietnamese titles become ASCII). Map `đ`/`Đ` to `d` first, because NFKD does not decompose them. Lowercase, runs of non-`[a-z0-9]` become `-`, trim `-`, cut to 40 characters on a `-` boundary when possible, and fall back to `quiz` when empty.
  - Valid names match `^[a-z0-9][a-z0-9-]{0,39}$`. `-n` is validated against it (exit 2 with the rule on failure).
  - `free_name(base, taken)`: `base`, `base-2`, `base-3`, ….
- **`lookup(data, text) -> entry`**:
  1. exact name;
  2. exact id;
  3. a unique id prefix of at least 3 characters.

  It raises `NotFound` (exit 2, "no quiz named …; see quiz library list") or `Ambiguous` (exit 2, listing the candidates as `name (id)`).
- **Snapshot layout** (from `LIBRARY_PLAN.md`):
  - `quizzes/<id>/versions/<hash>.md`: the source bytes;
  - `quizzes/<id>/versions/<hash>.assets.toml`: `[assets]`, mapping each reference (as written in the Markdown, `/`-normalised) to its sha256 hex;
  - `quizzes/<id>/versions/<hash>.brief.yaml`: when a `brief.yaml` sat beside the source;
  - `assets/<sha256><ext>`: the extension lowercased, from the reference. One file per content, shared by every version and quiz.
- **Read-only.**
  - After writing any version file or store asset, call `os.chmod(path, stat.S_IREAD)`, which sets the read-only attribute on Windows.
  - To replace or delete one (the `replaced` case below), first `os.chmod(path, stat.S_IREAD | stat.S_IWRITE)`. Put both in `fsutil.py` (`make_read_only`, `make_writable`).
  - Store assets are never deleted in v1. `status` reports unused ones as information.
- **`stage(library, entry, hash) -> ContextManager[Path]`**: yields the staged `.md` path (decision 1). It is used by the test build now, and by `take` and `share` in task 4.

### `register`

```text
quiz library register FILE.md [-n NAME | --update NAME] [--strict] [--review REVIEW] [--json]
```

`-n` and `--update` are mutually exclusive (argparse group).

1. **Library.** Use `config.library_location()`.
   - None: exit **3**. With `--json`, print `{"status": "needs_input", "written": false, "message": "no library on this machine; ask the user where it should go, then run quiz library init PATH", "missing": [{"id": "library", "flag": null, "label": "Library folder", "help": "Where quizmd keeps your quizzes and results (for example D:/quizzes). Created by quiz library init PATH.", "choices": null}], "fix": "quiz library init PATH"}`. Without `--json`, print the message to stderr.
   - If the path is configured but `store.load` fails: exit 2 with the error.
2. **Check** with `checking.check_file` (with `--review`), then apply `--strict`. Print findings as `quiz check` does: to stderr with `--json`, otherwise to stdout. Errors: exit 1.
3. **Portable references** (decision 2). The refs come from `media_refs` over the source text: one pass over the whole text is enough, because `media_refs` already skips code.
4. **Which quiz:**
   - **`--update NAME`:** `lookup` (exit 2 on failure).
   - **Otherwise a new quiz:**
     - If any entry's `source` resolves to the same file: exit 1, `"<file> is registered as <name> (<id>); pass --update <name> to add a version, or -n NEW for a separate quiz"`.
     - Name: `-n` or `slugify(quiz.title)`. If taken: exit 1, `"the name <name> is taken by <title>; pass -n <free_name(...)> or --update <name>"`. With `--json`, include `"suggested_name"`.
5. **Compute:**
   - `hash = quiz.source_hash`;
   - the asset map (reference → sha256 of the referenced file);
   - the brief bytes, if any.
6. **Test build** (decision 4): stage the bytes, assets and brief in a temp folder, `load_quiz` and `build_html`. Errors: exit 1, nothing written.
7. **Decide** (`--update` only; a new quiz is always `registered`):

   | Situation | Result |
   |---|---|
   | `hash == current`, and the asset map and brief are equal | `unchanged`. Write nothing, no commit, exit 0 |
   | Current version has **no attempts** (decision 5) | `replaced`: delete the current version's files (make them writable first), write the new ones, and replace the version in `versions` (same position, new hash, file and `added`) |
   | Current version has attempts | `new-version`: write the new files, append to `versions` |
   | `hash == current` but the assets or brief changed, with attempts | Rewrite that version's `.assets.toml` and `.brief.yaml` in place (writable, write, read-only again). Result `new-version` is wrong here; use `updated-assets` |

   Set `current = hash`. Update `title` from the new source and `source` to the new path.
8. **Write:**
   - store assets first; skip a sha256 that is already present;
   - then the version files, all read-only;
   - then `library.toml` (atomic), with `registered` set for a new quiz.
9. **Commit:** `git.commit(library, f"register: {name} ({status}, {hash[:7]})")`. Pass its warnings through.
10. **Output.** Text: one line, `registered signals-week3 (k7f3q2), version a1b2c3d; take it with: quiz library take signals-week3`, then `warning:` lines. `--json`: `{"status": "registered" | "replaced" | "new-version" | "updated-assets" | "unchanged", "id", "name", "name_defaulted", "hash", "version_count", "committed", "warnings", "take": "quiz library take <name>"}`. Exit 0.

### `list`

```text
quiz library list [--json]
```

- No library configured: exit 2 with the same "No library on this machine; run `quiz library init [PATH]`" message `status` uses. Share the text through one constant.
- One row per quiz, sorted by last taken (newest first; never-taken last, by name):
  - `name`, `id`, `title`, `versions` (count);
  - `attempts` (all results files of the quiz);
  - `last taken` (the newest `attempt.submitted_at`, falling back to `attempt.started_at` and then the file's mtime);
  - `last score` (`score.percent_auto` rounded, as `83%`; `survey` when `attempt.mode == "survey"`; `–` when null or no attempts);
  - `note`: `source changed` when the recorded `source` exists and its hash, asset map or brief differs from `current`. A missing source shows nothing. Computing the asset map needs the refs: parse leniently, and if the source no longer parses, show `source changed (has errors)`.
- Text: an aligned table, or `No quizzes yet. Register one with: quiz library register FILE.md` when empty. `--json`: a list of objects with those keys (`last_taken` as an ISO string or null, `last_score` as a number or null, `mode`, `note` as a string or null).

### `status` additions

At the comment task 2 left:

- **Problems:**
  - a `versions/<hash>.md` whose recomputed hash (`read_source` + the shared helper) differs from `<hash>`;
  - a store asset whose sha256 differs from its file name;
  - an asset referenced by a version's `.assets.toml` that is missing from the store;
  - a version listed in `library.toml` whose `.md` or `.assets.toml` is missing;
  - a version file with no entry in `library.toml`.
- **Information (not a problem):** `N unused assets` in the store.
- **Counts:** add `assets`.

### `cli.py`

Add the `register` and `list` subparsers under `library`, dispatched lazily like `init` and `status`.

### Tests: extend `tests/test_library.py`

Use the existing fixture.

**Fixture quizzes:** copy `src/quizmd/examples/<calculus>/` (it has `assets/` images) to `tmp_path`. Also write a tiny quiz with no media inline in the test. Check the folder names under `src/quizmd/examples/` first.

1. **Register** a quiz with an image:
   - exit 0, `registered`;
   - `library.toml` has the entry with all fields;
   - `versions/<hash>.md` holds the same bytes as the source, plus the `.assets.toml` and the store asset;
   - **no HTML anywhere** in the library (`rglob("*.html")` is empty);
   - all version files and assets are read-only (`not os.access(p, os.W_OK)`);
   - exactly one new commit.
2. The brief is stored when `brief.yaml` sits beside the source, and not otherwise.
3. **Deleting the source folder** afterwards: `stage()` still builds with images (a `data:image` URI in the HTML), and the quiz id equals the one from the source.
4. Two quizzes using the same image store it once.
5. **The same path again** without `--update` exits 1 and names the quiz. A name clash exits 1 with the suggested name in the JSON.
6. **`--update`:**
   - unchanged gives `unchanged` with no commit and no file changes;
   - an edit with no attempts gives `replaced` (one version, the old files gone);
   - after writing a results file with the current hash into `results/`, an edit gives `new-version` (two versions, both snapshots present);
   - a changed image with the same Markdown gives `replaced` (no attempts), or `updated-assets` (with attempts).
7. **Refusals:**
   - a source with errors exits 1, and the library is unchanged (compare a listing of files and `library.toml` before and after);
   - `--strict` with a warning exits 1;
   - `--review` with a flagged question exits 1 (reuse a helper from `tests/test_review.py` if there is one);
   - a media reference with `..` or a drive letter exits 1 with the "outside the quiz folder" message.
8. **No library:** exit 3, and the `--json` output has `status: needs_input` and `missing[0].id == "library"`.
9. `-n "Bad Name"` exits 2. `slugify("Tín hiệu và Hệ thống: Tuần 3")` gives `tin-hieu-va-he-thong-tuan-3`, and `đ` becomes `d`.
10. **Lookup:** name, id, a 3-character prefix; an ambiguous prefix exits 2 listing both (craft two ids with a common prefix by writing `library.toml` directly); too short or unknown exits 2.
11. **`list`:**
    - empty library;
    - two quizzes, one with a results file (score, mode `survey` on another);
    - `source changed` after editing the source;
    - nothing shown after deleting it;
    - `--json` shape;
    - no library exits 2.
12. **`status`:**
    - an edited snapshot (make it writable, change a byte) is a hash-mismatch problem (exit 1);
    - an edited store asset likewise;
    - a deleted store asset is a missing-asset problem;
    - an extra unused asset is information only (exit 0).
13. **Import direction:** the subprocess test from task 2 still passes, and `quizmd.checking` does not import `quizmd.library`.

### Docs for this commit

- `docs/GUIDE.md`: extend the one `quiz library` row so `test_guide_documents_every_command` stays green. The full section is task 6.
- `LIBRARY_PLAN.md`:
  - strike task 3 through ("done, `LIBRARY_REGISTER_PLAN.md`");
  - in "Identity", note the staging decision and the portable-reference rule;
  - in the library folder layout, add `file` to `[[quiz.versions]]`;
  - in `register`, add the `updated-assets` status.
- `docs/PLANNED.md`, "Library": one struck line for register and list.
- Include this file in the commit.

### Verify, then commit

1. `uv run pytest -q`: all pass. The known flake rule applies: `tests/e2e/test_panel.py::test_narrow_screen_keeps_progress_and_pills_in_the_header`, rerun alone.
2. `uv run ruff check`, `uv run ruff format --check` (clean on the whole repository since `d78a74e`), `biome lint src/quizmd/static/quiz.js` (0 warnings).
3. **Manual check** with a scratch `QUIZMD_CONFIG` and git config:
   - `init` a scratch library;
   - copy the calculus example to a temp folder and `register` it;
   - delete the temp folder;
   - `list`;
   - `status` (exit 0, `assets` counted);
   - `git -C <lib> log --oneline` (two commits).

   Confirm that `%APPDATA%\quizmd` does not exist.
4. Commit:

   ```text
   quiz library register and list: snapshots with a shared asset store, versions by source hash, explicit --update
   ```

End every commit message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Stop and report instead of guessing

- If staging cannot reproduce the build exactly (a quiz id or a hash that differs between the source and the staged copy).
- If `cmd_check`'s output changes in any existing test after the refactor.
- If a decision above contradicts `LIBRARY_PLAN.md` in a way that matters.
- If any existing test has to change its expectations.

Report: both commit hashes, the files changed in each, the test counts before and after, the lint results, the manual check output, the deviations from this plan with reasons, and anything left open.
