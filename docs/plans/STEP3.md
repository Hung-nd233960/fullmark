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
| 3v the form boards (on the Design canvas) | `review` boards drafted by Opus and reviewed by the owner (2026-11-04); G38, G40 to G45 decided; **waits for the owner**: G39 (materials) and G46 (`vi` words). `grade --web` and `brief --web` boards after that | |
| 3e `review`, 3f `grade --web`, 3h `brief --web` | wait for 3v; briefs not written yet | |
| 3z acceptance | last | |

Each slice's review, and the owner's decisions on its gaps, are under its own section below (**Review**); every gap, G1 to G37, is in "Gaps", in number order.

Step 2 is closed ([archive/STEP2.md](archive/STEP2.md), item 75): every "Done when" criterion passes in Chromium and Firefox; Vitest 2059 of 2059, the 2 startup tests, Playwright and axe. What step 3 inherits:

- **The attach point is built:** `src/page/events.ts` emits `ready`, `progress` (on every autosave) and `submit`; `src/page/main.tsx` exposes it as `window.fullmark.events`. Nothing listens yet.
- **`PageData.focus`** (`src/page/data.ts`) already ticks the start screen's Focus mode box; `build` never sets it. `serve --focus` sets it.
- **`buildPage(quizzes[], options)`** (`src/build/page.ts`) writes the page and its CSP (no `connect-src`). The served copy needs a second script hash and `connect-src 'self'`.
- **Stubs that say "not available yet"**, to be replaced: `check --review` (`src/cli/check.ts`), `grade --web` and `--name` (`src/cli/grade.ts`, `src/cli/main.ts`), `build --watch`, `--serve`, `--port` (`src/cli/build.ts`, `src/cli/main.ts`). *Still stubs after 3j:* `check --review` and `inspect --review` (3e), `grade --web` and `--name` (3f), `brief --web` (3h).
- **`brief.yaml` is read with no defaults** ([archive/STEP1.md](archive/STEP1.md), item 1 of 1f): every key is required; the defaults belong to `quiz brief`, which writes them. `src/core/rules/brief-read.ts` and `BriefSchema` in `src/core/ir.ts` are the reader.
- **Templates:** only `templates/blank/` exists; the other six built-in names (`calculus`, `rust`, `ielts`, `medical`, `exam`, `survey`) exist as `examples/`.

### Next steps, in order

1. **The form boards on the Design canvas** (3v, G7), as 2v did for the page: every slice left (3e, 3f, 3h) waits for them. The `review` boards are drafted and reviewed (Gaps, "The review boards"); the owner decides G39 and G46 on the updated boards; then they are copied into `docs/mockup/` (sources and images), the decisions go into COMMANDS.md, and 3e's brief is written. The `grade --web` and `brief --web` boards follow in the same way.

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

**The review boards (3v).** Opus drafted them on the Design canvas on 2026-11-04, in a new row titled "Forms: quiz review": **Review** (1280 px, interactive; Tweaks for theme, `locked`, `lang`, `--since`, the dialogs, materials and the sidebar), **ReviewSince** (`--since`), **ReviewFinish** (the dialog), **ReviewPhone** (390 px, interactive) and **ReviewVi** (`ui_lang` vi). They use the page's tokens, the Quiz board's top bar, status line, card and 320 px sidebar. **The owner reviewed them on 2026-11-04**: G38, G40, G41, G43, G44 and G45 as recommended, G42 changed (below), and **The rest is fine** renamed **Keep the rest** ("Giữ các câu còn lại" in `vi`, G46); all written into COMMANDS.md, `quiz review`, and TECHNICAL_DESIGN.md section 4 (`assumed`). G39's materials and G46's `vi` labels wait for the owner, on the updated boards.

**G38. The review form's keys** (3e). **Decided by the owner on 2026-11-04, as recommended**, and written into COMMANDS.md. `1`, `2`, `3` give Keep, Fix, Drop to the current question; `N` moves to the next question not judged; `Q` and `Esc` as on the page.

**G39. The verdict map, and materials** (3e). The map is **decided by the owner on 2026-11-04, as recommended**, and written into COMMANDS.md. The owner asked whether the form should show the materials. **Recommend:** yes, read-only, as the page's sidebar does after Submit: when the quiz has materials the sidebar is **Questions & materials** with two tabs (Questions, the verdict map, 320 px; Materials, the sheet chips over the open sheet, 40%), `Q` and `M` open each tab. A question can only be judged fairly with the sheets the learner had (a sheet may give an answer away, or a question may need a formula no sheet has), and the reasons stay per question: a sheet's problem is written as a note on the question it affects. Drawn on the Review board (its Materials tab; `materials: none` in Tweaks gives the plain Questions sidebar).

**G40. What a question shows in review** (3e). **Decided by the owner on 2026-11-04, as recommended**, and written into COMMANDS.md: the key state, with a `short` question's patterns shown as written.

**G41. Changing a verdict** (3e). **Decided by the owner on 2026-11-04, as recommended**, and written into COMMANDS.md.

**G42. The form's top bar** (3e). **Decided by the owner on 2026-11-04, changed from the recommendation**, and written into COMMANDS.md: the look controls stay, with A− / A+ merged into **Appearance** so the bar is not cluttered: theme and font under `look: free`, the text size alone under `look: locked` (with a line saying the quiz's look is locked). No Focus mode. The owner asked whether the review can change a quiz's theme or lock: it cannot, since `review-v1` has entries per question only. The look is the quiz's front matter (`theme:`, `look:`), so editing it makes a new version of the same quiz (the quiz hash covers the whole file), not a new quiz; a later `review --since` then asks about no question, since no question's hash changed.

**G43. Finish and after** (3e). **Decided by the owner on 2026-11-04, as recommended**, and written into COMMANDS.md.

**G44. `--since`** (3e). **Decided by the owner on 2026-11-04, as recommended**, and written into COMMANDS.md.

**G45. The review form on a phone** (3e). **Decided by the owner on 2026-11-04, as recommended**, and written into COMMANDS.md.

**G46. The form's words in `vi`** (3e). The prompts "What needs fixing?" and "Why drop it?" are in COMMANDS.md. **Recommend:** the `vi` strings drawn on the ReviewVi board, reusing the page's catalog where a word exists (Giao diện, Nền, Phông, Cỡ chữ, Tài liệu, Đáp án đúng, Đáp án chấp nhận, Tiêu chí chấm, Bài mẫu, đang xem, Đóng thanh bên): Rà soát, Giữ / Sửa / Bỏ, Giữ các câu còn lại, Hoàn tất, Đã xét 14 / 32, Đánh giá của bạn, Cần sửa gì?, Vì sao bỏ?, Chọn ít nhất một lý do., Ghi chú (không bắt buộc) / (bắt buộc khi chọn Khác), Chưa xét; the reasons Đáp án sai, Chưa rõ ràng, Tiêu chí chấm quá lỏng, Chia điểm chưa hợp lý, Tiêu chí chưa rõ, Khác, Trùng lặp, Ngoài phạm vi, Quá dễ; the dialog "N câu chưa xét", Quay lại câu K, Huỷ, Đánh dấu Giữ và hoàn tất; after writing, Đã lưu bản rà soát. The owner reads them on the board; 3e copies the approved ones into the catalogs.

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
| **3e** | `review`: `review-v1` in `ir.ts` and its JSON Schema, the form (verdict, then reasons; The rest is fine; the Finish dialog), merge, `--since` with the diff; `check --review` with `review.fix`, `review.drop` and `review.unconfirmed`; `inspect --review` | G1, G2, G3, boards |
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
