# Step 3: the server, the forms and the authoring commands

## Handoff (2026-11-03): start here

A new session picks up from this section alone; it needs no earlier chat.

### How the work runs

As in step 2 ([archive/STEP2.md](archive/STEP2.md), Handoff): Opus writes a slice's full brief here, commits it, and hands it to **one Sonnet subagent**; Sonnet implements and commits on branch `1.0` (never pushes) and reports; Opus reviews and brings every gap to the owner with a recommendation; the owner decides; the decisions go into `docs/design/` and become the next brief's first tasks. Commit after every round. A slice is sized to fit one Sonnet session (about 150k tokens), and its brief names exactly what to read.

### Where it stands

| Slice | State | Commits |
|---|---|---|
| plan | approved (2026-11-03), the slice order with it; every gap so far (G1 to G37) decided | this file |
| 3a the one-shot server and `quiz serve` | done, reviewed, gaps decided | `b9ca8c1`, `730a7ae` |
| 3b 3a's fixes, `--section`, `--focus`, `--autosave` | done, reviewed, gaps decided | `7fa0ba3`..`4a1e0bf` |
| 3c `inspect`, `new`, `template` | done, reviewed, gaps decided | `e71ce68`..`3602a3d` |
| 3d 3c's fixes, `stats` | done, reviewed, gaps decided | `fd466d1`, `2dfd341` |
| 3g 3d's fixes, `brief` through flags | done, reviewed, gaps decided | `27a61a4`..`2e6b449` |
| 3i 3g's fixes, `brief --tui` | done, reviewed, gaps decided | `fb5ed78`..`546ccc0` |
| 3j 3i's fixes, `build --watch` and `--serve` | done, reviewed, gaps decided (G35 built in review) | `4a0835f`..`45fe811` |
| 3v the form boards (on the Design canvas) | `review` boards drafted by Opus and reviewed by the owner (2026-11-04); G38 to G47 decided (2026-11-04); boards and images in `docs/mockup/` `grade --web` and `brief --web` boards after that | |
| 3e G47, the review file, `check --review`, `inspect --review` | done, reviewed, gaps decided (2026-11-04) | `5e9b45c`..`dbcd43e` |
| 3k G51, `quiz review` and its form | done, reviewed, gaps decided (2026-11-04) | `91a8821`..`c326d9f` |
| 3l G50, G56, 3k's fixes, `quiz review --since` | done, reviewed, gaps decided (2026-11-05) | `54214a5`..`4140cf6`, review |
| 3m G63, G64, the stacked sidebar with the materials, and the phone | done, reviewed, gaps decided (2026-11-05) | `182beb3`..`0a68e2d`, review |
| 3n G68, G69 | built by Sonnet (2026-11-06), awaiting review | `d0e44e4`, `50aca61`, docs |
| 3f `grade --web`, 3h `brief --web` | wait for their boards (3v) | |
| 3z acceptance | last | |

Each slice's review, and the owner's decisions on its gaps, are under its own section below (**Review**); every gap, G1 to G69, is in "Gaps", in number order.

Step 2 is closed ([archive/STEP2.md](archive/STEP2.md), item 75): every "Done when" criterion passes in Chromium and Firefox; Vitest 2059 of 2059, the 2 startup tests, Playwright and axe. What step 3 inherits:

- **The attach point is built:** `src/page/events.ts` emits `ready`, `progress` (on every autosave) and `submit`; `src/page/main.tsx` exposes it as `window.fullmark.events`. Nothing listens yet.
- **`PageData.focus`** (`src/page/data.ts`) already ticks the start screen's Focus mode box; `build` never sets it. `serve --focus` sets it.
- **`buildPage(quizzes[], options)`** (`src/build/page.ts`) writes the page and its CSP (no `connect-src`). The served copy needs a second script hash and `connect-src 'self'`.
- **Stubs that say "not available yet"**, to be replaced: `check --review` (`src/cli/check.ts`), `grade --web` and `--name` (`src/cli/grade.ts`, `src/cli/main.ts`), `build --watch`, `--serve`, `--port` (`src/cli/build.ts`, `src/cli/main.ts`). *Still stubs after 3e:* `grade --web` and `--name` (3f), `brief --web` (3h).
- **`brief.yaml` is read with no defaults** ([archive/STEP1.md](archive/STEP1.md), item 1 of 1f): every key is required; the defaults belong to `quiz brief`, which writes them. `src/core/rules/brief-read.ts` and `BriefSchema` in `src/core/ir.ts` are the reader.
- **Templates:** only `templates/blank/` exists; the other six built-in names (`calculus`, `rust`, `ielts`, `medical`, `exam`, `survey`) exist as `examples/`.

### Next steps, in order

1. **The form boards on the Design canvas** (3v, G7), as 2v did for the page: every slice left (3e, 3f, 3h) waits for them. The `review` boards are done: reviewed, G38 to G47 decided and in COMMANDS.md, the sources copied into `docs/mockup/boards/`. Their images are in `docs/mockup/images/Review*.png` (the owner's export, scaled to board size). 3e is cut in three (3e the file and the checks, 3k the form, 3l `--since` and the phone), and **3e is built and reviewed** ("Slice 3e", its Review): G50 and G51 decided (3l's and 3k's first tasks). **3k is built and reviewed** ("Slice 3k", its Review, at the end): G56 and G57 decided as recommended. **3l's brief is approved** ("Slice 3l", at the end), with G58 to G62 decided as recommended, and handed to Sonnet; the stacked sidebar and the phone moved to a new 3m (G58), whose brief follows 3l's review. **3l is built and reviewed** ("Slice 3l", its Review): G63 and G64 decided as recommended; **3m's brief is approved** ("Slice 3m", at the end), with G65 to G67 decided as recommended; **3m is built and reviewed** ("Slice 3m", its Review), which closes the `review` boards; G68 and G69 decided as recommended, and made a slice of their own, **3n** ("Slice 3n", at the end), built before the boards since they wait on none. Next: the `grade --web` boards, then the `brief --web` ones, drafted on the Design canvas as the `review` ones were.

### Open proposals carried over from step 2

- [build-log.md](../design/proposals/build-log.md): stays a proposal, not in step 3. `build --watch --json` already gives one line per rebuild, which is all v1 promises.
- [print-pdf.md](../design/proposals/print-pdf.md) (raised in 2k's review, written in 3j's): stays a proposal, out of v1.
- [TODO.md](../design/TODO.md)'s only item (1.0 and 0.x share `config.toml`) is due before step 4, not here.

## Goal

The one-shot server and everything on it, plus the authoring commands that need no server. TECHNICAL_DESIGN.md section 12, step 3: `serve` (with `--section`), `review`, `grade --web`, `brief` (flags, `--web`, `--tui`), `stats`, `inspect`, `new`, `build --watch`.

**Done when** (section 12): contract tests pass for each command; the same answers through flags, `--web` and `--tui` write byte-identical `brief.yaml` files. **And** (from foundations 4 and 9, section 11): the server rejects a wrong token, `Host` or `Origin`; a `build` page is byte-identical with and without the server features and contains no server code; the two-quiz server seam test passes; every new form passes axe in both themes and has a `vi` scan; `npm run samples` gains a line for each served command, and the owner has tried them by hand.

**Not in step 3:** `library take` and the rest of the library (step 4; the server supports it through `--timeout 0` and the quiz-keyed predicate, nothing more); `--background` ([proposals/background-serve.md](../design/proposals/background-serve.md); the `listening` line is its seam, built here); `quiz guide` and `agent-guide` (not in section 12's step 3; see G4); build logs.

## Rules for every slice

Step 2's rules hold ([archive/STEP2.md](archive/STEP2.md), "Rules for every slice"), including item 73's rule on environmental failures: a failure is environmental only when its cause is shown, and a golden is never reverted to hide a difference. Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; never push. Added for step 3:

- **No real network in unit tests.** The server binds 127.0.0.1 on port `0` in tests and is driven with `fetch`; the page side is tested in Playwright against a served page. No test waits on a real timeout: the clock and the timeout are injected.
- **Every served command is tested as a subprocess**: started with `--json`, its `listening` line read, the page or form driven by Playwright or by a POST, then the exit code, the second JSON line and the written file compared with a golden. A helper for this lives in `e2e/helpers.ts` (3a) and every later slice uses it.
- **Ctrl+C is tested** on Linux by sending SIGINT to the subprocess, and the expected file state (nothing written, or the old file intact) is checked. Windows has no SIGINT for a child; the test says so and skips there by name.
- **A command loads only what it uses** (section 7, Budgets): `serve` and the forms load the page builder; `brief` through flags, `stats`, `inspect` and `new` do not; `@clack/prompts` loads only for `brief --tui`. The startup test gains no new limit, but a test checks that `check` still does not load `src/serve/`.
- **Forms are built from the boards** (from 3e on), as pages were from the mockup: colours, sizes and spacing from the board's source; screens to `docs/screens/<slice>/`, committed.

## Gaps

The design docs left these open, or a slice's review found them. Each needs the owner's yes before the slice that depends on it; the recommendation is written so it can go into the docs as it stands. Once decided, it is written into `docs/design/`, which then wins over the text here.

**G1. The `review-v1` format** and **G2. what `check --review` fails on**: **decided by the owner on 2026-11-03** and written into TECHNICAL_DESIGN.md section 4 ("`review-v1`", with the three rules) and section 5 (the catalogue row), and COMMANDS.md (`quiz check --review`, `quiz review`'s form). In short: entries keyed by question id with the question hash and, for fix and drop, the question's source; the nine reasons shown per verdict as chips after Keep, Fix or Drop is chosen; **The rest is fine** and the Finish dialog record Keep with `assumed`; `review.fix` passes once the question changed or is gone, `review.drop` only once it is gone, `review.unconfirmed` warns on a changed fix until `review --since` judges it again, and `--since` shows the earlier verdict and a diff. Keyboard keys wait for the form board (3v).

**G3. Questions without ids in `review`, `stats` and `grade --web`** (3d, 3e). Reviews and history follow questions by id. **Decided by the owner on 2026-11-03, as recommended**, and written into the design docs. **Recommend:** `review` refuses a quiz with a question without an id (exit 1, "run `quiz ids FILE` first"), so a verdict is never lost; COMMANDS.md's exit list for `review` gains `1` (also for check errors, as `serve` has). `stats` matches questions across versions by id, and by question hash for those without one (counted per version, marked "no id" in the output).

**G4. `quiz template` and the built-in templates** (3c). `new TEMPLATE` reads user templates and names `quiz template list`, but section 12 lists `new` without `template`. **Decided by the owner on 2026-11-03, as recommended**, and written into the design docs. **Recommend:** `template list`, `add` and `rm` come in step 3 with `new` (they share the skeleton code and the template folder), and the seven built-ins are made from `examples/` (`blank` stays as it is). `section 12` gains `template`. `guide` and `agent-guide` stay out (they need the authoring guide's content, a writing task of its own); they go into step 4 or a step of their own, the owner's choice.

**G5. `serve --autosave PROGRESS`** (3b). **Decided by the owner on 2026-11-03, as recommended**, and written into COMMANDS.md. **Recommend:** the file is a `results-v2` document with the attempt's state still `in-progress` (the shape the page already autosaves), written atomically on each `progress` event, at most once a second. On start, a file whose `quizId` and `quizHash` match is handed to the page, which opens on it as a resume (the start screen's resume path, already built in 2d); a file for another version exits 1, naming the version, and is left alone. It is deleted after the results are written. `--autosave` with `--section` keeps the section's plan.

**G6. `build --watch` and `--serve`** (3j). The design says only "rebuild on change; keep the last good page; reload after each rebuild". **Decided by the owner on 2026-11-03, as recommended**, and written into the design docs. **Recommend:** `--watch` watches each `FILE`, the files its quiz hash covers (assets, `materials` and their assets) and the build file, debounced 100 ms; a rebuild that fails prints its errors and keeps the page on disk and in the server. `--serve` is not the one-shot server: it serves the last good page at a token URL until Ctrl+C, with the reload code as its only module (no submit, no autosave); the page learns of a rebuild by Server-Sent Events (`GET /events?token=…`) and reloads. Ctrl+C exits 0 (the user's normal way out), not 2 as for `serve`. `--watch` with `--print` is allowed and rebuilds the paper. `--serve` with several files serves an index of the pages.

**G7. The forms need boards** (3e, 3f, 3h). The Design canvas has none for `review`, `grade --web` or `brief --web`. **Decided by the owner on 2026-11-03:** the boards wait until the owner is ready, and the slices are reordered so only 3e, 3f and 3h wait for them. **Recommend:** the owner draws three boards (and their phone width) before 3e; they reuse the page's tokens, themes and fonts, follow `ui_lang` (`review`, `grade --web`) or `--language` (`brief`), and use the page's question rendering for `review` and `grade --web`. Until then the slices that need no design go first.

**G8. `--json` and the human output of `inspect` and `stats`** (3c, 3d). COMMANDS.md gives `stats`'s top-level keys only and `inspect` none. **Decided by the owner on 2026-11-03 for `inspect`** (3c's brief, written into COMMANDS.md); `stats`' shape comes with 3d's brief. `stats`' shape **decided by the owner on 2026-11-03** (3d's brief, in COMMANDS.md). **Recommend:** the shapes are proposed in each slice's brief and approved by the owner with it, then written into COMMANDS.md before Sonnet starts.

**G9. Interrupted and refused submits** (3a). **Decided by the owner on 2026-11-03, as recommended**, and written into the design docs. **Recommend:** Ctrl+C on a one-shot server prints `{"status": "interrupted"}` as the second `--json` line and exits 2; a POST that fails validation (wrong quiz id, a body that is not a valid attempt for this quiz) gets HTTP 400, the page says "could not save, use Export", and the server keeps waiting. A second submit after the first is never accepted (the server is closing).

**G10. Where the browser module and the forms live in the bundle** (3a). **Decided by the owner on 2026-11-03, as recommended**, and written into the design docs. **Recommend:** `dist/serve.js`, a second esbuild IIFE beside `dist/page.js`, built by `scripts/build-page.mjs` and read by `src/serve/` at run time, so `build` never reads it; its own entry in `scripts/bundles.mjs` and in the notices test. The forms are their own Preact entries (`dist/review.js`, `dist/grade-form.js`, `dist/brief-form.js`) sharing the page's components and styles, each under the 60 KB budget.

**G11. The brief question file** (3g). Section 7 names it as YAML that people write; nothing gives its shape. **Decided by the owner on 2026-11-03, as recommended (YAML)**, and written into COMMANDS.md, `quiz brief`. **Recommend:** `src/brief/questions.yaml`, shipped in the bundle as data, one entry per brief key: `key`, `kind` (`choice`, `multi`, `text`, `number`), `label`, `help`, `choices` with a `hint` each, `min-words` with `example`, `follow-up` (for `other`), `human-only`, `default`, and `section` (the steps of `--tui`); every text in `en` and `vi`. A zod schema checks it in a unit test; the flags' `--help` text, the web form and the TUI all read it, so they cannot drift.

**G12. `@clack/prompts`** (3i). A new runtime dependency, already named in section 3. **Decided by the owner on 2026-11-03, as recommended (with the refinement below).** **Recommend:** pinned exactly, MIT (in the allow-list), listed in `--acknowledgements` and `THIRD_PARTY_NOTICES.md`, loaded only by `brief --tui`, with the byte-identity test driving it through a pseudo-terminal (`node:child_process` with a scripted stdin) rather than a new test dependency. If clack cannot be driven that way, the slice stops and reports. **Refined with 3i's brief:** a pipe is not a terminal, and `--tui` refuses one, so the byte-identity test drives the form in process, through the prompts' `input` and `output` streams (a scripted stream that reports itself as a TTY); one subprocess test runs the real command under `script(1)` for a pseudo-terminal on Linux and Ctrl+C, skipped by name elsewhere. No new test dependency. `@clack/prompts` 1.8.1 (MIT, 2026-09-13) brings `@clack/core`, `sisteransi`, `fast-wrap-ansi`, `fast-string-width` and `fast-string-truncated-width`, all MIT: each pinned through the lock file, checked against the allow-list and listed in the notices.

**G13. A quiz started from a template keeps the template's ids** (3c). A built-in template is an example with a quiz `id` (`rust-basics`) and question ids; `new TEMPLATE` and `new --from FILE` "copy" it, so two quizzes would share a quiz id and question ids, and in step 4's library their histories would mix. **Decided by the owner on 2026-11-03, as recommended**, and written into COMMANDS.md, `quiz new`. **Recommend:** `new` without `--skeleton` copies everything except the identity: the front matter's `id` is removed (it then defaults to the new file's name, slugged) and every question's `id` is removed, and `new` ends by saying "run `quiz ids FILE` to give the questions ids". `--skeleton` already does this (QUIZ_SYNTAX.md, section 9). `template add` stores the quiz as given; the ids are dropped when a quiz is started from it.

**G14. `stats` cannot score an attempt from a results file alone** (3d). A `results-v2` file holds the answers and the version (`quizHash`), but no score and no quiz id, so `stats RESULTS... [--quiz FILE]` can neither grade an attempt on an older version (its key is in a source it is not given) nor tell two quizzes apart, though COMMANDS.md promises "any versions" and exit 2 for different quizzes. The JSON report (`report-v2`, written by `grade --json`) has what is missing: the quiz's id and version, and per question `earned`, `points`, `status`, tags and criteria, graded against the version the attempt was taken on. **Decided by the owner on 2026-11-03, as recommended**, and written into COMMANDS.md, `quiz stats`. **Recommend:** `stats` takes `*-report.json` files, of any version, and also results files whose version matches `--quiz` (graded on the spot, as `grade` would); a results file of another version exits 1 naming it, with the fix "grade it with that version: `quiz grade FILE --quiz OLD.md --json`". Different quiz ids exit 2. In step 4 the library already keeps a report per attempt, so `library stats` reads the same thing.

**G15. `commitment` is missing from the reader** (3g). COMMANDS.md's file table lists `commitment` (from `--commitment`, a number, `0` for none), but `BriefSchema` in `src/core/ir.ts` has no such key, so a brief `quiz brief` writes would be `brief.invalid` to `check`. **Decided by the owner on 2026-11-03, as recommended:** the key is always in the file, the answer never required (`0` is no goal). **Recommend:** add `commitment` (an integer from 0 to 100) to `BriefSchema` and to the brief fixtures, as COMMANDS.md says.

**G16. `--mix`'s default is "per purpose", with no table** (3g). **Decided by the owner on 2026-11-03:** the table below, and the machine config's `[brief.purpose.<purpose>]` tables change a purpose's defaults (`count`, `minutes`, `mix`, `difficulty`, `mode`); briefs fitted to a subject are [proposals/brief-purposes.md](../design/proposals/brief-purposes.md). **Recommend:** `self-study`: `recall`, `understanding`, `calculation`; `exam-prep`: `understanding`, `calculation`, `essay`; `classmates`: `recall`, `understanding`; `survey`: empty. Written into the question file as each choice's default, and into COMMANDS.md.

**G17. `focus_tags` outside a library** (3g). The file fills it "from earlier results when `weak_topics` is true", but `quiz brief` is a core command with no history to read. **Decided by the owner on 2026-11-03, as recommended.** **Recommend:** `quiz brief` always writes `focus_tags: []`; with `--weak-topics yes` it warns (`brief.no-history`, listed in `--json`'s `warnings`) that the agent should pick the weak topics from the learner's reports, or use the library's brief in step 4, which fills it from `stats`.

**G18. A `DIR` that already holds `brief.yaml`** (3g). Nothing says. **Decided by the owner on 2026-11-03, as recommended.** **Recommend:** never overwrite, as `new`: exit 2 before asking anything, "DIR/brief.yaml already exists: edit it, or delete it to start again". An existing `content/` is kept as it is, and a missing `DIR` is created.

**G19. `brief.vague` is not in the rule catalogue** (3i). **Decided by the owner on 2026-11-03, as recommended.** It is emitted with a rule id, but TECHNICAL_DESIGN.md section 5 and the registry list only `brief.no-history`. **Recommend:** register it as a warning, beside `brief.no-history` ("given by `quiz brief` through flags, not by `check`"), in section 5 and the registry; the 17 `rules/*` goldens change again, once.

**G20. `commitment` and `--accept-defaults`** (3i). **Decided by the owner on 2026-11-03, as recommended.** `commitment` is human-only with the default `0` and may be left empty; without `--commitment` 3g writes `0` as `default`, with or without `--accept-defaults`. COMMANDS.md says `--accept-defaults` fills "human-only values that have a default" as `agent`, which would make it `agent`. **Recommend:** keep 3g's reading: `0` is no goal, so nothing is chosen for the learner and it stays `default`; COMMANDS.md says `--accept-defaults` fills only the human-only values that need an answer (today `purpose`).

**G21. `stats` and a report question with an empty `id`** (3i). **Decided by the owner on 2026-11-03, as recommended.** Not in the brief: with the hash match gone (3d's G3 change), such questions would all merge under one key, so 3g exits 1 with the fix "run `quiz ids FILE`, then make it again with `quiz grade --json`". **Recommend:** keep it and write it into COMMANDS.md, `quiz stats`.

**G22. The question file's extra fields** (3i). **Decided by the owner on 2026-11-03, as recommended.** Beyond G11's list 3g added `flag`, `optional` (to tell `commitment` from `purpose`), `min` and `max` for numbers, `default-by-purpose` (the profile) and `default-for` on a choice (the `mix` defaults), plus a top-level `sections` list with `en` and `vi` titles; `kinds_other` is the `follow-up` of `content.kinds`. **Recommend:** accept them and add them to COMMANDS.md's question-file paragraph, since 3h and 3i read the same file.

**G23. `decided_by` for an answer given in a form** (3i, 3h). **Decided by the owner on 2026-11-03, as recommended**, and written into COMMANDS.md, `quiz brief`. The forms pre-fill every question that has a default; nothing says whether one the user leaves as it is was chosen by the `user` or is a `default`, and the byte-identity criterion depends on it. **Recommend:** an answer left at its pre-filled default is `default`, one the user changed (or typed, as purpose and scope always are) is `user`; the summary screen marks the defaults the same way. Then a form and a flags run that gives flags for exactly the changed answers write the same bytes, which is what the three-way test compares. 3h's `--web` follows the same rule.

**G24. Flags given with `--tui`** (3i, 3h). **Decided by the owner on 2026-11-03, as recommended**, and written into COMMANDS.md, `quiz brief`. The forms are "in the language of `--language`", so at least that flag is meant to travel with a form; nothing says what the others do. **Recommend:** an answer flag given with a form pre-fills its question (recorded `user` when kept, as through flags), and every question is still shown, so an agent can prepare the form and the human confirms or changes it; `--language` also sets the form's language (default `en`). A bad value exits 2 before the form opens, as through flags. `--accept-defaults` with a form exits 2 (the human is there to answer). `--web` with `--tui` exits 2.

**G25. Where the form draws, and `--json`** (3i). **Decided by the owner on 2026-11-03, as recommended**, and written into COMMANDS.md, `quiz brief`. **Recommend:** the form draws on stderr and reads stdin, so stdout holds only the `--json` line (or the human `written` line); both must be terminals, or `--tui` exits 2 with "`--tui` needs an interactive terminal: use `--web`, or give the answers as flags". A short scope is not written with `brief.vague`: the form shows the example and asks again, as COMMANDS.md says, so a `--tui` run has no warnings unless `--weak-topics` is yes (`brief.no-history`). Ctrl+C at any step writes nothing and exits 2, `{"status": "cancelled"}` with `--json`.

**G26. Which error wins without a terminal** (3h). **Decided by the owner on 2026-11-03, as recommended.** The terminal check runs before the flags are checked, so `quiz brief d --tui --purpose exam < /dev/null` says "needs an interactive terminal", not that `exam` is not a purpose. Both exit 2. **Recommend:** check the flags first: an agent that prepares a form learns of its own mistake whatever terminal it has; COMMANDS.md's exit list gains the order (flags, then `brief.yaml` exists, then the terminal).

**G27. "Nothing selected" in a select** (3i). **Decided by the owner on 2026-11-03, as recommended.** COMMANDS.md says purpose and scope "start with nothing selected". Scope does; clack's select always has its cursor on the first row, so Enter on purpose picks **Self-study**. Nothing is pre-chosen and the summary lists it, but one key gives an answer recorded `user`. **Recommend:** accept, and say so in COMMANDS.md ("nothing is pre-chosen; the cursor starts on the first choice, and the summary shows the answer before anything is written"). The other way, a "Choose one" row that cannot be confirmed, is clack against its grain.

**G28. The step heading** (3i). **Decided by the owner on 2026-11-03, as recommended.** COMMANDS.md's example is *Quiz 1/2*; the form shows "Step 1/2: About the material" (the section's title from the question file). **Recommend:** accept; COMMANDS.md's example becomes "Step 1/2: About the material".

**G29. A terminal that reports no width** (3h). **Decided by the owner on 2026-11-03, as recommended.** Under `script(1)` the width starts at 0 and clack then draws one character per line; the test sets `stty cols 100` first. A real terminal reporting 0 (some serial consoles, some CI shells with a pty) would see the same. **Recommend:** the form falls back to 80 columns when the width is 0 or missing; a unit test with a 0-column output stream.

**G30. The reload server's paths** (3j). **Decided by the owner on 2026-11-03, as recommended**, and written into COMMANDS.md, `quiz build`. G6 gives the event stream as `GET /events?token=…`; the one-shot server puts the token in the path (`/<token>/`) and refuses everything outside it. **Recommend:** the same: the page at `/<token>/` (with several files, the index there and each page at `/<token>/<name>.html`), the events at `/<token>/events`, the same `Host` check, every other path 403 or 404 as for `serve`; COMMANDS.md's `GET /events` becomes `GET /<token>/events`. One `reload` event per good rebuild, none for a failed one; a comment line every 15 s so a proxy or the browser keeps the stream open.

**G31. Where the reload code lives** (3j). **Decided by the owner on 2026-11-03, as recommended**, and written into COMMANDS.md, `quiz build`. G10 made `dist/serve.js` the one-shot module (submit, autosave, `sent`). The reload page must carry none of it (G6: "the reload code as its only module"). **Recommend:** its own esbuild IIFE, `dist/reload.js`, a few hundred bytes (an `EventSource` that calls `location.reload()`, and reconnects as `EventSource` does), its own entry in `scripts/bundles.mjs` and the notices test; the served copy's CSP gains its hash and `connect-src 'self'`. A test checks that a `--serve` page holds no submit code and a `build` page none of either.

**G32. `--watch`'s outputs** (3j). **Decided by the owner on 2026-11-03, as recommended**, and written into COMMANDS.md, `quiz build`. COMMANDS.md says "one JSON line per rebuild" and nothing of `--serve`'s URL or of the human output. **Recommend:** with `--serve`, the first line is `{"status": "listening", "url", "port", "pid"}`, as `serve`'s; then a first build and every rebuild give `build --json`'s line (with `"file"` when there are several), and Ctrl+C prints `{"status": "stopped"}` and exits 0. The human output is one line per rebuild on stderr (`rebuilt quiz.html · 412 KB · 0.3 s`, or the errors and "kept the last good page"). `--open` with `--serve` opens the URL once, after the first build; without `--serve` it opens the file once. `--port N` without `--serve` exits 2.

**G33. The index of several pages** (3j). **Decided by the owner on 2026-11-03, as recommended**, and written into COMMANDS.md, `quiz build`. "With several files it serves an index of the pages"; no board shows it. **Recommend:** a plain page with no board needed: the quizzes' titles as links in the order given, each with its file name and, after a failed rebuild, "last build failed: see the terminal"; the page's tokens and both themes, `ui_lang` from `--ui-lang` or `en`, no script but the reload code. It lives in `src/build/` as one small function with a golden.

**G34. The index after a failed rebuild** (later). **Decided by the owner on 2026-11-03, as recommended.** G30 sends no event for a failed rebuild, and G33 shows "last build failed" on the index, so an open index shows the note only when it is next loaded. **Recommend:** accept: the terminal already prints the errors, and the page in the browser is the last good one, as decided; COMMANDS.md says the note shows on the next load.

**G35. `--open` with several files and `--serve`** (later). **Decided by the owner on 2026-11-03, as recommended.** It opens nothing ("`--open` opens one page; built N", from several files), though the served index is one page. **Recommend:** with `--serve`, `--open` opens the index; without it, nothing, as now. One line in COMMANDS.md and in `build-watch.ts`.

**G36. The config is not watched** (later). **Decided by the owner on 2026-11-03, as recommended.** `fullmark.toml` and the machine config are read once, so a profile change needs a restart. **Recommend:** leave it, and say so in COMMANDS.md's `--watch` row ("a change to the config needs a restart").

**G37. The watcher is per folder, not `recursive`** (docs only). **Decided by the owner on 2026-11-03, as recommended.** **Recommend:** accept, and change TECHNICAL_DESIGN.md section 3's Watching row to "`node:fs.watch` on each watched file's folder, not recursive: only the files the quiz hash covers matter, and a rename save is seen in its folder".

**The review boards (3v).** Opus drafted them on the Design canvas on 2026-11-04, in a new row titled "Forms: quiz review": **Review** (1280 px, interactive; Tweaks for theme, `locked`, `lang`, `--since`, the dialogs, materials and the sidebar), **ReviewSince** (`--since`), **ReviewFinish** (the dialog), **ReviewPhone** (390 px, interactive) and **ReviewVi** (`ui_lang` vi). They use the page's tokens, the Quiz board's top bar, status line, card and 320 px sidebar. **The owner reviewed them on 2026-11-04**: G38, G40, G41, G43, G44 and G45 as recommended, G42 changed (below), and **The rest is fine** renamed **Keep the rest** ("Giữ các câu còn lại" in `vi`, G46); all written into COMMANDS.md, `quiz review`, and TECHNICAL_DESIGN.md section 4 (`assumed`). G39 was decided after a redraw, G46 on the ReviewVi board (below).

**G38. The review form's keys** (3e). **Decided by the owner on 2026-11-04, as recommended**, and written into COMMANDS.md. `1`, `2`, `3` give Keep, Fix, Drop to the current question; `N` moves to the next question not judged; `Q` and `Esc` as on the page.

**G39. The verdict map, and materials** (3e). **Decided by the owner on 2026-11-04**, and written into COMMANDS.md: the sidebar is the page's while answering, as on the Quiz board, with verdicts in place of answers. With materials it is one stacked block, Questions over Materials (part tabs with a ring for the share judged, the chosen part's grid, the legend and keys, then the sheet chips and the open sheet, read-only); without, the collapsible part list. The first draft had a separate 320 px map and a Materials tab, which the owner rejected: the form should look like the quiz. A sheet's problem is written as a note on the question it affects. The boards are 1280 × 940, as the page's, with the column scrolling.

**G40. What a question shows in review** (3e). **Decided by the owner on 2026-11-04, as recommended**, and written into COMMANDS.md: the key state, with a `short` question's patterns shown as written.

**G41. Changing a verdict** (3e). **Decided by the owner on 2026-11-04, as recommended**, and written into COMMANDS.md.

**G42. The form's top bar** (3e). **Decided by the owner on 2026-11-04, changed from the recommendation**, and written into COMMANDS.md: the look controls stay, as on the page. A first redraw merged A− / A+ into Appearance; the owner asked for the page's own controls instead: the joined A− · 1× · A+ text size in the bar (under `free` and `locked`), and the Appearance menu with Theme (with Auto) and Font, named by category (System, Sans, Serif, Readable), only under `look: free`. No Focus mode. The owner asked whether the review can change a quiz's theme or lock: it cannot, since `review-v1` has entries per question only. The look is the quiz's front matter (`theme:`, `look:`), so editing it makes a new version of the same quiz (the quiz hash covers the whole file), not a new quiz; a later `review --since` then asks about no question, since no question's hash changed.

**G47. The page's font names** (page, found while drawing 3v). **Decided by the owner on 2026-11-04, as recommended**; 3e's first task, and written into TECHNICAL_DESIGN.md section 8 by 3e's brief. The owner names the fonts by category, System, Sans, Serif, Readable, as the review board now does; the page's catalog (`fontName` in `src/core/i18n/en.ts` and `vi.ts`) shows the families, "Be Vietnam Pro", "Source Serif 4", "Lexend". **Recommend:** the page's Font row uses the categories too (`vi`: Hệ thống, Sans, Serif, Dễ đọc), with the family as each pill's tooltip, so the form and the page say the same; the Information tab keeps the family names, since it is for debugging. A small change, done as 3e's first task.

**G43. Finish and after** (3e). **Decided by the owner on 2026-11-04, as recommended**, and written into COMMANDS.md.

**G44. `--since`** (3e). **Decided by the owner on 2026-11-04, as recommended**, and written into COMMANDS.md.

**G45. The review form on a phone** (3e). **Decided by the owner on 2026-11-04, as recommended**, and written into COMMANDS.md.

**G46. The form's words in `vi`** (3e). **Decided by the owner on 2026-11-04, as recommended**: the ReviewVi board's words, which 3e copies into the catalogs. The prompts "What needs fixing?" and "Why drop it?" are in COMMANDS.md. **Recommend:** the `vi` strings drawn on the ReviewVi board, reusing the page's catalog where a word exists (Giao diện, Nền, Phông, Cỡ chữ, Tài liệu, Đáp án đúng, Đáp án chấp nhận, Tiêu chí chấm, Bài mẫu, đang xem, Đóng thanh bên): Rà soát, Giữ / Sửa / Bỏ, Giữ các câu còn lại, Hoàn tất, Đã xét 14 / 32, Đánh giá của bạn, Cần sửa gì?, Vì sao bỏ?, Chọn ít nhất một lý do., Ghi chú (không bắt buộc) / (bắt buộc khi chọn Khác), Chưa xét; the reasons Đáp án sai, Chưa rõ ràng, Tiêu chí chấm quá lỏng, Chia điểm chưa hợp lý, Tiêu chí chưa rõ, Khác, Trùng lặp, Ngoài phạm vi, Quá dễ; the dialog "N câu chưa xét", Quay lại câu K, Huỷ, Đánh dấu Giữ và hoàn tất; after writing, Đã lưu bản rà soát. The owner reads them on the board; 3e copies the approved ones into the catalogs.

**G48. The review file's format and version** (3e). **Decided by the owner on 2026-11-04, as recommended**; 3e writes it into the design docs (its task 5). Section 4 names it `review-v1`, with `format: "review"; version: 1`. But 0.x already wrote a `review.json` with `"version": 1` (`src/fullmark/review.py` on `main`: `quiz`, `items`, `problems`), and foundation 6 starts every 1.0 format at version 2 so that a 0.x file is never mistaken for a 1.0 one; the other formats are also named `fullmark-results`, `fullmark-report`, `fullmark-grades`. **Recommend:** `{"format": "fullmark-review", "version": 2}`, called `review-v2` in the docs; a 0.x file (`"version": 1` and no `format`) is refused with "a fullmark 0.x review: 1.0 does not read it; judge the quiz again with `quiz review`". 0.x reviews are not moved in by the move-in script: they judge 0.x quizzes, which 1.0 does not read either.

**G49. `inspect --review`'s output, and the JSON Schemas** (3e). **Decided by the owner on 2026-11-04, as recommended**; 3e writes it into the design docs (its task 5). COMMANDS.md says only "counts of kept, to fix and to drop". **Recommend:** counted over the quiz's current questions (entries for removed questions left out), one human row after Positions: `Review     keep 26 (14 not looked at) · fix 3 (2 changed since) · drop 1 · not judged 2 · 28 Oct`, and one JSON key, `"review": {"reviewedAt", "keep", "assumed", "fix", "fixChanged", "drop", "unjudged"}`. Also: section 3 says the JSON Schemas of `results`, `report`, `grades` and `review` are generated from zod, but none is yet; 3e writes the zod schema only, and exporting all of them stays one task for 3z, so the four arrive together.

**G50. `review.unconfirmed`'s fix hint** (raised in 3e's review). **Decided by the owner on 2026-11-04, as recommended**: 3l's first task. It reads "run `quiz review FILE --since REVIEW` to judge the change": placeholders, where every other hint `check` prints can be copied as it is, and a command that does not exist until 3k and 3l. **Recommend:** leave it until 3l; 3l's first task gives `RuleContext` the review's shown path, so the hint names the real files ("run `quiz review quiz.md --since review.json`"), with the goldens that change counted. The catalogue's text (`quiz rules`) keeps the placeholders.

**G51. Local Windows runs are never green** (raised in 3e's review). **Decided by the owner on 2026-11-04, as recommended**: 3k's first task. On this laptop the same 49 Vitest tests fail before and after 3e (checked on `261bf3e`): 23 `template/*` and `new/user-template*` goldens expect the Linux user folder (`$HOME/.config/fullmark`) where Windows uses `%APPDATA%`; 22 watcher and watch tests, 2 server tests and 2 example tests time out or hit `EPERM` removing a temp folder; Playwright's `watch.spec.ts:167` fails the same way. Every review has to rerun them on the baseline to tell a new failure from these. **Recommend:** one task at the start of 3k: the golden runner sets the user config folder itself, so the template goldens pass on win32 unchanged; temp folders are removed with retries; the watch tests' waits come from the injected clock, as the rules say. Done when Vitest is clean on win32 here and on Linux in the cloud.

**G52. 3k's size** (raised writing 3k's brief). **Decided by the owner on 2026-11-04, as recommended**; 3k writes it into the design docs (its task 5). The 3k row holds G51, a change to the server, the command, and a form with two sidebars, two dialogs, the keys, the look controls, the `vi` words, axe and screens: more than one Sonnet session (3e, a third of it, took most of one). **Recommend:** 3k builds everything on the Review, ReviewFinish and ReviewVi boards except the stacked **Questions & materials** sidebar. In 3k a quiz with materials gets the plain Questions sidebar, and its sheets are not shown. The stacked sidebar moves to 3l, beside `--since` and the phone, which change the same map.

**G53. Earlier verdicts when the form opens** (raised writing 3k's brief). **Decided by the owner on 2026-11-04, as recommended**; 3k writes it into the design docs (its task 5). COMMANDS.md says an existing `--out` file is merged into, but not what the form shows. If the form opens blank, **Keep the rest** after judging three questions replaces every earlier fix and drop with an assumed keep, and `check --review` then passes with nothing fixed. **Recommend:** the form opens with each earlier verdict, its reasons and its note in place when the question's hash is still the one judged; it counts as judged, and the learner may change it. A question that is new or changed since starts not judged, the ones `--since` will ask about alone. So Keep the rest and the Finish dialog touch only questions with no verdict for their current version.

**G54. Surveys** (raised writing 3k's brief). **Decided by the owner on 2026-11-04, as recommended**; 3k writes it into the design docs (its task 5). A `kind: survey` quiz has no key, so most reasons ("Answer key wrong", "Too easy") mean nothing there, and the design never says what reviewing a survey is for. **Recommend:** `quiz review` on a survey exits 2 before serving, "a survey has no answer key to review". A `scale` question in a graded quiz is judged like any other.

**G55. How a question shows its key** (raised writing 3k's brief). **Decided by the owner on 2026-11-04, as recommended**; 3k writes it into the design docs (its task 5). The boards draw single, multi, numeric, short and essay questions; the page shows every type's key after Submit, but always beside the learner's answer. **Recommend:** the form uses the page's own question components in their after-Submit state, from the same page data and key blob, with no answer: the key's marks only (Correct answer, Accepted answers with the tolerance, the right order, the right pairs, each blank's and field's accepted values), never "your answer" or a right or wrong colour; `short` adds its patterns as written (G40). Questions come in source order, every question of a bank's pool, choices unshuffled: the learner judges the source, not an attempt.

**G56. A matching question's distractors in the form** (raised in 3k's review). **Decided by the owner on 2026-11-04, as recommended**; 3l writes it into COMMANDS.md and builds it. The form shows a matching question's right pairs, but not its distractors: the right-hand items that match nothing. They are part of the key the learner judges (a distractor that is in fact a right answer is a `key-wrong`), and the source has them. **Recommend:** the form lists them under the pairs, each marked "Matches nothing" (vi: "Không ghép với mục nào"), in source order; 3l builds it with its other fixes.

**G57. The form's words that are not on the boards** (raised in 3k's review). **Decided by the owner on 2026-11-04, as recommended**: the six strings stay as written until the owner names a change. 3k needed six strings the boards do not draw, written by the implementing agent in `src/core/i18n/review.ts`: `patterns` "Accepted patterns" / "Mẫu chấp nhận" (a `short` question's patterns, G40); `unscored` "Not scored" / "Không tính điểm" (a `scale` question in a graded quiz); `partCount` "6 of 12 judged" / "đã xét 6 / 12"; `keysLabel` "Keys" / "Phím tắt" (the sidebar's key list); `held` "N questions need a reason or a note before the review can be saved:" / "N câu cần có lý do hoặc ghi chú trước khi lưu được bản rà soát:" (Finish with an incomplete verdict); `saveFailed` "The review was not saved: WHY" / "Chưa lưu được bản rà soát: WHY". **Recommend:** keep them as written (each follows the boards' wording where one is near), and the owner reads them in the form through `npm run samples` and says which to change; a change is one line in that file, done in 3l.

**G58. 3l's size** (raised writing 3l's brief). **Decided by the owner on 2026-11-05, as recommended**; 3l adds the 3m row (its task 5). The 3l row holds G50, G56, 3k's small fixes, `--since` (the command, the earlier verdict, the line diff, the muted map), the stacked **Questions & materials** sidebar and the phone. 3k, with less form work, took one long Sonnet session. **Recommend:** cut it in two, as G52 cut 3k. **3l** is G50, G56, 3k's small fixes and `--since`, all at 1280 px with the plain sidebar. **3m** is the stacked sidebar with the materials (the page's own, as on the Review and ReviewSince boards) and the phone (ReviewPhone), which change the same layout. The slice table gains the 3m row.

**G59. `--since` beside `--out`** (raised writing 3l's brief). **Decided by the owner on 2026-11-05, as recommended**; 3l writes it into the design docs (its task 5) and builds it. COMMANDS.md says `--since REVIEW` merges "into it", and `--out REVIEW` names the file written, so `--since a.json --out b.json` is not said. **Recommend:** `--since REVIEW` is read and written, so with it `--out` may be left out; an `--out` naming another file exits 2, "--since merges into its own review: leave out --out". The `--since` file is refused as `--out` is (missing, unreadable, invalid, 0.x, another quiz: exit 2), and a missing one says "--since needs an existing review; run quiz review FILE first".

**G60. `--since` with nothing to ask** (raised writing 3l's brief). **Decided by the owner on 2026-11-05, as recommended**; 3l writes it into the design docs (its task 5) and builds it. When no question is new or changed since the review, the form would open with nothing in it. **Recommend:** nothing is served; it prints "nothing new or changed since your review of 28 Oct" and exits 0, with `{"status": "unchanged", "review": PATH}` under `--json`, and the file is not touched.

**G61. A changed question that was kept** (raised writing 3l's brief). **Decided by the owner on 2026-11-05, as recommended**; 3l writes it into the design docs (its task 5) and builds it. The line diff needs the version judged, and the review keeps a question's `source` only for `fix` and `drop` (TECHNICAL_DESIGN.md section 4: a keep has no source). So a question kept and since changed has no "What changed since". **Recommend:** it shows the earlier verdict box with "Keep" (and "not looked at" when it was assumed) and, in place of the diff, "Changed since; a Keep does not store the earlier text". The format does not change.

**G62. What the dialogs promise about `--since`** (raised writing 3l's brief). **Decided by the owner on 2026-11-05, as recommended**; 3l writes it into the design docs (its task 5) and builds it. Both dialogs say a question marked Keep by them "a later `quiz review --since` can still judge" (G43). But `--since` asks only questions new or changed (G44), and `assumed` "changes nothing in `check` or `--since`" (TECHNICAL_DESIGN.md section 4), so an assumed keep is never asked again by `--since`. **Recommend:** keep `--since` as decided and change the promise: "a later `quiz review` can still judge them" (vi: "lần `quiz review` sau vẫn có thể xét lại"). A plain `quiz review` opens with them and lets the learner change them (G53). COMMANDS.md's two dialog sentences change with it.

**G63. Long lines in the `--since` diff** (raised in 3l's review). **Decided by the owner on 2026-11-05, as recommended**; 3m builds it and writes it into the design docs. The diff is a `<pre>` that scrolls sideways, so a line wider than the card is cut at its edge: on the calculus copy the changed heading ends in "{type=numeric ta" and the change itself is out of sight. The ReviewSince board draws only short lines, so it does not say. **Recommend:** the diff's lines wrap (`white-space: pre-wrap`, breaking inside a long word when needed), a wrapped line keeping its `−` or `+` column and its wash; the region then never scrolls sideways. 3m builds it with its other fixes.

**G64. A `fix` or `drop` with no `source`** (raised in 3l's review). **Decided by the owner on 2026-11-05, as recommended**; 3m builds it and writes it into the design docs. The schema makes `source` optional, and the form writes it for every `fix` and `drop` (TECHNICAL_DESIGN.md section 4), but a hand-edited file may leave it out; `--since` then shows the earlier verdict with neither a diff nor G61's line. **Recommend:** the reader requires `source` on a `fix` or `drop` entry, as it requires the other fields, so such a file is refused by `check --review`, `inspect --review` and `quiz review` with the reader's usual message naming the entry; no file written by 3e to 3l lacks it. 3m builds it, with a golden for the refusal.

**G65. The form's sidebar and look controls on a phone** (raised writing 3m's brief). **Decided by the owner on 2026-11-05, as recommended**; 3m builds it and writes it into COMMANDS.md (its task 5). The ReviewPhone board draws the cards and the foot bar, not the open sidebar, and its top bar has only the sidebar icon. The page on a phone gives the sidebar the whole screen, "with a back link and the two tabs" (TECHNICAL_DESIGN.md section 8, "Sidebar"), hides the text size and keeps the Appearance button (`src/page/App.tsx`). **Recommend:** the form follows the page: on a phone the sidebar takes the whole screen with a back link; with materials its two parts become two tabs, **Questions** and **Materials** ("Câu hỏi", "Tài liệu"), Questions first; without, the Questions map alone. It starts closed on a phone. The top bar holds the sidebar icon and the Appearance icon (under `look: locked` too, as on the page), the text size inside the Appearance menu as the page has it.

**G66. `M` in the form** (raised writing 3m's brief). **Decided by the owner on 2026-11-05, as recommended**; 3m builds it and writes it into COMMANDS.md (its task 5). On the page `M` opens the sidebar and moves the focus to the materials' chips (`src/page/keys.ts`), and the button's title names both keys ("Questions & materials (Q, M)"). COMMANDS.md lists `Q` and `Esc` for the form, not `M`. **Recommend:** with materials, `M` does in the form what it does on the page (on a phone, opens the Materials tab), the button's title names `Q, M`, and the keys list in the sidebar adds "M materials" ("M tài liệu"); without materials `M` does nothing. Not while typing in a note, as for every key.

**G67. A part with nothing asked again, in the stacked map** (raised writing 3m's brief). **Decided by the owner on 2026-11-05, as recommended**; 3m builds it and writes it into COMMANDS.md (its task 5). With `--since`, a part none of whose questions is asked has nothing for its ring and counts to cover; the ReviewSince board shows such parts with empty rings and no count. **Recommend:** the board as drawn: its ring is the empty track, its entry has no count, its accessible name says "Part 1, Signals: nothing asked again" ("Phần 1, Signals: không hỏi lại câu nào"), and choosing it shows its grid, all muted, with the heading's count line "nothing asked again". It stays choosable, so the learner can see where the asked questions are not.

**G68. Vitest's default timeout** (raised in 3m's review). **Decided by the owner on 2026-11-05, as recommended**: the next slice's first tasks. Three CPU-bound unit tests have now failed at Vitest's 5 s default on the owner's 4-core laptop, each well under it alone (the notices bundling 1.9 s, `fonts-cli` 0.3 s) and past it beside 108 other test files; each was given a named timeout once found (3l's and 3m's reviews). G51 asked that no test wait on real time unexplained, and these do not wait: they compute, and the machine's load sets their time. Found one at a time, the next one fails a run that has nothing wrong. **Recommend:** `vitest.config.ts` sets `testTimeout: 30_000` with a comment saying why (CPU-bound tests under the full parallel run), the named timeouts stay where they are longer, and a test that waits on a real timer is still a bug, as G51 says. The next slice does it first.

**G69. A temp file left by a killed `--autosave`** (raised in 3m's review). **Decided by the owner on 2026-11-05, as recommended**: the next slice's first tasks. The progress file is written atomically, through `.progress.json.<8 hex>.tmp` renamed over it (`src/cli/atomic.ts`). A server killed during that write leaves the temp file, and its random name means no later run removes it: litter beside the learner's quiz, and the reason `serve.spec.ts:318` failed once in Firefox. **Recommend:** `quiz serve --autosave FILE`, before it serves, removes the temp files of that one file (names matching `.<basename>.<8 lower-case hex>.tmp` in its folder, nothing else), and so does `finish`; a unit test with a planted temp file, and the e2e test unchanged. `atomic.ts` keeps its random names. The next slice does it with G68.

## Slices

| Slice | Content | Needs |
|---|---|---|
| **3a** | The one-shot server (`src/serve/`): bind, token, `Host` and `Origin`, one POST path, 10 MB cap, the quiz-keyed predicate, timeout, Ctrl+C, the `listening` line; the browser module on the attach point; the served page's CSP; the byte-identity and two-quiz seam tests. `quiz serve FILE` with `--out`, `--timeout`, `--open`, `--port`, `--json`, the `.html` refusal and exit 1 on check errors | G9, G10 |
| **3b** | 3a's fixes; `serve --section`, `--focus`, `--autosave`; Firefox through the whole submit; the samples line | G5 |
| **3c** | `inspect` (with `--review` waiting for 3e), `new TEMPLATE`, `new --from [--skeleton]`, `template list/add/rm`, the built-in templates | G4, G8 |
| **3d** | `stats`: `src/core/stats/` (per question, per tag, per criterion, across versions), the survey table, human and `--json` | G3, G8 |
| **3g** | `brief` through flags: the question file, every option, defaults written with `decided_by`, `brief.vague`, exit 3 and `needs_input`, `--accept-defaults`, `--json`, `content/` | G11 |
| **3i** | 3g's fixes; `brief --tui` with `@clack/prompts`; flags and `--tui` write byte-identical `brief.yaml` | G11, G12, G23 to G25 |
| **3j** | `build --watch` and `--serve`: watching, the last good page, `--json` per rebuild, the reload server | G6 |
| **3v** | The owner's form boards (G7), whenever the owner is ready; no code. Only 3e, 3f and 3h wait for it | G7 |
| **3e** | G47; the review file (`src/core/review/`: schema, reader, merge, the block text), `check --review` with `review.fix`, `review.drop` and `review.unconfirmed`, `inspect --review`. No browser | G1, G2, G47 to G49 |
| **3k** | `quiz review` on the one-shot server and its form (`dist/review.js`): the Review boards at 1280 px (the verdict, then reasons; the stacked sidebar with the materials; the text size and Appearance; Keep the rest; the Finish dialog; the saved card; the keys), the `vi` words of ReviewVi, the refusal of questions without ids, `--out` merged, axe in both themes, screens, the samples line | G3, G38 to G46, 3e |
| **3l** | `review --since`: only the new and changed questions, the earlier verdict and the line diff, the map's "not asked again"; the form on a phone (ReviewPhone) | G44, G45, 3k |
| **3m** | the stacked **Questions & materials** sidebar and the phone (ReviewPhone) | G58, G65 to G67, 3l |
| **3n** | G68 (Vitest's default timeout) and G69 (`--autosave`'s leftover temp files) | G68, G69 |
| **3f** | `grade --web` and `--name`: the grading form on the rubric modes, pre-filled from `--grades`, `kind: human` and `reviewed`, then the report | boards |
| **3h** | `brief --web`: the form from the question file, the detail rules, the summary screen, `--language` for the form; the three-way byte-identity test (flags, `--web`, `--tui`) that closes step 3's criterion | G11, boards |
| **3z** | Acceptance: every "Done when" item checked in Chromium and Firefox, samples tried by the owner | |

The order (owner, 2026-11-03) puts the server first, since four commands stand on it, then every slice that needs no form board (3c, 3d, 3g, 3i, 3j), so the owner's form design (3v) can come whenever the owner is ready; the three forms come last. Later briefs stay outlines until the slice before is reviewed.

## Slice 3a: the one-shot server and `quiz serve`

**Approved by the owner on 2026-11-03**, with G9 and G10.

### Read first

- TECHNICAL_DESIGN.md section 7: the `serve/` line of the tree, foundations 3 (the CSP bullet), 4 and 9, "Seams for later features" item 6 and "Running the server in the background", "Temporary files".
- COMMANDS.md: "Common options" (`--json`, `--open`, `--port`, `--timeout`), "Exit codes", `quiz serve`.
- This plan: "Rules for every slice", G9, G10.
- Code: `src/page/events.ts`, `src/page/main.tsx`, `buildPage` and the CSP in `src/build/page.ts`, `src/cli/build.ts` (how a page is built from a file: load, check, build), `src/cli/atomic.ts`, `scripts/build-page.mjs`, `scripts/bundles.mjs`.

### Decided for this slice

- **`src/serve/server.ts`** (Node): `startServer({pages, quizIds, predicate, timeoutMs, port, onSubmit})` returns `{url, port, done}`. It binds `127.0.0.1` only; the token is 32 random bytes, base64url, in the path (`/<token>/`). Every request checks the token, `Host` (`127.0.0.1:<port>` or `localhost:<port>`) and, on POST, `Origin` (the same two); any mismatch is 403 with no body. `GET /<token>/` serves the page; `POST /<token>/submit` takes `{quizId, attempt}` up to 10 MB (413 above), validates it with the `results-v2` schema and the quiz's hash (400 on failure, G9), calls `onSubmit`, and ends when `predicate` says so. Everything else is 404. Responses carry `Cache-Control: no-store`.
- **`src/serve/module.ts`** (browser, built to `dist/serve.js`, G10): reads `window.fullmark.events`, on `submit` POSTs to `./submit` with `fetch` and shows the page's own message on success or failure (catalog strings in `en` and `vi`); on `progress` it does nothing until 3b. Built by `scripts/build-page.mjs`, read only by `src/serve/`.
- **The served page:** `buildPage` gains an internal option that appends the module's script and adds its hash and `connect-src 'self'` to the CSP. A test requires `buildPage` without the option to give the same bytes as before the slice (the build goldens unchanged), and a test scans a built page for the module's code and for `connect-src`.
- **`quiz serve FILE`:** load and check as `build` does (exit 1 on check errors, printed as `check` prints them); a `.html` exits 2 with COMMANDS.md's message; the page is built in memory; with `--json` the first line is `{"status": "listening", "url", "port", "pid"}`, flushed before waiting; on submit the results are written atomically to `--out` (default `<quiz-id>-results-<YYYYMMDD-HHMMSS>.json` beside the source, local time), the score is graded with the shared grader, and the second line is `{"status": "submitted", "results", "score"}`. Timeout: `{"status": "timeout"}`, exit 2. Ctrl+C: G9. `--open` uses the opener `build --open` uses. Without `--json`, stderr says the URL and "waiting for Submit (Ctrl+C to stop)".
- **The seam:** a unit test starts the server with two quiz ids and a predicate "both submitted", posts both, and checks two `onSubmit` calls and that it ends only after the second.

### Tasks

1. `src/serve/server.ts` with unit tests: token, `Host`, `Origin` (each wrong one 403), the size cap, a bad body, a wrong quiz id, the predicate, the injected timeout, port `0`.
2. `src/serve/module.ts`, `dist/serve.js`, its notices entry, and the served-page option of `buildPage`; the byte-identity and no-server-code tests.
3. `quiz serve` in `src/cli/serve.ts` and `src/cli/main.ts`: the options above, contract tests through the subprocess helper (new in `e2e/helpers.ts`), goldens for the two JSON lines (URL, port and pid masked), Ctrl+C on Linux.
4. Playwright: serve an example, answer, Submit, check the written results grade as the page showed; the page's message when the server has gone; axe on the served page.
5. `samples`: a line in `TRY` saying how to try `quiz serve` by hand.

### Done when

`npm run check` passes; `quiz serve examples/calculus/quiz.md --json` prints the two lines and writes a results file that `quiz grade` grades to the same score; the server refuses a wrong token, `Host` and `Origin`; a `build` page is byte-identical to before the slice. Report as the rules say, with the startup numbers before and after.

### Review

**3a's review (2026-11-03).** Typecheck, Biome and Vitest clean: 86 files, **2111 of 2111** (34 new), the 2 startup tests (`--version` 21 ms, `check` 88 ms, both lower than before). Playwright in Chromium: 184 passed, 123 skipped, **1 failed**: `e2e/types.spec.ts:28` ("every simple type…", a `toHaveAttribute` that timed out at 9.7 s against 5.2 s normally). 3a changed nothing in `src/page`, `src/core` or that test, and it passed 3 of 3 runs on its own; **its cause is not shown**, so it is not called environmental: a task for 3b. Firefox not run (not installed here). The runtime is unchanged (56,214 B gzipped); `dist/serve.js` is 785 B gzipped. No `build`, `replay` or `check` golden changed; 2 top-level help goldens gain the `serve` line; 9 new golden cases under `test/golden/serve/`. Tried by hand: the page 200; a wrong token, a wrong `Host` and a POST without `Origin` 403; an unknown quiz id 400 with the reason; the served CSP has `connect-src 'self'`; SIGINT printed `{"status":"interrupted"}` and wrote nothing. **Found in review:** the URL without its trailing slash (`/<token>`) also serves the page, where `./submit` resolves to `/submit` and every submit would be refused. Done differently, accepted in review: `quizIds` is a map of id to hash; the samples line is a "Served commands" section of `samples/index.html`. **3a's gaps decided by the owner on 2026-11-03**, all as recommended, and written into COMMANDS.md (`quiz serve`: the synopsis with `--profile`, `--config` and `--fonts`; `{"status": "failed"}` for check errors; a results file that cannot be written) and TECHNICAL_DESIGN.md (foundation 4: 403 outside the token, 403 for a POST without `Origin`, 404 under it, the 308 to the trailing slash; foundation 9: `served: true`, the Submit dialog's line, the `sent` and `send-failed` events, **Sent** owned by the page core). The favicon's 403 stays. They are 3b's first tasks.

## Slice 3b: 3a's fixes, then `--section`, `--focus` and `--autosave`

**Approved by the owner on 2026-11-03**, with G5.

### Read first

- COMMANDS.md: `quiz serve`; "Names, ids and stamps" (how a section is named).
- TECHNICAL_DESIGN.md section 7: foundations 2, 4 and 9 (with the owner's additions of 2026-11-03); section 8: the rows "Submit asks first", "Results (after Submit)" (the **Download results** button) and "Focus mode"; section 4: "Plan and Attempt" (`plan.source`).
- This plan: "Rules for every slice", G5, and 3a's review above.
- Code: `src/serve/`, `src/cli/serve.ts`, `src/page/events.ts`, `src/page/data.ts` (`PageData`, `focus`), `src/page/store.ts` (the plan at Start, `planFor` with `source: "section"`), `src/page/saved.ts` (`Saved`, `readSaved`), `src/page/SubmitDialog.tsx`, `src/page/ResultsCard.tsx`, `src/core/plan/index.ts` (`sectionIds`), the page catalogs in `src/core/i18n`.

### Decided for this slice

- **The redirect:** `GET /<token>` answers 308 to `/<token>/`; a test submits from a page opened at the address without the slash.
- **`served`:** `PageData` gains `served?: true`, set only by `src/serve/`. The Submit dialog adds its line; the module emits `sent` or `send-failed` (with no payload) on the attach point after the POST; the results card shows **Sent** (not a button, `aria-live` polite) or, on failure, keeps **Download results** and shows the could-not-save line. The module's own notice from 3a goes: the page says it. New catalog strings in `en` and `vi`. `dist/page.js` changes, so every page golden changes: report the count, and show in one test that a `build` page's `PageData` has no `served` and its runtime has nothing that emits `sent`.
- **`--section S`:** resolved by slug or title, ignoring case; unknown exits 2 listing the valid ones (slug and title), before anything is served. `PageData` gains `section?: string` (the section id): the start screen shows only that part, with no picker, and Start plans `source: "section"`. The results record it, and `quiz grade` grades them as any section attempt.
- **`--focus`:** sets `PageData.focus`.
- **`--autosave PROGRESS`:** as G5 says once decided. The module writes on `progress`; the server gains one more POST path, `/<token>/progress`, with the same checks, body cap and validation (phase `in-progress`), answering 204; the server writes atomically, at most once a second (the last body wins). A matching file is put in `PageData` as the saved attempt the start screen's resume path already reads (`Saved`); local storage is not used under `--autosave`, so the file is the one copy. Deleted after the results are written.

### Tasks

1. The redirect; `served`, the dialog line, `sent` and `send-failed`, **Sent**; the page goldens regenerated and counted.
2. **`e2e/types.spec.ts:28`**, which failed once in 3a's full Chromium run (a `toHaveAttribute` at 9.7 s, against 5.2 s normally) and passed 3 of 3 alone. Find and show the cause (run the full suite at least twice; read the assertion); fix the test or the page. Never mark it flaky or raise a timeout without the cause.
3. `--section` and `--focus`, with goldens for the unknown section (human and `--json`) and Playwright for a section attempt that `quiz grade` grades to the page's score.
4. `--autosave`: unit tests of the progress path and the write rate (injected clock); Playwright: answer, kill the server, start it again with the same file, resume, Submit; the file gone after; a file of another version exits 1 and is left alone.
5. `samples`: the three new options in "Served commands".

### Done when

`npm run check` passes in Chromium (Firefox on the owner's machine); `types.spec.ts:28` has a shown cause and a fix; a served section attempt and a resumed `--autosave` attempt each grade with `quiz grade` to what the page showed. Report as the rules say, with screens of the dialog line and **Sent** in `docs/screens/3b/`.

### Review

**3b's review (2026-11-03).** Typecheck, Biome and Vitest clean: 88 files, **2153 of 2153**, the 2 startup tests. Playwright in Chromium: **193 passed**, 128 skipped, none failed (run in review). The runtime grew 627 B to 56,769 B gzipped (the `sent` handling moved into the page); `dist/serve.js` is 372 B. 14 page goldens regenerated for the new `dist/page.js`; no other golden changed. Screens in `docs/screens/3b/` reviewed: the dialog's line, **Sent**, the could-not-save line. Tried by hand: an unknown section lists the three slugs and titles and exits 2; `--autosave` and `--out` naming one file exits 2. **`types.spec.ts:28`: cause not shown.** It did not recur in 2 full runs and 64 repeats, some under load; `BlanksPrompt` now marks its boxes in a layout effect (the one asynchronous step found) and a failure attaches the page state. Still open. **A second unexplained failure, older than 3b:** `e2e/start.spec.ts:202` fails 3 or 4 of 40 repeats, on 3b's tree and on `b231c4e` alike: the saved attempt is not found after the reload. **Found in review:** after **Sent** the server has exited, but **Retry missed** and **New attempt** still show; what they do on a served page is not decided. Done differently, accepted in review: `sent` and `send-failed` carry `quizId` (the bundle seam); a served page starts after `DOMContentLoaded` so a timed attempt that expired while the server was down still reaches it; `--section` drops the other sections from `PageData`; under `--autosave` the Rules cell says "In a file on this computer" and nothing goes in `localStorage`.

**3b's gaps decided by the owner on 2026-11-03**, all as recommended, and written into COMMANDS.md (`--autosave`: matched by `quizHash` alone, the phase `answering`, an unusable file exits 1, the same file as `--out` exits 2) and TECHNICAL_DESIGN.md (foundation 9: after **Sent**, **Retry missed** and **New attempt** work as practice and are not sent). The page's button is **Download results** everywhere in the design docs (it was "Export" in places). A section attempt keeps the quiz's `time_limit`, since a section's `time` is only a suggestion (QUIZ_SYNTAX.md, section 3): no change. `start.spec.ts:202` is 3c's first task; `types.spec.ts:28` stays open, watched by its new attachment.

## Slice 3c: `start.spec.ts:202`, then `inspect`, `new` and `template`

**Approved by the owner on 2026-11-03**, with G8 for `inspect` and G13.

### Read first

- COMMANDS.md: `quiz inspect`, `quiz new`, `quiz template`, "Exit codes", "Paths in output", "Files".
- QUIZ_SYNTAX.md: section 9 (structure and content), and the **S** and **C** column of the tables in sections 2 to 4.
- TECHNICAL_DESIGN.md section 7, "Files, formats and safe writes" (atomic writes).
- This plan: "Rules for every slice", G4 (decided), G8, G13, and 3b's review (the `start.spec.ts:202` paragraph).
- Code: `src/cli/main.ts`, `src/cli/load.ts`, `src/cli/check.ts` (how a quiz is loaded and checked, and how issues are printed), `src/cli/atomic.ts`, `src/core/rules/quality.ts` (`answers.position-skew`, for the answer positions), `src/core/ir.ts` (the quiz IR), `src/core/parse/` only as far as the skeleton needs, `examples/`, `templates/blank/`, `e2e/start.spec.ts`.

### Decided for this slice

- **`inspect` (G8, for the owner to approve).** It checks the quiz (exit 1 on errors), and prints the summary whenever the quiz parses, with the issues after it, as `check` prints them. Human output:

  ```text
  rust-basics · Rust basics · version 9f3a
  18 questions · 25 points · 3 sections · time limit 25m
  Types      single 8 (10 points) · multi 3 (5) · code 2 (6) · essay 1 (4) · …
  Sections   ownership 6 questions, 8 points · collections 6, 10, pick 4 · …
  Tags       rust 18 · borrowing 5 · … · no tag 2
  Positions  A 5 · B 6 · C 3 · D 2 (correct choices of single and multi, in source order)
  ```

  `--json`: `{"status": "done" | "failed", "quiz": {"id", "title", "hash", "short"}, "questions", "points", "timeLimit", "types": [{"type", "count", "points"}], "sections": [{"id", "title", "questions", "points", "pick", "time"}], "tags": [{"tag", "count", "points"}], "positions": {"A": 5, …}, "errors", "warnings"}`. Points count a bank's `pick`, not its pool. Positions read the source order, as `answers.position-skew` does, and share its counting code. `--review` exits 2 "not available yet" until 3e, which adds `"review": {"keep", "fix", "drop", "notJudged"}`.
- **Built-in templates:** one source each, no copies in the repo: `npm run build` copies `examples/<name>/` (calculus, rust, ielts, medical, exam, survey) and `templates/blank/` into `dist/templates/<name>/`; `dist` is what the package ships. A test checks that `dist/templates` matches its sources and that each template passes `check`.
- **User templates:** the `templates/` folder next to `config.toml` (`FULLMARK_CONFIG` honoured), as COMMANDS.md says, with `list`, `add` and `rm` exactly as specified there.
- **`new`:** G13; never overwrites (an existing target file exits 2 before anything is written); copies the one `.md`, `assets/` and `materials/`; `--skeleton` follows QUIZ_SYNTAX.md section 9 to the letter, in a module of its own under `src/core/` (pure, no `node:*`), shared by `new --from --skeleton` and `template add --skeleton`.

### Tasks

1. **`e2e/start.spec.ts:202`** ("a page reopened after the deadline submits on open"): fails 3 or 4 of 40 repeats since before step 3; after the reload the saved attempt is not found. Show the cause (3b suspected the test's `addInitScript` racing the page's save on unload), then fix the test or the page. No retries, no longer timeouts, no flaky marks without the cause.
2. `inspect`, with goldens: every example, a quiz with check errors, a bank, a quiz with no tags; human and `--json`.
3. The skeleton module with unit tests per QUIZ_SYNTAX.md section 9 bullet; a skeleton of every example fails `check` with one error per emptied field and passes the structural check of `template add --skeleton`.
4. `new TEMPLATE`, `new --from [--skeleton]`, `template list/add/rm`, the built-in templates in `dist/templates/`; goldens for every exit of COMMANDS.md, the `ignored` user template, a name taken by a built-in, `--replace`, `unchanged`.
5. `quiz --help` and the top-level goldens gain the new commands.

### Done when

`npm run check` passes in Chromium, and `start.spec.ts:202` passes 40 of 40 repeats with its cause shown; `quiz new rust demo/` then `quiz ids demo/quiz.md` then `quiz check demo/quiz.md` passes; `quiz new --from examples/rust/quiz.md --skeleton s/` fails `check` with only emptied-field errors. Report as the rules say.

### Review

**3c's review (2026-11-03).** Typecheck, Biome and Vitest clean: 92 files, **2284 of 2284** (74 new golden cases), the 2 startup tests (`--version` 24 ms, `check` 85 ms). Playwright in Chromium: **193 passed**, 128 skipped, none failed. **`start.spec.ts:202`: cause shown.** After `page.reload()`, Chromium handed the reloaded document a `localStorage` snapshot older than the old document's last write; the test's init script read that snapshot (seen empty in every failing run, while a fresh tab saw the key). The page saved correctly and is unchanged; the test now edits the saved text it read from the old page. 40 of 40 in review. Only the two top-level help goldens changed (the three commands). Tried by hand: `template list` shows the seven built-ins; `new rust demo/`, `ids`, `check` pass; `new` again exits 2; a skeleton of `rust` fails `check` with 30 emptied-field errors; `inspect examples/exam/quiz.md` prints the summary. **Found in review:** that example has no `id`, so its id shows as `quiz`, the file name: the same collision as Sonnet's gap 2.

**3c's gaps decided by the owner on 2026-11-03**, all as recommended, and written into COMMANDS.md (`quiz new`: `PATH` a folder or an `.md` file, a fresh quiz `id` from the target's name, `--json`, `--from` copies only what the quiz references; `quiz inspect`'s details; `template list` shows `invalid` folders; `template add` and `rm` `--json`) and QUIZ_SYNTAX.md section 9 (`materials` emptied, how each answer shape is emptied, which errors a skeleton gives). `examples/exam` and `examples/medical` get an `id`. The id, `new --json` and `invalid` are 3d's first tasks.

## Slice 3d: 3c's fixes, then `stats`

**Approved by the owner on 2026-11-03**, with G14 and G8 for `stats`.

### Read first

- COMMANDS.md: `quiz stats`, `quiz new`, `quiz template` ("`template list`"), "Several files".
- TECHNICAL_DESIGN.md section 4, "Plan and Attempt" (scores per question and per tag) and section 10, "Decisions on the new features" (missed); section 6, "Where grades show up" (the `stats` row) and the report paragraph of "`grades-v2`".
- This plan: "Rules for every slice", G3, G8, G14, and 3c's decided gaps.
- Code: `src/core/report/build.ts` (`Report`), `src/cli/grade.ts` (loading and grading results), `src/cli/new.ts`, `src/cli/templates.ts`, `src/core/skeleton.ts` (`withoutIdentity`).

### Decided for this slice

- **The fixes from 3c:** `new` writes a fresh quiz `id` (the folder's name for `quiz.md`, else the file's), takes `PATH` ending in `.md` as the file, and has `--json`; `template list` shows `invalid` folders with the reason; `examples/exam` and `examples/medical` gain an `id` (their goldens change: report the count).
- **`stats` (G8, for the owner to approve).** Inputs as G14. Each attempt counts only the questions it had (`plan.questions`), so a section or retry attempt never counts as a low score on the whole quiz. Questions match across versions by id, and without one by question hash (G3). Pending grades count as not yet scored.

  ```text
  rust-basics · Rust basics · 5 attempts, 2 versions
  Attempts   3 Oct 62% · 10 Oct 71% (section ownership) · 17 Oct 80% · …
  Tags       borrowing 54% (13 of 24 points) · traits 70% · ownership 88% · no tag 75%
  Weakest    borrowing, traits
  Missed     q-k7m2qx "Which borrow…" wrong in 4 of 5 · q-a1b2c3 3 of 5 · …
  Criteria   interp 60% over 4 attempts · LR band 5.5 average · …
  ```

  `--json`: `{"status": "done", "quiz": {"id", "title"}, "attempts": [{"file", "submitted", "version", "plan", "earned", "points", "percent", "pending"}], "tags": [{"tag", "earned", "points", "percent", "attempts"}], "weakest": [tag], "questions": [{"id", "hash", "title", "seen", "missed", "earned", "points", "changed"}], "criteria": [{"question", "criterion", "earned", "max", "percent", "band"}]}`. **Weakest:** the up to three tags with the lowest percent, of those seen in at least two attempts. **Missed:** wrong or partly right, by count, then by id; at most ten in human output, all in JSON. A survey shows "Answers over time" instead: per question, each attempt's answer in date order. `--quiz` names questions and tags from the current source; without it, from the newest report.

### Tasks

1. 3c's fixes above, with goldens.
2. `src/core/stats/` (pure, no `node:*`): attempts in, the summary out, with unit tests for sections, retries, two versions, a question without an id, pending grades, surveys and criteria (an IELTS band and an additive rubric).
3. `quiz stats` in `src/cli/stats.ts`: loading reports and results, the G14 refusals, human and `--json`, goldens from fixtures made with `grade --json` (never by hand).

### Done when

`npm run check` passes in Chromium; five attempts over two versions of one fixture give the summary above in shape; a results file of an older version exits 1 with the fix; two quizzes exit 2. Report as the rules say.

### Review

**3d's review (2026-11-03).** Typecheck, Biome and Vitest clean: 93 files, **2334 of 2334**, the 2 startup tests. Playwright in Chromium: **193 passed**, 128 skipped, none failed. Goldens: 56 existing cases changed, all from two causes: `examples/exam` and `examples/medical` gained an `id` (so their versions changed, and the grade cases' results inputs carry the new hash), and each report question gained `hash`; 25 new cases. `new/default-folder` became a unit test (its id is the random temp folder's name). Tried by hand: five attempts over two versions give the summary in the approved shape; a survey gives "Answers over time"; a results file of the old version exits 1 with the fix; two quizzes exit 2; `new rust signals/week3.md --json` writes `id: week3`. **Found in review:** an average IELTS band prints as `5.88`; bands are halves, so two decimals read as false precision. The agent kept re-sending its report while a monitor of its own ran; stopped in review, with nothing left uncommitted.

**3d's gaps decided by the owner on 2026-11-03**, all as recommended, and written into COMMANDS.md (`quiz stats`: matched by id only, `--quiz` renames titles and tags, `attempts` on criteria, holistic criteria left out, bands to one decimal, the survey `answers`, unanswered is not missed, a results file without `--quiz` exits 1; `quiz new`: the id from a name starting with a digit, too long, or empty) and TECHNICAL_DESIGN.md section 6 (a report question's `hash`). **G3 changes for `stats`:** the match by question hash is removed (unreachable: a question without an id fails `check`); `review` still refuses such a quiz. Removing that path, the band's one decimal and the id edges are 3g's first tasks.

## Slice 3g: 3d's fixes, then `brief` through flags

**Approved by the owner on 2026-11-03**, with G15 to G18.

### Read first

- COMMANDS.md: `quiz brief` (all of it: the question file, the detail rules, both option tables, "Defaults per purpose", "Also", "The file"), "Exit codes", "Common options" (`--json`).
- TECHNICAL_DESIGN.md section 5: the `brief.*` rows of the rule catalogue and "Where the config comes from" (the profile from the brief); section 9, the `brief` forms row.
- USER_DESIGN.md: the "Brief" step of the loop (item 1) and the agent's limits (the **Author** row).
- This plan: "Rules for every slice", G11 (decided), G15 to G18, and 3d's decided gaps.
- Code: `src/core/ir.ts` (`BriefSchema`), `src/core/rules/brief-read.ts`, `src/core/rules/brief.ts`, `src/cli/atomic.ts`, `src/cli/main.ts`, `src/core/stats/`, `src/cli/new.ts`.

### Decided for this slice

- **3d's fixes:** `stats` loses the match by question hash and its "no id" marking; an average band prints to one decimal; `new`'s id edges (a digit first, over 64, nothing usable), with goldens.
- **The question file** (G11): `src/brief/questions.yaml`, one entry per key in COMMANDS.md's file table, in its order, every text in `en` and `vi`; a zod schema and a test that it covers every `BriefSchema` key exactly once, that every `choice` value is one the schema accepts, and that no `en` or `vi` text is missing. Shipped as data in the bundle: read at run time, never by `check`.
- **The writer:** one pure function in `src/core/brief/` takes the answers (each marked `user`, `default` or `agent`) and returns the YAML text: every key always, in the file table's order, `decided_by` for every key, and the same bytes for the same answers, however they were given. 3h and 3i call the same function; the three-way test in 3h depends on it.
- **Flags:** every option of COMMANDS.md's table, values checked against the question file (a bad one exits 2 naming the allowed values); `--kinds-other` without `other` in `--kinds` exits 2. Defaults from the question file, recorded `default`; human-only values without a flag make the run exit 3 with `{"status": "needs_input", "missing": ["purpose", "scope"], "how": "…"}` (the `how` names the flags and `--web`), nothing written. `--accept-defaults` fills human-only values that have a default (`purpose`), recorded `agent`; `scope` has none, so it still needs a flag.
- **Detail rules:** a text answer under its `min-words` is written with the warning `brief.vague` (the key, the word count, the question file's example), in `--json`'s `warnings`; exit 0.
- **Defaults per purpose:** the question file holds each purpose's defaults; the machine config's `[brief.purpose.<purpose>]` tables replace them, read through the existing config loader, with `config.toml:line` errors (an unknown purpose, key or value).
- **Not in this slice:** `--web` and `--tui` exit 2 "not available yet" (3h, 3i).

### Tasks

1. 3d's fixes above.
2. G15: `commitment` in `BriefSchema` and the brief fixtures; the `brief.*` goldens updated and counted.
3. The question file, its schema and tests (G11, G16's defaults).
4. The writer, with unit tests: byte-identical output for the same answers given in any order; every key present; `decided_by` right for flags, defaults and `--accept-defaults`; the profile resolved from the purpose; Vietnamese text and YAML quoting edges (colons, `#`, leading spaces, multi-line `request`).
5. `quiz brief DIR` with flags: G17 (`brief.no-history` registered as a warning), G18, exit 3, `--json`, `content/` created, goldens for every exit; `check` reads every written brief without `brief.invalid`.
6. `[brief.purpose.<purpose>]` in the machine config, with goldens for a changed default and for each config error.
7. `quiz --help` and the top-level goldens gain `brief`.

### Done when

`npm run check` passes in Chromium; `quiz brief d --purpose exam-prep --scope "lectures 3 to 5, the Fourier transform" --json` writes a `d/brief.yaml` that `check` reads cleanly, and the same answers given in another flag order write the same bytes; without `--scope` it exits 3 and writes nothing. Report as the rules say.

### Review

**3g's review (2026-11-03).** Typecheck, Biome and Vitest clean: 96 files, **2422 of 2422**, the 2 startup tests (run alone, as `npm test` runs them; inside a single run of every file at once the `check` budget test reads 240 ms against 180, which is that invocation's load, not a regression). Playwright in Chromium: **193 passed**, 128 skipped, none failed (run in review). Firefox not run (not installed here, as before). Goldens: 23 existing cases changed (4 `stats` cases for the one-decimal bands, 17 `rules/*` cases for the `brief.no-history` row, `top/help` and `top/no-command` for `brief`); 49 new (5 `new/id-*`, `check/brief-no-commitment`, 29 `brief/*`, 14 `brief/config-*`). The question file ships as `dist/brief/questions.yaml` (13 KB, copied by `scripts/build-brief.mjs`); `brief` and its `--help` are lazy chunks, so startup is untouched. Tried by hand: the "Done when" command writes `d/brief.yaml` and `d/content/`, and `check` on a quiz beside it gives no `brief.invalid`; the flags in another order write the same bytes; without `--scope` exit 3 with `needs_input`, nothing written; `--scope x` and `"ch 3"` write with `brief.vague` (the word count and the example); `--accept-defaults` writes `purpose: self-study` as `agent`; `--purpose exam` exits 2 naming the four values; a second run on the same `DIR` exits 2 with G18's message; a scope with `: ` and `#` and a two-line `request` with leading spaces are written quoted and read back. Done differently, accepted in review unless the owner says otherwise: a whitespace-only `--scope` counts as missing (exit 3); an existing `brief.yaml` is reported before a missing value (exit 2 before exit 3, as G18 says "before asking anything"); `--profile` is checked against the built-in and configured profiles (exit 2 naming them); a `config.toml` error under `[brief.purpose.*]` also stops the other commands, since the file is read once; `--timeout`, `--port` and `--no-open` are accepted and ignored without `--web`; lists are written in the question file's order, so `--kinds a,b` and `b,a` give the same bytes; `decided_by.content` is the strongest of its three answers.

**3g's gaps decided by the owner on 2026-11-03**, all as recommended, and written into TECHNICAL_DESIGN.md section 5 (the `brief.vague` row) and COMMANDS.md (`quiz brief`: the question file's extra fields, `--accept-defaults` fills only the values that need an answer; `quiz stats`: a report question with an empty `id` exits 1). They are 3i's first tasks.

## Slice 3i: 3g's fixes, then `brief --tui`

**Approved by the owner on 2026-11-03**, with G12 and G23 to G25.

### Read first

- COMMANDS.md: `quiz brief` (all of it, especially `--tui`, the question file, the detail rules and "The file"), "Exit codes", "Common options"; `quiz stats`'s `FILE...` row and exit list.
- TECHNICAL_DESIGN.md section 3 (the terminal form row), section 5 (the `brief.*` rows), section 7 (Budgets: `@clack/prompts` loads only for `brief --tui`), the notices paragraph and its allow-list.
- This plan: "Rules for every slice", G12, G19 to G25, and 3g's review.
- Code: `src/cli/brief.ts`, `src/cli/brief-help.ts`, `src/cli/brief-questions.ts`, `src/core/brief/` (`questions.ts`, `write.ts`), `src/brief/questions.yaml`, `src/core/rules/brief.ts`, `src/cli/stats.ts`, `scripts/notices.mjs`, `test/notices.test.ts`, `test/startup.test.ts`, `test/golden/brief/`.

### Decided for this slice

- **3g's fixes:** `brief.vague` registered as a warning beside `brief.no-history` (G19), its `run` returning nothing; the `rules/*` goldens change once, counted. G20, G21 and G22 are already what the code does: only the docs changed, and a test pins each (`--accept-defaults` leaves `commitment` as `default`; a report with an empty question `id` exits 1 with the fix; the question file's schema covers every field COMMANDS.md now names).
- **The dependency** (G12): `@clack/prompts` pinned exactly (1.8.1, or the newest at least two weeks old when the slice starts), loaded by a dynamic `import()` inside the `--tui` path only; a test checks that `brief` through flags and `check` do not load it. `--acknowledgements`, `THIRD_PARTY_NOTICES.md` and the notices test gain it and its dependencies; the allow-list is not widened.
- **The form** reads the question file and nothing else for its words: each section a step with progress (*Quiz 1/2*); each question's label and help; a `choice` as a select and a `multi` as a multi-select, each choice with its hint; the follow-up text box when *other* is picked; `text` with its `min-words` (show the example, ask again); `number` with `min` and `max`; human-only questions start empty and cannot be skipped, an `optional` one may be left empty. The defaults that depend on the purpose (`mix`, `profile`, the machine config's `[brief.purpose.*]`) are filled after purpose is answered, so changing purpose on the way back refills the ones still at their default.
- **The summary screen** lists every answer, marks the defaults (G23), and lets the user go back to any question; only **Write** writes. The answers go through the same writer as the flags (`emitBrief`), so nothing new decides the bytes.
- **Flags with `--tui`** (G24), **the streams, `--json` and Ctrl+C** (G25), as decided. G18's check (an existing `brief.yaml`) runs before the form opens.
- **Not in this slice:** `--web` (3h). Its "not available yet" stays.

### Tasks

1. 3g's fixes above (G19's registration, tests pinning G20 to G22).
2. G12: the dependency, its notices and the load test.
3. The form as a module over injected `input` and `output` streams, so it can be driven in process; the summary screen; going back.
4. `quiz brief DIR --tui`: the terminal check, flags as pre-fills, stderr drawing, `--json`, Ctrl+C, the exits; `--help` and the brief goldens updated (the `tui` golden's "not available yet" goes).
5. **The byte-identity test:** for at least six answer sets (every purpose; English and Vietnamese; *other* with its text; a changed purpose on the way back; a defaults-only run but for purpose and scope; `--weak-topics yes`), the form and the equivalent flags run write the same bytes and the same `decided_by`.
6. One subprocess test under `script(1)`: the real command answers through a pseudo-terminal and writes the brief; a SIGINT mid-form writes nothing. Skipped by name where `script` is not there.
7. `npm run samples` gains a `brief --tui` line for the owner to try by hand.

### Done when

`npm run check` passes in Chromium; `quiz brief d --tui` in a real terminal asks every question in the question file's words, shows the summary, and writes a `d/brief.yaml` byte-identical to the flags run with the same answers; Ctrl+C writes nothing; `quiz brief d --tui < /dev/null` exits 2 with the message; `check` does not load `@clack/prompts`. Report as the rules say.

### Review

**3i's review (2026-11-03).** Typecheck, Biome and Vitest clean: 98 files, **2466 of 2466**, the 2 startup tests. Playwright in Chromium: **193 passed**, 128 skipped, none failed (run in review). Goldens: 19 changed (17 `rules/*` for the `brief.vague` row, once; `brief/tui` for the terminal message in place of "not available yet"; `brief/help` for the `--tui` line); 3 new (`brief/tui-json`, `brief/tui-and-web`, `brief/tui-accept-defaults`). The byte-identity test compares 11 answer sets (every purpose, Vietnamese both ways, *other*, purpose changed on the way back, `--weak-topics yes`, several answers changed, a flag pre-fill kept) through the form and the flags: the whole file, `defaults_applied` and the warnings. `@clack/prompts` 1.8.1 and its four dependencies, all MIT, are in the notices and load only from the form's chunk (`test/cli-graph.test.ts`). **The notices script changed:** clack's MIT text is worded differently, and as the first MIT text it would have become the one the page's Licences popup shows (9 build goldens changed in Sonnet's first run); the script now always takes a shown text from a package the page ships, and gives clack's copyright line in the override, since its file runs title and copyright on one line. Reviewed and accepted; no build golden changed. Tried by hand: `< /dev/null` exits 2 with the message; under `script(1)` the form draws each step heading, the help above each question, a hint beside each choice, and Ctrl+C prints "cancelled: nothing was written", exit 2, no `DIR`. Done differently, accepted in review unless the owner says otherwise: the form returns flag-style answers and `runBrief` writes them, so byte identity holds by construction (G23: an answer left at its default is omitted); going back is from the summary screen, as COMMANDS.md says; `--language` fixes the form's language for the run; the number and word checks moved to `src/core/brief/questions.ts`, shared by the flags and the form; the form's own words (steps, summary, validation) are in `src/cli/brief-tui.ts` in `en` and `vi`.

**3i's gaps decided by the owner on 2026-11-03**, all as recommended, and written into COMMANDS.md, `quiz brief` (the exit order; the cursor on the first choice; the step heading; 80 columns for a terminal with no width). G26 and G29 are code: 3j's first tasks.

## Slice 3j: 3i's fixes, then `build --watch` and `--serve`

**Approved by the owner on 2026-11-03**, with G30 to G33.

### Read first

- COMMANDS.md: `quiz build` (all of it: `--watch`, `--serve`, `--json`, several files, the build file), `quiz serve` (the `listening` line), "Exit codes", "Common options"; `quiz brief`'s exit list and `--tui` row (G26, G29).
- TECHNICAL_DESIGN.md: section 3 (Watching: `node:fs.watch` with `recursive`), section 7 (Budgets; "Left until measured": no disk cache), foundation 1 (what the quiz hash covers: the files to watch), foundation 4 (the server's rules), foundation 9 (no server code in a shared page; the reload code).
- This plan: "Rules for every slice", G6, G10, G26, G29, G30 to G33, and 3i's review.
- Code: `src/cli/build.ts`, `src/cli/build-file.ts`, `src/cli/main.ts` (the `LATER` stubs), `src/build/page.ts` (the CSP), `src/serve/server.ts`, `src/serve/module-file.ts`, `scripts/build-page.mjs`, `scripts/bundles.mjs`, `e2e/helpers.ts` (the served-command helper), `src/cli/brief.ts` and `src/cli/brief-tui.ts` (for G26 and G29).

### Decided for this slice

- **3i's fixes:** G26, the flags are checked before an existing `brief.yaml` and before the terminal (the `brief/tui*` goldens that change, counted); G29, the form draws at 80 columns when the output reports 0 or no width, with a unit test on a 0-column stream.
- **What is watched** (G6): each `FILE`, every file its quiz hash covers (assets, `materials` sheets and their assets, found from the last build, good or failed), and the build file; watched by folder, so an editor that saves by rename is seen; changes gathered for 100 ms, then one rebuild of the quizzes they touch. A file the quiz starts or stops referencing is watched from the next rebuild on. A deleted `FILE` is a failed rebuild (its read error), not an exit.
- **The last good page** stays on disk and in the server after a failed rebuild; nothing is written when check fails, as `build` already does. `--print` rebuilds the paper. A build file's entries are re-read when it changes; a build file that no longer parses is a failed rebuild of everything, and the old entries stay watched.
- **The reload server** (G30, G31): not the one-shot server's predicate or submit path. Either `startServer` gains a mode with no `quizIds`, no submit and an events path, or a small sibling in `src/serve/` shares its token, `Host` and refusal code; Sonnet picks the smaller change and says which. It holds the pages in memory and writes nothing. It runs until Ctrl+C, which exits 0 (G6).
- **Outputs** (G32) and **the index** (G33), as decided.
- **Determinism:** a `build --watch` page on disk is byte-identical to `build` of the same input (with `--built-at`); only the served copy carries the reload code.
- **Not in this slice:** a disk cache; a build log ([proposals/build-log.md](../design/proposals/build-log.md)); the PDF through the browser (a proposal written in this slice's review, as "Open proposals" says).

### Tasks

1. 3i's fixes above (G26, G29).
2. The watcher in its own module over an injected file-system watcher and clock, so unit tests never wait: debounce, the watched set following the last build, rename saves, deletion, the build file.
3. `build --watch` without `--serve`: rebuilds, the human line and the JSON lines, the last good page kept, `--print`, several files, the build file, Ctrl+C exits 0 with `{"status": "stopped"}`.
4. `dist/reload.js` (G31) and the served copy: its CSP, the byte-identity test (a page on disk with and without `--watch`), a test that a `--serve` page holds no submit code.
5. The reload server (G30): token paths, `Host`, the event stream, the keep-alive comment, the index (G33); `--port`, `--open`.
6. Subprocess tests with the served-command helper: start `build --watch --serve --json`, read `listening`, open the page in Playwright, edit the quiz, see the page reload with the change; save an error, see the terminal's errors and the page unchanged; fix it, see it reload; SIGINT exits 0. The same for two files through the index.
7. `quiz build --help`, the `LATER` stubs removed, goldens for every new exit and usage error; `npm run samples` gains a `build --watch --serve` line.

### Done when

`npm run check` passes in Chromium; `quiz build examples/rust/quiz.md --watch --serve --open` opens the page, a saved edit reloads it within a second, a saved error leaves it as it was and prints the errors, and Ctrl+C exits 0; the page on disk is byte-identical to `build`'s; `check` does not load `src/serve/`. Report as the rules say.

### Review

**3j's review (2026-11-03).** Typecheck, Biome and Vitest clean: 101 files, **2525 of 2525**, the 2 startup tests. Playwright in Chromium: **197 passed** (4 new in `e2e/watch.spec.ts`), 128 skipped, none failed (run in review). No existing golden changed; 13 new (`brief/tui-bad-flag` for G26; 7 `build/*` usage errors and a missing file; `top/help-build`; the index in `en` and `vi`; 2 e2e `jsonl` goldens). `dist/reload.js` is 178 B (170 gzipped); `dist/serve.js` unchanged; the watch code is its own CLI chunk, which `build` and `check` never load. The reload server is a sibling, `src/serve/reload-server.ts`, with no POST path at all, sharing the one-shot server's token, `Host` and refusal code; the served copy is made by `withReload` on the finished page or paper, so a paper is served the same way. Tried by hand on a copy of `examples/rust`: `--watch --serve --json` gives `listening`, `built`, a `built` line and one `reload` event for a saved edit, a `failed` line with the errors and "kept the last good page" (no event) for a saved error; the page 200, a path outside the token 403; SIGINT printed `{"status":"stopped"}`, exit 0, no process left. Done differently, accepted in review unless the owner says otherwise: each watched file's folder gets a non-recursive watch (TECHNICAL_DESIGN.md section 3 says `recursive`); the 100 ms window starts at the first event and does not slide; a reload event names its page, so with several files an edit reloads only that page and the index; an unusable input at start exits 2 before anything is watched; the human line goes to stderr with and without `--json`. **Written in review:** [proposals/print-pdf.md](../design/proposals/print-pdf.md), as "Open proposals" planned.

**3j's gaps decided by the owner on 2026-11-03**, all as recommended, and written into COMMANDS.md (`quiz build`: the index's note on the next load; `--open` with `--watch --serve` opens the index; the config needs a restart) and TECHNICAL_DESIGN.md section 3 (the Watching row). G35's line was made in review, with a test in `test/build/watch.test.ts`.

## Slice 3e: G47, then the review file, `check --review` and `inspect --review`

**Approved by the owner on 2026-11-04**, with G48 and G49 as recommended. 3e as first listed (the format, the checks, the form, `--since`) is three Sonnet sessions, not one, so it is cut in three (the slice table): **3e** the file and the two commands that read it, with no browser; **3k** `quiz review` and its form; **3l** `--since` and the phone. This brief is 3e's; 3k and 3l stay outlines until 3e is reviewed.

### Read first

- COMMANDS.md: `quiz check` (the `--review` row and the exit list), `quiz inspect` (all of it), `quiz review` (the form's rules, for what the file must hold), `quiz ids`, "Exit codes", "Files".
- TECHNICAL_DESIGN.md: section 4, "`review-v1`" (the type, the rules on keys, reasons, merging and `assumed`, and the table of `review.fix`, `review.drop`, `review.unconfirmed`); section 5 (the rule catalogue: where these three go); foundation 1 (what the question hash covers); foundation 6 (versioned files; 0.x files refused).
- This plan: "Rules for every slice", G1, G2, G3, G47, G48, G49.
- Code: `src/core/ir.ts` (`QuestionBase`: `id`, `hash`), `src/core/parse/question.ts` (lines 300 to 325: the block the hash is taken over), `src/core/rules/types.ts` (`RuleContext`), `src/core/rules/fixed.ts` (the `fixed(...)` helper, `raisedBy: "check"`), `src/core/rules/quality.ts`, `src/core/rules/registry.ts`, `src/core/rules/check.ts` (`runChecks`), `src/cli/check.ts` (the `--review` stub, line 263), `src/cli/inspect.ts` (its stub), `src/core/inspect.ts` (`summarise`, `summaryLines`), `src/cli/main.ts` (the two `--review` options and their "not available yet"), `src/core/attempt/schema.ts` (how a versioned file is read and refused); for G47, `src/core/i18n/en.ts` and `vi.ts` (`fontName`), `src/page/Appearance.tsx` (line 150), `src/core/fonts.ts` (`FONT_REGISTRY[id].family`).
- Goldens: `test/golden/rules/`, `test/golden/check/`, `test/golden/inspect/`, `test/golden/top/` (help).

### Decided for this slice

- **G47 first:** the page's Font row names each font by category, from the catalogs: `en` System, Sans, Serif, Readable; `vi` Hệ thống, Sans, Serif, Dễ đọc. Each pill's `title` is the family from `FONT_REGISTRY` (none for System). The Information tab keeps the family names. TECHNICAL_DESIGN.md section 8 (the Appearance row) says so. Goldens of built pages that hold the font row's strings change: count them.
- **The file** (G48): `{"format": "fullmark-review", "version": 2}` and the fields of section 4's type. A zod schema in `src/core/review/schema.ts` is the source of the TS type; a reader in `src/core/review/read.ts` returns the review or every problem found: not JSON, wrong `format` or `version` (a file with `"version": 1` and no `format`, as 0.x wrote, is refused with "a fullmark 0.x review: 1.0 does not read it; judge the quiz again with `quiz review`"), a missing or wrongly typed field, an unknown verdict, an unknown reason id, a reason given with the wrong verdict, `reasons` not empty for `keep` or empty for `fix` and `drop`, an `other` reason with an empty `note`, `assumed` on a `fix` or `drop`, `source` on a `keep`. A reason for essays and code (`rubric-loose`, `points-misallocated`, `criterion-unclear`) on a question that is in the quiz and is not `essay` or `code` is a problem too; on a question no longer in the quiz it is not judged.
- **Writing and merging** (`src/core/review/merge.ts`), for 3k to call, tested here: `merge(old, judged, quiz)` replaces the entries judged, keeps every other entry (also those of questions no longer in the quiz), sets `quizHash` and `reviewedAt`, and writes keys sorted, so the same inputs give the same bytes. `source` is the question's block as hashed (foundation 1): export it from the parser beside the hash (for example a `blockText(lines, region, parts)` used by both), without adding it to the IR, so no IR golden changes.
- **The three rules.** `review.fix` and `review.drop` are fixed rules (`raisedBy: "check"`, level error); `review.unconfirmed` is a quality rule (warning by default) that runs only when a review is given. `RuleContext` gains `review: Review | null` (null everywhere except `check --review`). Each finding is on the question's heading line and names the verdict's date and reasons ("marked fix on 28 Oct (unclear): the question has not changed since"); the fix hints are section 4's. Entries for questions no longer in the quiz are ignored; a `keep` is never a finding. The `rules/*` goldens change once for the three new rules: count them.
- **`check --review REVIEW`**: one quiz only (several files exit 2, "--review takes one quiz"); an unreadable or invalid review exits 2 listing every problem; a review whose `quizId` is another quiz's exits 2 naming both ids. A review of another *version* of the same quiz is the normal case and is fine. `--json` is as without `--review`, the findings among `issues`.
- **`inspect --review REVIEW`** (G49): the same reading and the same exits as `check --review`; the summary gains one row and the JSON one key.
- **Not in this slice:** `quiz review` and its form (3k); `--since` (3l); the reason labels in the catalogs (3k, from the ReviewVi board): the CLI's messages are English only.

### Tasks

1. G47 (one commit): the catalogs, the tooltip, TECHNICAL_DESIGN.md section 8, the goldens that change, counted; a unit test that the Font row shows the categories and the families as tooltips.
2. `src/core/review/` (one commit): the schema, the reader with every problem above (one fixture each), the block text from the parser (a test that the `source` of a question hashes to its `hash`), `merge` with its determinism test.
3. The three rules and `RuleContext.review` (one commit): unit tests for each finding and each non-finding (changed fix, removed fix, changed drop, removed drop, keep, an entry for a removed question, a changed fix that was judged again in a later run); the `rules/*` goldens, counted.
4. `check --review` and `inspect --review` (one commit): the stubs and the "not available yet" help text removed; goldens for a clean review, each finding, `--json`, every exit 2 (several files, unreadable, invalid, 0.x file, another quiz); `inspect --review` in human and `--json`.
5. The docs (with the code that makes them true): G48 and G49 into TECHNICAL_DESIGN.md section 4 and COMMANDS.md, `review-v1` renamed `review-v2` where it names the format (this plan's history keeps the old name).

### Done when

`npm run check` passes in Chromium (Firefox only if the environment has it; say which ran); a review fixture with one fix, one drop and one keep makes `quiz check examples/<quiz> --review review.json` exit 1 with `review.fix` and `review.drop`, exit 0 with `review.unconfirmed` once both questions are changed and the drop removed, and exit 2 on a 0.x review; `quiz inspect --review` prints the counts; `check` still does not load `src/serve/`. Report as the rules say, with every golden that changed counted and explained.

### Review

**3e's review (2026-11-04).** Six commits, `5e9b45c`..`dbcd43e`. Typecheck and Biome clean; the 2 startup tests and `test/cli-graph.test.ts` pass alone (`check` still does not load `src/serve/`). Vitest: **2539 passed**, 51 failed, 3 skipped. The 2 startup tests fail only in the parallel run, as before; the other **49 fail identically on the baseline `261bf3e`** (run in review in a worktree there: the same six files, the same counts), for the causes in G51. None of the failures is a 3e test. Playwright in Chromium: 190 passed, 133 skipped, 2 failed. `watch.spec.ts:167` fails on the baseline too (`EPERM` on a temp folder, G51). `budget.spec.ts` passes alone on HEAD, twice, but only on its retry (first measure 1074 and 1106 ms against 1000 ms, then 564 and 527 ms); G47 adds only a `title`, so this is the laptop's cold start, to watch in 3z. Firefox was not run.

**Goldens**, all explained: G47 changed **14 files in 9 cases** (8 `build/*` and `replay/good`: the Font row's four words and the tooltip); the three new rules changed **17 `rules/*` cases** (two lines in the fixed group, one in the quality list); `check/review-with-several` and `top/help-check` changed with the stub's message and the option's help; **19 added** (13 `check/review-*`, 6 `inspect/review-*`); **3 removed** (the "not available yet" stubs).

**Tried by hand** on a copy of `examples/calculus`, with a review made by `merge` and `serialiseReview` (fix on `chain-rule`, drop on `product-rule`, keep on `related-rates`): exit 1 with `review.fix` and `review.drop` on the heading lines; after changing `chain-rule`'s answer and removing `product-rule`, exit 0 with `review.unconfirmed` only (exit 1 with `--strict`); `inspect --review` printed `Review    keep 1 · fix 1 · drop 1 · not judged 9 · 28 Oct`, and the JSON key as G49 says (`fixChanged: 1`, `drop: 0` after the edits); exit 2 for a 0.x file (G48's message), two quizzes or a glob ("--review takes one quiz"), another quiz's review (both ids named), and a file that is not JSON (with `problems` in `--json`). The `source` written is the block without its id, as foundation 1 hashes it. The schema's problems use zod's wording ("Invalid input: expected string, received undefined"), as the results and grades readers already do.

**Done differently, accepted in review unless the owner says otherwise:** `review.unconfirmed` sits in its own `REVIEW_RULES` group, so `quiz rules` lists it last, after the build rules; `review.fix` and `review.drop` are raised by `runChecks` itself, beside the profile's rules, and cannot be ignored (fixed rules never can); a finding names the review's one `reviewedAt` (an entry has no date of its own) and the reason ids, not their labels (labels come with 3k); the `--json` error object gains `problems`, written into COMMANDS.md; `merge` takes a `ReviewTarget` built by `reviewTarget(quiz, quizHash, blocks, reviewedAt)`, so it stays pure; the other-quiz check comes before the rubric-reason check; the parser gives the blocks through an optional `ParseOptions.blocks` map, so no IR golden changed. No example `review.json` was added (the brief asked for none).

**3e's gaps decided by the owner on 2026-11-04**, both as recommended: G50 (the unconfirmed hint names the real files) is 3l's first task, G51 (local Windows runs green) is 3k's.

**Left on the disk by the implementing agent** (its own cleanup was blocked): the worktree `D:\coding-projects\fm-base` at `261bf3e` (used again in this review for the baseline), whose `node_modules` is a junction to this repo's, and six `D:\tmp_*.txt` logs. With the owner's go-ahead the junction and the worktree were removed in review (the real `node_modules` kept); the logs are left for the owner to delete, since the safety check refuses removals at the root of `D:`.

## Slice 3k: G51, then `quiz review` and its form

**Approved by the owner on 2026-11-04**, with G52 to G55 as recommended. Built from the Review, ReviewFinish and ReviewVi boards (`docs/mockup/boards/`, images in `docs/mockup/images/`) at 1280 px. The stacked sidebar with the materials, `--since` and the phone are 3l's (G52).

### Read first

- COMMANDS.md: `quiz review` (all of it), `quiz serve` (the options, the `listening` line, the exits 3k copies), `quiz check` (`--review`), "Exit codes", "Files".
- TECHNICAL_DESIGN.md: section 4, "`review-v2`"; section 7, foundations 4, 6 and 9 (the locked-down server, one module for every form, a built page holds nothing of a server); section 8, the Sidebar, Question map and Appearance rows and the text size; the catalogs (the `vi` rules).
- This plan: "Rules for every slice", G38 to G46, G48, G51 to G55, and 3e's Review.
- Code: `src/serve/server.ts` (`startServer`, and how a POST body is read and checked), `src/serve/module.ts`, `src/cli/serve.ts` (`runServe`: the refusals, `--json`, the timeout, Ctrl+C), `src/cli/atomic.ts`, `src/cli/review-file.ts`, `src/core/review/` (all), `src/core/parse/index.ts` (`ParseOptions.blocks`), `src/build/page.ts` (`pageQuizOf`, `buildPage`, the CSP), `scripts/bundles.mjs` and `scripts/build-page.mjs` (the IIFE bundles), `src/page/data.ts` (`PageQuiz`, `KeyBlob`, `openKey`), `src/page/questions/Card.tsx` and the type components (their after-Submit state), `src/page/Appearance.tsx`, `src/page/look.ts`, `src/page/Sidebar.tsx` and `src/page/map.ts` (`Part`, `Ring`, the cells: their look, not their store), `src/page/styles/`, `src/core/i18n/en.ts` and `vi.ts`, `e2e/helpers.ts` (`serveProcess`, `expectGolden`, `noViolations`), `scripts/samples.mjs`, `test/cli-graph.test.ts`.
- For G51: `test/golden/golden.test.ts` (how a case's environment is set), `src/cli/templates.ts` (where the user folder comes from), `test/watch/watcher.test.ts`, `test/build/watch.test.ts`, `test/serve/server.test.ts`, `test/build/several-cli.test.ts`, `test/build/build-file-cli.test.ts`, `e2e/watch.spec.ts`.

### Decided for this slice

- **G51 first:** the golden runner sets the user config folder of every case itself, on every platform, so the `template/*` and `new/user-template*` goldens pass on win32 unchanged (a golden that would have to change is a sign the fix is wrong: stop and report). Temp folders in tests are removed with retries. Each watch, watcher and server test that waits on real time takes its time from the injected clock or the injected timer; one that cannot is named in the report with the reason. The two example tests that time out get a timeout sized to what they build, said in the test. Done when Vitest has no failure on win32 here, run twice.
- **The server takes other submits** (foundation 6: every form runs on one module). `startServer` gains the reader of a submit body as an option: given the parsed JSON, it returns the quiz id and the value, or a plain-words problem (400). `serve` passes the attempt reader it has today, so no `serve` test or golden changes. Each server keeps the one POST path, `./submit`; `review` has no progress path.
- **The command:** `quiz review FILE [--out REVIEW] [--open] [--timeout SECONDS] [--port N] [--json]`, as COMMANDS.md says. It refuses, in this order: a usage error, exit 2 (a built page, as `serve` refuses one; `--since`, with "quiz review --since is not available yet"); a survey, exit 2 (G54); check errors, exit 1, printed as `check` prints them; questions without an id, exit 1, all named, with "run `quiz ids FILE` first: a verdict follows its question by id"; an `--out` file that `check --review` would refuse (unreadable, invalid, 0.x, another quiz), exit 2 with the same messages. Then it serves the form, with the `listening` line under `--json`, `--open`, the timeout (default 1800 s) and Ctrl+C as `serve` has them. Nothing is written unless a Finish is accepted, and an interrupted run leaves an existing `--out` byte for byte as it was.
- **The submit:** `{"quizId", "quizHash", "judged": {"<id>": {"verdict", "reasons", "note", "assumed"?}}}` with one entry for every question of the quiz, the earlier verdicts kept under G53 included. The server checks it with the review's own rules (the entry schema, rubric reasons only on essays and code) and answers 400 to another version, a missing or unknown id, or a broken entry. It then writes `merge(old, judged, reviewTarget(...))`, with `reviewedAt` from the injected clock (local offset) and `serialiseReview`, atomically, and ends. It prints `review.json written: 26 keep (14 not looked at), 3 fix, 1 drop` and the next command, `quiz check FILE --review REVIEW`. With `--json` it prints `{"status": "written", "review": PATH, "keep", "fix", "drop"}`, counted over the quiz's current questions as `inspect --review` counts them (`keep` includes the assumed). A timeout prints `{"status": "timeout"}` and exits 2.
- **The form** lives in `src/review/`, bundled to `dist/review.js` as its own IIFE beside `dist/serve.js`. The CLI builds its page in memory (`src/build/review-form.ts`) from the quiz's page data (`pageQuizOf`), the earlier verdicts kept under G53, the page's CSS and the form's own, and a CSP with the form's script hash and `connect-src 'self'`. `build`'s output does not change: no `build` golden moves. What it shows is COMMANDS.md's "The form" and the boards: the cards in key state (G55) with Keep, Fix, Drop, the reasons and the note (G41); the bar with the label, the sidebar button, the joined text size, Appearance only under `look: free`, Keep the rest and Finish (G42); the status line; the plain Questions sidebar with its collapsible parts, rings and 40 px cells (G39, G52); the keys `1`, `2`, `3`, `N`, `Q`, `Esc`, none while typing, with `aria-keyshortcuts` (G38); the Keep the rest and Finish dialogs (G43); the saved card. Colours, sizes and spacing come from the boards' source.
- **Words:** English from COMMANDS.md and the boards, Vietnamese from G46 (the ReviewVi board), in a `review` group of the catalogs; the quiz's `ui_lang` chooses. The CLI's own lines are English only.
- **Loading:** `quiz review` loads the page builder and `src/serve/`; `check` still loads neither, and `test/cli-graph.test.ts` names the review chunk.
- **Not in this slice:** `--since`, the stacked Questions & materials sidebar and the phone (3l, G52); G50's hint (3l).

### Tasks

1. G51 (one commit): the runner's user folder, the retries, the clocks and the timeouts; Vitest clean on win32 twice, the counts in the report.
2. The server's body reader (one commit): the option, `serve` unchanged, unit tests with a second reader (port 0, `fetch`).
3. The command without the form (one commit): every refusal and exit, a golden each (`test/golden/review/`); the submit read and written as a unit test with a POST (merge into an existing file, the clock injected, G53's kept verdicts written back unchanged), and the `--json` lines.
4. The form (one or more commits): the components, the bundle, `review-form.ts`; Playwright through `serveProcess`: judge every question by mouse and by keys; a Fix with no reason, or Other with no note, holds Finish back; Keep the rest and the Finish dialog write `assumed`; the written file against a golden and read back by `quiz check --review`; the saved card; a second run opens with the first run's verdicts (G53); a `vi` quiz; axe in light and dark; screens of the Review, ReviewFinish and ReviewVi states to `docs/screens/3k/`, committed.
5. The rest (one commit, with the code that makes it true): the samples line for `quiz review`; G52 to G55 into COMMANDS.md (`quiz review`) and TECHNICAL_DESIGN.md (section 4 for G53); the slice table's 3k and 3l rows as G52 says.

### Done when

`npm run check` passes on win32 here with no Vitest failure (G51) and in Chromium (Firefox only if the environment has it; say which ran). `quiz review examples/rust/quiz.md --open` opens the form in the quiz's look; judging every question by keys and pressing Finish writes `review.json`, and `quiz check examples/rust/quiz.md --review review.json` then exits 1 with `review.fix` and `review.drop` for what was marked. A second `quiz review` opens with those verdicts in place. A survey exits 2; a quiz with a question without an id exits 1. `check` still does not load `src/serve/`. The screens are committed. Report as the rules say, every golden that changed counted and explained.

### Review

**3k's review (2026-11-04).** Seven commits, `91a8821`..`c326d9f`. Typecheck, Biome and knip clean. Vitest, run twice in review after a fresh build: **2668 passed**, 3 skipped, and in each run only the 2 startup tests failed, because the run was parallel; alone (as `npm test` runs them) they pass, 2 of 2. So **G51 holds: no other failure on win32**, where 3e's review had 49. Playwright in Chromium: 205 passed, 140 skipped, 1 failed, `budget.spec.ts` under the full run's load (1134 ms against 1000); alone it passes at 592 ms. `dist/page.js`, `serve.js`, `reload.js` and `page.css` are byte-identical to before 3k, so the shared page is unchanged. Firefox was not run, and the Ctrl+C e2e test is skipped on win32: both need a Linux run, in 3z at the latest.

**Goldens**, all explained: **2 changed** (`top/help` stdout and `top/no-command` stderr, each the three lines of the new `review` entry); **19 added** under `test/golden/review/` (every refusal and its `--json` form) and 3 e2e goldens (`review-written`, `review-types`, `review-keep-rest`); none removed, no `build` golden moved.

**Tried by hand** on a copy of `examples/rust`. `quiz review quiz.md --json`: the `listening` line, the form in the quiz's look. `1` gave Keep, `N` moved and scrolled to the next, `2` gave Fix. Finish with that Fix having no reason wrote nothing and listed it ("1 question needs a reason or a note…: 2"). After picking Unclear, Keep the rest opened its dialog, and Mark them Keep and finish wrote `{"status":"written","review":"review.json","keep":9,"fix":1,"drop":0}`, exit 0, with `assumed` on the 8 not looked at. `check --review` then exited 1 with `review.fix` on `which-compile` (reason "unclear"), and `inspect --review` printed `keep 9 (8 not looked at) · fix 1 · drop 0 · not judged 0`. After editing the `largest` question, a second `quiz review` opened at "Judged 9 of 10" with only `largest` not judged (G53). Killing that run left `review.json` byte for byte. `quiz review examples/survey/quiz.md` exits 2 with G54's message; `--since` exits 2, "not available yet".

**Done differently, accepted in review unless the owner says otherwise:**

- The form's words are in their own catalog file, `src/core/i18n/review.ts`, not a group in `en.ts` and `vi.ts`: adding them there changed `dist/page.js` and every build golden.
- G51 was met by finding the causes, not by moving every wait onto the injected clock. The watcher watched folders whose drive letter had been case-folded (a real Windows bug, fixed in `src/cli/watcher.ts`). The server answered 413 while the client was still writing, and Windows dropped the answer; it now reads up to twice the cap before answering. The example-building tests got timeouts sized and explained in the test, and the golden test's went from 60 to 180 s. No test was named as still waiting on real time; the two clean runs are the evidence.
- In the server the 409 "already submitted" now comes after the body is read and checked, not before.
- "Ask for `quiz ids`" applies only when every check error is `question.id-missing`; with other errors too, the errors are printed as `check` prints them.
- The human output leaves out "(0 not looked at)"; the two progress lines go to stderr; the form's `lang` is the quiz's `ui_lang`; `test/serve/module.test.ts`'s guard skips `src/cli/review.ts`, which uses the server as `serve.ts` does.

**Small things for 3l's fixes** (no decision needed):

- In both dialogs `quiz review --since` breaks at its hyphen; it should be a code span that does not wrap.
- COMMANDS.md says "until slice 3l" twice (the stacked sidebar and `--since`); 3l removes both when it builds them.
- A one-question part shows its heading row as the cell, as on the page (`singleRow`), so "3 · Write some code" has no count: as designed.
- Fixed in review: a form-feed byte in a comment of `test/golden/runner.ts` (the `\f` of `%APPDATA%\fullmark`, written by a shell).

**3k's gaps decided by the owner on 2026-11-04**, both as recommended: G56 (a matching question's distractors, listed as "Matches nothing") is built in 3l; G57 (the six strings not on the boards) keeps them as written.

**Left on the disk:** nothing in the repo; the review's copies are in the session scratchpad.

## Slice 3l: G50, G56 and 3k's fixes, then `quiz review --since`

**Approved by the owner on 2026-11-05**, with G58 to G62 as recommended. As G58 decided, the stacked Questions & materials sidebar and the phone are 3m's. Built from the ReviewSince board (`docs/mockup/boards/ReviewSince.dc.html`, image in `docs/mockup/images/ReviewSince.png`) at 1280 px, with the plain Questions sidebar that 3k built in place of the stacked one drawn there.

### Read first

- COMMANDS.md: `quiz review` (all of it, "With `--since`" above all), `quiz check` (`--review`), `quiz inspect` (`--review`: how the date is written).
- TECHNICAL_DESIGN.md: section 4, "`review-v2`" ("What the form opens with", `source`, `assumed`).
- This plan: "Rules for every slice", G43, G44, G50, G53, G56, G58 to G62, and 3k's Review (its "done differently" and "small things").
- Code: `src/cli/review.ts` (the refusals, `readOld`, the submit reader), `src/build/review-form.ts` (`earlierVerdicts`, `ReviewData`), `src/review/` (all), `src/core/i18n/review.ts`, `src/core/review/` (all), `src/core/rules/review.ts` and `src/core/rules/types.ts` (`RuleContext`), `src/cli/check.ts` (where `RuleContext` is built), `test/golden/review/`, `e2e/review.spec.ts`, `e2e/screens-3k.spec.ts`.

### Decided for this slice

- **G50 first:** `RuleContext` carries the quiz's path and the review file's path as `check` shows them, so `review.unconfirmed`'s hint reads "run `quiz review quiz.md --since review.json` and judge the change" with the real names. `quiz rules` keeps `FILE` and `REVIEW`. Every golden that changes is counted in the report.
- **G56:** a matching question in the form lists its distractors under the pairs, in source order, each marked "Matches nothing" (vi: "Không ghép với mục nào").
- **3k's small fixes:** in both dialogs the command is a code span that does not wrap; with G62 the sentence becomes "a later `quiz review` can still judge them" (vi: "lần `quiz review` sau vẫn có thể xét lại"). COMMANDS.md loses "until slice 3l" for `--since` (the stacked sidebar's stays until 3m).
- **The command** (G59, G60): `quiz review FILE --since REVIEW [--open] [--timeout SECONDS] [--port N] [--json]`. The refusals keep 3k's order, with `--since` in place of `--out`: a built page; `--out` naming a file other than REVIEW ("--since merges into its own review: leave out --out"), exit 2; a survey, exit 2; check errors and questions without ids, exit 1; REVIEW missing ("--since needs an existing review; run quiz review FILE first"), or refused as `check --review` refuses one, exit 2. With nothing new or changed: "nothing new or changed since your review of 28 Oct", exit 0, `{"status":"unchanged","review":PATH}`, the file untouched, nothing served. The date is written as `inspect --review` writes it.
- **What is asked:** the questions with no entry for their current hash: new ones (no entry) and changed ones (an entry whose hash is another). Every other question keeps its earlier verdict and is not shown. The submit is 3k's, one verdict for every question, the ones not asked coming back unchanged (G53), so the server's reader, `merge` and the output do not change.
- **The form with `--since`** (the ReviewSince board): only the asked questions are cards, in source order. The status line starts "Asked again: N questions new or changed since your review of 28 Oct", and "Judged", the progress bar and the counts cover those N; "Question K of M" keeps the quiz's numbering. A changed question shows, above its text, the box "Your verdict on 28 Oct" with the verdict in its colour, the reason chips and the note in quotes, then "What changed since" and a line diff of its `source` against its current block: unchanged lines plain, removed lines with `−` on `--bad-wash`, added with `+` on `--ok-wash`, monospaced. A changed question that was kept has the box with "Keep" (and "not looked at" when assumed) and "Changed since; a Keep does not store the earlier text" in place of the diff (G61). A new question has no box. In the map the questions not asked are muted, with a dashed border, not focusable by `N`, and the legend adds "not asked again". Keep the rest and the Finish dialog count and touch the asked questions only. The saved card and the output are 3k's.
- **The diff** is a line diff (longest common subsequence) written in `src/core/review/` with no package added, pure and unit tested; the form gets the old and new text in its data, both as hashed, and renders the diff itself. Words are added to `src/core/i18n/review.ts`, en and vi.
- **Not in this slice:** the stacked Questions & materials sidebar and the phone (3m, G58).

### Tasks

1. G50 (one commit): `RuleContext`, the hint, the goldens that change counted.
2. G56 and 3k's small fixes (one commit): the distractors, the dialog code span and sentence, COMMANDS.md; the e2e golden that changes counted.
3. The command (one commit): `--since` read and refused, `--out` beside it, nothing to ask; a golden per refusal and for `unchanged` (`test/golden/review/since-*`, replacing 3k's two "not available yet" cases, counted); a unit test that a `--since` run writes back every question not asked byte for byte.
4. The form (one or more commits): the diff with unit tests (equal texts, a line changed, lines added and removed, a whole block replaced, trailing newlines); the asked cards, the earlier verdict box, G61's line, the muted map and legend, the counts; Playwright through `serveProcess` on a copy of `examples/calculus` with a review from a first run, then one fix question changed, one kept question changed and one added: only those three are cards, the diff shows on the first, G61's line on the second, nothing on the third; Keep the rest marks only them; the file then has the other entries unchanged; a `vi` run; axe in light and dark; screens of the ReviewSince state to `docs/screens/3l/`, committed.
5. The rest (one commit): the samples line for `--since`; G58 to G62 into COMMANDS.md (`quiz review`) and TECHNICAL_DESIGN.md (section 4: what `--since` asks, G61); the slice table's 3l and new 3m rows.

### Done when

`npm run check` passes in Chromium (startup tests alone, as `npm test` runs them; Firefox only if the environment has it; say which ran). On a copy of `examples/rust`: `quiz review` with a Fix on one question, then that question edited, then `quiz check --review` warns `review.unconfirmed` naming `quiz review quiz.md --since review.json`; that command opens the form with only that question, its earlier verdict and the diff; Keep on it and Finish write the file with every other entry as it was, and `check --review` no longer warns. Run again with no change, it prints "nothing new or changed" and exits 0. The screens are committed. Report as the rules say, every golden that changed counted and explained.

### Review

Built by Sonnet in six commits, `54214a5`..`4140cf6`, from the brief alone; reviewed by Opus on 2026-11-05. Every "Done when" holds.

**Tests, run by the reviewer.** Typecheck, Biome and knip clean. Vitest: the startup tests alone 2 of 2, the rest 2691 passed, 3 skipped. Playwright, Chromium and Firefox both: 412 passed, 295 skipped, 1 failed, `budget.spec.ts:53` in Firefox (3418 ms against 1000). **Cause shown:** 3l does not touch the page (`git diff 630df71..HEAD` is empty for `src/page`, `src/build/page.ts`, `en.ts`, `vi.ts`), and `630df71`, built in a separate worktree on the same laptop, fails the same test alone in Firefox (1407 to 3231 ms); 3l's tree alone gives 1449 to 1775 ms, and Chromium passes alone. The laptop was loaded by other sessions; the budget is a machine measurement, as in 3k's review. The implementing agent saw the same test fail in both browsers under the full run and pass alone.

**Fixed in review** (one commit): the first full run failed on two `test/notices.test.ts` tests at Vitest's 5 s default. They wait for `generate()`, which bundles the CLI and the page runtimes with esbuild: 1.9 s with the file alone, past 5 s beside 108 other files on 4 cores. They now take a named 60 s timeout with that reason in a comment; the second run passed them. Not caused by 3l, which adds no bundle.

**Goldens**, as the report says and checked in the diff: **6 changed** (the G50 hint, one line each, in `check/review-unconfirmed`, `-json`, `-strict`, `inspect/review-counts`, `-json`; the `--since` line of `review/help`), **2 removed** (3k's `review/since` and `review/since-json`, "not available yet"), **7 added** (`review/since-out-other`, `-json`, `since-missing`, `-json`, `since-invalid`, `since-unchanged`, `-json`), 1 e2e golden added (`review-since-written.jsonl`). No `build` golden moved.

**Read in the code.** `askedIds` asks every question whose entry is missing or has another hash, in source order; the refusals keep 3k's order with `--since` in place of `--out`, and an `--out` naming the same file is accepted. The unasked questions start from `earlier` (hash equal), so each has a verdict, and the state's `N`, Keep the rest and Finish, which still walk all `items`, touch the asked ones only; the bar, the dialog and the sidebar counts use the asked `scope`. `lineDiff` is a plain LCS with a changed stretch's deletions first. The distractors are the `rights` past the pairs, which holds because the form's plan keeps source order.

**Tried by hand** on a copy of `examples/rust`, the form driven by POSTing its submission as the e2e helpers do (the agent's script, extended to compare entries). `quiz review --json` with a Fix on `which-compile` (unclear, "Which edition?") and Keep the rest wrote `keep 9 · fix 1`; `check --review` exited 1 with `review.fix`. After editing that question's heading it exited 0 with `review.unconfirmed` and "fix: run `quiz review quiz.md --since review.json` and judge the change". `--since review.json` served a form asking `which-compile` alone of 10, with the earlier verdict and both blocks; Keep on it wrote `keep 10 · fix 0`, the nine other entries identical to the first file's, and `check --review` then gave 0 errors, 0 warnings. Again with no change: "nothing new or changed since your review of 5 Nov", exit 0, and `{"status":"unchanged","review":"review.json"}` under `--json`. `--out other.json` and a missing `nope.json` both exit 2 with G59's messages. The screens in `docs/screens/3l/` match the ReviewSince board but for the plain sidebar (3m) and G63.

**Done differently, accepted in review unless the owner says otherwise:**

- The diff shows the stored `source` and the current block, both as hashed, so a heading's `id=` is in neither.
- In `vi` the date is written `28/10`, as the ReviewSince board writes it; `en` keeps `inspect --review`'s `28 Oct`.
- Two `vi` strings not on the boards, in `src/core/i18n/review.ts`: `keptChanged` "Đã đổi kể từ đó; Giữ không lưu bản trước" and `notLookedAt` "chưa xem"; the English "Asked again" line also has a singular form. Like G57, the owner reads them in the form and names a change.
- The diff is a `figure` with an `aria-label`, its `pre` focusable (axe's `scrollable-region-focusable`), with Biome's `noNoninteractiveTabindex` suppressed there and the reason in a comment.
- A part with nothing asked shows no count; a part's count covers the asked ones ("0/1"). A cell not asked is a disabled button.
- The saved card and the `--json` counts cover the whole review, as 3k's do; the status line covers the asked.
- The refusal order is 3k's (built page, `--since` with another `--out`, `--timeout`, `--port`, check, survey, ids, review): it differs from the brief only for a survey given with a conflicting `--out`, both exit 2.
- The e2e helper copies the quiz's `assets` folder, which the calculus copy needs.

**Not a gap:** the agent's first proposed gap (axe's `label` on a choice whose label is only maths, in the form on `examples/calculus`). Step 2 settled it: axe reads no text from MathML, browsers name the choice from it, and the page's own axe tests skip `label` and `select-name` on maths pages (`e2e/maths-code.spec.ts`, `MATHML_NAMES`). The form follows the page. The second (a large block carries both texts in the form's data) needs nothing: blocks are a few dozen lines. The third is G64.

**Small things for 3m's fixes** (no decision needed):

- An axe run of the form on a copy of `examples/calculus`, skipping `MATHML_NAMES` as the page's test does (3l's axe runs on rust only).

**3l's gaps decided by the owner on 2026-11-05**, both as recommended: G63 (the diff's lines wrap) and G64 (a `fix` or `drop` entry needs its `source`) open 3m's brief.

**Left on the disk:** nothing in the repo; the by-hand copies and scripts are in the session scratchpad.

## Slice 3m: G63, G64 and 3l's fixes, then the stacked sidebar with the materials, and the phone

**Approved by the owner on 2026-11-05**, with G65 to G67 as recommended. Built from the Review board (`docs/mockup/boards/Review.dc.html`, image `docs/mockup/images/Review.png`) for the stacked **Questions & materials** sidebar, the ReviewSince board for it with `--since`, and the ReviewPhone board (`ReviewPhone.png`) for the phone. This closes the `review` boards: after 3m, `quiz review` is as COMMANDS.md says.

### Read first

- COMMANDS.md: `quiz review`, "The form" (all of it: the sidebar, the keys, `--since`, the phone).
- TECHNICAL_DESIGN.md: section 4, "`review-v2`" (the reader, `source`); section 8, the rows "Sidebar", "Question map" and "Materials".
- This plan: "Rules for every slice", G52, G58, G61, G63 to G67, and 3l's Review (its "done differently" and "small things").
- Code: `src/review/` (all), `src/build/review-form.ts`, `src/cli/review.ts` (where `loaded.sheets` is at hand), `src/core/review/schema.ts` and the review reader it feeds (`loadReview`), `src/core/i18n/review.ts`; of the page, to follow and not to change: `src/page/Sidebar.tsx` (the stacked form, `PartRing`), `src/page/map.ts` (`ringOf`), `src/page/Materials.tsx` (`Sheets`), `src/page/keys.ts` (`M`), `src/page/App.tsx` (the phone top bar), `src/page/styles/25-sidebar.css` (the `max-width: 759px` block); tests `e2e/review.spec.ts`, `e2e/screens-3l.spec.ts`, `e2e/maths-code.spec.ts` (`MATHML_NAMES`), `test/golden/review/`, `test/golden/check/`.

### Decided for this slice

- **G63 first:** the `--since` diff's lines wrap (`white-space: pre-wrap`, breaking inside a long word when needed); a wrapped line keeps its `−` or `+` column and its wash, so the sign stays at the start of the first row and the continuation rows are indented under the text, not under the sign. The region no longer scrolls sideways.
- **G64:** the review reader requires `source` on every `fix` and `drop` entry. A file without it is refused by `check --review`, `inspect --review` and `quiz review` (also with `--since`) as the reader refuses a missing field today, the message naming the entry. COMMANDS.md and TECHNICAL_DESIGN.md section 4 say so. A golden for the refusal under `check/`.
- **3l's small fix:** an axe run of the form on a copy of `examples/calculus`, skipping `MATHML_NAMES` as the page's test does, in light and dark.
- **The stacked sidebar** (the Review board), for a quiz with materials: one block, 40% of the width, named **Questions & materials** (the top-bar button's name too). On top, **Questions**: the master and detail split 35/65 of the page's stacked map, the parts as a vertical tab list, each entry "Part N" over its name with a ring for the share judged (`ringOf`, an arc in the accent; a full disc with the tick cut out when every question is judged), the chosen part outlined in the accent; beside it the chosen part's heading, "6 of 12 judged · 3 fix · 1 drop" (the fix and drop parts only when not zero) and its grid of 40 × 40 cells in the verdict states. Each entry's accessible name gives its counts. A one-part quiz shows the grid without the list. Then the legend and the keys, as in the plain sidebar. Then a **Materials** heading over one chip per sheet and the open sheet, read-only, the first sheet open at first; the sheets are rendered at build as the page renders them (`pageQuizOf` given `loaded.sheets`), so maths and code in a sheet look as on the page. A quiz without materials keeps 3k's plain Questions sidebar.
- **With `--since`** in the stacked map (the ReviewSince board): the cells not asked are muted and dashed, disabled, as in 3l's plain map; a part's ring and counts cover its asked questions ("0 of 4 judged"); a part with none asked is G67.
- **Keys:** `Q` opens and closes the sidebar, `Esc` closes it, as now; `M` is G66.
- **The phone**, below 760 px (the page's `PHONE_QUERY` and its `max-width: 759px`), from the ReviewPhone board: the compact top bar ("Review: TITLE" over "Judged 15 of 32 · Question 20", and with `--since` "Judged 0 of 3 · Question 5"), the sidebar button a 44 px icon; the status line is not shown. On each card Keep, Fix and Drop share the card's width in three columns, the reason chips wrap, the note box takes the width. **Keep the rest** and **Finish** leave the top bar for a bar docked at the foot of the screen, side by side, each half the width, 44 px tall at least; the cards' column keeps room for it so the last card is never hidden. The dialogs and the saved card fit the width. The sidebar and the look controls on a phone are G65. Cells are 44 × 44 with the 6 px gap, as the page's phone map.
- **Nothing under `src/page/` changes**, and no `build` golden moves: the form follows the page's components in its own code under `src/review/`, importing only the page's pure helpers (`ringOf` and its like, as 3k imports the question bodies) and its CSS classes. A page component that would need a change to be shared is copied into `src/review/` with a comment naming the original, and reported under "done differently".
- Words are added to `src/core/i18n/review.ts`, en and vi; the vi ones follow the page's own (`Câu hỏi và tài liệu`, `Tài liệu`), and any not on the boards are listed in the report as G57's were.
- COMMANDS.md loses "until the stacked one is built (slice 3m)" and "(slice 3m)"; G65 to G67 go into it as plain statements.

### Tasks

1. G63, G64 and the calculus axe run (one commit): the CSS and its e2e check that no diff line is wider than the card; the reader, its unit test and the `check/` golden for the refusal; COMMANDS.md and TECHNICAL_DESIGN.md section 4; every golden that changes counted.
2. The stacked sidebar (one or more commits): the sheets in the form's data, the stacked map with rings and counts, the legend and keys, Materials with its chips and open sheet; `--since` in it (muted cells, the asked counts, G67); `M` (G66). Unit tests for the counts and the ring under `--since`; Playwright through `serveProcess` on a copy of `test/fixtures/page/materials.md` with its `materials/` folder (three sheets, three parts, 12 questions with ids; no example has materials): the button's name, the tab list moving the grid, a verdict updating the ring and the counts, a chip opening its sheet, `M` and `Q`; once with `--since`; axe in light and dark (with `MATHML_NAMES` when the quiz has maths).
3. The phone (one or more commits): the compact bar, the three-column verdicts, the foot bar, the full-screen sidebar and the look controls as G65 says. Playwright at 390 × 844 (the board's width) in Chromium: the compact line, the foot bar's two buttons working, nothing wider than the screen (`scrollWidth` equals `clientWidth`), the sidebar opening on the whole screen and its back link closing it, the 44 px targets; a `vi` run; axe in light and dark.
4. Screens (one commit): to `docs/screens/3m/`, the Review state with materials at 1280 px in light and dark, the ReviewSince state in the stacked sidebar, the ReviewPhone state at 390 px with and without a reason picked, the phone sidebar, and one `vi`; through a spec like `e2e/screens-3l.spec.ts`.
5. The rest (one commit): G63 to G67 into COMMANDS.md (`quiz review`, "The form"); the slice table's 3m row.

### Done when

`npm run check` passes in Chromium (startup tests alone, as `npm test` runs them; Firefox when the environment has it; say which ran; a budget failure is reported with its cause shown, as 3l's review did). On a copy of a quiz with materials: `quiz review` opens with the **Questions & materials** sidebar as on the Review board; a verdict moves the part's ring and counts; a chip opens its sheet. At 390 px the form is the ReviewPhone board: the compact bar, three verdict buttons across the card, Keep the rest and Finish at the foot, the sidebar on the whole screen; Finish writes the review as at 1280 px. A review file with a `fix` lacking `source` is refused by `check --review`. Nothing under `src/page/` changed and no `build` golden moved. The screens are committed. Report as the rules say, every golden that changed counted and explained.

### Review

Built by Sonnet in five commits, `182beb3`..`0a68e2d`, from the brief alone; reviewed by Opus on 2026-11-05. Every "Done when" holds. Nothing under `src/page/` changed and no `build` golden moved (`git diff ca9ee9b..HEAD` is empty there).

**Tests, run by the reviewer.** Typecheck, Biome and knip clean. Vitest: the startup tests alone 2 of 2, the rest 2706 passed, 3 skipped (second run). Playwright, Chromium and Firefox both: 442 passed, 309 skipped, 3 failed.

- `budget.spec.ts:53`, both browsers (1408 and 3412 ms against 1000): the loaded laptop, as 3l's review showed on the commit before 3l; 3m loads nothing the test measures.
- `serve.spec.ts:318`, Firefox: after the `--autosave` run, a `.progress.json.202fecd5.tmp` was left in the folder. **Cause read in the code, not caused by 3m** (the server and `atomic.ts` are untouched): the autosaver chains its writes and `finish` waits for them before removing the file, so the temp file is not the second run's; the test `SIGKILL`s the first server, and a kill during a progress write leaves its temp file, whose random name nothing cleans. That is G69.
- The agent's `headings.spec.ts:95` Firefox failure did not come back in either of the reviewer's two runs.

**Fixed in review** (one commit):

- The first Vitest run failed `test/build/fonts-cli.test.ts`'s "same bytes" test at the 5 s default: 0.3 s alone, 5.5 s beside 108 other files. It now has a named 60 s timeout with the reason, as 3l's review did for the notices tests. Three such fixes in two slices is G68.
- On a phone the card's status read "✎ Fix · 1 reason" on two cramped lines beside the question number; the ReviewPhone board has "✎ Fix" alone. On a phone the status is now the verdict alone (the reasons are in view under the buttons). The three phone screens it shows in are retaken (`phone-fix`, `phone-fix-reason`, `phone-vi`); the review e2e passes in Chromium after it.
- TECHNICAL_DESIGN.md section 4 had `source: string` in the `Review` type, as if a keep had one; it is `source?: string` again, the comment saying it is required on `fix` and `drop` and never on `keep`.

**Goldens**, as the report says and checked in the diff: **1 added** (`check/review-no-source`, exit 2 naming both entries), **4 changed in 3 cases** (`review/out-invalid` stderr, `review/out-invalid-json` stderr and stdout, `review/since-invalid` stderr: each hand-made invalid review has a `fix` without `source`, so the reader now lists that line too), none removed, no `build` golden moved.

**Read in the code and the screens.** The stacked map, its rings (`ringOf`), the counts "3 of 5 judged · 1 fix · 1 drop" and the tabs' names match the Review board; under `--since` the asked counts and G67's part ("nothing asked again", an empty ring, its grid all muted) match the ReviewSince board. G64 is one rule in the schema's refinement. `M` and the phone's Questions and Materials tabs follow `src/page/keys.ts`. On a phone a wide sheet table scrolls in its own box, as the page's does. The by-hand run was the agent's (`dist/cli.js review` driven through Playwright on a copy of `test/fixtures/page/materials.md`, at 1280 px then `--since` at 390 px), and the reviewer's e2e run covers the same steps.

**Done differently, accepted in review unless the owner says otherwise:**

- `Ring` and `Sheets` are copied into `src/review/Side.tsx`, each with a comment naming the original (the page's `Ring` is not exported and its `Sheets` takes `QuizState`); `tabKeys`, `ringOf`, `Icon`, `Html` and the look controls are imported.
- `src/review/main.tsx` writes its own `(max-width: 759px)` query rather than import `PHONE_QUERY`, to keep `src/page/store.ts` out of the form's bundle.
- The reason chips' CSS is scoped to `.fm-reason-box`, since unscoped it restyled the sheet chips, which share the class.
- On a phone Keep the rest and Finish are rendered in the foot bar only; the foot bar is hidden while the sidebar covers the screen; the sidebar closes when the window narrows to a phone.
- The plain map's one-question row is now muted under `--since` too (3l missed it), its accessible name holding the "Part N" text.
- The page's double-click jump from a part tab is not copied; the phone's Questions tab is the plain collapsible map, as on the page; the phone's compact bar has no "Asked again" line.
- The diff is a `pre` of lines, each a grid of the sign and the text; it no longer scrolls, so its `tabIndex` and Biome suppression are gone.

**Words not on the boards**, in `src/core/i18n/review.ts`, for the owner to read in the form as G57's were: `partStats` ("6 of 12 judged · 3 fix · 1 drop" / "đã xét 6 / 12 · 3 sửa · 1 bỏ"), G67's "nothing asked again" / "không hỏi lại câu nào" and its tab name, `materialsKey` ("materials" / "tài liệu"), `phoneTitle` ("Review: TITLE" / "Rà soát: TITLE").

**3m's gaps decided by the owner on 2026-11-05**, both as recommended: G68 (`testTimeout: 30_000` in `vitest.config.ts`) and G69 (`serve --autosave` removes its file's leftover temp files) open the next slice.

**Left on the disk:** nothing in the repo; the agent's by-hand copies and scripts are in the session scratchpad.

**The `review` boards are done**: `quiz review` is as COMMANDS.md says. What is left of step 3 waits for the `grade --web` and `brief --web` boards (3v), then 3f, 3h and 3z.

## Slice 3n: G68 and G69

**Approved by the owner on 2026-11-06**: a slice of its own, ahead of the `grade --web` boards, since neither gap waits on a board. It holds G68 and G69 as decided, and nothing else.

### Read first

- This plan: "Rules for every slice", G51, G68, G69, and 3m's Review (the `fonts-cli` and `serve.spec.ts:318` items).
- COMMANDS.md: `quiz serve`, the `--autosave` row. TECHNICAL_DESIGN.md: "Files, formats and safe writes".
- Code: `vitest.config.ts`; `src/cli/atomic.ts` (the temp file's name); `src/cli/serve.ts` (where `progressFile` is resolved and checked, and the autosaver it builds); `src/serve/autosave.ts` (`finish`); tests `test/serve/autosave.test.ts`, `test/serve/serve-cli.test.ts`, `e2e/serve.spec.ts` (the test at line 318), and the named timeouts in `test/build/fonts-cli.test.ts`, `test/notices.test.ts`, `test/build/build-file-cli.test.ts`.

### Decided for this slice

- **G68:** `vitest.config.ts` sets `testTimeout: 30_000`, with a comment saying why: CPU-bound tests slow down under the full parallel run on a 4-core machine; a test that waits on a real timer is still a bug (G51). The named timeouts of 30 s are now the default and are removed; those longer than 30 s (60 s) stay, each with its reason.
- **G69:** `quiz serve --autosave FILE` removes the temp files left beside FILE by an earlier run that was killed during a write: in FILE's folder, the names matching exactly `.<basename of FILE>.<8 lower-case hex>.tmp`, nothing else (not another file's temp files, not a name with other hex lengths or upper case). It does so once, before it serves (after the existing file's checks pass, so a run that exits 1 or 2 on the progress file touches nothing), and again in `finish`, after the progress file is removed. A temp file that cannot be removed is not an error: it is left. `atomic.ts` keeps its random names. One helper, pure of the clock, beside `writeFileAtomic` in `src/cli/atomic.ts` (for example `removeStaleTemps(file)`), so `review --out` and the rest can use it later; only `serve --autosave` calls it in this slice.
- COMMANDS.md's `--autosave` row gains one sentence: temp files a killed run left beside the file are removed when the server starts and when the results are written. TECHNICAL_DESIGN.md's "Files, formats and safe writes" says how the temp file is named and that `--autosave` clears its own.

### Tasks

1. G68 (one commit): the config and its comment; the 30 s named timeouts removed; the count of each kept or removed in the report.
2. G69 (one commit): the helper and its unit test (planted temp files: two of FILE's, one of another file, one with 7 hex, one with upper-case hex, a folder of FILE's name pattern; only FILE's two go; FILE itself untouched); `serve` calling it before serving and in `finish`, tested in `test/serve/serve-cli.test.ts` with a planted temp file (gone after start; one planted during the run gone after submit; left alone when the run exits 1 on a wrong progress file). `e2e/serve.spec.ts` unchanged.
3. The docs (one commit): COMMANDS.md and TECHNICAL_DESIGN.md as above; the slice table's 3n row.

### Done when

`npm run check` passes (startup tests alone first, as `npm test` runs them; say which browsers ran; a budget failure is reported with its cause shown). Vitest runs with no 30 s named timeout left and the 60 s ones kept. A temp file planted beside a progress file is gone once `quiz serve --autosave` is listening. No golden changes; if one does, it is counted and explained.
