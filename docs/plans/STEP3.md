# Step 3: the server, the forms and the authoring commands

## Handoff (2026-11-03): start here

A new session picks up from this section alone; it needs no earlier chat.

### How the work runs

As in step 2 ([STEP2.md](STEP2.md), Handoff): Opus writes a slice's full brief here, commits it, and hands it to **one Sonnet subagent**; Sonnet implements and commits on branch `1.0` (never pushes) and reports; Opus reviews and brings every gap to the owner with a recommendation; the owner decides; the decisions go into `docs/design/` and become the next brief's first tasks. Commit after every round. A slice is sized to fit one Sonnet session (about 150k tokens), and its brief names exactly what to read.

### Where it stands

| Slice | State | Commits |
|---|---|---|
| plan | approved (2026-11-03): gaps G1 to G4, G6, G7, G9, G10, G11 and G5 decided; G8 and G12 open; the slice order and 3a's brief approved | this file |
| 3a the one-shot server and `quiz serve` | done, reviewed, gaps decided | `b9ca8c1`, `730a7ae` |
| 3b 3a's fixes, `--section`, `--focus`, `--autosave` | done, reviewed, gaps decided | `7fa0ba3`..`4a1e0bf` |
| 3c `inspect`, `new`, `template` | done, reviewed, gaps decided | `e71ce68`..`3602a3d` |
| 3d 3c's fixes, `stats` | done, reviewed, gaps decided | `fd466d1`, `2dfd341` |
| 3g 3d's fixes, `brief` through flags | **brief ready, waiting for the owner's go** | |

Step 2 is closed (STEP2.md, item 75): every "Done when" criterion passes in Chromium and Firefox; Vitest 2059 of 2059, the 2 startup tests, Playwright and axe. What step 3 inherits:

- **The attach point is built:** `src/page/events.ts` emits `ready`, `progress` (on every autosave) and `submit`; `src/page/main.tsx` exposes it as `window.fullmark.events`. Nothing listens yet.
- **`PageData.focus`** (`src/page/data.ts`) already ticks the start screen's Focus mode box; `build` never sets it. `serve --focus` sets it.
- **`buildPage(quizzes[], options)`** (`src/build/page.ts`) writes the page and its CSP (no `connect-src`). The served copy needs a second script hash and `connect-src 'self'`.
- **Stubs that say "not available yet"**, to be replaced: `check --review` (`src/cli/check.ts`), `grade --web` and `--name` (`src/cli/grade.ts`, `src/cli/main.ts`), `build --watch`, `--serve`, `--port` (`src/cli/build.ts`, `src/cli/main.ts`).
- **`brief.yaml` is read with no defaults** (STEP1.md, item 1 of 1f): every key is required; the defaults belong to `quiz brief`, which writes them. `src/core/rules/brief-read.ts` and `BriefSchema` in `src/core/ir.ts` are the reader.
- **Templates:** only `templates/blank/` exists; the other six built-in names (`calculus`, `rust`, `ielts`, `medical`, `exam`, `survey`) exist as `examples/`.

**3a's review (2026-11-03).** Typecheck, Biome and Vitest clean: 86 files, **2111 of 2111** (34 new), the 2 startup tests (`--version` 21 ms, `check` 88 ms, both lower than before). Playwright in Chromium: 184 passed, 123 skipped, **1 failed**: `e2e/types.spec.ts:28` ("every simple type…", a `toHaveAttribute` that timed out at 9.7 s against 5.2 s normally). 3a changed nothing in `src/page`, `src/core` or that test, and it passed 3 of 3 runs on its own; **its cause is not shown**, so it is not called environmental: a task for 3b. Firefox not run (not installed here). The runtime is unchanged (56,214 B gzipped); `dist/serve.js` is 785 B gzipped. No `build`, `replay` or `check` golden changed; 2 top-level help goldens gain the `serve` line; 9 new golden cases under `test/golden/serve/`. Tried by hand: the page 200; a wrong token, a wrong `Host` and a POST without `Origin` 403; an unknown quiz id 400 with the reason; the served CSP has `connect-src 'self'`; SIGINT printed `{"status":"interrupted"}` and wrote nothing. **Found in review:** the URL without its trailing slash (`/<token>`) also serves the page, where `./submit` resolves to `/submit` and every submit would be refused. Done differently, accepted in review: `quizIds` is a map of id to hash; the samples line is a "Served commands" section of `samples/index.html`. **3a's gaps decided by the owner on 2026-11-03**, all as recommended, and written into COMMANDS.md (`quiz serve`: the synopsis with `--profile`, `--config` and `--fonts`; `{"status": "failed"}` for check errors; a results file that cannot be written) and TECHNICAL_DESIGN.md (foundation 4: 403 outside the token, 403 for a POST without `Origin`, 404 under it, the 308 to the trailing slash; foundation 9: `served: true`, the Submit dialog's line, the `sent` and `send-failed` events, **Sent** owned by the page core). The favicon's 403 stays. They are 3b's first tasks.

**3b's review (2026-11-03).** Typecheck, Biome and Vitest clean: 88 files, **2153 of 2153**, the 2 startup tests. Playwright in Chromium: **193 passed**, 128 skipped, none failed (run in review). The runtime grew 627 B to 56,769 B gzipped (the `sent` handling moved into the page); `dist/serve.js` is 372 B. 14 page goldens regenerated for the new `dist/page.js`; no other golden changed. Screens in `docs/screens/3b/` reviewed: the dialog's line, **Sent**, the could-not-save line. Tried by hand: an unknown section lists the three slugs and titles and exits 2; `--autosave` and `--out` naming one file exits 2. **`types.spec.ts:28`: cause not shown.** It did not recur in 2 full runs and 64 repeats, some under load; `BlanksPrompt` now marks its boxes in a layout effect (the one asynchronous step found) and a failure attaches the page state. Still open. **A second unexplained failure, older than 3b:** `e2e/start.spec.ts:202` fails 3 or 4 of 40 repeats, on 3b's tree and on `b231c4e` alike: the saved attempt is not found after the reload. **Found in review:** after **Sent** the server has exited, but **Retry missed** and **New attempt** still show; what they do on a served page is not decided. Done differently, accepted in review: `sent` and `send-failed` carry `quizId` (the bundle seam); a served page starts after `DOMContentLoaded` so a timed attempt that expired while the server was down still reaches it; `--section` drops the other sections from `PageData`; under `--autosave` the Rules cell says "In a file on this computer" and nothing goes in `localStorage`.

**3b's gaps decided by the owner on 2026-11-03**, all as recommended, and written into COMMANDS.md (`--autosave`: matched by `quizHash` alone, the phase `answering`, an unusable file exits 1, the same file as `--out` exits 2) and TECHNICAL_DESIGN.md (foundation 9: after **Sent**, **Retry missed** and **New attempt** work as practice and are not sent). The page's button is **Download results** everywhere in the design docs (it was "Export" in places). A section attempt keeps the quiz's `time_limit`, since a section's `time` is only a suggestion (QUIZ_SYNTAX.md, section 3): no change. `start.spec.ts:202` is 3c's first task; `types.spec.ts:28` stays open, watched by its new attachment.

**3c's review (2026-11-03).** Typecheck, Biome and Vitest clean: 92 files, **2284 of 2284** (74 new golden cases), the 2 startup tests (`--version` 24 ms, `check` 85 ms). Playwright in Chromium: **193 passed**, 128 skipped, none failed. **`start.spec.ts:202`: cause shown.** After `page.reload()`, Chromium handed the reloaded document a `localStorage` snapshot older than the old document's last write; the test's init script read that snapshot (seen empty in every failing run, while a fresh tab saw the key). The page saved correctly and is unchanged; the test now edits the saved text it read from the old page. 40 of 40 in review. Only the two top-level help goldens changed (the three commands). Tried by hand: `template list` shows the seven built-ins; `new rust demo/`, `ids`, `check` pass; `new` again exits 2; a skeleton of `rust` fails `check` with 30 emptied-field errors; `inspect examples/exam/quiz.md` prints the summary. **Found in review:** that example has no `id`, so its id shows as `quiz`, the file name: the same collision as Sonnet's gap 2.

**3c's gaps decided by the owner on 2026-11-03**, all as recommended, and written into COMMANDS.md (`quiz new`: `PATH` a folder or an `.md` file, a fresh quiz `id` from the target's name, `--json`, `--from` copies only what the quiz references; `quiz inspect`'s details; `template list` shows `invalid` folders; `template add` and `rm` `--json`) and QUIZ_SYNTAX.md section 9 (`materials` emptied, how each answer shape is emptied, which errors a skeleton gives). `examples/exam` and `examples/medical` get an `id`. The id, `new --json` and `invalid` are 3d's first tasks.

**3d's review (2026-11-03).** Typecheck, Biome and Vitest clean: 93 files, **2334 of 2334**, the 2 startup tests. Playwright in Chromium: **193 passed**, 128 skipped, none failed. Goldens: 56 existing cases changed, all from two causes: `examples/exam` and `examples/medical` gained an `id` (so their versions changed, and the grade cases' results inputs carry the new hash), and each report question gained `hash`; 25 new cases. `new/default-folder` became a unit test (its id is the random temp folder's name). Tried by hand: five attempts over two versions give the summary in the approved shape; a survey gives "Answers over time"; a results file of the old version exits 1 with the fix; two quizzes exit 2; `new rust signals/week3.md --json` writes `id: week3`. **Found in review:** an average IELTS band prints as `5.88`; bands are halves, so two decimals read as false precision. The agent kept re-sending its report while a monitor of its own ran; stopped in review, with nothing left uncommitted.

**3d's gaps decided by the owner on 2026-11-03**, all as recommended, and written into COMMANDS.md (`quiz stats`: matched by id only, `--quiz` renames titles and tags, `attempts` on criteria, holistic criteria left out, bands to one decimal, the survey `answers`, unanswered is not missed, a results file without `--quiz` exits 1; `quiz new`: the id from a name starting with a digit, too long, or empty) and TECHNICAL_DESIGN.md section 6 (a report question's `hash`). **G3 changes for `stats`:** the match by question hash is removed (unreachable: a question without an id fails `check`); `review` still refuses such a quiz. Removing that path, the band's one decimal and the id edges are 3g's first tasks.

### Next steps, in order

1. **3g's brief is ready** (G15 to G18 decided, 2026-11-03), **waiting for the owner's go.** Then 3g with Sonnet. G12 comes with 3i's brief.
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

**G5. `serve --autosave PROGRESS`** (3b). **Decided by the owner on 2026-11-03, as recommended**, and written into COMMANDS.md. **Recommend:** the file is a `results-v2` document with the attempt's state still `in-progress` (the shape the page already autosaves), written atomically on each `progress` event, at most once a second. On start, a file whose `quizId` and `quizHash` match is handed to the page, which opens on it as a resume (the start screen's resume path, already built in 2d); a file for another version exits 1, naming the version, and is left alone. It is deleted after the results are written. `--autosave` with `--section` keeps the section's plan.

**G6. `build --watch` and `--serve`** (3j). The design says only "rebuild on change; keep the last good page; reload after each rebuild". **Decided by the owner on 2026-11-03, as recommended**, and written into the design docs. **Recommend:** `--watch` watches each `FILE`, the files its quiz hash covers (assets, `materials` and their assets) and the build file, debounced 100 ms; a rebuild that fails prints its errors and keeps the page on disk and in the server. `--serve` is not the one-shot server: it serves the last good page at a token URL until Ctrl+C, with the reload code as its only module (no submit, no autosave); the page learns of a rebuild by Server-Sent Events (`GET /events?token=…`) and reloads. Ctrl+C exits 0 (the user's normal way out), not 2 as for `serve`. `--watch` with `--print` is allowed and rebuilds the paper. `--serve` with several files serves an index of the pages.

**G7. The forms need boards** (3e, 3f, 3h). The Design canvas has none for `review`, `grade --web` or `brief --web`. **Decided by the owner on 2026-11-03:** the boards wait until the owner is ready, and the slices are reordered so only 3e, 3f and 3h wait for them. **Recommend:** the owner draws three boards (and their phone width) before 3e; they reuse the page's tokens, themes and fonts, follow `ui_lang` (`review`, `grade --web`) or `--language` (`brief`), and use the page's question rendering for `review` and `grade --web`. Until then the slices that need no design go first.

**G8. `--json` and the human output of `inspect` and `stats`** (3c, 3d). COMMANDS.md gives `stats`'s top-level keys only and `inspect` none. **Decided by the owner on 2026-11-03 for `inspect`** (3c's brief, written into COMMANDS.md); `stats`' shape comes with 3d's brief. `stats`' shape **decided by the owner on 2026-11-03** (3d's brief, in COMMANDS.md). **Recommend:** the shapes are proposed in each slice's brief and approved by the owner with it, then written into COMMANDS.md before Sonnet starts.

**G9. Interrupted and refused submits** (3a). **Decided by the owner on 2026-11-03, as recommended**, and written into the design docs. **Recommend:** Ctrl+C on a one-shot server prints `{"status": "interrupted"}` as the second `--json` line and exits 2; a POST that fails validation (wrong quiz id, a body that is not a valid attempt for this quiz) gets HTTP 400, the page says "could not save, use Export", and the server keeps waiting. A second submit after the first is never accepted (the server is closing).

**G10. Where the browser module and the forms live in the bundle** (3a). **Decided by the owner on 2026-11-03, as recommended**, and written into the design docs. **Recommend:** `dist/serve.js`, a second esbuild IIFE beside `dist/page.js`, built by `scripts/build-page.mjs` and read by `src/serve/` at run time, so `build` never reads it; its own entry in `scripts/bundles.mjs` and in the notices test. The forms are their own Preact entries (`dist/review.js`, `dist/grade-form.js`, `dist/brief-form.js`) sharing the page's components and styles, each under the 60 KB budget.

**G11. The brief question file** (3g). Section 7 names it as YAML that people write; nothing gives its shape. **Decided by the owner on 2026-11-03, as recommended (YAML)**, and written into COMMANDS.md, `quiz brief`. **Recommend:** `src/brief/questions.yaml`, shipped in the bundle as data, one entry per brief key: `key`, `kind` (`choice`, `multi`, `text`, `number`), `label`, `help`, `choices` with a `hint` each, `min-words` with `example`, `follow-up` (for `other`), `human-only`, `default`, and `section` (the steps of `--tui`); every text in `en` and `vi`. A zod schema checks it in a unit test; the flags' `--help` text, the web form and the TUI all read it, so they cannot drift.

**G13. A quiz started from a template keeps the template's ids** (3c). A built-in template is an example with a quiz `id` (`rust-basics`) and question ids; `new TEMPLATE` and `new --from FILE` "copy" it, so two quizzes would share a quiz id and question ids, and in step 4's library their histories would mix. **Decided by the owner on 2026-11-03, as recommended**, and written into COMMANDS.md, `quiz new`. **Recommend:** `new` without `--skeleton` copies everything except the identity: the front matter's `id` is removed (it then defaults to the new file's name, slugged) and every question's `id` is removed, and `new` ends by saying "run `quiz ids FILE` to give the questions ids". `--skeleton` already does this (QUIZ_SYNTAX.md, section 9). `template add` stores the quiz as given; the ids are dropped when a quiz is started from it.

**G14. `stats` cannot score an attempt from a results file alone** (3d). A `results-v2` file holds the answers and the version (`quizHash`), but no score and no quiz id, so `stats RESULTS... [--quiz FILE]` can neither grade an attempt on an older version (its key is in a source it is not given) nor tell two quizzes apart, though COMMANDS.md promises "any versions" and exit 2 for different quizzes. The JSON report (`report-v2`, written by `grade --json`) has what is missing: the quiz's id and version, and per question `earned`, `points`, `status`, tags and criteria, graded against the version the attempt was taken on. **Decided by the owner on 2026-11-03, as recommended**, and written into COMMANDS.md, `quiz stats`. **Recommend:** `stats` takes `*-report.json` files, of any version, and also results files whose version matches `--quiz` (graded on the spot, as `grade` would); a results file of another version exits 1 naming it, with the fix "grade it with that version: `quiz grade FILE --quiz OLD.md --json`". Different quiz ids exit 2. In step 4 the library already keeps a report per attempt, so `library stats` reads the same thing.

**G15. `commitment` is missing from the reader** (3g). COMMANDS.md's file table lists `commitment` (from `--commitment`, a number, `0` for none), but `BriefSchema` in `src/core/ir.ts` has no such key, so a brief `quiz brief` writes would be `brief.invalid` to `check`. **Decided by the owner on 2026-11-03, as recommended:** the key is always in the file, the answer never required (`0` is no goal). **Recommend:** add `commitment` (an integer from 0 to 100) to `BriefSchema` and to the brief fixtures, as COMMANDS.md says.

**G16. `--mix`'s default is "per purpose", with no table** (3g). **Decided by the owner on 2026-11-03:** the table below, and the machine config's `[brief.purpose.<purpose>]` tables change a purpose's defaults (`count`, `minutes`, `mix`, `difficulty`, `mode`); briefs fitted to a subject are [proposals/brief-purposes.md](../design/proposals/brief-purposes.md). **Recommend:** `self-study`: `recall`, `understanding`, `calculation`; `exam-prep`: `understanding`, `calculation`, `essay`; `classmates`: `recall`, `understanding`; `survey`: empty. Written into the question file as each choice's default, and into COMMANDS.md.

**G17. `focus_tags` outside a library** (3g). The file fills it "from earlier results when `weak_topics` is true", but `quiz brief` is a core command with no history to read. **Decided by the owner on 2026-11-03, as recommended.** **Recommend:** `quiz brief` always writes `focus_tags: []`; with `--weak-topics yes` it warns (`brief.no-history`, listed in `--json`'s `warnings`) that the agent should pick the weak topics from the learner's reports, or use the library's brief in step 4, which fills it from `stats`.

**G18. A `DIR` that already holds `brief.yaml`** (3g). Nothing says. **Decided by the owner on 2026-11-03, as recommended.** **Recommend:** never overwrite, as `new`: exit 2 before asking anything, "DIR/brief.yaml already exists: edit it, or delete it to start again". An existing `content/` is kept as it is, and a missing `DIR` is created.

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

## Slice 3g: 3d's fixes, then `brief` through flags

**Ready**: G15 to G18 decided by the owner on 2026-11-03; waiting for the owner's go.

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
