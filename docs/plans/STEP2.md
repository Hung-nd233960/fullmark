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
| 2b the simple types | done, reviewed, gaps decided | `868cf82`, `97a6f6e`, `47aca74` |
| 2c2 materials in the core | done, reviewed, gaps decided | `94341aa`..`9797716` |
| 2c ordering, matching, essay, code | done, reviewed, gaps decided | `06ab9f3`..`92af933` |

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

**2b's review (2026-10-28).** Playwright passes (5 tests, axe clean). Vitest has 2 failures, both from the design commit `0b527cc`, not from 2b: the doc-against-registry tests find `materials.missing` and `materials.question` in section 8a with no code yet. 2c2 turns them green, so it runs before 2c. Found by hand:

- **A.** A blank in a table cell crashes `build` ("a blanks prompt has 7 blanks in the page but the question has 6", exit 2): the parser does not scan table rows, the page does.
- **B.** A blank in an image's alt text writes an `<input>` inside `alt="…"`; in link text it puts an input inside `<a>`.
- **C.** `\[[x]]` is still a blank, and the page shows a stray `\`.
- **D.** The `numeric` box has `inputmode="decimal"`: the iPhone keypad then has no `−`, `/` or `e`.
- **E.** On a `blanks` question the hint shows above the prompt.
- **F.** An empty blank says "Incorrect" in the per-blank list.

**Decided by the owner on 2026-10-28** (QUIZ_SYNTAX.md "blanks", section 2 "Materials", 8a, 10; TECHNICAL_DESIGN.md section 5's rule table; COMMANDS.md user templates and the library):

1. A: blanks are found in table cells too, by parser and page alike; a `|` between variants in a cell is `\|`. B: a blank in link text or alt text is `blanks.syntax`. C: `\[[` is a literal `[[`. D: no `inputmode`. E: the prompt comes before the hint. F: an empty blank says "No answer".
2. Sonnet's gaps: `quizHash` becomes required in `PlanRequest` (no seedless mode); a bad seed's exit 2 is wired in 2k with `--seed`; a bank draw without a seed uses the short version, as section 4 "Seeds" says; `numeric` on fields, `data-numeric`, `lang` on the page, the token cut, the badges on `single`, `data-earned`/`data-points` and the new strings stay; `answerLabel` is deleted; `tolerance: 1%` stays an error; the `vi` export goes through `quiz grade` in 2c's Playwright; a blank inside Shiki-highlighted code is tested in 2c.
3. Materials: a sheet starts with one `#` heading, its name (`materials.heading`, error), and may use `##` and `###`; `materials.question` no longer counts `##` and now counts a blank `[[…]]`; maths and images are allowed. The quiz's `materials:` list is the only thing that makes a file a sheet (no marker, no flag): sheets are checked through their quiz, at their own path and line, and kept in a subfolder (`materials/`) by convention; `syntax.front-matter` on a file with no front matter adds that a sheet is checked through its quiz. `syntax.reserved` is retired; `reference:` is `syntax.unknown-key`. The name `materials.empty` stays (as `quiz.empty`). Sample questions in fullmark format inside a sheet are kept for later ([proposals/sample-questions.md](../design/proposals/sample-questions.md)); v1 stays strict.

Also raised on 2026-10-28 and kept outside v1: [proposals/rapid-response.md](../design/proposals/rapid-response.md) (one question at a time, keyboard answering).

### Next steps, in order

1. Done: 2b reviewed and decided (above).
2. Done: 2c2. Reviewed on 2026-10-28: `npm run check` passes (45 files, 1419 vitest tests, 2 startup tests, 5 Playwright tests; the startup test missed its 150 ms budget once in Sonnet's run, at 156 ms, and passed on re-run and in review). Tried by hand: a blank in a table cell, `\[[` as text, a blank in alt text, case mismatches for a sheet and a sheet's image, a second `#`, a sheet with no heading, a `- [x]` in a sheet. **Decided by the owner:** sheets allow `##` to `######` (2c2 made `####` and deeper `syntax.heading-level`: fix in 2c); no `:::` containers in a sheet (as built); an empty sheet is `materials.heading` (as built); loading problems stay at the `materials:` line; the key blob may carry the sheet paths; `blanksInLinkText` makes its markdown-it once (2c); Shiki and blanks tested in 2c. Written into QUIZ_SYNTAX.md section 2.
3. **2c split in three** (owner, 2026-10-28): 2c the four types, 2c3 KaTeX and Shiki, 2c4 dragging for `ordering` (after 2f). How the four types are answered is in TECHNICAL_DESIGN.md section 8, row "Answering ordering, matching, essay, code". The blank inside Shiki-highlighted code moves to 2c3.
4. Done: 2c. Reviewed on 2026-10-28: `npm run check` passes (45 files, 1428 vitest tests, 2 startup tests, 8 Playwright tests, axe clean); the runtime is 28.4 KB gzipped; every example builds. The keyboard `ordering` test was flaky (it read the focus before the effect that moves it ran; 1 failure in 5): fixed in review to poll (`92af933`). Sonnet's choices kept: `NotAvailableError` and its exit 2 deleted; `KeyBlob.samples` (sample answers as HTML); page items `{html, label}`; essay and code read-only after Submit; the rubric shown above a `code` box too; the pending line keeps the catalog's "Waiting for a grader". **Decided by the owner** (written into TECHNICAL_DESIGN.md section 8, row "Answering ordering, matching, essay, code"), the first tasks of 2c3:
   - **G.** Unanswered after Submit: an untouched `ordering` marks no item right or wrong, only "belongs at N"; a `matching` pair left at "—" says "No answer" with the right match (as an empty blank). Today both say "Incorrect" on every item.
   - **H.** `pageQuestion` falls back to source order when the plan has no `optionOrder` for an `ordering` or `matching` question, which would show the answer: make it a build error instead (it cannot happen today).
   - **Code reset.** Clearing a `code` box leaves it empty; while it is empty and the question has a `starter`, a "Reset to starter" button under the box puts the starter back (a new string in `en` and `vi`; a Playwright test: clear, reset, the answer is `null` again).
5. **Bad TeX** (owner, 2026-10-28): a maths span KaTeX cannot parse is a new fixed `check` error, `math.syntax`, so `build` never meets it. Written into QUIZ_SYNTAX.md section 8a by 2c3.
6. **Next: delegate 2c3** (brief below) in a fresh session, then review it.

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
| **2c2** | 2b's fixes; materials in the core: the `materials` key, reading and hashing the sheets, `materials.missing`, `materials.heading`, `materials.question`, `materials.empty`, the field the page and print read; `syntax.reserved` retired. Runs before 2c |
| **2c** | `ordering` (↑ and ↓ buttons), `matching`, `essay`, `code`; 2c2's four follow-ups |
| **2c3** | Maths (KaTeX) and code highlighting (Shiki) at build time, in questions and in sheets; CSS and fonts only when used; the startup budget kept |
| **2d** | Start screen and part picker, sections and `pick`, shuffling with a seed drawn at Start, the timer, autosave and resume, storage blocked; Playwright adds Firefox here, for its isolated `file://` storage (foundation 2) and one full answer-submit-export run |
| **2e** | Results card (asterisks, goal line), review filter, Retry missed, `feedback: instant` |
| **2f** | The top bar and its status line, the docked sidebar (one button, `Q`/`M`/`Esc`, stacked while answering, tabs after Submit, full screen on a phone), the question map with rings and flags, the materials in the sidebar, Focus mode |
| **2g** | Themes: five token sets, the light/dark toggle, `look: locked`, the contrast test |
| **2h** | Fonts: four fonts, `--fonts`, the Vietnamese glyph test, screenshot baselines |
| **2i** | `build` across the CLI: several files, `--build-file`, `-o`, `--strict`, `--open`, `--json`, `build.size`, `--ui-lang` and the `vi` chrome scan, `--acknowledgements` and the page's licence comment, the 300-question budget, golden files |
| **2j** | `replay` |
| **2c4** | Dragging for `ordering` (own pointer-event code, mouse and touch, on top of the buttons; no library); decides whether `matching` gets dragging too. After 2f |
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

## Slice 2c2: 2b's fixes, then materials in the core

Two parts, in this order. First 2b's review fixes. Then materials in the core: the parser, `check` and the quiz hash know the sheets; the page and the paper only get a field to read (the sidebar is 2f, the paper 2k). No rendering work: KaTeX in sheets comes with 2c. At the end `npm run check` is green again (it is red now: section 8a lists `materials.missing` and `materials.question`, and the registry does not have them).

### Read first

- This brief, and "2b's review" and its decisions in the Handoff above.
- QUIZ_SYNTAX.md: section 2, the `materials` row and the "Materials" paragraph after the table; section 6 "blanks"; section 8a, the rows `syntax.front-matter`, `materials.*`, `blanks.*`; section 10.
- TECHNICAL_DESIGN.md: section 5's rule table, the row `materials.empty`; the foundation "1. Hashes survive machines" (the quiz hash), and the bullet "Assets and `materials` sheets stay inside the quiz folder".
- Code: `src/core/parse/blanks.ts`, `src/core/parse/question.ts` (the blank scan, from "-- blanks"), `src/core/parse/outline.ts` (the chunks it scans), `src/core/parse/front-matter.ts`, `src/core/ir.ts` (`FrontMatterSchema`, `QuizSchema`), `src/core/hash.ts`, `src/cli/load.ts`, `src/core/rules/fixed.ts`, `src/core/plan/index.ts`, `src/build/render.ts`, `src/build/page.ts`, `src/page/questions/` (Card, Blanks, Numeric), `src/core/i18n/en.ts` and `vi.ts`; the tests next to each, `test/fixtures/invalid/` and its `expected.json`, `test/data/rule-ids.json`.

### Decided for this slice

- **Blanks in tables.** The parser scans table rows (every cell) as markdown chunks, with `\|` read as `|` before `parseBlankBody`, so `[[a\|b]]` has the variants `a` and `b`; the page's cut (on markdown-it's inline tokens) must give the same blanks in the same order. A test checks that parser and page agree on a prompt with a blank in each region: heading, paragraph, list, nested list, quote, table cell, fenced code, indented code.
- **Blanks in link text and alt text** are `blanks.syntax` ("a blank cannot be inside link text or an image's alt text"), at the blank's line. Find them in the parser (the `[` of a link or the `![` of an image around the blank, beside the spans `findSpans` already finds); never a second blanks regex.
- **`\[[`** is text: `scanBlanks` skips a `[[` whose first `[` is escaped by an odd number of backslashes, and the page shows `[[` (markdown-it drops the backslash once nothing cuts it).
- **2b's page fixes:** drop `inputMode` from `Numeric`; the card shows the prompt before the hint for every type (render the blanks prompt in the card's prompt slot and keep the event delegation there, rather than moving the hint); an empty blank's line in the results list says `t.noAnswer` in place of the status; delete `answerLabel` from both catalogs.
- **The plan:** `PlanRequest.quizHash` is required, and the "no hash, no shuffle" branch goes; `source: "bank"` takes an optional `seed`, defaulting to the short version like the others. Update the tests that called `planFor` without a hash.
- **`materials:`** in `FrontMatterSchema`: a list of strings, default `[]`; a value that is not a list of strings, or a path given twice, is `syntax.value`. `reference` goes from the front-matter parser, and `syntax.reserved` from the registry, `rule-ids.json`, the fixtures (`reserved-reference.md` becomes a `syntax.unknown-key` fixture) and the goldens; report the golden count.
- **The core never reads files.** Add `parseSheet(text, path)` in `src/core/parse/` (no `node:*`). It returns the sheet's `name` (the text of its one `#` heading, inline Markdown kept as written), its `source` (the text, unchanged), its asset references (as the quiz parser gives them, same rules), and its issues, each with `file` = the sheet's path and the line in the sheet. It raises `materials.heading` (the first non-blank line is not a `#` heading, or a second `#` heading follows), `materials.question` (a `{type=…}` attribute, a `- [x]` or `- [ ]` choice line, an `answer` fence, or a `[[…]]` blank outside code; the fix: "sample questions in a sheet are not supported yet; write the example as text", see [proposals/sample-questions.md](../design/proposals/sample-questions.md)), `materials.empty` (nothing but blank lines after the heading; a warning, through the registry like the other quality rules), and every Markdown rule section 8 applies to a quiz (raw HTML, `asset.alt`, containers) except the heading level: `##` and `###` are allowed in a sheet.
- **Loading** (`src/cli/load.ts`): for each `materials` path, in order, the same path checks as an asset (`asset.remote`, then `asset.outside`, then `materials.missing` in place of `asset.missing`; a sheet that is not `.md` is `asset.type`), at the quiz's `materials:` line. Then read it, `parseSheet` it, and resolve its assets: a sheet's `![](x.png)` is relative to the sheet's own folder, as Markdown viewers read it, and must still be inside the quiz folder. `LoadedQuiz` gains `sheets: { path: string; name: string; source: string }[]` (empty when there are none, or when any sheet has an error). The quiz hash covers each sheet and each of its assets as foundation 1 says: the path relative to the quiz folder and the SHA-256 of the sheet's **normalised text** (`normaliseText`, as the quiz file) or of the asset's bytes, all referenced files sorted by path. The hash is `null` when a sheet could not be read, as for an asset. Decided by the owner on 2026-10-28, with the sheet-relative paths and the case rule below.
- **Letter case** (owner, 2026-10-28; for assets and sheets alike): a path whose letter case differs from the file on disk is `asset.missing` (`materials.missing` for a sheet), with the fix naming the file as it is ("the file is `Assets/Normal.png`; paths match letter case exactly"). On Windows and macOS the file system ignores case, so compare each segment of the written path with the directory listing (or `realpathSync.native`; plain `realpathSync` may keep the case as written on Windows: test it on this machine). A test on a case-insensitive file system builds a fixture whose path differs only in case and expects the error.
- **The field the page and print read** is `BuildQuiz.sheets`, passed from `LoadedQuiz`; `pageQuizOf` does nothing with it yet. It is not in the key blob.
- **A file with no front matter** (`syntax.front-matter`) gets the `fix` "a materials sheet has no front matter: check the quiz that lists it".

### Tasks

1. **2b's parser fixes** (one commit): blanks in table cells, `\[[`, the link and alt-text error; the parser-and-page agreement test; fixtures in `test/fixtures/invalid/` for the link and alt cases.
2. **2b's page fixes and the plan** (one commit): the page items and the plan changes above; update goldens (report the count).
3. **`materials:` and `syntax.reserved`** (one commit): the front-matter key, the rule's removal everywhere.
4. **`parseSheet`, loading and hashing** (one or two commits): the rules above in the registry (`materials.heading` and `materials.question` fixed errors, `materials.empty` a quality warning, on in `default`), so the doc-against-registry tests pass; a valid fixture quiz with two sheets in `materials/`, one with an image and `$x^2$`; invalid fixtures for each `materials.*` rule and for a sheet outside the folder, a URL and a `.txt`; a hash test (editing a sheet, or an image a sheet uses, changes the quiz hash; a sheet with CRLF line endings or a BOM hashes as the same sheet with LF); a sheet using `../assets/x.png` and one using its own folder's image both resolve.
5. **`check`** reports a sheet's problems at the sheet's path (a golden with `--json` and one without). `quiz ids` never writes to sheets (a test: `ids` on a quiz with sheets leaves the sheet files unchanged).
6. **`examples/exam`** gets a `materials/formulas.md` sheet only if it fits the example; say so in the report.

### Done when

- `npm run check` passes, Playwright included.
- Every rule touched has a fixture; the parser and the page find the same blanks in every region.
- Report: commits, test counts, golden count with one line each, every gap, and what was decided differently and why.

## Slice 2c: ordering, matching, essay and code

The last four question types on 2b's architecture, each answered in the page, graded by the one grader, shown after Submit and exported, plus 2c2's follow-ups first. The test that matters stays 2a's: **for every question, the status and points the page shows equal what `quiz grade` gives for the exported file.** After 2c every type builds; maths and code highlighting are still plain text until 2c3, and `ordering` has no dragging until 2c4.

### Read first

- This brief, and the Handoff's "Next steps" above (2c2's review and the split).
- QUIZ_SYNTAX.md section 6: "ordering", "matching", "essay", "code", "Rubrics" (the paragraph only).
- TECHNICAL_DESIGN.md section 4 "`results-v2`", the answer table rows for `essay`, `ordering`, `matching`, `code` and the paragraph "Indices are source order"; section 6, the rubric table row "Page before submit" and the bullet "`show_rubric`"; section 8, the row "Answering ordering, matching, essay, code"; foundation "5. The answer key is obfuscated, not secret".
- Code: `src/page/questions/` (Card, shared, and one 2b component as a model, e.g. `Fields.tsx`), `src/page/data.ts`, `src/build/page.ts`, `src/core/attempt/answers.ts`, `src/core/grade/types.ts`, `src/core/plan/index.ts` (`optionOrder`), `src/core/ir.ts` (the four types), `src/core/i18n/en.ts` and `vi.ts` (the `page` block), `src/core/parse/sheet.ts` (the heading check), `src/core/parse/blanks.ts` (`blanksInLinkText`), `e2e/types.spec.ts`, `e2e/helpers.ts`, `test/build/types.test.ts`, `test/fixtures/page/types.md` and `types-vi.md`.

### Decided for this slice

- **One component per type**, in `src/page/questions/`, added to the card's table, as in 2b. Native controls only: no new dependency.
- **Page data** (the union in `src/page/data.ts`): `ordering` carries its items' HTML **in the order the page shows them** (`plan.optionOrder`), never in source order; `matching` carries the left items' HTML in source order and the right-hand items' HTML (distractors included) in the shown order; `essay` carries `minWords`, `maxWords` and, when `show_rubric` is true, the rubric's criteria and points as the page shows them; `code` carries `language` and `starter`. `sample_answer` is only in the key blob (as HTML, like an explanation). The plan in the page still holds `optionOrder`, so a reader of the page source can work the order out: that is foundation 5 (obfuscated, not secret), and the page never shows it by accident.
- **Stored answers** are exactly section 4's table, in source indices. `ordering` stores `{order}` (source index at each position) only once the learner has moved an item, `null` before; `matching` stores `{pairs}` with `null` for "—", and `null` for the whole answer when every dropdown is "—"; `essay` stores `{text}`, `null` when empty; `code` stores `{code, language}` with the question's `language`, `null` when the box is empty or exactly `starter`. The page never decides a status: every status and point comes from `grade` (`pending` for an answered essay or code).
- **`ordering`:** a list (`<ol>`), each item with ↑ and ↓ buttons (`aria-label` "Move up: <item text>" and "Move down"; the first item's ↑ and the last's ↓ disabled). After a move the focus stays on the moved item's same button, and a polite live region says "Moved to position N of M". After Submit each item is marked correct or wrong (from `GradedQuestion.results`), and a wrong one says its correct position ("belongs at 2").
- **`matching`:** one `<select>` per left item, labelled by the left item, options "—" then the right-hand items in the shown order. A right-hand item may be picked for two left items (the grader marks the extra one wrong); no item is removed from the other lists. After Submit each pair is marked, with the right match when wrong.
- **`essay`:** a `<textarea>` (spellcheck on: it is prose) with a live count under it, "87 / 120 words minimum", "87 / 300 words maximum", "87 words, 120 to 300", or "87 words" with no target; the count uses the grader's own word-count function so the two never disagree; going past `max_words` shows the count as a warning, never blocks typing or Submit. With `show_rubric`, the rubric's criteria and points sit above the box. After Submit: the result line says "Waiting for a grade" (status `pending`), then "Sample answer" with `sample_answer` when there is one.
- **`code`:** a `<textarea>` with a monospaced font, `spellcheck="false"`, `autocapitalize="off"`, `autocomplete="off"`, filled with `starter`; Tab is never captured. After Submit as for an essay. No highlighting here (2c3).
- **2c2's follow-ups:** a sheet allows `##` to `######` (`src/core/parse/sheet.ts`: only `#` after the first, and nothing deeper than six which Markdown does not have, stay errors); `blanksInLinkText` builds its markdown-it once per module, not per call.
- **Still refused:** none. `test/golden/build/other-type` no longer has a type to refuse: delete the case, and report it.

### Tasks

1. **2c2's follow-ups** (one commit): sheet headings, with a fixture sheet using `####` that passes and a test; `blanksInLinkText`'s renderer made once.
2. **`src/build` and `src/page`** (one commit per type or two): page data, the key blob (`keyOf` strips item, pair and sample text as now), the components, the strings in `en` and `vi` ("Move up", "Move down", "Moved to position N of M", "belongs at N", the word-count lines, "Waiting for a grade", "Sample answer").
3. **Tests in vitest:** the page data per type holds no `sample_answer` and lists `ordering` items in the shown order, never in source order (with a fixture whose shown order differs); the stored-answer rules above (untouched `ordering`, all-"—" `matching`, `code` equal to `starter`, all `null`); the word count equals the grader's on a few texts (hyphens, numbers, Vietnamese).
4. **Playwright:** extend the types fixture (or add one) with each of the four: `ordering` moved into the right order and one moved wrong, `matching` partly right, an essay and a code answer; submit, export, and `quiz grade` on the file gives the same status and points for every question, `pending` for essay and code. Keyboard only for one `ordering` (Tab to a button, Enter, the focus and the live-region text). The `vi` fixture's export also goes through `quiz grade` (2b's gap 11). axe after Start and after Submit, no violations.
5. **Golden files:** the `all-simple-types` page becomes `all-types` (every type); `other-type` removed. Report the count.

### Done when

- `npm run check` passes, Playwright and axe included; every example in `examples/` builds.
- Report: the runtime's gzipped size (budget 60 KB), test counts, golden count with one line each, every gap, what was decided differently and why, and one line per type on what the page shows before and after Submit.

## Slice 2c3: 2c's fixes, then maths and code highlighting

Two parts, in this order. First 2c's review fixes (G, H and the code reset, in the Handoff's "Next steps" item 4). Then maths with KaTeX and code highlighting with Shiki, both at build time, wherever Markdown is rendered: prompts, choices, labels, items, explanations, rubric criteria, sample answers and materials sheets. The page's runtime does not grow: maths and colours are HTML and CSS made at build. The test that matters: **a quiz with no maths and no code pays nothing** (the same page bytes as before this slice, the same startup time), and a quiz with them builds byte-identically twice.

### Read first

- This brief, and the Handoff's "Next steps" items 4 and 5 (2c's review, the owner's decisions G, H, the code reset and `math.syntax`).
- TECHNICAL_DESIGN.md: section 3, the rows "Code highlighting" and "Math" and the paragraph "Licences" (the page comment only); section 7 "Budgets"; section 8, the row "Answering ordering, matching, essay, code", the font bullet "KaTeX fonts are embedded only when the quiz has math", and "How it is built" item 3; foundations "3. Content from others is untrusted" and "7. Output-shaping dependencies are pinned".
- QUIZ_SYNTAX.md: section 8 (the table and the edge cases); section 8a, the `blanks.*` row (to place the new row beside it); section 6 "code" (`language`).
- Code: `src/build/render.ts`, `src/build/page.ts`, `src/core/parse/markdown.ts` (the maths tokens), `src/core/rules/quality.ts` (`KNOWN_LANGUAGES`, `code.unknown-language`), `src/core/rules/fixed.ts`, `src/cli/load.ts`, `src/cli/check.ts`, `tsup.config.ts`, `scripts/build-page.mjs`, `src/page/questions/` (Ordering, Matching, Open), `src/page/styles/20-quiz.css`, `src/core/i18n/en.ts` and `vi.ts`; `test/startup.test.ts`, `test/build/types.test.ts`, `e2e/types.spec.ts`; `test/data/rule-ids.json`, `test/fixtures/invalid/` and its `expected.json`.

### Decided for this slice

- **G (owner, 2026-10-28).** After Submit, an `ordering` the learner never moved marks no item right or wrong: each item shows only "belongs at N", and the result line says "No answer". A `matching` pair left at "—" says `t.noAnswer` in place of "Incorrect", then the right match. Items and pairs the learner did answer are marked as now.
- **H.** `pageQuestion` throws (a bug, so exit 2) when the plan has no `optionOrder` entry of the right length for an `ordering` or `matching` question, instead of falling back to source order. `shownOrder` in `Ordering.tsx` and its twin in `Matching.tsx` do the same. A test calls `pageQuizOf` with the entry removed from the plan and expects the throw.
- **Code reset (owner, 2026-10-28).** While a `code` box is empty and the question has a `starter`, a "Reset to starter" button (`t.resetToStarter`, en and vi) sits under the box; pressing it puts the starter back, stores `null` (the starter is unanswered) and moves the focus into the box. It is not shown before the box is emptied, nor after Submit.
- **`math.syntax` (owner, 2026-10-28), a fixed error.** Every maths span, in the quiz and in its sheets, is parsed by KaTeX (`throwOnError: true`); a span KaTeX rejects is `math.syntax` at the span's line, with KaTeX's message (without its "KaTeX parse error:" prefix) and the fix "check the TeX between the `$` signs". So `build` never meets bad TeX. Add the row to QUIZ_SYNTAX.md section 8a next to the `blanks.*` row, to the registry and `rule-ids.json`, with invalid fixtures (one in a question, one in a sheet).
- **KaTeX loads only for maths.** `src/core` does not import KaTeX: the check receives a `parseTex(tex, display) => string | null` (null when it parses, else the message) from the CLI, which does `await import("katex")` only when the parsed quiz or a sheet has a maths token. A test: `check` on a quiz without maths does not load the module.
- **Rendering maths.** `renderToString` at build, `displayMode` for `$$…$$`, output `htmlAndMathml` (screen readers read the MathML), `throwOnError: true` (check has passed). The page gets KaTeX's CSS with its fonts as WOFF2 `data:` URIs (drop the `woff` and `ttf` sources from the `@font-face` rules), once per page and only when the page has maths; check that the CSP's `font-src data:` and `style-src` allow it. The page records whether it has maths, for 2i's licence comment.
- **Labels with maths.** An item's `label` (ordering's `aria-label`; matching's `<option>`, which cannot hold HTML) keeps a maths span as its TeX source between `$` signs, not KaTeX's text: build `label` from the source, not from the rendered HTML. A test on a matching item `$x^2$`.
- **Highlighting.** Shiki's fine-grained core (`shiki/core`) with the JavaScript regex engine (no WASM), loading only the grammars a quiz uses, each from `KNOWN_LANGUAGES` (the list `code.unknown-language` checks; every name there must have a grammar: report any that don't). Highlighted: every fenced block whose language is in the list, wherever it is (prompts, explanations, choices, sheets), and a `code` question's `sample_answer`. A fence with no language or an unknown one stays plain `<pre><code>`. The `code` answer box is a textarea and stays plain.
- **Colours from CSS variables.** Shiki's CSS-variables theme (`createCssVariablesTheme`, prefix `--fm-code-`), so the HTML holds `var(--fm-code-…)` and no colour literal. Give the variables provisional light and dark values in the page CSS, beside the existing light and dark rules; 2g generates them from the theme tokens. Report the variable names.
- **Blanks in highlighted code** (2b's gap): a `blanks` prompt with a blank inside a fence of a known language still gets its input at the right place, and parser and page agree on the count. The cut markers must survive highlighting. A test with a blank in a `python` fence; the parser-and-page agreement test gains that region.
- **Bundling.** `katex`, `shiki` and the `@shikijs/*` packages it needs are `dependencies`, pinned exactly, and **external** to the CLI bundle (tsup `external`), so the one file stays small and they load from `node_modules` only when used (bundled, they would make the CLI several MB, parsed at every start; the single binary is not v1). Pin the versions `npm view` gives as current and report them. Licences: both MIT.
- **Sheets.** `pageQuizOf` renders each sheet to HTML (maths and code included) into a new `PageQuiz.materials: { name: string; html: string }[]`, in `materials:` order. The page does not show it yet (2f).
- **Budgets.** `test/startup.test.ts` keeps `check` on a small quiz without maths or code under 150 ms. A build test: a quiz without maths or code gives the same page bytes as at the start of the slice (no KaTeX CSS, no font, no Shiki markup; the provisional `--fm-code-` values are the one allowed addition, so compare with them excluded, or say how you compared). Report the page size of the `all-types` golden before and after, and of a quiz with maths.

### Tasks

1. **G, H and the code reset** (one commit): the page changes and their vitest tests; Playwright for each (an untouched `ordering` and an all-"—" `matching` after Submit; clear a code box, Reset, the starter is back and the question is unanswered).
2. **`math.syntax`** (one commit): the rule, the doc row, the injected `parseTex`, the fixtures, the lazy-load test.
3. **Maths in the page** (one commit): the renderer, the CSS and fonts once per page, the labels, the sheets in `PageQuiz.materials`.
4. **Highlighting** (one commit): Shiki, the CSS variables, the sample answer, blanks in highlighted code.
5. **Goldens and examples:** a build golden `maths-and-code` (a prompt with inline and display maths, a choice with maths, a `python` and a `rust` fence, a blank in code, a sheet with maths); update other goldens only where bytes really changed, and say why. Every example in `examples/` builds; Playwright opens `examples/calculus` and `examples/rust` and finds a `.katex` element and a highlighted span, with axe clean.

### Done when

- `npm run check` passes, Playwright and axe included; every example builds; the startup test passes three runs in a row.
- Report: commits, test counts, the runtime's gzipped size (expected unchanged), the pinned versions, page sizes before and after, the golden count with one line each, every gap, what was decided differently and why, and files read beyond the list.
