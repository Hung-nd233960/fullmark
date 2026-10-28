# Step 2: the page

## Handoff (2026-10-28): start here

A new session picks up from this section alone; it needs no earlier chat.

### How the work runs

As in step 1 ([STEP1.md](STEP1.md), Handoff): Opus writes a slice's full brief here, commits it, and hands it to **one Sonnet subagent**; Sonnet implements and commits on branch `1.0` (never pushes) and reports; Opus reviews and brings every gap to the owner with a recommendation; the owner decides; the decisions go into `docs/design/` and become the next brief's first tasks. Commit after every round.

New in step 2: **a slice is sized to fit one Sonnet session** (about the work of slice 1f, some 150k tokens), and the brief is written to keep that session small (see "Rules for every slice"). From 2d on, the owner's review is in the browser: the slice ends with screenshots to compare against the Design canvas (<https://claude.ai/artifact/HPX2k7wM7ENHVQLc3zzjL5>; read it back before relying on it).

### Where it stands

| Slice | State | Commits |
|---|---|---|
| 2a foundation | brief written | |

Step 1 is done (see [STEP1.md](STEP1.md)): `check`, `rules`, `grade` and `ids`, 1309 tests.

### Next steps, in order

1. Delegate 2a, then review it.

## Goal

`build` and the page: every question type answered in an offline page that grades itself exactly as `quiz grade` does; the start screen, parts, timer, resume, results, review and retry; five themes and four fonts; `replay`; the printable paper. TECHNICAL_DESIGN.md section 12, step 2.

**Done when** (section 12): all examples build; three quizzes, one broken, give two pages and exit 1, through files and through a build file; Playwright and axe pass; screenshot baselines reviewed and committed; a replayed page matches the original submitted page; a `vi` example passes the same tests.

**Not in step 2:** `build --watch` and `--serve`, and everything else that needs the one-shot server (step 3). The page only exposes the attach point (ready, progress, submit) that step 3's server module hooks into.

## Rules for every slice

Step 1's rules hold ([STEP1.md](STEP1.md), "Rules for every slice"): the design docs win over this plan, and a gap is reported, not invented; TypeScript strict, npm, dependencies only from TECHNICAL_DESIGN.md section 3, pinned exactly; `src/core` imports no `node:*`; determinism; every behaviour tested; small commits on `1.0` ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; never push. Added for step 2, to keep a session small:

- **Read only what the brief names.** Each brief lists the doc sections (by heading or table row) and the source files to work in. Do not read whole design docs or explore the codebase beyond them; if something else is needed, read that one part and say so in the report.
- **Run the slice's own tests while working**, and `npm run check` once at the end. Do not print full test or build output; filter it (failures and the summary).
- **Golden and screenshot updates are reported as a count and a one-line summary each**, not as diffs. Opus reads the diffs in review.
- **If the slice turns out bigger than planned,** stop at a clean commit and report what is left, rather than carry on with a full context.
- **Report:** commits (hashes, one line each), test counts, every gap in the design docs, anything decided differently and why, and for 2d onward the screenshot paths for the owner.

## Slices

| Slice | Content |
|---|---|
| **2a** | Foundation: the page build, the Attempt reducer, `single` only, Submit and Export, `build FILE`, determinism, the CSP, the runtime budget, the two-quiz seam, Playwright |
| **2b** | `multi`, `truefalse`, `short`, `numeric`, `blanks`, `fields`, `scale` |
| **2c** | `ordering`, `matching`, `essay`, `code`; maths (KaTeX) and code highlighting (Shiki) in question text |
| **2d** | Start screen and part picker, sections and `pick`, the timer, autosave and resume, storage blocked |
| **2e** | Results card (asterisks, goal line), review filter, Retry missed |
| **2f** | Question map and flags, the collapsible panel, Focus mode |
| **2g** | Themes: five token sets, the light/dark toggle, `look: locked`, the contrast test |
| **2h** | Fonts: four fonts, `--fonts`, the Vietnamese glyph test, screenshot baselines |
| **2i** | `build` across the CLI: several files, `--build-file`, `-o`, `--strict`, `--open`, `--json`, `build.size`, `--ui-lang` and the `vi` chrome scan, `--acknowledgements` and the page's licence comment, the 300-question budget, golden files |
| **2j** | `replay` |
| **2k** | The printable paper: `--print`, `--answers`, `--answer-sheet`, `--seed` |

Later briefs stay outlines until the slice before is reviewed.

## Slice 2a: the foundation

One question type from source to graded export, on the architecture every later slice extends. The test that matters: **the score the page shows equals the score `quiz grade` gives for the file the page exported.**

### Read first

- TECHNICAL_DESIGN.md: section 3 (the stack table, rows Page UI, Bundling, Tests); section 4 "Plan and Attempt" and "`results-v2`" (the `single` row of the answer table); section 7 the `src/` layout, foundations 2, 3 (the CSP bullet), 5, 7 and 9, the Budgets table, and "Seams for later features" (points 1, 2, 3 and 5); section 8 "Start from 0.x's look, build it fresh"; section 11.
- COMMANDS.md: `quiz build` (the table rows `FILE`, `-o`, `--built-at`, and Exit) and Conventions.
- QUIZ_SYNTAX.md: the `single` type only.
- Code: `src/core/attempt`, `src/core/plan`, `src/core/grade` (their public functions only), `src/cli/main.ts`, `src/cli/check.ts` (how a command is wired, `checkFile`), `src/cli/atomic.ts`, `tsup.config.ts`, `test/golden/runner.ts`.

### Decided for this slice (architecture the design leaves to the build)

- **Where the runtime comes from.** `npm run build` bundles `src/page/main.tsx` with esbuild into one minified IIFE, `dist/page.js`, and the page CSS (`src/page/styles/*.css`, concatenated in a fixed order) into `dist/page.css`. `quiz build` reads both from beside `dist/cli.js`, only when it runs, so startup does not grow. Add `preact`, `@preact/signals`, `preact-render-to-string` and `esbuild` (the version tsup already uses), pinned exactly.
- **The page.** One HTML file: a `<meta>` CSP, the CSS inline, the pre-rendered HTML, a `<script type="application/json" id="fm-data">` holding what the page needs, then the runtime inline. Build renders the components in the `start` phase with `preact-render-to-string`; the runtime hydrates the same tree.
- **Data in the page.** The quiz as the page needs it (prompts rendered to HTML at build, choices, points, ids, slugs, `quizHash`), with every answer key and explanation moved into one obfuscated blob: canonical JSON, UTF-8, XOR with the bytes of SHA-256 of `quizHash` repeated, base64. Deterministic; the page decodes it to grade. This is foundation 5's "obfuscated, not secret".
- **One grader.** The page grades with `grade` from `src/core`, bundled into the runtime; no grading code in `src/page`.
- **State.** The runtime holds `Map<QuizId, Attempt>` (seam 2), driven by a reducer in `src/page` (start, answer, submit). Element ids and fragments carry the quiz id (seam 3). `build` takes a list of quizzes internally (seam 1), called with one.
- **The attach point** (foundation 9): the page core emits `ready`, `progress` and `submit` events on one small object; nothing listens in 2a.
- **Export** downloads `results-v2` from `resultsOf(attempt)` through a Blob link, named `<quiz id>-results-<stamp>.json` with the stamp `YYYYMMDD-HHMMSS` in the learner's local time. (The design names the file `*-results-*.json` but not the stamp: report this as a proposal.)
- **Determinism.** `--built-at ISO` is written into one `<meta name="generator">` with the version; without it, `build` uses the current time (read in `src/cli` only). With `--built-at`, two builds are byte-identical. The CSP's `script-src 'sha256-…'` is computed over the inline runtime at build.
- **Look.** Plain hand-written CSS on tokens (`var(--…)`) with one placeholder token set taken from 0.x's light look, in cascade layers. Themes come in 2g; do not build a theme system now.
- **Other types.** A quiz with any type other than `single` is refused: `build` exits 2 with "not available yet: <type> questions arrive in a later slice", as `check --review` does. No placeholder pages.

### Tasks

1. **`src/build`:** IR to HTML as above: prompts and choices through markdown-it (as the parser configures it), images and audio as `data:` URIs, the data block, the key blob, the CSP, the inline runtime and CSS. Pure functions over the IR and the runtime text; file reading stays in `src/cli`.
2. **`src/page`:** the reducer, the components (a question card for `single` with its `{input}` text fields, a Start button, Submit, a result line per question and the total after Submit, Export), hydration, the events.
3. **`quiz build FILE [-o OUT] [--profile P] [--config TOML] [--built-at ISO]`:** checks the quiz as `check` does and writes nothing on errors (exit 1, the issues as `check` prints them); writes atomically; prints `quiz.md: wrote quiz.html`. Several files, `--json` and the other options are 2i; give a plain "not available yet" exit 2 for them.
4. **Playwright:** `@playwright/test` pinned, Chromium only, `npm run test:e2e`, included in `npm run check`. The cases: a `single` quiz built from an example or fixture, answered in the page (one right, one wrong, one with an `{input}`, one left empty), submitted, exported; `quiz grade` on the exported file gives the same earned points, points and per-question status as the page shows. Also: the page makes no network request (block and count them), and works opened from `file://`.
5. **Tests in vitest:** two builds with `--built-at` are byte-identical; the key blob round-trips and the page text holds no answer in plain form; the CSP hash matches the inline script; the runtime is under 60 KB gzipped (the Budgets row), with the measured size printed; a two-quiz page built through the internal API renders both, keeps two Attempts and exports each separately (the seam test, without the server half); the startup test still passes.
6. **Golden files:** `test/golden/build/` with the HTML pages written for one `single` quiz (with `--built-at`), a quiz with check errors (exit 1, nothing written), a quiz with another type (exit 2), and a missing file (exit 2).

### Done when

- Every task above has its tests; `npm run check` passes, Playwright included.
- Report: the runtime's gzipped size, the startup medians, the export file name proposal, and anything the docs left open.
