# Step 1: the core

## Handoff (2026-10-28): start here

A new session picks up from this section alone; it needs no earlier chat.

### How the work runs

1. Opus writes a slice's full brief in this file (below), commits it, and hands the slice to **one Sonnet subagent** with a short prompt that points here.
2. Sonnet implements, commits on branch `1.0` (never pushes), and reports: commits, test counts, and every gap it found in the design docs.
3. Opus reviews: reads the commits, runs `npm run check`, tries the CLI by hand, then brings the gaps to the owner with a recommendation for each. **The owner decides**; nothing goes into the design docs without that yes.
4. Opus writes the decisions into `docs/design/`, writes the next slice's brief here with those decisions as its first tasks, and delegates again.

The owner's working rules: state what, why and what done means before a big job and wait for a yes; keep the core minimal and deterministic (remove the mode that causes a gap rather than specify it); commit only when asked, and the owner has asked for a commit after every round so far.

### Where it stands

| Slice | State | Commits |
|---|---|---|
| 1a scaffold and test data | done, reviewed | `764bd07`..`4e1b0cf` |
| 1b parser and `quiz ids` | done, reviewed | `0789b52`..`b49918f` |
| 1c rules, config, `check`, `rules` | done, reviewed, gaps decided | `8a632b5`..`201d9fb` |
| 1d grader and `grade` | done, reviewed, gaps decided; follow-up fixes done | `402bb97`..`9c350a3`, `869db1d`..`49dba98` |
| 1e contract tests | delegated to Sonnet; committed as it went, not reviewed | `62aeaf4` and the commits around it |

`npm run check` after 1d: 37 test files, 1010 passed, 0 todo. Branch `1.0` is not on GitHub; nothing has been pushed.

1d's proposals and gaps were decided on 2026-10-28 and are in the design docs (commits `d274e3d` and the one after it): `results-v2` with `AttemptState` and every answer shape (TECHNICAL_DESIGN.md section 4); `optionOrder` also for ordering and matching, and matching always shown shuffled (QUIZ_SYNTAX.md); `report-v2`; the score while grades are pending; the rubric rule details, rounding, the grades template and validation (section 6); `grade --quiz` required and `--grades` explicit (COMMANDS.md). The code already matches all of it.

### Next steps, in order

1. 1e was delegated to Sonnet on 2026-10-28 and the session ended while it was still running. Its work so far is committed, unreviewed. Check `git log` and `git status`, then finish or re-delegate what is missing from "Slice 1e" below. Review it: read the golden files themselves, since they become the contract; bring its gaps (and its path-printing proposal) to the owner.
2. With 1e reviewed, step 1 is done. Step 2 (`build`, the page runtime, themes, `replay`) gets its own plan file, `docs/plans/STEP2.md`, cut into slices the same way.

### Design work in parallel (themes and pages)

The mockups are a Design canvas: <https://claude.ai/artifact/HPX2k7wM7ENHVQLc3zzjL5> (tokens and fonts, the quiz screen in all five themes, the start screen). The owner reviews by commenting there. The local copy sat in a session scratchpad, so read the artifact back before changing it. Decided so far: OLED uses near-black cards on a pure black page, with softened colours (written into TECHNICAL_DESIGN.md section 8). The rest (darker light-theme status colours, flag colours, the explanation box, the start screen with "the whole quiz" pinned above a 5-row scrolling list of parts, single choice) is agreed on the canvas but not yet written into section 8.

Open questions for the owner:

1. Can every page take one part on its own, or only one served with `serve --section`? Recommended: every page.
2. Did "launch page" mean the quiz start screen (as designed), or something else?
3. Light tints behind highlights and explanations: derive them from the main colour (`color-mix`), or list them as tokens in each theme? Recommended: derive them.
4. Explanation text: full bold, or semibold (600) as now?

Next design work: **Focus Mode** and the **Review page**.

### Loose ends outside this plan

- **document-kit and presentation-kit** have one local commit each switching them to `fullmark-py` (`1d34d42`, `a148385`), not pushed; the owner still has to reinstall `doc` and `deck` (`uv tool install --reinstall <path>`, plus `--editable` if that is how they were installed).
- **`D:\coding-projects\fullmark`** (the old checkout, branch `main`) holds someone's uncommitted edits to five docs files; leave them alone.
- **Config path shared with 0.x:** see [TODO.md](../design/TODO.md).

The plan for step 1 of the order of work ([TECHNICAL_DESIGN.md](../design/TECHNICAL_DESIGN.md), section 12). It is cut into slices so that each one can be handed to an agent, reviewed, and committed before the next starts. A slice's brief is written in full here before it is delegated; later slices stay outlines until then, so they can absorb what the earlier ones teach.

## Goal

The core of fullmark 1.0 and the commands that need no page: `check`, `rules`, `grade` and `ids`.

**Done when** every example passes `check`; the grading cases from 0.x pass as vitest tests against the 1.0 grader; and `check`, `rules`, `grade` and `ids` match reviewed golden files (exit codes, messages, `--json` lines), for one file and for several, including three quizzes of which one is broken.

**Not in step 1:** `build`. It moved to step 2, with the page runtime it needs; a step 1 `build` would produce placeholder pages whose golden files step 2 would replace.

## Rules for every slice

- **Read first:** [QUIZ_SYNTAX.md](../design/QUIZ_SYNTAX.md), [TECHNICAL_DESIGN.md](../design/TECHNICAL_DESIGN.md) (sections 3, 4, 5, 6, 7, 9 and 11) and [COMMANDS.md](../design/COMMANDS.md) (Conventions, and the commands the slice touches). The design docs win over this plan; if they disagree or leave a gap, stop and report it rather than invent an answer.
- **Stack:** TypeScript (strict), Node 22 or later (the machine runs 24), **npm** with a committed `package-lock.json`, tsup for the CLI bundle, vitest, Biome. Dependencies only from TECHNICAL_DESIGN.md section 3, pinned exactly; add one only when its slice needs it.
- **Layout:** `src/` as in TECHNICAL_DESIGN.md section 7. `src/core` imports no `node:*` module and nothing from `library`; a test enforces it.
- **Determinism:** no `Date.now()`, `Math.random()`, OS locale or `Intl` in `core`. Sorting uses a fixed comparison.
- **Tests:** every behaviour has a vitest test. Test data lives in `test/`.
- **Git:** work on branch `1.0`. Small commits, each with a message saying what and why, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never push.
- **Report:** commits (hashes), test counts, every gap or contradiction found in the design docs, and anything decided differently, with the reason.

## Slices

| Slice | Content | Done when |
|---|---|---|
| **1a** | Scaffold, and step 0's test data ported to the 1.0 syntax | below |
| **1b** | Parser: Markdown and YAML to the IR, with positions, ids, slugs and hash normalisation; the syntax rules of QUIZ_SYNTAX.md section 8a; `quiz ids` | every example and valid fixture parses; every invalid fixture gives exactly its expected rule ids and lines; `quiz ids` contract tests |
| **1c** | Rule registry, quality rules, `fullmark.toml` and profiles, custom checks, inline ignores, message catalogs for what pages and reports show; `check` and `rules` | every rule has a fixture that triggers it and one that does not, under each built-in profile; config errors point to `file:line` |
| **1d** | Plan and Attempt, `results-v2`, the grader, rubric modes and presets, `grades-v2`, reports; `grade` | the 0.x grading cases pass; rubric golden cases, IELTS rounding edges included; a `grades-v1` file is refused |
| **1e** | Contract tests across the commands: golden files, several files, `--json` lines, exit codes, the startup budget | the step's done criteria above |

## Slice 1a: scaffold and test data

### Scaffold

1. **Package.** `package.json`: name `fullmark`, version `1.0.0-alpha.0`, `"type": "module"`, `engines.node` `>=22`, bins `quiz` and `fullmark` pointing at `dist/cli.js`. Scripts: `build` (tsup), `test` (vitest run), `typecheck` (`tsc --noEmit`), `lint` (`biome check`), and `check` running typecheck, lint and test.
2. **Dependencies for 1a only:** `typescript`, `tsup`, `vitest`, `@biomejs/biome` (dev), and `commander`. Pinned exact versions.
3. **TypeScript:** strict, `noUncheckedIndexedAccess`, ES2023 target, bundler module resolution.
4. **Biome:** replace the 0.x leftover `biome.json` (it points at `src/fullmark/static`) with one for `src/**`, `test/**` and the config files, keeping the formatter settings (2 spaces, width 120, LF).
5. **Layout:** create `src/core/`, `src/cli/` and `test/`. Create the other folders of TECHNICAL_DESIGN.md section 7 only when a slice fills them.
6. **CLI skeleton:** `src/cli/main.ts` with commander. `quiz --version` prints `fullmark 1.0.0-alpha.0`; `quiz --help` lists no commands yet. An `exit-codes.ts` with the four codes of COMMANDS.md (Conventions). The bundle is one file with a shebang.
7. **Message catalogs:** `src/core/i18n/` with `en.ts` as the source, `vi.ts` typed `satisfies Messages`, and one key each, so a missing key is a compile error from the first commit. Terminal output is English and does not use the catalogs (TECHNICAL_DESIGN.md, section 9).
8. **Boundary test:** a vitest test that fails when any file under `src/core` imports `node:*` or anything under `src/library`.
9. `.gitignore`: add `node_modules/`.
10. Tests: `--version` through the built bundle; the boundary test; the catalog compiles.

### Test data from 0.x

The source is `D:\coding-projects\fullmark-py` (0.10.3, read only). Every quiz is rewritten in the 1.0 syntax by hand, following QUIZ_SYNTAX.md section 11 (changes from 0.10.2). The main changes: `type=` on every question; a readable `id=` on every question; `::: hint` and `::: explanation`; `kind:` for `mode:`; `partial:` for `multi_scoring:`; `pick` only on sections; `source=` for `Source:` notes; `sample_answer` for code's `reference`, and no `show_*` keys; rubrics in the 1.0 form (the IELTS example uses `preset:`); field points absolute.

| From (fullmark-py) | To (fullmark-1.0) | Notes |
|---|---|---|
| `src/fullmark/examples/*.md` except `blank.md`, with `assets/` | `examples/<name>/quiz.md` and `examples/<name>/assets/` | six examples; `examples/` at the 0.x root holds the same quizzes |
| `src/fullmark/examples/blank.md` | `templates/blank/quiz.md` | the template `quiz new` will copy (step 3) |
| `tests/fixtures/*.md` and `assets/` | `test/fixtures/valid/` | |
| `tests/fixtures/invalid/*.md` | `test/fixtures/invalid/` | with a new `expected.json`: for each file, the 1.0 rule id from QUIZ_SYNTAX.md section 8a and the line |
| `tests/grading_cases.json` | `test/data/grading_cases.json` | copied unchanged |

- **Invalid fixtures:** each one must still break exactly one rule of section 8a. A fixture whose 0.x error no longer exists in 1.0 (for example because 1.0 allows it) is dropped and listed in the report. A 0.x error with no 1.0 rule is a gap in section 8a: keep the fixture, mark it `"rule": null`, and list it. Add a fixture for each rule of section 8a that has none, so every syntax rule has one.
- **Grading cases:** the file keeps 0.x's shape until slice 1d defines `results-v2` answers. Add `test/grading-cases.test.ts`, which loads the file and registers each case as `it.todo` with its name, so the 160 cases are visible from now on.
- **Valid data:** nothing can parse it until 1b. Check it by reading against QUIZ_SYNTAX.md; 1b's done criteria prove it.

### Done when

`npm run check` passes; `node dist/cli.js --version` prints `fullmark 1.0.0-alpha.0`; the examples, the template and the fixtures are in place in the 1.0 syntax; `expected.json` covers every invalid fixture; and the report lists the dropped fixtures, the rules with no fixture before, and every gap found in the design docs.

## Slice 1b: parser and `quiz ids`

1a is reviewed (commits `764bd07` to `4e1b0cf`). Its gaps are settled in the design docs (2026-10-27): QUIZ_SYNTAX.md section 8a now has `syntax.yaml`, `syntax.preamble`, `quiz.empty`, `code.language` and `question.ungraded-key`, the "one mistake, one rule" principle and the line rules; TECHNICAL_DESIGN.md section 6 has the banded rubric syntax; foundation 1 says what is hashed.

### First: update the test data

1. Re-key the seven `"rule": null` fixtures and the overlaps to the new rules: `no-questions` → `quiz.empty`, `answer-yaml-error` → `syntax.yaml`, `matching-empty-right` → `matching.pairs`, `code-no-language` → `code.language`, `scale-graded-true` → `question.ungraded`, `ungraded-fields-with-value` and `ungraded-essay-rubric` → `question.ungraded-key`; an `[x]` in a survey → `question.ungraded-key`. Add a fixture for `syntax.preamble`. Recheck every line number against the line rules of section 8a. After this, no fixture has `"rule": null`.
2. `examples/survey/quiz.md`: the text 1a moved into the first section's intro belongs in `description` instead.
3. Rubric fixtures and the IELTS example: follow the banded syntax now in TECHNICAL_DESIGN.md section 6 (weights on criteria, not a list).

### The parser

`src/core/parse/`: `parse(text: string, file: string): { quiz: Quiz | null; issues: Issue[]; assets: AssetRef[] }`, pure (no `node:*`).

- **IR** in `src/core/ir.ts` as zod schemas with inferred types: front matter (every key of section 2, defaults applied), sections (title, `id`, `time`, `pick`, intro, passage), questions (`id`, `type`, attributes, prompt, hint, explanation, `source`, the answer per type, the rubric parsed into its structure), each node with its source line. Prompts, choices, explanations and passages are kept as **Markdown source strings**; rendering to HTML is step 2. `Issue` is the type in TECHNICAL_DESIGN.md section 4.
- **Markdown:** `markdown-it` for block structure and line maps, `markdown-it-container` for `:::`. The attribute grammar of section 4 ("Where attributes start and end"), task-list markers, blanks and `{input}` are parsed by our own code, since no plugin follows those rules exactly. Maths (`$…$`, `$$…$$`) and code spans must be recognised so braces and `[[` inside them are skipped.
- **YAML:** `yaml` with `LineCounter`, so a YAML issue reports the right line in the file.
- **Normalisation and hashes:** as TECHNICAL_DESIGN.md foundation 1 now defines them, with SHA-256 from `@noble/hashes` (pure TS, MIT, synchronous: `core` cannot use `node:crypto`). The question hash is on each question; the quiz hash is computed by a function that takes the text and the assets' bytes.
- **Slugs:** the slug function of section 9 of TECHNICAL_DESIGN.md (`đ` → `d`).
- **Syntax rules:** the parser reports every rule of section 8a except `rubric.*` (slice 1d) and `ignore.invalid` (slice 1c, which needs the registry), with the rule's id, the line, an English message and a `fix` where one is obvious. `check-ignore` is parsed and kept on the question. Parsing continues after an error, so one run reports every problem.
- **Assets:** the parser returns each referenced path with its line. `src/cli/load.ts` (Node) resolves them, symlinks included, reads their bytes, and reports `asset.missing`, `asset.outside`, `asset.type` and `asset.remote`; the core never touches the disk.

### `quiz ids`

As specified in COMMANDS.md (`quiz ids`). It edits the raw text and never re-serialises: the output equals the input byte for byte except the inserted `id=q-xxxxxx` and the space before it (or a new `{id=q-xxxxxx}` block where a heading has none), and a CRLF file stays CRLF. Random ids come from `node:crypto` in `src/cli`, checked against every id already in the file. It follows the "Several files" conventions and `--json` of COMMANDS.md.

### Dependencies for 1b

`markdown-it`, `markdown-it-container`, `yaml`, `zod`, `@noble/hashes`, and the `@types` packages they need. Pinned exactly.

### Done when

- Every example, the template and every valid fixture parse with no issue.
- Every invalid fixture gives exactly its expected rule and line, and no other issue (`rubric.*` and `ignore.invalid` fixtures are marked pending until 1d and 1c).
- Hash tests: the same quiz with CRLF, a BOM, NFD text or trailing spaces has the same quiz hash; adding an `id` or moving a question keeps its question hash; changing an asset's bytes changes the quiz hash.
- `quiz ids` tests: ids added only where missing; a second run is `unchanged`; output is byte-identical apart from the insertions, CRLF included; duplicate ids and a block that does not parse leave the file untouched with exit 1; several files and `--json` lines.
- A parse benchmark: the largest example parses in well under 50 ms (a test with a generous limit, to catch accidents).

## Slice 1c: rules, config, `check` and `rules`

1b is reviewed (commits `0789b52` to `b49918f`). Its gaps are settled in the design docs (2026-10-27): QUIZ_SYNTAX.md now has `question.trailing-text` and `asset.alt`, a question before the first `#` is `syntax.preamble`, one passage per section, `fields.empty` covers a graded question with no graded field, the asset precedence, the line rule for answer blocks and key conflicts, and the Markdown edge cases (section 8). TECHNICAL_DESIGN.md foundation 1 has the exact hash layout 1b built. COMMANDS.md says what `quiz ids --dry-run` returns.

### First: the parser catches up

Add to the parser the rules above that 1b did not report (`question.trailing-text`, `asset.alt`, `syntax.preamble` for a question before the first `#`, the second passage as `syntax.container`, `fields.empty` for no graded field), each with fixtures. Text after the answer must no longer be folded into `prompt`.

### The registry and the rules

- **Registry** in `src/core/rules/`, with the `Rule` and `Issue` types of TECHNICAL_DESIGN.md section 4. Every fixed rule of QUIZ_SYNTAX.md section 8a is registered (the parser and the loader still raise them; the registry is the catalogue, with a description, an example and a fix for each, for `quiz rules RULE`). Rule ids are a contract: a test fails if an id is removed or renamed.
- **Quality rules:** the catalogue of TECHNICAL_DESIGN.md section 5 (the 0.x rules with ids and options, and the new ones off in `default`), except `build.size` (step 2). Thresholds from 0.x's `src/fullmark/lint.py` in `D:\coding-projects\fullmark-py` (read only) where the design gives none. `question.points-ignored` moves into the registry as a quality warning.
- **Brief rules** (`brief.count`, `brief.mix`, `brief.content-kinds`, `brief.past-exams`, `brief.generated-by`): `check` reads a `brief.yaml` beside the quiz. Its format is not written down yet: define a zod schema in `src/core/ir.ts` from the `quiz brief` options of COMMANDS.md (snake-case keys, `decided_by` per value, `focus_tags`), base it on 0.x's `brief.py` where the docs are silent, and report the schema as a proposal for the design docs. `brief.past-exams` now looks for `source=` on questions.
- **Not in 1c:** `--review` and the `review.*` rules (they need `review.json`, which `quiz review` defines in step 3). `check --review` exits 2 with "not available yet" until then; say so in `--help`.

### Config and profiles

TECHNICAL_DESIGN.md section 5, all of it: built-in profiles (`default`, `draft`, `exam`, `survey`, with `survey` picked for `kind: survey`), `extends` chains, `[check] profile` and `fail-on`, the user config's personal profiles, the nearest `fullmark.toml` (looking up from the quiz, stopping at a git root), the profile choice order, custom checks (`count`, `require`, `forbid`, ids starting `custom.`), inline ignores (`config.ignored` as info, `allow-ignore = false` turning them into errors, `ignore.invalid` for a missing `because` or a fixed rule). Config is parsed with `smol-toml`; `core/config` receives text and the CLI reads files. **Every config error names `file:line`.** If `smol-toml` cannot give a line for a semantic error, find the key's line in the text, test it, and say how in the report. The user config's location is in COMMANDS.md (Environment, `FULLMARK_CONFIG`).

### Commands

`quiz check` and `quiz rules` exactly as in COMMANDS.md: options, human output (first line names the profile and the config files used), `--json` shapes, exit codes, `--strict`, and the "Several files" conventions for `check`. Human output goes to stderr only where COMMANDS.md says so; follow the Conventions.

### Dependencies for 1c

`smol-toml`, `picocolors`. Pinned exactly.

### Done when

- Every rule (fixed, quality, brief) has a fixture that triggers it and one that does not, under each built-in profile where the level differs.
- The six pending `rubric.*` fixtures stay pending (1d); the two `ignore.invalid` fixtures pass.
- Config: every config error points to `file:line`; the profile choice order, `extends`, user and project layers and `fail-on` each have tests; `quiz rules --for FILE` shows where each value came from.
- `quiz check` on every example exits 0 under its profile; `check` on three quizzes with one broken exits 1 with three JSON lines and a summary line.
- `npm run check` passes.

## Slice 1d: the grader, rubrics and `grade`

1c is reviewed (commits `8a632b5` to `201d9fb`). Its gaps are settled in the design docs (2026-10-28, commit `eaa45ad`): COMMANDS.md now defines the `brief.yaml` file (every key always written, none filled in when read), the exit for an unknown `--profile`, and `kind: "custom"` in `rules --json`; TECHNICAL_DESIGN.md section 5 has `brief.mode`, `brief.invalid`, `build.size` registered early, the profile overlay and choice order, the built-in rule lists and "no numeric codes"; QUIZ_SYNTAX.md has `profile.unknown` and the wider `ignore.invalid`.

Read first, beyond the usual: TECHNICAL_DESIGN.md section 4 (Plan and Attempt) and section 6 (all of it), COMMANDS.md `quiz grade`, and QUIZ_SYNTAX.md for every answer type, `lang`, `ui_lang` and section 7 (ungraded questions and surveys).

### First: 1c catches up

1. **`brief.yaml` has no defaults when read.** Remove the `.default(...)`s from `BriefSchema`; every key is required, a missing one is `brief.invalid` like an unknown one (with the line of the mapping, or line 1), an empty file is `brief.invalid`, and `profile` is a string, not nullable. Update the brief fixtures so each holds every key. The defaults move to `quiz brief` (step 3); do not keep a second copy.
2. **`brief.mode`** (warning): `each-question` expects `feedback: instant`; `timed-exam` expects a `time_limit` and `look: locked`. One finding per mismatch, at the line of the quiz key concerned (or line 1 when it is missing). Fixtures that trigger it and one that does not.
3. **`profile.unknown`**: a fixed rule for an unknown front-matter profile, at the `profile:` line, replacing today's `syntax.value`. An unknown `--profile` exits 2 with a plain message naming the known profiles. Add the id to `test/data/rule-ids.json`.
4. **`because` without `check-ignore`** is `ignore.invalid`, with a fixture.
5. **`build.size`** registered (quality, warning, options `warn-mb` 20 and `max-mb` 100) with no check, so a profile that sets it is accepted and `quiz rules build.size` describes it, saying it is checked by `build` from step 2.

### Plan and Attempt

In `src/core/attempt/`, pure. The `Plan` and `Attempt` types of TECHNICAL_DESIGN.md section 4, as zod schemas. `AttemptState` is not written down yet; define it from what grading, reports and `stats` need, and report it as a proposal: the answers keyed by question id, when the attempt started and was submitted (ISO strings, as written by the page), the time used, and flags. A function `planFor(quiz, source, ...)` for `full`, `section` and `bank` plans (a bank draw takes a seed and uses a seeded generator of our own, never `Math.random()`); `missed` and `retry` plans come from the library and from the page, so 1d only accepts them.

### `results-v2`

The serialised `Attempt`, in `src/core/attempt/results.ts`, with a zod schema. It is a proposal for the design docs; report it in full.

- Top-level `"format": "fullmark-results"` and `"version": 2`, then the `Attempt` fields. Every known key is required; **unknown keys are ignored**, since TECHNICAL_DESIGN.md (seams for later features) reserves an optional `bundle` object that older readers must skip.
- A file whose `version` is 1, or that looks like a 0.x results file, is refused with a plain message: 1.0 does not read 0.x files; the owner's history is converted once by the move-in script (section 12, step 6).
- **Answer shapes:** one per question type. Start from the `response` shapes in `test/data/grading_cases.json` (`choice`, `choices`, `inputs`, `value`, `raw`, `text`, `blanks`, `fields`, `code` and `language`, `order`, `pairs`) and keep them unless the 1.0 syntax forces a change; list every change. Choice, item and pair indices refer to the **source order**, never the shuffled order of `optionOrder`, so grading does not depend on the shuffle. A numeric answer is the text as typed. An essay's word count is computed by the grader, not read from the file.

### The grader

`grade(quiz: Quiz, attempt: Attempt): Graded` in `src/core/grade/`, pure, the one function the page will also run (TECHNICAL_DESIGN.md section 7). For each question in the plan: `earned`, `points` and a status (`correct`, `partial`, `incorrect`, `unanswered`, `pending`, `ungraded`); then totals per section and per tag, and the pass mark. Questions outside the plan are not counted. Numeric answers go through `src/core/number.ts`, and the quiz's `lang` (never `ui_lang`) decides whether a decimal comma is read. Essay and code answers are `pending` until grades are folded in. A survey has no score: every question is `ungraded` and the report shows only the answers.

**The 160 grading cases:** rewrite `test/data/grading_cases.json` to 1.0 shapes. Each case's `spec` becomes the question in 1.0 Markdown (a `question` string, one `##` block), and its `response` becomes a `results-v2` answer, so every case runs through `parse` and then `grade`. Write the conversion as a one-off script, commit its output and not the script, and list every case whose expected result had to change, with the reason. `test/grading-cases.test.ts` turns its 160 `it.todo` into real tests.

### Rubrics

- **The `rubric.*` fixed rules** of TECHNICAL_DESIGN.md section 6 (`rubric.mode-missing`, `rubric.sum`, `rubric.step`, `rubric.scale`, `rubric.weights`, `rubric.duplicate-id`), raised where the rubric is parsed. The 6 pending fixtures pass.
- **Quality rules:** `rubric.missing`, `rubric.thin` (option `min`, 3) and `rubric.points-in-text`, each with fixtures. The built-in profiles pick them up through their existing rules ("every quality rule that is on in `default`"). `rubric.missing` does not fire on an ungraded question, which covers surveys.
- **Presets:** `ielts-writing-task1` (TA, CC, LR, GRA) and `ielts-writing-task2` (TR, CC, LR, GRA), equal weights, scale 0 to 9 step 0.5, `round: ielts`. Criterion texts in English; they are not in the catalogs, since grades refer to ids.
- **Arithmetic** in `src/core/rubric/`: the additive sum, the weighted band mean, the three rounding rules and `points × band / scale.max`. Work in integer steps (scale every value by its step) so that no float error can move a band: 6.25 must round to 6.5 under `ielts` on every machine. Golden cases cover each rounding rule at .25 and .75 and at the scale ends, a weighted mean, and the three worked examples of section 6 (2.25 / 3, band 6.5 so 6.5 / 9, 3 / 4).

### `grades-v2`

TECHNICAL_DESIGN.md section 6, "`grades-v2`", in `src/core/rubric/grades.ts`: the template (written with every id, text, maximum or scale in place and `null` cells), validation (every rule in the "Validation" list, exit 1 with every problem listed, nothing written), the two warnings, and the computed result. A `grades-v1` file is refused like a 0.x results file.

`rubric_hash` and `results_hash` are defined in section 6 (decided 2026-10-28): SHA-256 over canonical JSON of the parsed content, never over bytes. One canonical-JSON function in core serves both. Tests: re-indenting the rubric's YAML or rewriting the results file with CRLF and other spacing keeps each hash; changing a criterion's text, points or weight, or one answer, changes it.

### Reports

From `Graded` (and grades, when given), pure, in `src/core/report/`: Markdown and JSON. Contents as COMMANDS.md `quiz grade` says: the score, per section and per tag, every wrong answer with its explanation, and the essays and code laid out for a grader (prompt, answer, word count, rubric with ids and maximums, sample answer). With grades: per question `earned`, `points`, `status`, `graded_by`, `rubric_current` and the criteria list (section 6, "Computed"). A survey report is titled "Answers" and has no score. Every heading and label comes from the message catalogs in `src/core/i18n/` and follows the quiz's `ui_lang`; add the keys to `en.ts` and `vi.ts`. A report holds no time of its own making: dates come from the files, so the same inputs give byte-identical reports.

### `quiz grade`

As in COMMANDS.md: `RESULTS...`, `--quiz` (required: the results file does not carry the quiz), `-o`, `--grades`, `--json` (the report as JSON plus the `*-grades.json` template beside it, named as `quiz replay` expects), the "Several files" conventions, and the exits. A `quizHash` that does not match `--quiz` exits 1 and names the hash the attempt was taken on. **Not in 1d:** `--web` and `--name` (the one-shot server is step 3); they exit 2 with "not available yet", as `check --review` does, and `--help` says so.

### Dependencies for 1d

None expected. If one seems needed, it must be in TECHNICAL_DESIGN.md section 3; say why in the report.

### Done when

- Items 1 to 5 above, each with fixtures; the `rule-ids.json` contract test lists the new ids.
- The 160 grading cases pass as real tests in 1.0 shapes, and the report lists every case whose expectation changed.
- The 6 `rubric.*` fixtures pass; every rubric rule, fixed and quality, has a fixture that triggers it and one that does not.
- Rubric golden cases pass, the IELTS rounding edges and the three worked examples included.
- `grades-v2`: for each mode a valid file, and one fixture per validation error and per warning; a `grades-v1` file and a 0.x results file are refused.
- `quiz grade` tests: one file and several, Markdown and `--json`, `--grades` with a partly graded file (the rest pending), a hash mismatch (exit 1), `--web` (exit 2), a survey (no score), and a `vi` report (headings from the catalog). Running twice gives byte-identical output.
- `npm run check` passes.
- The report proposes, for the design docs: `AttemptState`, the `results-v2` schema with every answer shape, and anything else the docs left open.

## Slice 1e: contract tests, which close step 1

1d is reviewed (commits `402bb97` to `9c350a3`, follow-ups `869db1d` to `49dba98`). Its proposals and gaps are settled in the design docs (2026-10-28): see the handoff above.

1e adds little new behaviour. It pins what `check`, `rules`, `grade` and `ids` do, as seen from outside, so that step 2 cannot change it by accident. Read first, beyond the usual: TECHNICAL_DESIGN.md section 11 (Testing) and section 7 (the budgets table); COMMANDS.md Conventions (exit codes, common options, "Several files", Files) and the four commands in full.

### Golden files

- **Layout:** `test/golden/<command>/<case>/` holding `cmd.txt` (the arguments, one per line, paths relative to the case's input folder), the inputs (or a pointer to an example or fixture), and the expected `stdout.txt`, `stderr.txt`, `exit.txt` and every file the command writes. One runner test finds every case folder and runs it.
- **They run the built bundle** (`node dist/cli.js`) as a subprocess, as TECHNICAL_DESIGN.md section 11 says, with a temporary copy of the inputs as the working directory, `NO_COLOR` set, no terminal, and `FULLMARK_CONFIG` pointing at a file inside the case (or at a missing one), so the owner's real config is never read.
- **Normalisation, the only one allowed:** the temporary folder's path becomes `<dir>`, and Windows backslashes in paths become `/`. Nothing else is masked: no timestamps or random values may appear in this output (`ids` is the exception, see below). If anything else differs between two runs, it is a determinism bug to fix, not to mask.
- **Updating:** `npm run golden:update` (an environment variable read by the runner) rewrites the expected files; a plain run only compares. A changed golden file is a reviewed diff in its own commit.
- **Paths in output:** COMMANDS.md does not say how a path is printed. Today `grade --json` prints its input path with `/` and the files it wrote with `\` in one line. Make it consistent: a path is printed relative to the working directory when it lies under it, else absolute, always with `/`. Report this as a proposal.

### The cases

For each of `check`, `rules`, `grade` and `ids`: every option of COMMANDS.md, every exit code it lists, human output and `--json`. At least:

- **Several files:** three quizzes of which one is broken, for `check` and `ids` (exit 1, three JSON lines then the summary line, the human summary `2 done, 1 failed`); globs, repeated names dropped, a folder refused; an option that names one thing (`--grades`, `--review`) with several inputs (exit 2); `-o` as a folder for `grade`.
- **Exit codes:** each command's `0`, `1` and `2` paths, and `3` wherever a command can return it (none of these four should; say so if one does).
- **`check`:** every example under its profile (exit 0); a broken fixture per rule family; `--strict`; `--profile` unknown (exit 2, plain message); a `fullmark.toml` with an error (exit 2, `file:line`); a quiz beside a `brief.yaml` it does not match; `--review` (exit 2, not available yet).
- **`rules`:** no arguments; one fixed, one quality and one custom rule; `--for FILE` showing where values came from; `--profile exam`; an unknown rule (exit 2).
- **`grade`:** Markdown and `--json` reports for an attempt on an example with every auto-graded type; the grades template; `--grades` filled in for each rubric mode, a partly graded file, and an invalid one (exit 1, every problem listed); a hash mismatch; a survey; a `vi` quiz (headings from the catalog, `2,5` read as 2.5); `--web` (exit 2).
- **`ids`:** a quiz missing ids is the one place random values appear. Run it with a fixed seed through a test-only environment variable (`FULLMARK_TEST_SEED`, read only in `src/cli`, and documented in the code as test-only), so the golden file is stable; plus `--dry-run`, an `unchanged` second run, and a CRLF file.
- **Top level:** `--version`, `--help`, `--acknowledgements` if it exists yet (if not, report it), an unknown command (exit 2).

### Determinism

Every case runs twice in the runner and must give byte-identical output and files. Grader cases from section 11 that 1d did not add: Unicode (NFD answers, full-width digits if the number reader accepts them, a BOM at the start of a results file) and `2,5` in both an `en` and a `vi` quiz.

### The startup budget

TECHNICAL_DESIGN.md section 7: `quiz --version` and `check` on a small quiz under 150 ms on the Windows laptop. A test runs each 7 times through `node dist/cli.js`, takes the median and fails above the limit. Print the measured medians in the report. If the budget fails, find where the time goes (imports at startup, most likely) and fix it in `src/cli` by loading heavy modules only in the commands that need them; report what was done.

### A final pass over COMMANDS.md

Make a table, in the report, of every promise COMMANDS.md makes about `check`, `rules`, `grade` and `ids` (each option, output shape and exit), with the golden case that covers it. A promise with no case gets one. A promise the code does not keep is a bug to fix if the doc is clear, or a gap to report if it is not.

### Done when

- The step's done criteria (Goal, above) hold: every example passes `check`; the grading cases pass; `check`, `rules`, `grade` and `ids` match reviewed golden files for one file and for several, including three quizzes of which one is broken.
- Every case gives the same bytes twice.
- The startup budget test passes, with its medians in the report.
- The COMMANDS.md promise table has a case for every row.
- `npm run check` passes.
