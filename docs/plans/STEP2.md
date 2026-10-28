# Step 2: the page

## Handoff (2026-10-28): start here

A new session picks up from this section alone; it needs no earlier chat.

### How the work runs

As in step 1 ([STEP1.md](STEP1.md), Handoff): Opus writes a slice's full brief here, commits it, and hands it to **one Sonnet subagent**; Sonnet implements and commits on branch `1.0` (never pushes) and reports; Opus reviews and brings every gap to the owner with a recommendation; the owner decides; the decisions go into `docs/design/` and become the next brief's first tasks. Commit after every round.

New in step 2: **a slice is sized to fit one Sonnet session** (about the work of slice 1f, some 150k tokens), and the brief is written to keep that session small (see "Rules for every slice"). From 2d on, the owner's review is in the browser: the slice ends with screenshots to compare against the Design canvas (<https://claude.ai/artifact/HPX2k7wM7ENHVQLc3zzjL5>; read it back before relying on it).

### Where it stands

| Slice | State | Commits |
|---|---|---|
| 2a foundation | done, reviewed, gaps decided | `ef9bac7`..`963a180` |
| 2b the simple types | done by Sonnet, **review not started** | `868cf82`, `97a6f6e`, `47aca74` |

Step 1 is done (see [STEP1.md](STEP1.md)): `check`, `rules`, `grade` and `ids`, 1309 tests.

**2a's review (2026-10-28).** `npm run check` passes: 42 files, 1341 vitest tests, 2 startup tests, 2 Playwright tests. The runtime is 24.2 KB gzipped (budget 60; `dist/page.js` 67 KB raw, `dist/page.css` 2.6 KB). Sonnet's own report was not kept, so the gaps below come from the review. Found:

- **Bug:** `scriptJson` in `src/build/page.ts` writes `"\u003c"` (and `"\u2028"`, `"\u2029"`) as TypeScript string escapes, which are the characters themselves, so nothing is escaped. A quiz whose title holds `</script>` ends the data block early and breaks the page (tried by hand). Fixed in 2b, task 1.
- **Housekeeping:** `test-results/.last-run.json` (Playwright's output) was committed and is not ignored.
- **Proposal from 2a:** the export is named `<quiz id>-results-YYYYMMDD-HHMMSS.json`, the stamp in the learner's local time.
- **Done differently:** the answer shapes moved from `zod` to `zod/mini` (the same package; the full one added 110 KB gzipped to the runtime). Same shapes and messages.
- **Not in any slice:** `shuffle_questions` and `shuffle_choices` (the page's plan is made at build without a seed, so it never shuffles), and `feedback: instant` (a Check button per question).

**Decided by the owner on 2026-10-28**, and written into the design docs (TECHNICAL_DESIGN.md sections 3, 4 "Seeds" and "`results-v2`", 8 "Results" and "Printable paper"; COMMANDS.md `quiz build --seed` and the file table):

1. The export is named `<quiz id>-results-YYYYMMDD-HHMMSS.json`, local time.
2. `zod/mini` for code bundled into the page.
3. Shuffling arrives in **2d**: the page draws a random seed at Start and records it with the order it produced; replay reads the record and never shuffles again.
4. `feedback: instant` arrives in **2e**.
5. A `short` question with only `patterns` shows its result and no accepted answer.
6. **Mã đề:** `build --print --seed S` prints `S` (1 to 8 letters or digits) as the paper's code, "Mã đề" or "Paper code", in the header, the footer, the key, and a box on the answer sheet. Slice 2k.
7. **Default seed:** without a seed, the seed is the quiz's short version (the first 4 hex characters of `quizHash`). `ordering` and `matching` are always scrambled, so they are never shown in the right order; questions and choices stay in source order unless asked. Lands in 2b's task 1, before 2c brings `ordering`.

**2b's report (Sonnet, 2026-10-28), not yet reviewed.** `npm run check` passes: 43 files, 1356 vitest tests, 2 startup tests, 5 Playwright tests; axe clean; the runtime is 26.6 KB gzipped. Commits: `868cf82` (2a's fixes: `scriptJson` escapes, `test-results/` ignored, the default seed), `97a6f6e` (the seven types with tests and goldens), `47aca74` (Playwright and axe for them; the blanks prompt owned by its body). The gaps Sonnet reported, for the review to judge:

1. `PlanRequest` gained an optional `quizHash`.
2. A bad seed throws `PlanError`; the CLI's exit 2 for it is not wired.
3. A bank draw still needs an explicit seed.
4. A `numeric` flag on fields, and `data-numeric` on blanks.
5. `PageQuiz` gained `lang`.
6. Blanks are cut on markdown-it tokens; `scanBlanks` returns `at`.
7. "Your answer" and "Correct answer" text badges, on `single` too.
8. `data-earned` and `data-points` on results.
9. New catalog strings (`answerLabel` unused).
10. `rel_tolerance` shown as "± 1%"; `tolerance: 1%` is a parse error.
11. The `vi` export was not run through `quiz grade`.
12. Files read beyond the brief's list.

**Materials and the sidebar, decided by the owner on 2026-10-28** on the Design canvas (the boards "Interactive: one sidebar…", "Sidebar A, tabs…", "Sidebar B, stacked…", "Focus mode…", "Phone…", "Results after Submit…", "Replay…" and "Printable paper: materials page…"), and written into the design docs (TECHNICAL_DESIGN.md section 8, rows "Top bar and status line", "Sidebar", "Question map", "Materials", "Focus mode", "Results", and "Printable paper"; section 5's rule table; QUIZ_SYNTAX.md sections 2, 8a, 10 and 11; COMMANDS.md `build --materials` and `--focus`; [proposals/reference-sheet.md](../design/proposals/reference-sheet.md) marked adopted):

1. **Materials are in v1, quiz-level only:** `materials:` in the front matter (the reserved `reference` is dropped), a list of Markdown sheets inside the quiz folder, rendered at build, covered by the quiz hash. Rules `materials.missing` and `materials.question` (errors), `materials.empty` (warning). Available on the start screen, while answering, in review and in replay; opening one is not recorded. Printed on a page after the last question and before the key; `--materials none` leaves it out. The guide warns that a sheet can give answers away.
2. **The side panel is retired.** A top bar with a status line (time, the part's time, the current question, progress with its bar, flags; after Submit the submitted time, what was taken and the time used). "Chrome docks to the edges, content floats as cards."
3. **One docked sidebar**, flush right, opened by one button, "Questions & materials" (or "Questions" without materials), at the last tab; `Q`, `M`, `Esc`. **Hybrid:** stacked while answering (the map over the materials, 40% wide), tabs after Submit and in replay (results map | materials). On a phone it takes the screen.
4. **The question map while answering** is a 35/65 master and detail: parts listed with completion rings (a filled disc with a cut-out tick when done) and a flag dot in the corner; the chosen part's counts and grid on the right.
5. **Focus mode** is fullscreen with the sidebar closed, the clock in the status line. "Hide panel", `P` and the collapsed bar are gone.

Open, to settle in the materials slice's brief: with `reference` no longer reserved, `syntax.reserved` has nothing left to raise (`::: passage` layout renders in place). Recommendation: retire the rule, so `reference:` is `syntax.unknown-key` like any other unknown key.

Also raised on 2026-10-28 and kept outside v1: [proposals/rapid-response.md](../design/proposals/rapid-response.md) (one question at a time, keyboard answering).

### Next steps, in order

1. **Review 2b** in a fresh session: read the three commits' diffs and the goldens, judge the 12 gaps above, bring each to the owner with a recommendation, and write the decisions into the design docs.
2. Write 2c's brief from the review's decisions, then delegate it.
3. Then 2c2 (materials in the parser and `check`), whose brief settles `syntax.reserved`.

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
| **2c2** | Materials in the core: the `materials` key, reading and hashing the sheets, `materials.missing`, `materials.question`, `materials.empty`, the IR field the page and print read; `reference` no longer reserved |
| **2d** | Start screen and part picker, sections and `pick`, shuffling with a seed drawn at Start, the timer, autosave and resume, storage blocked; Playwright adds Firefox here, for its isolated `file://` storage (foundation 2) and one full answer-submit-export run |
| **2e** | Results card (asterisks, goal line), review filter, Retry missed, `feedback: instant` |
| **2f** | The top bar and its status line, the docked sidebar (one button, `Q`/`M`/`Esc`, stacked while answering, tabs after Submit, full screen on a phone), the question map with rings and flags, the materials in the sidebar, Focus mode |
| **2g** | Themes: five token sets, the light/dark toggle, `look: locked`, the contrast test |
| **2h** | Fonts: four fonts, `--fonts`, the Vietnamese glyph test, screenshot baselines |
| **2i** | `build` across the CLI: several files, `--build-file`, `-o`, `--strict`, `--open`, `--json`, `build.size`, `--ui-lang` and the `vi` chrome scan, `--acknowledgements` and the page's licence comment, the 300-question budget, golden files |
| **2j** | `replay` |
| **2k** | The printable paper: `--print`, `--answers`, `--answer-sheet`, `--seed` and the mã đề, the materials page and `--materials none` |

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

## Slice 2b: the simple types

`multi`, `truefalse`, `short`, `numeric`, `blanks`, `fields` and `scale` on 2a's architecture: each answered in the page, graded by the one grader, shown in review, and exported. The test that matters stays 2a's: **for every question, the status and points the page shows equal what `quiz grade` gives for the exported file.** After 2b, `examples/exam` builds.

### Read first

- This brief, and 2a's review above.
- QUIZ_SYNTAX.md section 6: "single and multi", "truefalse", "numeric", "short", "blanks", "fields", "scale"; section 7 (ungraded questions) only for what an ungraded question shows.
- TECHNICAL_DESIGN.md section 4 "`results-v2`" (the answer table); section 8 "New UI for the v1 features", the row "Results (after Submit)" only for what a question shows after Submit (the results card itself is 2e).
- Code: `src/page/` (all of it, it is small), `src/build/page.ts`, `src/build/render.ts`, `src/core/attempt/answers.ts`, `src/core/grade/types.ts` (`GradedQuestion` and its `results`), `src/core/number.ts` (`readNumber`), `src/core/parse/blanks.ts` and the place in `src/core/parse/question.ts` that calls `scanBlanks`, `src/core/i18n/en.ts` and `vi.ts` (the `page` block), `e2e/single.spec.ts`, `test/build/page.test.ts`.

### Decided for this slice

- **One component per type**, in `src/page/questions/`, chosen by a table keyed on the type. The card around them (number, points, prompt, hint, result line, explanation) is one shared component, taken out of 2a's `SingleQuestion`. `single` and `multi` share the choice list (radio or checkbox; `{input}` on any picked choice).
- **Page data is a union on `type`.** Each type carries only what the learner may see: `multi` its choices; `truefalse` nothing more; `numeric` its `unit`; `short` nothing more; `blanks` the prompt with its blanks cut out (below) and the blank count; `fields` each field's label (HTML) and whether it is graded; `scale` `min`, `max` and the labels. Every key (`value`, `values`, tolerances, `accept`, `patterns`, blank answers, field keys, `[x]`) is only in the key blob, as in 2a.
- **Blanks in the page.** At build, the prompt's blanks are found with the parser's own `scanBlanks` (extended to return each blank's start and end offset; never a second regex), in the same regions the parser scans (body, fenced code, heading), and each is replaced by an `<input>` written into the prompt HTML (`class="fm-blank" data-blank="N"`, an `aria-label` "Blank N"). The number found must equal `q.blanks.length`, or build throws. The component reads them by event delegation on the prompt and sets their value, `disabled` and result after Submit from an effect; Preact does not render inside that HTML.
- **Inputs.** Text boxes are `type="text"` (a numeric answer may be `1/3` or `1e-3`), with `autocomplete="off"` and `spellcheck="false"`. `truefalse` is two radios, True then False, in the UI language. `scale` is one radio row from `min` to `max`, each label under its value.
- **What the page stores** is exactly the answer table of section 4. Clearing every box of a question, or a `multi` with nothing ticked, stores `null` (unanswered). `blanks` and `fields` store one text per box, `""` for an empty one. The page never decides a status itself: every status, point and per-blank or per-field result on screen comes from `grade`.
- **The comma warning.** In a quiz with `lang: en`, a numeric box (a `numeric` question, a numeric blank or a numeric field) that holds a comma shows at once, under the box, "Use a point for decimals: 2.5, not 2,5" (and the `vi` catalog's wording when `ui_lang: vi`). It never changes what is stored. With `lang: vi` there is no warning; `2,5` is read as 2.5 by the grader. The rule follows `lang`, never `ui_lang`.
- **After Submit,** each question shows 2a's result line, then: `multi` marks "Your answer" and "Correct answer" on the choices as `single` does; `truefalse` marks the right one; `numeric` shows the learner's text beside the accepted value with its tolerance and unit as `value ± tolerance` ("−2 ± 0.01"), `value ± 1%` for a relative tolerance, the value alone when the tolerance is 0, several `values` joined with "or"; `short` shows the first `accept` entry (none when it has only `patterns`; owner's point 5); each blank and each graded field gets its own mark (correct or wrong) and, when wrong, the first accepted answer or the value with its tolerance. `scale` and ungraded fields show only the learner's answer. The words are in both catalogs.
- **Still refused** with 2a's exit 2: `ordering`, `matching`, `essay`, `code`.

### Tasks

1. **2a's fixes first, one commit:** `scriptJson` escapes `<`, U+2028 and U+2029 as the six characters `\u003c`, `\u2028`, `\u2029` (write them as `"\u003c"` in the source), with a test that a title, a prompt and a choice holding `</script>` build a page whose data block parses back to the same text; add `test-results/` to `.gitignore` and remove it from git. Read section 4's "Seeds" bullet and make `planFor` follow it: with no seed given, use the quiz's short version, so `ordering` and `matching` always get an `optionOrder` and choices and questions shuffle only when asked; reject a seed that is not 1 to 8 letters or digits. Update the plan tests and any golden files this moves (report the count). The page's plan, made at build, then carries the short version as its seed.
2. **`src/build`:** page data for the seven types, the blank cutting, the key blob for every type (`keyOf` strips what the page shows: prompts, choice text, labels, explanations, as now).
3. **`src/page`:** the shared card, the seven components, the comma warning, the review display above, the new strings in `en` and `vi`.
4. **Tests in vitest:** for each type, the page data holds no part of its key (search the built page's text for every accepted text, number as written and blank answer of a fixture, and check the data block against the union's exact keys); blanks found in the heading, the body and fenced code, and skipped in inline code, with the count check; the comma warning's rule (en and vi, `numeric`, blank, field); a `vi` quiz's `2,5` scores right through the page's grader.
5. **Playwright:** a fixture with every 2b type plus one `single`, answered with right, wrong, partly right (`multi`, `blanks`, `fields`) and empty answers, submitted and exported: `quiz grade` on the file gives the same status and points for every question, and the same total, as the page shows. `examples/exam` built, answered in part, the same comparison. A `vi` fixture: `2,5` right, no comma warning; the `en` fixture shows it. Add axe-core (`@axe-core/playwright` and `axe-core`, pinned) and run it on the fixture page after Start and after Submit; it must report no violations.
6. **Golden files:** `test/golden/build/` gets one page with every 2b type (with `--built-at`); `other-type` now uses a quiz with `ordering` (still exit 2).

### Done when

- Every task above has its tests; `npm run check` passes, Playwright and axe included; `examples/exam` builds.
- Report: the runtime's gzipped size, test counts, every gap, and what the review display looks like for each type (one line each; screenshots are not needed until 2d).
