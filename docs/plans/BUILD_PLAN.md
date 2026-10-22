# Build plan

An ordered work list drawn from `docs/PLANNED.md`, written for an agent to carry out one task at a time. Each task lists the files to touch, what "done" means, and the tests to add. The code was checked on 2026-10-20 at commit `ec99476`, so the facts below are verified unless a task says otherwise.

## How to work through this plan

- Read `AGENTS.md` first, then the shell notes in the shell notes in your own setup.
- Do the tasks in order. Each task ends in one commit. Run `uv run pytest -q` before every commit; it must pass.
- Grading rules live twice: `src/quizmd/grading.py` (the authority) and `src/quizmd/static/quiz.js`. A task that changes grading changes both and adds golden cases (`uv run python tests/make_grading_cases.py`).
- A task that changes syntax updates `src/quizmd/guide.md` **and** `docs/GUIDE.md` (keep their tables in step), then runs `uv run python docs/build_docs.py`.
- A task that changes the page (CSS, JS, template) or a packaged example finishes by copying examples over (task 0.2 adds a script) and rebuilding `examples/*/quiz.html`.
- UI rules the tests enforce: no network requests, contrast limits in both themes, keyboard access, and never color alone for right or wrong.
- Put all localStorage access through the existing `store()` wrapper in `quiz.js` (about line 250). It already copes with blocked storage, and `test_works_with_storage_blocked` relies on that.
- When a task is done, strike it through in `docs/PLANNED.md` the way finished items already are (`~~item~~: done`).
- Stop and ask the user before anything that needs an account, a remote or a publish (GitHub). Never publish to PyPI or any package index.

## Evaluation of PLANNED.md

Checked against the code:

| Item | Finding | Decision |
|---|---|---|
| Fix 2, single source for examples | `examples/*/quiz.md` and the packaged templates are identical today, but nothing keeps them so. File names differ (`quiz.md` vs `calculus-1.md`) and `blank` has no top-level copy. | Task 0.2 |
| Fix 3, results schema | Results are `format: quizmd-results, version: 1` (built in `quiz.js` about line 1520). The report JSON is `format: quizmd-report, version: 1` (`report.py`, `make_report_json`). Neither has a schema file. `scoring: band` is confirmed: it is a field of `EssaySpec` in `models.py`, set in the essay's `answer` block. | Task 1.1. The "unverified" note can go. |
| Fix 4, readability | `.qm` container is `max-width: 72rem`; there is one breakpoint at 480px. Prose in cards has no line-length cap. | Task 2.4 |
| Fix 5, lock more themes | Only IELTS sets `theme: light`. Calculus and Rust are practice drills, where following the device is right. | No code change. Task 0.3 adds one line of guidance to the guide. |
| Fix 6, line endings | `.gitattributes` already says `* text=auto eol=lf` and the index is all LF. 29 files have CRLF in the **working tree** only, because Windows tools wrote them. The warning is cosmetic, but it recurs. | Task 0.1 |
| Enter triggers Check | Check exists only when `feedback: instant`, and only as a button (`quiz.js` about line 700). No key handler. | Task 2.1 |
| Font-size control | Not present. | Task 2.2 |
| "Answered N of M" on phones | `progressEl` sits in the sticky header row, so it should stay visible, but no test covers it at phone width. | Task 2.3: test first, fix only if it fails |
| Review wrong answers only | Not present. | Task 2.5 |
| Retry missed questions | Not present. It touches state, export and `quiz grade`. | Task 3.2 |
| Print with answer key | A print stylesheet exists but hides the header and has no key mode. | Task 3.1 |
| Spaced repetition | Needs history across attempts; localStorage is per browser and easy to lose. | Deferred |
| Watch auto-reload | The page CSP blocks network, so this needs a local server and a watch-only build. | Task 5.3 (optional) |
| Bank weighting, no-repeat draws | Small, but no user has asked for them yet. | Deferred |
| Matching and ordering | Real value for exam practice; both graders and golden cases. | Tasks 4.1, 4.2 |
| Hotspot on image | Needs a coordinate editor story for authors. | Deferred |
| Includes | Breaks the single `file:line` error format that agents parse. Needs a design first. | Deferred |
| `quiz check --strict` | Small and useful for CI. | Task 1.2 |
| Anki/CSV import, Moodle/QTI export | Large, separate formats. | Deferred |
| `quiz stats` | Moderate; useful once learners do several attempts. | Task 3.4 |
| `quiz agent-guide` | `AGENTS.md` is at the repo root and is not in the wheel. | Task 1.3 |
| Grading blocks to a machine-readable file | Today the agent's grades live only in the Markdown report, so the final score never includes them. | Task 3.3 |
| PyPI | The user does not want it. Install stays local (`uv tool install` from the repo or from a built wheel file). | Dropped. Task 5.1 keeps only a test that the wheel is complete |
| CI | No `.github/` and no remote. | Task 5.2 writes the workflow; it runs once the user pushes to GitHub |
| axe audit | Feasible offline if axe-core is vendored for tests only. | Task 5.4 |
| Visual snapshots | Pixel diffs drift with fonts and machines; Python Playwright has no built-in screenshot assertion. | Deferred |
| Rust rewrite | Agree with the recommendation in `docs/PLANNED.md`: no. | No action |

## Phase 0: housekeeping

### 0.1 Line endings

The goal is LF everywhere, so the CRLF warning stops coming back.

- Add `.editorconfig` at the root: `root = true`, `[*]` with `end_of_line = lf`, `insert_final_newline = true`, `charset = utf-8`.
- In `pyproject.toml` add `[tool.ruff.format]` with `line-ending = "lf"`. Ruff defaults to `auto`, which keeps a file's existing CRLF.
- `biome.json` already sets `"lineEnding": "lf"`; leave it.
- Rewrite the CRLF working-tree files from the index. The tree must be clean first (`git status`). Then delete only the files that `git ls-files --eol` reports as `w/crlf` and run `git checkout -- .` to restore them as LF. Do not use `git reset --hard`.
- Done when `git ls-files --eol | grep w/crlf` prints nothing. There is nothing to commit for the restored files, so the commit holds only the config changes.

### 0.2 One source for the examples

- Add `scripts/sync_examples.py`. It holds the mapping (`calculus` to `calculus-1.md` with `cubic.png`, `rust` to `rust-basics.md`, `ielts` to `ielts-writing.md` with `ielts-chart.png`; take it from `TEMPLATES` in `templates_cmd.py` and do not repeat it). It copies the packaged templates and assets to `examples/<name>/` and then rebuilds each `quiz.html` with `build_html`. The packaged files are the source; the copies follow.
- Add `test_top_level_examples_match_packaged` to `tests/test_examples.py`. It compares the `quiz.md` and asset bytes, and it checks that the `hash` embedded in each `examples/<name>/quiz.html` equals the hash of the current source. Find how `build.py` computes `DATA.hash` and reuse that function. On failure, the message says to run `uv run python scripts/sync_examples.py`.
- Update the "Top-level `examples/`" paragraph in `AGENTS.md` to name the script.

### 0.3 Theme guidance

- In `src/quizmd/guide.md` and `docs/GUIDE.md`, below the `theme` row, add: lock `theme: light` for exam simulations whose real paper is printed; leave `auto` for practice drills.

## Phase 1: agent-facing contracts

### 1.1 JSON Schemas for results and report

- Add `src/quizmd/schemas/results-v1.schema.json` and `src/quizmd/schemas/report-v1.schema.json` (JSON Schema draft 2020-12). Derive the fields from `quiz.js` `buildExport` (search for `format: "quizmd-results"`) and from `report.py` `make_report_json` and `_ai_block`. Mark the fields that are always present as required; `attempt.bank`, `correct` and `explanation` are optional or nullable. Keep `additionalProperties` open (`true`) at the top level, so later optional fields do not break version 1.
- Make sure the wheel ships them: the hatch target already includes all of `src/quizmd`, but check by building the wheel (`uv build`) and listing it.
- Add `jsonschema` to the dev group: `uv add --dev jsonschema`.
- Tests:
  - `tests/test_report.py`: validate `make_report_json` output for every results fixture the file already uses.
  - `tests/e2e/test_browser.py`: in the existing export tests (calculus, rust, bank), validate the downloaded results file against the results schema.
- Docs: add a "Results and report files" section to `docs/GUIDE.md` naming both files, the `format` and `version` fields, and the rule for compatibility: new optional fields keep the version, and removing or renaming a field bumps it. Link the schemas from `AGENTS.md` (Job 2) and drop "(unverified)" from fix 3 in `docs/PLANNED.md`.

### 1.2 `quiz check --strict`

- In `cli.py` `cmd_check`, add `--strict`: if there are no errors but there are warnings, exit 1. Text and `--json` output stay the same, except that JSON gains `"strict": true`.
- Add `--strict` to `quiz build` as well, so CI can build and gate in one step. It must not write the HTML when strict fails. *(Done. The `--json` output stays a plain list; the `"strict": true` field in the first draft was dropped so existing consumers keep working.)*
- Tests in `tests/test_validate.py` or `tests/test_build.py`: a quiz with only a missing explanation exits 0 without the flag and 1 with it, for both commands.
- Document in both guides and in the `AGENTS.md` exit-code line.

### 1.3 `quiz agent-guide`

- Package the agent instructions: move the text to `src/quizmd/agents.md` and make root `AGENTS.md` a byte-identical copy. Tools look for the root file, so it has to stay.
- `scripts/sync_examples.py` copies the packaged file to the root, and a test checks that the two files are identical. *(Done this way.)*
- Add the `agent-guide` subcommand in `cli.py`, next to `guide`. It prints the packaged file.
- Test: `main(["agent-guide"])` prints text that starts with `# AGENTS.md`.

## Phase 2: learner experience, small changes

Each of these is a JS/CSS change with a Playwright test in `tests/e2e/test_browser.py`.

### 2.1 Enter triggers Check

- In `quiz.js`, in the card builder where the Check button is made (about line 695), add a `keydown` listener on the card when `DATA.feedback === "instant"` and the type is auto-graded: on `Enter` without modifiers, and only if the target is an `input` (never a `textarea`, so essay, code and multi-line answers are untouched), call `preventDefault()` and `checkQuestion(q)`.
- In `feedback: end` mode, Enter does nothing new.
- Test, using `calculus_html` (instant): type a numeric answer, press Enter, and the feedback for that card appears. Also press Enter in a blanks input and check the whole question.

### 2.2 Font-size control

- Add `A−` and `A+` buttons beside the theme toggle (`themeBtn`, about line 437), each with an `aria-label` ("Smaller text", "Larger text"). The visible text is a symbol plus a letter, so it is never color-only.
- Scale with one CSS variable on `:root`, for example `--qm-scale`, used by the base font size in `quiz.css`. Use steps 0.875, 1, 1.125, 1.25, 1.5; disable the button at either end.
- Remember the step with `store("set", "quizmd:fontscale", ...)`. The key is global, not per quiz, because it is a device preference.
- Hide the buttons in print. Colors come only from `theme.py` variables.
- Test: click A+ twice, reload, and the computed font size of `body` is 1.25 times the original. With storage blocked the buttons still work for the session.

### 2.3 Progress visible on phones

- Add a test: at a 375×700 viewport, scroll to the last question, and `#progress` is visible inside the viewport and reads `Answered N/M`.
- If it fails, adjust the `@media (max-width: 480px)` rules so the header wraps the title onto its own row and keeps the progress and actions on the next row.

### 2.4 Readability at 72rem

- Cap prose line length inside cards at about 80 characters: `max-width: 80ch` on the prompt, explanation and hint text blocks only. Find their classes in `quiz.js`/`quiz.css`. Do not cap code blocks, tables, images or answer controls.
- Add a test at 375, 768 and 1920 px widths: no horizontal scroll (extend `test_phone_width_no_horizontal_scroll` to take a width parameter), and at 1920 px a prompt paragraph is no wider than 82ch, measured as its width divided by the width of a `0` in its font.
- Save screenshots of the calculus example at the three widths to the pytest `tmp_path` and look at them before committing; mention anything odd in the commit message.

### 2.5 "Needs review" filter after Submit

- After Submit, show a two-option toggle in the results area: "All questions" and "Needs review (N)". The second keeps only cards whose status is incorrect, partial or unanswered and hides the rest with the `hidden` attribute. It also filters the question navigator.
- Use a real button group with `aria-pressed`. It is keyboard reachable and announced through the existing live region.
- Not persisted; it resets on reload.
- Test with `kitchen_html`: answer two questions wrongly, submit, press the filter; exactly those two cards (plus any unanswered) are visible, and the navigator matches.

## Phase 3: larger learner and grading features

### 3.1 Print with answer key

- After Submit, add a "Print with answers" button in the results area. It adds a class to `<body>` (for example `qm-print-key`), makes sure every card shows its correct answer and explanation (reuse what the results view already renders; look before writing new code), calls `window.print()`, and removes the class on `afterprint`.
- In `@media print`, when the class is present: show correct answers and explanations, keep `break-inside: avoid` on cards, and print badges with their symbols.
- The plain browser print (Ctrl+P) keeps today's behavior.
- Test: use `page.emulate_media(media="print")` after adding the class through the button's handler (stub `window.print` in the test). Every auto-graded card then has a visible correct answer.

### 3.2 Retry missed questions

Design:

- After Submit, a "Retry missed (N)" button starts a new attempt containing only the questions that were incorrect, partial or unanswered. It is disabled when N is 0.
- It reuses the question-bank path: an attempt with a subset `Q` of `QALL`. Read how `quiz.js` handles `attempt.bank` (`seed`, `pool`, `drawn`) and how `report.py` `bank_info` and the grader check it, then add `retry_of` (the `started_at` of the previous attempt) and keep `drawn` as the subset. The grader accepts a retry the same way it accepts a bank draw.
- The previous attempt's export is still available until the new attempt starts; warn in a confirm dialog that starting the retry discards it, unless it has been exported.
- This adds an optional field, so the version stays 1. Update `results-v1.schema.json`.
- Tests:
  - e2e: miss two questions, submit, retry: exactly two cards appear, submit and export, and `quiz grade` on the export reports two questions and no hash warning.
  - Python: `quiz grade` on a hand-written retry results file.
- Works for quizzes with and without `pick`. For a bank quiz the retry draws from the missed questions of the current draw, not the whole pool.

### 3.3 Merge agent grades back into the report

- Define `grades-v1`: a JSON file `{ "format": "quizmd-grades", "version": 1, "results_hash": ..., "grades": { "<question id>": { "score": number|null, "band": number|null, "criteria": { "<name>": number }, "justification": str, "improvement": str } } }`. Add `src/quizmd/schemas/grades-v1.schema.json`.
- `quiz grade results.json --quiz quiz.md --grades grades.json`:
  - Checks that every id exists and needs AI grading, that `score` lies between 0 and the question's points, and that `band` lies between 0 and 9 in steps of 0.5. Errors exit 1 with a clear message per id.
  - Fills the Grading blocks in the Markdown report and the `ai_grading` entries in the JSON report (`ai_grading.result`), and adds `summary.final_earned` / `final_percent`, which include AI scores. Band questions report the band and do not count toward points unless the essay has `points`; follow whatever `summarize` does for band today and say so in the guide.
- `quiz grade ... --json` also writes an empty `*-grades.json` template beside the report when questions need AI grading and no `--grades` was given, so the agent fills a file instead of editing Markdown.
- Update `AGENTS.md` Job 2 and the `/quiz` skill text, if it lives in this repo (search for it; if it lives outside the repo, tell the user what to change).
- Tests in `tests/test_report.py`: template generation, a valid merge, each validation error.

### 3.4 `quiz stats`

- `quiz stats RESULTS... [--quiz quiz.md] [--json]`: grade each file the same way `quiz grade` does, sort by `attempt.started_at`, and print:
  - one line per attempt: date, score, percent;
  - per tag: percent in each attempt, plus the change from first to last;
  - the three weakest tags in the latest attempt.
- Files from different quizzes (different `quiz.id`) are an error, exit 2. A changed quiz hash is a warning.
- Output goes to stdout as Markdown, or JSON with `--json`. No files are written.
- Tests with three hand-made results files.

## Phase 4: new question types

Both types need: parser and models, validation errors with fixtures (`tests/fixtures/make_fixtures.py`), the grader in Python **and** JS, golden cases, rendering with keyboard access, the export `response`/`correct` shapes, report formatting, schema updates, both guides, and one example question in `blank.md` and `tests/fixtures/all-types.md`.

### 4.1 `ordering`

- Syntax: `{type=ordering}` followed by an ordered list (`1.` items) in the correct order. The page shows the items shuffled, with Move up / Move down buttons on each item; drag is optional and must not be the only way.
- Scoring: `partial` (default) gives each item in its correct position 1/n of the points; `all_or_nothing` respects the existing `multi_scoring` front-matter setting or a per-question `scoring` attribute (pick one and document it).
- Validation: at least 2 items; no duplicate item text.
- The shuffle must never show the correct order when n ≥ 2 (reshuffle if it does). Use the seeded random the bank already uses, so a resume shows the same order.

### 4.2 `matching`

- Syntax: `{type=matching}` followed by a bullet list of `left :: right` pairs. A bullet `:: right` with no left side adds a distractor.
- The page shows each left item with a `<select>` of all right items, shuffled. Native selects keep this accessible.
- Scoring: partial credit per correct pair by default; `all_or_nothing` as for ordering.
- Validation: at least 2 pairs; right items unique; `::` present on every bullet.

## Phase 5: distribution and quality

### 5.1 Wheel completeness test

Not for PyPI: the user does not want to publish there. The test makes sure a local install from a wheel file (`uv tool install dist/quizmd-*.whl`) works without the repo.

- `uv build`, then a test (`tests/test_wheel.py`, marked slow, skipped if `uv` is not on PATH) that installs the wheel into a temp venv and runs `quiz new calculus` and `quiz build` there. This proves `static/`, `templates/`, `vendor/`, `examples/`, `schemas/`, `guide.md` and `agents.md` are all in the wheel.
- Do not add PyPI metadata, a publish step or a release workflow.

### 5.2 CI workflow

- Add `.github/workflows/ci.yml`: on push and pull request, on `ubuntu-latest` and `windows-latest`, install uv, `uv sync`, `uv run playwright install --with-deps chromium` (no `--with-deps` on Windows), and `uv run pytest -q`.
- The `rustc` and markdownlint tests already skip when the tool is missing. Decide with the user whether CI should install them (Rust toolchain, Node with `markdownlint-cli2`) so those checks actually run.
- Tell the user it runs only once the repo is pushed to GitHub.

### 5.3 Watch with auto-reload (optional)

- `quiz watch --serve`: serve the output folder on `127.0.0.1` with a random free port (stdlib `http.server` in a thread), plus an `/events` endpoint for server-sent events that sends a message after each rebuild.
- Only the served page gets an injected reload snippet and a CSP that allows `connect-src 'self'`. Normal `build` output is unchanged, and `test_no_network_requests` must still pass on it. Add a test that a normal build contains neither the snippet nor the relaxed CSP.
- `--open` opens the `http://127.0.0.1:PORT/quiz.html` URL instead of the file.

### 5.4 Accessibility audit

- Vendor `axe-core` (pin an exact version, `axe.min.js` only) under `tests/vendor/`. It is used only by tests and never shipped in the package.
- Add an e2e test that loads each example and the kitchen-sink quiz in light and dark, injects axe with `page.add_script_tag(path=...)`, runs it, and fails on any `serious` or `critical` violation. Fix what it finds, or list accepted exceptions with a reason in the test.

## Deferred

Left out on purpose, so they are not built by accident:

- Publishing to PyPI: dropped at the user's request.
- Spaced repetition across attempts: needs durable history. Revisit after `quiz stats` (3.4), which may cover the need from exported files.
- Bank weighting by tag and no-repeat draws.
- Hotspot questions.
- Multi-file includes: the `file:line` error format would need a design change first.
- Anki or CSV import, and Moodle XML or QTI export.
- Visual snapshot tests.
- A Rust rewrite or a WASM grader. Revisit only under the conditions listed in `docs/PLANNED.md`.
