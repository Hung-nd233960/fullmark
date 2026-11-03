# fullmark 1.0: user design

What fullmark is for, who uses it, and how people and agents work with it. The technical design ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md)) says how it is built, and the command reference ([COMMANDS.md](COMMANDS.md)) says what each command accepts and returns. This document sits above both: it gives the intent, so that a command's behaviour can be judged against the reason for it. Read it before working on fullmark, as the owner or as an agent. Where a detail is needed, it links to the section that holds it rather than repeating it.

## 1. The idea

fullmark turns one Markdown file into one self-contained HTML quiz. The page opens by double-click, grades itself, and exports the learner's answers as JSON. An AI reads that JSON to grade what a machine cannot (essays, code) and to say what to study next. The program is `quiz`.

**Who it is for.** One owner: a biomedical engineering student who studies with AI help. The quizzes are for:

- **Self-study**: an agent reads lecture slides or a chapter and writes questions; the owner takes them and sees weak topics over time.
- **Classmates**: the same quiz handed over as a file, or put on a web page.
- **Exam prep**: mock exams with a time limit, a fixed look, and stricter checks, or printed on paper.
- **Surveys and questionnaires**: no score; an agent that needs answers from the owner asks through a form and reads them back.

fullmark has one user, so it has no compatibility burden and no settings meant for other people's workflows ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), intro).

**The core bet.** Four choices carry the whole product:

1. **The source is plain Markdown in git.** Humans can read and edit it, an AI writes it reliably, and every change is a diff.
2. **The output is one offline HTML file.** No server, no account, no network. A learner needs a browser and nothing else.
3. **Everything else is a file too.** Results, reports, grades, reviews, the library: plain text and JSON, so git history is the audit trail and `git revert` is the undo.
4. **The loop closes through JSON.** The page exports `results.json`; a deterministic grader scores what can be scored; an AI grades the rest against a rubric and its grades come back as another JSON file.

The loop is: **brief, write, check, review, build, take, grade, study again.** Section 4 walks through it.

## 2. Principles, as a user meets them

- **Offline, one file.** A quiz is one `.html` that works from `file://` with the network off. A Content Security Policy makes sure the page itself makes no request. *Why:* a file can be sent in a chat, opened on a plane, and still work in five years. The only network exception is the one-shot server on `127.0.0.1` ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 7, foundations 3 and 4), used when something is waiting for an answer.
- **Files in, files out.** Every command reads files and writes files, and says which. Core commands need no setup and no config. *Why:* an agent or a script can chain commands without hidden state, and the human can open any intermediate file and see what happened.
- **The human decides; the agent proposes.** Some values are the user's, and the tool enforces it:
  - **Purpose and scope of a quiz** are human-only in `brief`. A missing one exits 3 and says how to provide it; `--accept-defaults` records `decided_by: agent` so a delegated choice is visible.
  - **The learner judges the quiz** in `review` (keep, fix or drop per question). An agent fixes what is flagged by changing the source, and never writes `review.json`, which is the learner's verdict.
  - **The check rules belong to the user.** The profile, `fullmark.toml` and `check-ignore` are the user's choice. An agent never loosens them to make `check` pass; it fixes the quiz ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 5, "Rules for agents"). `check` names the profile and config files it used, so loosening is visible.
  - **The grader is declared.** A grades file names who graded (`ai` or `human`), so a human can re-grade an AI's mark and the record keeps both.
  - *Why:* an AI writing and judging its own work is how a wrong answer key survives. The learner is the only one who knows whether a question is right and fair.
- **Every finding has a rule id and a fix hint.** `check` reports `rule`, `level`, `file:line`, `message` and `fix`. `quiz rules` explains any rule and where a threshold came from. *Why:* an agent matches on the id, not on prose, and a person can see why a quiz was held to a rule. Ids, JSON keys and exit codes never change with the language.
- **Exit codes mean the same everywhere.** `0` done, `1` problems found, `2` usage or I/O error, `3` needs input ([COMMANDS.md](COMMANDS.md#exit-codes)). With `--json` a command prints one object and never prompts. *Why:* an agent can decide what to do from the code alone.
- **Builds are deterministic.** The same input gives the same bytes; `--built-at` pins the time; publishing the same library state twice changes nothing. *Why:* diffs in git stay meaningful, and "unchanged" can be trusted.
- **The library is plain git, and never pushes.** It commits after every change and leaves pushing to the user. Results hold the learner's answers and snapshots hold answer keys, so where they go is the user's step. *Why:* publishing is outward-facing and not undoable.
- **Destructive commands are narrow.** `library rm` and `library rename` take one quiz per command, on purpose, and each deletion is its own commit to revert.
- **No telemetry.** Nothing is sent anywhere, ever.
- **One grader.** The same code scores in the page and in `quiz grade`, so the number the learner saw is the number in the report ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 2).
- **The tool does the arithmetic.** A grader (AI or human) gives components (a score per criterion, a band per criterion); fullmark adds, weights and rounds ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 6). *Why:* models add and round wrongly.
- **Two keys in the quiz, no tool language.** `lang` is the language the quiz is written in, and grading follows it; `ui_lang` (default: `lang`) is the interface the learner sees: the page, reports, printed papers and forms. Terminal output is English; `quiz guide --lang vi` gives the Vietnamese guide ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 9).

## 3. Roles

Four roles. One person can play several, and an agent can play two of them.

| Role | Is | Does | Does not |
|---|---|---|---|
| **Author** | The owner, or an agent working for them | Gathers material, answers the brief, writes `quiz.md`, runs `check` until it passes, builds or registers | Decide purpose and scope for the owner; loosen checks to pass; write `review.json` |
| **Learner** | The owner, a classmate, or a respondent | Takes the quiz, exports the results, reviews questions, judges whether the quiz is right | Need fullmark installed: a built page is enough |
| **Agent** | An AI such as Claude Code | Reads material, writes quizzes, runs `check`, grades essays and code from a template, summarises weak topics, runs a one-shot server and waits for the learner | Pass off its own judgement as the learner's; edit the learner's answers; choose where a library goes (`library init`, `import --into`) unless the user named the place; push anything |
| **Grader** | An AI or a human | Fills in the grades template for essays and code, with a note for every lost mark | Compute totals or bands; add criteria or change maximums; stay anonymous |

Notes on the table:

- The author is often an agent. The owner remains the author in the sense that matters: they set the brief's purpose and scope, and they own the rules the quiz is checked against.
- The grader is a role, not a person. The same agent that wrote the quiz can grade the essays, and a human can grade over it with `grade --web`. The grades file records `kind`, `name` and, for a human over an AI, `reviewed`.
- Agent instructions are printed by `quiz agent-guide` (English only). They state these limits in the agent's own terms ([COMMANDS.md](COMMANDS.md#quiz-guide-quiz-agent-guide)).

### Rules in `AGENTS.md`

`quiz agent-guide` prints these as rules for an agent. Each says what to do and why, in one line.

| Rule | Why |
|---|---|
| Read every page of the material, as text and as an image | Slides and scans carry figures, tables and formulas that the text layer loses |
| Never run `quiz library init` unasked, and pass `--into` to `import` only when the user named the place. See 4.4 and [COMMANDS.md](COMMANDS.md#quiz-library-import) | The library's location is the owner's choice |
| Run `library rm` and `library rename` only on request, one quiz at a time | Both change history the owner cares about |
| Never pass `--yes` or `--force` | They skip the confirmation and the safety checks that exist for the owner to see |
| Set `generated_by` in the front matter of a quiz you wrote, naming the agent and model. `check` warns when a quiz written from a brief lacks it (`brief.generated-by`, [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 5) | The owner can tell which quizzes an AI wrote |
| Never change `profile:`, edit `fullmark.toml` or add a `check-ignore` to make `check` pass. See section 2 and [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 5, "Rules for agents" | The rules are the owner's |
| When the user cannot reach your `127.0.0.1`, do not start a one-shot server. Ask in chat, or hand over the built page and wait for an exported results file. See 4.3 and 4.7 | A server on a machine the user cannot reach only times out |
| After `library register`, end your message with the command that starts the quiz, for example `quiz library take NAME` | The learner should not have to look it up |
| Match on rule ids, JSON keys and exit codes, never on message text | They do not change with the language |

## 4. Workflows

Each workflow is a short story with the commands in order. The flags are in [COMMANDS.md](COMMANDS.md).

### 4.1 From material to a quiz

The owner has lecture slides and wants a practice quiz.

1. **Brief.** `quiz brief DIR --web` opens a form (or `--tui` in a terminal, or flags). The owner states the purpose and the scope; the rest has defaults. It writes `DIR/brief.yaml` and an empty `DIR/content/`, where the material goes. If the owner already told the agent the purpose and scope, the agent passes them as flags; if not, `brief` exits 3 and the agent asks. The brief also picks the check profile: `exam-prep` gives `exam`, `survey` gives `survey`, the rest `default`.
2. **Write.** The agent reads the brief and the material, reads `quiz guide` for the syntax, and writes `quiz.md`. `quiz new TEMPLATE` gives a starting file: a built-in one, or one of the owner's own (`quiz template list` shows both; `quiz template add FILE` and `quiz library template add NAME` store more), or `quiz new --from FILE --skeleton`, which keeps an earlier quiz's structure and drops its content. While writing, `quiz build quiz.md --watch --serve` rebuilds and reloads the browser on each save.
3. **Check.** `quiz ids quiz.md` gives every question without an id a random one. `quiz check quiz.md` reports every finding with a rule id and a hint, and warns if the quiz drifts from the brief (count, mix, mode). The agent fixes the quiz until the exit is `0`. `quiz inspect` shows types, points, tags and answer positions, to compare coverage against the material.
4. **Review.** The agent offers `quiz review quiz.md`. The learner works through a form that shows each question rendered, and marks keep, fix or drop with a reason ("the answer key is wrong", "rubric too loose"). **Finish** writes `review.json`.
5. **Fix.** The agent changes the source for each flagged question, then runs `quiz check quiz.md --review review.json`, which fails until every flagged question has changed or gone. `quiz review quiz.md --since review.json` asks only about what is new or changed.
6. **Build.** `quiz build quiz.md` checks again and writes `quiz.html`. Nothing is written when `check` finds errors. The learner gets that one file. For a quiz that will live in the library, the next workflow starts with `library register` instead.

*What done means:* `check` exits `0` under the quiz's profile, the learner's review has no open flags, and the page builds.

### 4.2 Taking a quiz and getting feedback

1. **Take.** The learner opens `quiz.html` by double-click, or the agent serves it with `quiz serve quiz.md --open`. The page grades choice, numeric and short answers on its own, and shows feedback as the quiz is set up (instantly, or at the end). The learner's progress is kept in the browser, so closing the tab does not lose an essay; if storage is blocked the page says so once.
2. **Export.** After **Submit**, **Download results** writes `<id>-results-<time>.json` (`serve` writes it itself). The learner gives it to the agent.
3. **Grade.** `quiz grade results.json --quiz quiz.md --json` re-grades with the shared grader and writes two files: a report (score, per-section and per-tag results, every wrong answer with its explanation, and the essays and code laid out for grading) and a grades template with each rubric's structure and empty cells. `--quiz` must match the version the learner took (the `quizHash`); a mismatch exits 1.
4. **Agent grading of essays and code.** The agent reads each answer against its rubric and fills the template: a score per criterion (`additive`), a band per criterion (`banded`) or one score (`holistic`), a note for every lost mark, a justification and one concrete improvement. It never computes totals. Then `quiz grade results.json --quiz quiz.md --grades results-grades.json` validates (a lost mark without a note, a score off its step, an unknown criterion, a half-filled question all exit 1 with every problem listed), computes the totals and writes the final report. Code is judged by reading; it is never run. See [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 6.
5. **Human grading.** `quiz grade results.json --quiz quiz.md --web` opens a form with the answer next to the rubric, pre-filled with the agent's grades to accept or adjust. It records a human grader and keeps the earlier file; the newest grades file counts.
6. **Summarise.** The agent tells the learner the weak tags first, what to revisit, and a correction for each wrong answer.
7. **Replay.** `quiz replay results.json --quiz quiz.md --grades results-grades.json` writes the page already submitted, with the learner's answers, the explanations, the grades and **Retry missed**. It exits 1 if the attempt was taken on a different version of the quiz, and names the right one.
8. **Over time.** `quiz stats a.json b.json c.json` shows score by date, percent per tag, the weakest tags, the questions missed most often and, for graded essays, the percent per criterion.

### 4.3 A survey answered straight back to an agent

An agent needs a dozen answers from the owner: preferences for a project, or an intake form for a study plan.

1. The agent writes a quiz with `kind: survey` (start from `quiz new survey`), so every question is ungraded and the page shows no score. The `survey` profile switches off the rules about answer keys and explanations.
2. It runs `quiz serve survey.md --open --json` in the background. The page opens on the owner's machine; the owner answers and presses **Finish**.
3. The server writes the results file, prints the final JSON line (`submitted` and the results path) and exits `0`. After `--timeout`, it exits `2`.
4. The agent runs `quiz grade results.json --quiz survey.md --json` and reads the readable answer of each question. The report is titled "Answers" and has no score.

`serve` takes the quiz `.md`, never a built page. Surveys are not registered in the library: `library register` and `import` refuse them (`library.survey`), since the library is the owner's history of their own attempts and surveys mostly go to other people. `serve` and `stats` handle them without a library.

This only works when the owner can reach the agent's `127.0.0.1`. When the agent runs elsewhere (a sandbox, a remote session), it asks in chat, or hands over the built page and waits for an exported results file.

### 4.4 The library over time

The owner keeps quizzes, attempts and reports in a library: one folder under git.

1. **Set up once.** `quiz library init PATH`. The location is the owner's choice; an agent asks and never picks it. `quiz library status` checks the health of the setup.
2. **Register.** `quiz library register quiz.md` checks the quiz, copies the source, assets and brief into the library as a version with the rules it passed (`check.json`), and commits. The original can be deleted. A name already taken exits 1 and suggests a free one.
3. **Take.** `quiz library take NAME` builds the current version, serves it, files the result next to that version and commits. Progress is autosaved, so a closed tab or server resumes the attempt. `--section S` takes one section. `--focus` ticks Focus mode on the start screen: fullscreen with the sidebar closed and a clock in the status line.
4. **Study what you missed.** `quiz library take NAME --missed` offers only the questions that are wrong or partly right in an earlier attempt and not fully right since, across all attempts and versions. Questions changed since are included and marked. Graded essays below full marks come back; ungraded ones are skipped. With nothing missed it says so and exits `0`.
5. **Grade and look back.** `quiz library grade NAME --json` grades the newest attempt against the version it was taken on and files the report under `reports/`; the grading steps are as in 4.2, with `--grades FILE` or `--web`. `quiz library replay NAME` opens a past attempt as a submitted page. `quiz library stats NAME` shows progress across every attempt and version, per question, per tag and per criterion.
6. **Change a quiz.** `quiz library share NAME --source -o DIR` writes the editable folder; edit it, run `check`, then `quiz library register DIR/FILE.md --update NAME` adds a version. Old attempts stay tied to the version they were taken on.
7. **Tidy.** `quiz library rename OLD NEW` changes a name and keeps its id, folder and shelf entries. `quiz library rm NAME` deletes a quiz with its versions and results, asks first, and commits so `git -C LIBRARY revert HEAD` brings it back. Both are for one quiz at a time, at the owner's request.

The library never pushes. If the owner wants a remote, they add it, and it should be private.

### 4.5 Sharing and publishing

Three ways to hand a quiz to someone, from lightest to most lasting.

- **Send a file.** `quiz library share NAME -o DIR` writes the clean offline page. The recipient double-clicks it. This works on a desktop. On a phone, a local HTML file may not run its script or keep its storage, so phone users get a link instead ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 7, foundation 8).
- **Send the source.** `quiz library share NAME --source` writes the Markdown, assets, brief and a `fullmark.toml` with the custom profile the quiz uses. The recipient can edit it.
- **Publish a shelf.** A shelf is a folder (often a public repository on GitHub Pages) holding the current source, assets and built page of every quiz on the shelf named `public`, plus an index page and a `fullmark-shelf.json` manifest.
  1. `quiz library publish NAME --on` puts a quiz on the `public` shelf (`--off` takes it off). This writes no shelf. A quiz's shelf membership is a list of entries, so several shelves can come later without changing the library ([proposals/shelves.md](proposals/shelves.md)).
  2. `quiz library publish DIR --dry-run` shows what would be added, updated and removed.
  3. `quiz library publish DIR` builds everything first (nothing is written if any build fails), writes only what changed, and commits in `DIR` only the paths it wrote. It never pushes; the owner does that. `DIR` is remembered after the first sync.
  4. Results, reports, progress and older versions are never copied. Briefs only with `--with-brief`.
- **Import.** `quiz library import DIR` registers a published folder into a library, keeping ids and names. Every quiz must pass `check` first. `--into PATH` creates the library first; an agent passes it only when the owner named the place. A shelf holds no results or history, so import restores quizzes, not a backup.

For printing, `quiz build quiz.md --print` writes a paper version (`--answers none|key|inline`, `--seed S` for several versions of one exam), saved to PDF from the browser ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 8).

### 4.6 Many quizzes at once

A course folder has twelve quizzes.

- **Build them all.** `quiz build signals/*.md -o site` checks and builds each quiz on its own, one page per quiz, in the order given. Every file is attempted; the exit code is the worst one. fullmark expands globs itself, since PowerShell does not. A folder argument is refused, so a `README.md` is never built by accident. On a terminal, one updating progress line shows `[3/12] signals.md`.
- **Register them all.** `quiz library register signals/*.md` is all or nothing: if any file has errors or a taken name, nothing is registered and every problem is listed. Otherwise one commit holds them. Re-running after adding one quiz registers only the new one, since a file whose content already is the current version is skipped as `unchanged`. A quiz registered before and since edited is refused with the `--update NAME` command to run.
- **Write it down once.** A build file (`build.toml`) lists files and per-entry options (`out`, `profile`, `fonts`, `ui-lang`, `built-at`, `print`, `answers`, `seed`), so a course folder, or an exam with its answer key, rebuilds with one command: `quiz build --build-file build.toml`. `quiz library register --build-file build.toml` reads the same file and uses its `files`, `profile`, `config` and `strict`. fullmark never looks for a build file; it is named on the command line. The format is in [COMMANDS.md](COMMANDS.md#quiz-build).
- **Check, grade and replay them all.** `quiz check signals/*.md` checks every quiz. `quiz grade results/*.json --quiz quiz.md --json` writes a report and a grades template for each results file, for example for a class that took the same quiz; a file taken on another version fails alone. `quiz replay results/*.json --quiz quiz.md` writes one page per attempt, each with its `-grades.json` if one sits beside it. Filling in the grades stays one answer sheet at a time. The batch rules are in [COMMANDS.md](COMMANDS.md#several-files).
- **Pin the time** with `built-at` (or `--built-at`) so a rebuild is byte-identical.
- A page holding several quizzes (a bundle) is not in v1 (section 6).

### 4.7 An agent running a one-shot server in the background

`serve`, `review`, `brief --web`, `grade --web` and `library take` serve a page on `127.0.0.1`, wait for one submit and exit. An agent that is waiting on a human should not block its own session.

1. Start the command with `--json`, in the agent's background runner, for example `quiz serve survey.md --open --json`.
2. **First line:** as soon as the server is up it prints `{"status": "listening", "url", "port", "pid"}`. The agent can pass the URL on to the user at once.
3. **Last line:** when the learner submits, `{"status": "submitted", "results", "score"}`; on `--timeout`, `{"status": "timeout"}`. The exit code matches: `0` submitted, `2` timeout. `review` and the form commands end with their own status object and the same codes.
4. The agent reads the file named in the last line. Defaults to know: `serve`, `review`, `brief --web` and `grade --web` wait 1800 seconds, `library take` waits forever (`--timeout 0`).

If the user cannot reach the agent's `127.0.0.1`, the agent does not start these servers. It asks in chat, and records the answers with flags so the brief still says the user decided them ([COMMANDS.md](COMMANDS.md#quiz-brief)).

## 5. The files a user sees

The full table, with formats, is [COMMANDS.md](COMMANDS.md#files). By who writes them:

| Who | Files |
|---|---|
| **The author or an agent** | `quiz.md` and `assets/`; filled-in `*-grades.json` (the grader) |
| **The user** | `fullmark.toml` (check rules; agents never edit it to pass `check`); `config.toml` (library path, shelf folders, personal profiles, default fonts); `build.toml` |
| **The learner, through the page or a form** | `*-results-*.json` (**Download results**, `serve`, `library take`); `review.json` (`review`) |
| **`brief`** | `brief.yaml` and `content/` |
| **fullmark, from a command** | `quiz.html`; `*-report.md` and `*-report.json`; a grades template; `check.json`, `library.toml`, `fullmark-shelf.json` |

Three data formats, and no fourth: TOML for configuration people write, YAML for content people write (front matter, `brief.yaml`), JSON for anything the tool or the page writes ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 7). Every JSON file carries `format` and `version`. Every write is atomic, so an interrupted command leaves the old file or the new one.

## 6. What fullmark deliberately does not do

- **Secure exams.** The answer key ships inside the page, only obfuscated. fullmark never calls a quiz secure; a printed paper without `--answers` carries no key at all. *Why:* a page that runs on the learner's machine cannot hide anything from that machine.
- **Run the learner's code.** Code answers are exported and judged by reading. *Why:* running untrusted code is a security and portability problem for a small gain.
- **Symbolic maths.** Numeric answers are compared as numbers within a tolerance; `2x` and `x*2` are not compared as equal. *Why:* a computer algebra system is a large dependency for a rare question type.
- **Surveys in the library, for now.** `library register` and `import` refuse a survey (`library.survey`). Allowing surveys in a shared library later is additive: `take` works, `grade` exits 2 with no score, and `--missed` refuses. There would be no separate survey-library kind.
- **A server, accounts, sync or analytics.** Beyond the one-shot server on `127.0.0.1`, nothing listens and nothing is sent. *Why:* the whole product is files; anything networked would need hosting, upkeep and a privacy policy.
- **Pushing, ever.** The library and `publish` commit locally; the user pushes.
- **Loosening checks for you.** There is no `--rule` flag. Overrides live in files, in git, where they can be reviewed.
- **Plugins in `check`.** Custom checks use a fixed declarative vocabulary (`count`, `require`, `forbid`), so they stay deterministic and safe.
- **A library UI or sync.** No `library --web`, no `library sync`.
- **Other formats.** No Anki, CSV or QTI import or export, no includes or hotspot questions, and spaced repetition only as far as `--missed`.
- **Terminal forms except `brief --tui`.** `review` needs rendered maths, code and images, which a terminal does badly.
- **Comparing graders.** Two graders on the same answer can be compared later; every grades file is kept so the format does not change.
- **Compatibility with 0.x.** 1.0 reads no 0.x quiz, results, grades or library. The owner's history is converted once by a throwaway script ([fullmark-migration.md](fullmark-migration.md)). 0.10.2 stays as the MVP, now mainly for surveys.

### Not in v1, may come later

These are written up in `proposals/`. They are ideas, not promises, and nothing in this document depends on them.

| Proposal | What it would add | Seam in v1 |
|---|---|---|
| [multi-quiz-bundle.md](proposals/multi-quiz-bundle.md) | `quiz bundle`: several quizzes of one kind and look in one HTML file, for sharing a course as one file | build takes a list; page state keyed by quiz |
| [app-window.md](proposals/app-window.md) | Knowing when the quiz window closes (`--exit-on-close`), a Chromium app window (`--open app`), and `--open-with COMMAND` for your own app shell | the one-shot server; a served page built apart from a shared one |
| [background-serve.md](proposals/background-serve.md) | `--background` for the one-shot server, mostly for PowerShell | the `listening` JSON line |
| [shelves.md](proposals/shelves.md) | The `quiz library shelf ...` commands: several shelves (public, one per class) | adopted in v1: shelf membership is a list of entries, and only the shelf named `public` has commands |
| [guide-web.md](proposals/guide-web.md) | `quiz guide --web`, the guide with live examples | every guide example is a `quiz-example` block that passes `check` |
| [markdown-export.md](proposals/markdown-export.md) | Plain Markdown paper for pandoc, Word and Typst | `build --print` |
| [import-clone.md](proposals/import-clone.md) | `library import --clone` from a Git URL | `publish` and `import` |
| [japanese-support.md](proposals/japanese-support.md) | JLPT N5 to N3 practice: shared reading passages, furigana, `lang="ja"` text, `jlpt-*` templates | the `single` type and embedded audio, which already suffice for vocabulary, grammar and listening |
| [self-host.md](proposals/self-host.md) | Quizzes reachable from other devices: static hosting (a how-to), then a library server with an admin account and remotes, then more accounts | a shelf is static files; the one-shot server's checks; `results-v2` carries the quiz hash |
| [reference-sheet.md](proposals/reference-sheet.md) | Reference sheets (formulas, constants, unit conversion tables) the learner opens during a quiz, appended to printed papers | adopted in v1 (2026-10-28) as quiz-level `materials`: Markdown sheets in a docked sidebar and on a printed page |
| [library-query.md](proposals/library-query.md) | Filter terms on `library list` (`tag:fourier score:<70 -taken:never`), with `--names` for batch use | adopted in v1: the field names of `library list --json` |
| [vi-typo-check.md](proposals/vi-typo-check.md) | Rules that catch impossible Vietnamese syllables | the rule registry |
| [build-log.md](proposals/build-log.md) | `--log FILE` (the `--json` lines appended to a file, for `--watch` too) and a record beside a printed paper proving which paper and key went out | `build --json`, deterministic builds |
| [cli-integration.md](proposals/cli-integration.md) | Shell completion, prediction, a tldr page, a prompt segment | none needed |
| [rapid-response.md](proposals/rapid-response.md) | One question at a time that moves on when answered, for drills | none needed: another view over the same `Attempt` reducer |
| [brief-purposes.md](proposals/brief-purposes.md) | Briefs fitted to a subject: template overrides, the brief as a survey | the machine config's `[brief.purpose.<purpose>]` tables |
| [print-pdf.md](proposals/print-pdf.md) | `build --print --pdf` through the teacher's own Chromium-based browser | `build --print` and `build --watch --serve`'s long-running server |
| [interactions.md](proposals/interactions.md) | Open questions about how the features combine | |

## 7. Where to go next

- A command's flags, JSON and exit codes: [COMMANDS.md](COMMANDS.md).
- Data model, rubric modes, security, page design, testing and order of work: [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md).
- Why 1.0 is a rewrite: [fullmark-migration.md](fullmark-migration.md).
- The authoring syntax and the agent instructions: `quiz guide` and `quiz agent-guide`.
