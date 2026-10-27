# Step 1: the core

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

## Slices 1d and 1e

Outlined above; each gets its full brief here after the previous slice is reviewed.
