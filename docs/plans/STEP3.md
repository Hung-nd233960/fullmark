# Step 3: the server, the forms and the authoring commands

## Handoff (2026-11-03): start here

A new session picks up from this section alone; it needs no earlier chat.

### How the work runs

As in step 2 ([STEP2.md](STEP2.md), Handoff): Opus writes a slice's full brief here, commits it, and hands it to **one Sonnet subagent**; Sonnet implements and commits on branch `1.0` (never pushes) and reports; Opus reviews and brings every gap to the owner with a recommendation; the owner decides; the decisions go into `docs/design/` and become the next brief's first tasks. Commit after every round. A slice is sized to fit one Sonnet session (about 150k tokens), and its brief names exactly what to read.

### Where it stands

| Slice | State | Commits |
|---|---|---|
| plan | **drafted, waiting for the owner**: the gaps below (G1 to G4, G6, G7 and G11 decided; G5, G8, G9, G10 and G12 open) and 3a's brief; the slice order approved | this file |

Step 2 is closed (STEP2.md, item 75): every "Done when" criterion passes in Chromium and Firefox; Vitest 2059 of 2059, the 2 startup tests, Playwright and axe. What step 3 inherits:

- **The attach point is built:** `src/page/events.ts` emits `ready`, `progress` (on every autosave) and `submit`; `src/page/main.tsx` exposes it as `window.fullmark.events`. Nothing listens yet.
- **`PageData.focus`** (`src/page/data.ts`) already ticks the start screen's Focus mode box; `build` never sets it. `serve --focus` sets it.
- **`buildPage(quizzes[], options)`** (`src/build/page.ts`) writes the page and its CSP (no `connect-src`). The served copy needs a second script hash and `connect-src 'self'`.
- **Stubs that say "not available yet"**, to be replaced: `check --review` (`src/cli/check.ts`), `grade --web` and `--name` (`src/cli/grade.ts`, `src/cli/main.ts`), `build --watch`, `--serve`, `--port` (`src/cli/build.ts`, `src/cli/main.ts`).
- **`brief.yaml` is read with no defaults** (STEP1.md, item 1 of 1f): every key is required; the defaults belong to `quiz brief`, which writes them. `src/core/rules/brief-read.ts` and `BriefSchema` in `src/core/ir.ts` are the reader.
- **Templates:** only `templates/blank/` exists; the other six built-in names (`calculus`, `rust`, `ielts`, `medical`, `exam`, `survey`) exist as `examples/`.

### Next steps, in order

1. **The owner decides G9 and G10** (3a needs them) and approves 3a's brief (below). Then 3a with Sonnet. G5 is needed by 3b, G8 by 3c, G12 by 3i.
2. **Whenever the owner is ready:** the form boards on the Design canvas (3v, G7), as 2v did for the page. Only 3e, 3f and 3h wait for them.

### Open proposals carried over from step 2

- [build-log.md](../design/proposals/build-log.md): stays a proposal, not in step 3. `build --watch --json` already gives one line per rebuild, which is all v1 promises.
- **The PDF through the teacher's own browser** (raised in 2k's review): not yet written as a proposal. Recommendation: write it as `proposals/print-pdf.md` during 3j's review, since it would reuse `build --watch --serve`'s long-running server; it stays out of v1.
- [TODO.md](../design/TODO.md)'s only item (1.0 and 0.x share `config.toml`) is due before step 4, not here.

## Goal

The one-shot server and everything on it, plus the authoring commands that need no server. TECHNICAL_DESIGN.md section 12, step 3: `serve` (with `--section`), `review`, `grade --web`, `brief` (flags, `--web`, `--tui`), `stats`, `inspect`, `new`, `build --watch`.

**Done when** (section 12): contract tests pass for each command; the same answers through flags, `--web` and `--tui` write byte-identical `brief.yaml` files. **And** (from foundations 4 and 9, section 11): the server rejects a wrong token, `Host` or `Origin`; a `build` page is byte-identical with and without the server features and contains no server code; the two-quiz server seam test passes; every new form passes axe in both themes and has a `vi` scan; `npm run samples` gains a line for each served command, and the owner has tried them by hand.

**Not in step 3:** `library take` and the rest of the library (step 4; the server supports it through `--timeout 0` and the quiz-keyed predicate, nothing more); `--background` ([proposals/background-serve.md](../design/proposals/background-serve.md); the `listening` line is its seam, built here); `quiz guide` and `agent-guide` (not in section 12's step 3; see G4); build logs.

## Rules for every slice

Step 2's rules hold ([STEP2.md](STEP2.md), "Rules for every slice"), including item 73's rule on environmental failures: a failure is environmental only when its cause is shown, and a golden is never reverted to hide a difference. Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; never push. Added for step 3:

- **No real network in unit tests.** The server binds 127.0.0.1 on port `0` in tests and is driven with `fetch`; the page side is tested in Playwright against a served page. No test waits on a real timeout: the clock and the timeout are injected.
- **Every served command is tested as a subprocess**: started with `--json`, its `listening` line read, the page or form driven by Playwright or by a POST, then the exit code, the second JSON line and the written file compared with a golden. A helper for this lives in `e2e/helpers.ts` (3a) and every later slice uses it.
- **Ctrl+C is tested** on Linux by sending SIGINT to the subprocess, and the expected file state (nothing written, or the old file intact) is checked. Windows has no SIGINT for a child; the test says so and skips there by name.
- **A command loads only what it uses** (section 7, Budgets): `serve` and the forms load the page builder; `brief` through flags, `stats`, `inspect` and `new` do not; `@clack/prompts` loads only for `brief --tui`. The startup test gains no new limit, but a test checks that `check` still does not load `src/serve/`.
- **Forms are built from the boards** (from 3e on), as pages were from the mockup: colours, sizes and spacing from the board's source; screens to `docs/screens/<slice>/`, committed.

## Gaps to settle before the briefs

The design docs leave these open. Each needs the owner's yes before the slice that depends on it; the recommendation is written so it can go into the docs as it stands.

**G1. The `review-v1` format** and **G2. what `check --review` fails on**: **decided by the owner on 2026-11-03** and written into TECHNICAL_DESIGN.md section 4 ("`review-v1`", with the three rules) and section 5 (the catalogue row), and COMMANDS.md (`quiz check --review`, `quiz review`'s form). In short: entries keyed by question id with the question hash and, for fix and drop, the question's source; the nine reasons shown per verdict as chips after Keep, Fix or Drop is chosen; **The rest is fine** and the Finish dialog record Keep with `assumed`; `review.fix` passes once the question changed or is gone, `review.drop` only once it is gone, `review.unconfirmed` warns on a changed fix until `review --since` judges it again, and `--since` shows the earlier verdict and a diff. Keyboard keys wait for the form board (3v).

**G3. Questions without ids in `review`, `stats` and `grade --web`** (3d, 3e). Reviews and history follow questions by id. **Decided by the owner on 2026-11-03, as recommended**, and written into the design docs. **Recommend:** `review` refuses a quiz with a question without an id (exit 1, "run `quiz ids FILE` first"), so a verdict is never lost; COMMANDS.md's exit list for `review` gains `1` (also for check errors, as `serve` has). `stats` matches questions across versions by id, and by question hash for those without one (counted per version, marked "no id" in the output).

**G4. `quiz template` and the built-in templates** (3c). `new TEMPLATE` reads user templates and names `quiz template list`, but section 12 lists `new` without `template`. **Decided by the owner on 2026-11-03, as recommended**, and written into the design docs. **Recommend:** `template list`, `add` and `rm` come in step 3 with `new` (they share the skeleton code and the template folder), and the seven built-ins are made from `examples/` (`blank` stays as it is). `section 12` gains `template`. `guide` and `agent-guide` stay out (they need the authoring guide's content, a writing task of its own); they go into step 4 or a step of their own, the owner's choice.

**G5. `serve --autosave PROGRESS`** (3b). **Recommend:** the file is a `results-v2` document with the attempt's state still `in-progress` (the shape the page already autosaves), written atomically on each `progress` event, at most once a second. On start, a file whose `quizId` and `quizHash` match is handed to the page, which opens on it as a resume (the start screen's resume path, already built in 2d); a file for another version exits 1, naming the version, and is left alone. It is deleted after the results are written. `--autosave` with `--section` keeps the section's plan.

**G6. `build --watch` and `--serve`** (3j). The design says only "rebuild on change; keep the last good page; reload after each rebuild". **Decided by the owner on 2026-11-03, as recommended**, and written into the design docs. **Recommend:** `--watch` watches each `FILE`, the files its quiz hash covers (assets, `materials` and their assets) and the build file, debounced 100 ms; a rebuild that fails prints its errors and keeps the page on disk and in the server. `--serve` is not the one-shot server: it serves the last good page at a token URL until Ctrl+C, with the reload code as its only module (no submit, no autosave); the page learns of a rebuild by Server-Sent Events (`GET /events?token=…`) and reloads. Ctrl+C exits 0 (the user's normal way out), not 2 as for `serve`. `--watch` with `--print` is allowed and rebuilds the paper. `--serve` with several files serves an index of the pages.

**G7. The forms need boards** (3e, 3f, 3h). The Design canvas has none for `review`, `grade --web` or `brief --web`. **Decided by the owner on 2026-11-03:** the boards wait until the owner is ready, and the slices are reordered so only 3e, 3f and 3h wait for them. **Recommend:** the owner draws three boards (and their phone width) before 3e; they reuse the page's tokens, themes and fonts, follow `ui_lang` (`review`, `grade --web`) or `--language` (`brief`), and use the page's question rendering for `review` and `grade --web`. Until then the slices that need no design go first.

**G8. `--json` and the human output of `inspect` and `stats`** (3c, 3d). COMMANDS.md gives `stats`'s top-level keys only and `inspect` none. **Recommend:** the shapes are proposed in each slice's brief and approved by the owner with it, then written into COMMANDS.md before Sonnet starts.

**G9. Interrupted and refused submits** (3a). **Recommend:** Ctrl+C on a one-shot server prints `{"status": "interrupted"}` as the second `--json` line and exits 2; a POST that fails validation (wrong quiz id, a body that is not a valid attempt for this quiz) gets HTTP 400, the page says "could not save, use Export", and the server keeps waiting. A second submit after the first is never accepted (the server is closing).

**G10. Where the browser module and the forms live in the bundle** (3a). **Recommend:** `dist/serve.js`, a second esbuild IIFE beside `dist/page.js`, built by `scripts/build-page.mjs` and read by `src/serve/` at run time, so `build` never reads it; its own entry in `scripts/bundles.mjs` and in the notices test. The forms are their own Preact entries (`dist/review.js`, `dist/grade-form.js`, `dist/brief-form.js`) sharing the page's components and styles, each under the 60 KB budget.

**G11. The brief question file** (3g). Section 7 names it as YAML that people write; nothing gives its shape. **Decided by the owner on 2026-11-03, as recommended (YAML)**, and written into COMMANDS.md, `quiz brief`. **Recommend:** `src/brief/questions.yaml`, shipped in the bundle as data, one entry per brief key: `key`, `kind` (`choice`, `multi`, `text`, `number`), `label`, `help`, `choices` with a `hint` each, `min-words` with `example`, `follow-up` (for `other`), `human-only`, `default`, and `section` (the steps of `--tui`); every text in `en` and `vi`. A zod schema checks it in a unit test; the flags' `--help` text, the web form and the TUI all read it, so they cannot drift.

**G12. `@clack/prompts`** (3i). A new runtime dependency, already named in section 3. **Recommend:** pinned exactly, MIT (in the allow-list), listed in `--acknowledgements` and `THIRD_PARTY_NOTICES.md`, loaded only by `brief --tui`, with the byte-identity test driving it through a pseudo-terminal (`node:child_process` with a scripted stdin) rather than a new test dependency. If clack cannot be driven that way, the slice stops and reports.

## Slices

| Slice | Content | Needs |
|---|---|---|
| **3a** | The one-shot server (`src/serve/`): bind, token, `Host` and `Origin`, one POST path, 10 MB cap, the quiz-keyed predicate, timeout, Ctrl+C, the `listening` line; the browser module on the attach point; the served page's CSP; the byte-identity and two-quiz seam tests. `quiz serve FILE` with `--out`, `--timeout`, `--open`, `--port`, `--json`, the `.html` refusal and exit 1 on check errors | G9, G10 |
| **3b** | 3a's fixes; `serve --section`, `--focus`, `--autosave`; Firefox through the whole submit; the samples line | G5 |
| **3c** | `inspect` (with `--review` waiting for 3e), `new TEMPLATE`, `new --from [--skeleton]`, `template list/add/rm`, the built-in templates | G4, G8 |
| **3d** | `stats`: `src/core/stats/` (per question, per tag, per criterion, across versions), the survey table, human and `--json` | G3, G8 |
| **3g** | `brief` through flags: the question file, every option, defaults written with `decided_by`, `brief.vague`, exit 3 and `needs_input`, `--accept-defaults`, `--json`, `content/` | G11 |
| **3i** | `brief --tui` with `@clack/prompts`; flags and `--tui` write byte-identical `brief.yaml` | G11, G12 |
| **3j** | `build --watch` and `--serve`: watching, the last good page, `--json` per rebuild, the reload server | G6 |
| **3v** | The owner's form boards (G7), whenever the owner is ready; no code. Only 3e, 3f and 3h wait for it | G7 |
| **3e** | `review`: `review-v1` in `ir.ts` and its JSON Schema, the form (verdict, then reasons; The rest is fine; the Finish dialog), merge, `--since` with the diff; `check --review` with `review.fix`, `review.drop` and `review.unconfirmed`; `inspect --review` | G1, G2, G3, boards |
| **3f** | `grade --web` and `--name`: the grading form on the rubric modes, pre-filled from `--grades`, `kind: human` and `reviewed`, then the report | boards |
| **3h** | `brief --web`: the form from the question file, the detail rules, the summary screen, `--language` for the form; the three-way byte-identity test (flags, `--web`, `--tui`) that closes step 3's criterion | G11, boards |
| **3z** | Acceptance: every "Done when" item checked in Chromium and Firefox, samples tried by the owner | |

The order (owner, 2026-11-03) puts the server first, since four commands stand on it, then every slice that needs no form board (3c, 3d, 3g, 3i, 3j), so the owner's form design (3v) can come whenever the owner is ready; the three forms come last. Later briefs stay outlines until the slice before is reviewed.

## Slice 3a: the one-shot server and `quiz serve`

**Draft, for the owner to approve** (with G9 and G10).

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
