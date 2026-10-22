# Plan: rename to Fullmark Alchemist (`fullmark`) and prepare the PyPI release

A work order for an agent: **three commits in this repo**. Written on 2026-10-22 at quizmd 0.9.1. User decisions on 2026-10-22: the project becomes **Fullmark Alchemist**, package `fullmark` (the PyPI name `quizmd` belongs to an unrelated terminal quiz tool); license **MIT**; the README says plainly that the project was vibe-coded.

Before anything else, read:

- the shell notes in your own setup;
- `AGENTS.md` (Job 3, "Working rules (every change)");
- `pyproject.toml`, `src/quizmd/__init__.py`, `src/quizmd/library/config.py`, `scripts/sync_examples.py`, `docs/build_docs.py`, `.github/workflows/ci.yml`;
- `README.md` in full.

Never push, never create or rename anything on GitHub or PyPI, never upload. Those steps are the user's. Python only through `uv run`; no new runtime dependencies. Never touch the user's real library or config except to read them. Do not rename the repository folder the repository folder; that happens after this plan.

## A clean rename, no compatibility

User decision (2026-10-22): nothing needs to read old data. The user will re-create the library from their Markdown sources. So rename **everything**, including the data identifiers: `"format": "fullmark"` in results, `fullmark-library` in `library.toml`, the grades and report format strings, the schema `$id` URLs (`https://fullmark.local/...`), localStorage keys and `window.FULLMARK_*` in the page. No fallbacks for the old config folder or the old environment variables. Format `version` numbers stay at 1. The golden grading cases and fixtures are regenerated or edited to match.

The **command stays `quiz`**; add `fullmark` as a second entry point to the same `main`, for systems where another package owns `quiz`.

## Commit A: rename the package

1. `git mv src/quizmd src/fullmark`; fix every import, `pyproject.toml` (`name = "fullmark"`, wheel `packages`, scripts `quiz` and `fullmark`), tests, scripts, docs, CI, `skill/SKILL.md`. `tests/test_layers.py` checks the package by name: update it.
2. Rename "quizmd" to "fullmark" everywhere: help text, messages, `--version` output (`fullmark 0.10.0`), docs, and the identifiers above. Rename `docs/quizmd-project.*` to `docs/fullmark-project.*` and fix the references. After the commit, `git grep -i quizmd` finds only the plans in `docs/plans/` (history) and the README sentence about the old name.
3. Config folder `%APPDATA%\fullmark\` (and the XDG and macOS equivalents); environment `FULLMARK_CONFIG` and `FULLMARK_LIBRARY`. The `lib` fixture sets the new names.
4. Version **0.10.0** (`pyproject.toml`, `__init__.py`, the SPEC example), `uv lock`.
5. Full suite, ruff, ty. Commit: `Rename to fullmark (Fullmark Alchemist), 0.10.0`.

## Commit B: ready to be public

1. **Personal paths out of tracked files.** No tracked file may contain the author's home or project or library paths on Windows (either slash style), the name of the private setup repo, or the name of the shell-notes file (`tests/test_public.py` holds the patterns). Replace them with neutral forms: `uv tool install --editable <path to this repo>`, `<your library>`, "the shell notes in your own setup". The machine-specific working rules in `agents.md` become general ("read the repo's AGENTS.md", "use a scratch config"). Plans in `docs/plans/` are history: replace the paths there too, but do not rewrite their content otherwise. Add `tests/test_public.py` that greps every `git ls-files` text file for those strings and fails with the list.
2. **LICENSE**: MIT, `Copyright (c) 2026 Hung-nd233960`. In `pyproject.toml`: `license = "MIT"`, `license-files = ["LICENSE"]`. Keep KaTeX's own license file in `vendor/katex/` and confirm it ends up in the wheel.
3. **README top**, in this order:
   - Title `# Fullmark Alchemist`, the line `fullmark: Markdown in, a self-grading offline quiz out.`, and the tagline in italics: *To obtain full marks, something of equal value must be studied. That is the law of Equivalent Exchange.*
   - A short **How this was made** section, verbatim:
     > Fullmark was vibe-coded: written almost entirely by AI coding agents (Claude) from my prompts, plans and reviews, with me steering and testing it on my own coursework. The test suite (about 700 tests, including real-browser and accessibility checks) is what keeps it honest. Read the code before trusting it with anything important.
   - Install: `uv tool install fullmark` (or `pipx install fullmark`), then `quiz --help`; from source: `uv tool install --editable .` in a clone. Say it was called quizmd before 0.10.0, and that 0.10.0 does not read quizmd results or libraries (rebuild from the Markdown).
   - The rest of the README stays, renamed.
4. `docs/PLANNED.md`: the struck "Publish to PyPI: dropped" item becomes open again, pointing at this plan.
5. **History check, report only:** scan `git log -p --all` for secret-looking strings (`api_key`, `token`, `secret`, `password`, `sk-`, `ghp_`, `BEGIN .* PRIVATE KEY`) and for the personal paths above. Do **not** rewrite history. List what you found (file, commit, kind) in your report; the user decides.
6. Full suite, ruff. Commit: `Ready to be public: MIT license, README, no personal paths`.

## Commit C: packaging and the publish workflow

1. `pyproject.toml` metadata: `description`, `authors = [{name = "Hung-nd233960"}]`, `keywords`, `classifiers` (Python 3.13, MIT, OS independent, Education, Console), `[project.urls]` Homepage/Repository/Issues at `https://github.com/Hung-nd233960/fullmark`.
2. **sdist contents**: include `src/`, `tests/`, `docs/` (without `docs/plans/`), `examples/`, `README.md`, `LICENSE`, `pyproject.toml`; exclude `.github/`, `docs/plans/`, `skill/`, `scripts/` unless a test needs them (check). The wheel needs `src/fullmark` with `static/`, `templates/`, `vendor/`, `schemas/`, `examples/`, `guide.md`, `agents.md`.
3. Build and verify:
   - `uv build`, then `uvx twine check dist/*`.
   - Install the wheel into a fresh temp venv (`uv venv` in a temp folder, `uv pip install dist/*.whl`) and run from there: `quiz --version`, `fullmark --version`, `quiz new calculus <tmp>/c`, `quiz check`, `quiz build`, `quiz agent-guide | head`. Confirm the built page has KaTeX and no network references (the existing tests cover it; this is a smoke check of the installed copy).
   - The existing `slow` wheel test: run it and fix it for the new name.
   - List the wheel's files (`unzip -l` or Python `zipfile`) and check nothing personal or stray (`.pyc`, `__pycache__`, `make_assets.py` if it holds paths) is inside.
4. `.github/workflows/publish.yml`: on a pushed tag `v*`, build with uv and publish with `pypa/gh-action-pypi-publish` using **trusted publishing** (`permissions: id-token: write`, environment `pypi`). No tokens or secrets in the repo. Pin action versions by tag.
5. `docs/RELEASING.md` (short): the user's one-time steps (rename the GitHub repo to `fullmark`, make it public, add a pending trusted publisher on PyPI for `fullmark` / workflow `publish.yml` / environment `pypi`), then each release: bump the version, commit, `git tag vX.Y.Z`, `git push --follow-tags`. Link it from `docs/plans/README.md` is not needed; link it from the README's development section.
6. `docs/plans/README.md`: add this plan's row.
7. Full suite, ruff. Commit: `Packaging: metadata, sdist, trusted-publishing workflow`.

## Not in this plan (done afterwards, outside this repo)

Renaming the folder to `fullmark`, reinstalling the tool, the skill symlink in `~/.claude/skills/quiz`, and the references in Setups, the private setup repo and the CLI guides.

## Done means

Three commits, not pushed. Full suite passes. The wheel installs in a clean venv and `quiz --version` prints `fullmark 0.10.0`. `uvx twine check` passes. Report: commit hashes, test totals, the wheel's file count and size, the history scan findings, and every decision the plan left to you.
