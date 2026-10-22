# Planned work

Proposals, not commitments. Order within each section is rough priority. Items marked **(unverified)** are guesses that need a look at the code first.

## Fixes

1. ~~**Layout regression test.**~~ Done. The Check button sat flush against the input and nothing caught it. Add a Playwright check that the button is at least 0.5rem below the answer control.
2. ~~**Single source for examples.**~~ Done (`scripts/sync_examples.py` and a drift test). Original note: `examples/` (built HTML for readers) and `src/fullmark/examples/` (templates for `quiz new`) are copies. Add a sync script or a test that fails when they differ.
3. ~~**Verify and document the results schema.**~~ Done. JSON Schemas for the results and report files live in `src/fullmark/schemas/` and are validated in the tests; `scoring: band` is confirmed as an essay `answer` field.
4. ~~**Readability at the new width.** The page is now 72rem with an 18px base. Check phone, tablet and ultrawide; consider capping prose line length at about 80 characters inside cards.~~ Done.
5. ~~**Lock more themes where it fits.**~~ Decided: no. Calculus and Rust are practice drills and follow the device; the guide says when to lock.
6. ~~**Line endings.**~~ Done (`.editorconfig`, ruff `line-ending = "lf"`, builds write LF). Original note: Git warns that CRLF becomes LF on many files. Add or fix `.gitattributes` so the working tree and the repo agree.

## Learner experience

- ~~Enter key triggers Check in text inputs.~~ Done.
- ~~Font-size control (A- / A+) next to the theme toggle, remembered per device.~~ Done.
- ~~"Answered N of M" in the sticky header (the page already shows `Answered 0/10`; check it is also in the nav on phones).~~ Done.
- ~~After Submit: a "review wrong answers only" filter, and a "retry missed questions" mode.~~ Done.
- Print or PDF view that includes the answer key and explanations.
- Optional spaced repetition across attempts (needs a place to keep history; localStorage is per browser).

## Authoring

- ~~`quiz watch quiz.md`~~: done (rebuilds on save). Still open: reload the open page automatically; the page's CSP blocks network, so that needs a watch-only build or a local server.
- ~~`quiz serve`~~: done (sends the answers straight back to the waiting tool; see `docs/plans/SERVE_PLAN.md`).
- ~~Question banks~~: done (`pick` in front matter or on sections). Still open: weighting by tag, "never repeat the last draw", and a bank-aware retry of missed questions.
- ~~`quiz review`: a review form per question (keep, fix or drop, with problems such as "the answer key is wrong") that writes `review.json`. `quiz check --review` then fails until the flagged questions are fixed.~~ Done (design in `docs/SPEC.md` 5.8, work list in `docs/plans/REVIEW_PLAN.md` part A). The terminal form waits for part B. 0.7.1: the review page counts cards (`Reviewed N/M`, one nav button per card) and hides the flag checkbox, through the `review: true` front-matter marker.
- `quiz serve --tui`: any survey in a terminal (Textual as an optional extra), with the same results file as the web form, so every tool's brief gets a terminal form for free. See `docs/plans/REVIEW_PLAN.md` part B; needs a go-ahead.
- ~~`quiz brief DIR`: a brief for agent-written quizzes (purpose, scope, material, count, mix, difficulty, mode, weak topics), as `deck new` does for decks.~~ Done with flags and `--web` (design in `docs/SPEC.md` 5.9, `docs/plans/REVIEW_PLAN.md` part C). `--tui` exits 2 until part B.
- More question types: ~~matching, ordering~~ done; hotspot on an image still open.
- Multi-file quizzes with includes, so large quizzes can be split.
- A `figures:` field in the brief (`material`, `plotted`, `web`) so the user decides per quiz where figures may come from. Parked: the skill rule on figures comes first; add the field only if that rule keeps being overridden per quiz.
- `quiz library`: manage a folder of quizzes as a library, with subcommands such as `quiz library status` (each quiz: built or stale, last score), `quiz library sync` and `quiz library take`. `--web` serves a page that does the same things in the browser: list, status, modify, take a quiz. Parked: it is big. Notes for later: the subcommands come first and the page only calls them, so there is one implementation. `--web` is a long-running 127.0.0.1 server, beyond the one-shot `quiz serve` exception under Questionnaires. A quiz taken through the server saves its progress separately from the same quiz opened as a file (different origin), so results files, not the browser, should be the record.
- ~~`quiz check --strict`~~: done (also `quiz build --strict`).
- Import and export: Anki or CSV in, Moodle XML or QTI out.

## Grading and agents

- ~~`quiz grade --json`~~: done (`*-report.json`). The JSON Schema is done too.
- ~~`quiz stats`: combine several results files into a trend of weak tags over time.~~ Done.
- ~~`quiz agent-guide`~~: done (prints the packaged `agents.md`; the root `AGENTS.md` is a synced copy).
- ~~Write the agent's Grading blocks back into a machine-readable file, not only the Markdown report.~~ Done (grades-v1, `--grades`).

## Questionnaires

- ~~Ungraded questions (`graded=false`), a `scale` type and `mode: survey` (no score, answers report).~~ Done (`survey` template, `quiz new survey`; design in `docs/SPEC.md` 5.6). `quiz stats` shows an "Answers over time" table for them.
- ~~Follow-up text inputs on choices (`{input}` / `{input="Prompt"}` on `single` and `multi` choices).~~ Done (design in `docs/SPEC.md` 5.7, work list in `docs/plans/FOLLOWUP_PLAN.md`). Inputs on other question types, Markdown in the prompt, required text and several inputs per choice: deferred, no use case yet.
- Branching or skip logic: deferred. It needs a way to refer to earlier answers, which breaks the one-line-per-finding validation; split the survey in two files instead.
- Answers from several people: deferred. fullmark is one offline file for one person; combining respondents needs a place to collect them.
- Any server or network use: deferred, except `quiz serve` (`docs/plans/SERVE_PLAN.md`): a one-shot 127.0.0.1 server that receives the answers on Finish, for tools and agents waiting on a questionnaire. The page on disk stays offline-only.
- Required answers beyond the "unanswered" warning on submit: deferred. A hard block on a printed or offline form frustrates more than it helps.
- Analytics across respondents: deferred. It depends on collecting answers from several people.

## Library

Library v1 (init, status, register, list, take, share, path) is done in 0.9.0; `grade`, `stats`, `rename` and `rm` followed in 0.9.1. Design and work list in `docs/plans/LIBRARY_PLAN.md`.

- ~~Autosave in `quiz serve` (task 1 of `docs/plans/LIBRARY_PLAN.md`)~~: done in 0.8.1.
- ~~Config, `quiz library init` and `status`~~: done.
- ~~`quiz library register` and `list`~~: done (`docs/plans/LIBRARY_REGISTER_PLAN.md`).
- ~~`quiz library take`, `share` and `path`~~: done (`docs/plans/LIBRARY_TAKE_PLAN.md`).
- ~~Colored Rich tables for `quiz library status` and `list`, `--plain`~~: done (`docs/plans/LIBRARY_PRETTY_PLAN.md`).
- ~~Help grouping, the layering test, docs, agent guide, skill, SPEC and the release~~: done in 0.9.0 (`docs/plans/LIBRARY_RELEASE_PLAN.md`).

Deferred, each to be added only when the need shows up:

- `quiz library sync`: with library-owned sources it rarely fires; `register --update` covers it.
- ~~`quiz library grade` and `stats` wrappers~~: done in 0.9.1 (`docs/plans/LIBRARY_HOUSEKEEPING_PLAN.md`).
- ~~`quiz library rename` and `rm`~~: done in 0.9.1 (same plan; `rm` is a real delete that git can revert).
- `quiz library replay NAME [--attempt STAMP]` (planned for 0.11.0): open a past attempt as a page that is already submitted, with your answers, right and wrong, explanations, and "retry missed questions" working. A results file plus the version's `.md` it was taken on hold the whole question-and-answer picture, so this is mostly core: `quiz build --attempt results.json` builds the page in the submitted state (static, no server), and the library wrapper finds the attempt and its version the way `grade` does, builds into a temp folder and opens it. Not named `review`: `quiz review` is the question-review form. Check first whether `quiz.js` can start in the submitted state from embedded data without a rework (autosave already injects saved answers). Agent-graded essays and code show as pending in a first version; showing the grades from `reports/` comes later.
- Tags or collections, several users, several libraries per machine, importing old `results.json` files.
- Spaced repetition (see Learner experience): it now has a place for its history, because every attempt is filed in the library next to the version it was made with.

- `quiz library --web`: parked. A page on 127.0.0.1 that shows `list` and `status`, changes quizzes and starts a `take`. It is the human face (tooling principle 5) for the same operations as the CLI, so it calls the same library functions and adds no logic of its own. It needs a long-running server, unlike the one-shot `serve` and `take`: bind to 127.0.0.1 only, keep the token, exit on Ctrl+C or after an idle timeout. Prerequisite: library v1 in use for a while, so the page shows what you actually check.

## Quality and distribution

- Publish to PyPI as `fullmark`: open again; the work order is `docs/plans/FULLMARK_PLAN.md` (rename, public repo, packaging, trusted-publishing workflow). The one-time steps are the owner's.
- ~~CI that runs the full suite on every push.~~ Done (`.github/workflows/ci.yml`).
- ~~Automated accessibility audit (axe) on the built example pages.~~ Done (`tests/e2e/test_accessibility.py`, axe-core 4.10.2).
- MCP wrapper: only if fullmark is needed outside Claude Code (Claude Desktop, claude.ai). A thin layer over check, build, register and grade returning their existing JSON; no new logic. Long waits (serve/review --once) do not fit one tool call.
- Check config: one place (e.g. a `fullmark.toml` in the quiz folder or library, or a front matter block) that sets the `quiz check` thresholds that are hard-coded today (brief count tolerance 20% in `brief.py`; in `lint.py` a correct option more than 1.8 times the longest other option and over 40 characters, an explanation under 4 words, and answer-position skew over 50% once a quiz has 8 or more single-choice questions; in `build.py` the 20 MB size warning and the 100 MB limit) and what `--strict` means: which rules fail it, which are only warnings, which are off. Rule ids such as `brief.count` are the keys. Default behaviour stays as it is now.
- Visual snapshots of the three examples in both themes, to catch palette or layout drift.

## Should this be rewritten in Rust?

**Recommendation: no, not now.**

What would a rewrite buy?

- A single static binary with no Python install. That is real, but `uv tool install` or a PyInstaller build gets most of the way for far less work.
- Faster builds. A build is already well under a second for these quizzes; speed is not a problem.

What would it cost?

- The runtime that learners use is plain JavaScript and CSS inside the HTML. A Rust rewrite does not touch it.
- The current stack leans on mature Python libraries: `markdown-it-py` with plugins, Pygments with custom styles, pydantic validation with line numbers, Jinja2. Rust has `pulldown-cmark`, `syntect` and `minijinja`, but the validation messages, the plugin behaviour (task lists, attribute blocks, answer fences) and the highlighting styles would all be rebuilt and re-tested.
- Over 500 tests and the golden grading cases would need porting.

The real design wart is different: **the grading rules exist twice**, in `grading.py` and `static/quiz.js`, and the golden cases keep them in step. If that duplication becomes painful, there are two cheaper fixes than a full rewrite:

1. Write the grader once in Rust, compile it to WebAssembly for the page and also to a Python extension (PyO3) or call the same WASM from Python. One implementation, no drift.
2. Keep the grader in JavaScript only and have `quiz grade` run it through a small embedded engine or Node. This gives up the "Python is the authority" property, so it is the weaker option.

Revisit Rust if: a single-file binary becomes a hard requirement, the dual-grader drift causes real bugs, or the question types grow complex enough (matching, ordering, partial credit rules) that two copies are a liability. Start with option 1 above, as a small crate, before touching the parser or renderer.
