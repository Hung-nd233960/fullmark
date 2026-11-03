# fullmark 1.0: command reference

The spec sheet for every command of fullmark 1.0 ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md)); how the commands fit together, and why, is in [USER_DESIGN.md](USER_DESIGN.md). Each entry says what the command does, what it accepts, what it writes and how it exits. 1.0 is not compatible with 0.x; the tags only say how a command relates to the prototype, as a guide to what is new work:

- **same**: behaves as in 0.x.
- **changed**: exists in 0.x but behaves differently here.
- **new**: not in 0.x.

The program is `quiz`. `fullmark` runs the same program, for systems where another program already owns `quiz`.

## Conventions

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Done. Warnings may have been printed |
| `1` | Problems found: check errors, a refused quiz, a mismatched attempt |
| `2` | Usage error, I/O error, timeout, or nothing to work on |
| `3` | Needs input: a human-only value is missing. The output says which value and how to provide it (a flag or a form) |

`quiz` with no command prints the help on stderr and exits 2.

### Common options

| Option | Meaning |
|---|---|
| `--json` | Print the outcome as one JSON object on stdout. Human text goes to stderr. With `--json`, a command never prompts. Commands that run the one-shot server (`serve`, `review`, `brief --web`, `grade --web`, `library take`) first print a `listening` line, so the outcome is the second line: see `serve`. Content found wrong (check errors, a hash mismatch, invalid grades, a duplicate id) keeps the command's own status, such as `failed` or `problems`. A failure to run is `{"status": "error", "message"}`, with `"file"` when it concerns one input and `"errors": [{"file", "line", "message", "fix"}]` for a malformed config; its human text also goes to stderr |
| `--plain` | Plain text with no colours, even in a terminal. `NO_COLOR` does the same |
| `--open` / `--no-open` | Open, or don't open, the page in the default browser |
| `--port N` | Port on 127.0.0.1 for the one-shot server. Default: a free port |
| `--timeout SECONDS` | How long a one-shot server waits for a submit. `0` waits forever. Default `1800`, except `library take` (`0`) |
| `-h`, `--help` | Help for the command |
| `--version` | Print `fullmark X.Y.Z` (top level only) |
| `--acknowledgements` | Print fullmark's MIT licence, then every third-party component shipped in the CLI or in its pages, with version, licence and the notice its licence requires (top level only). The text is `THIRD_PARTY_NOTICES.md`, each distinct licence text printed once; it loads nothing else. See [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 3, "Licences" |
| `--profile P` | The check profile, on every command that runs `check` (`check`, `build`, `serve`, `review`, `inspect`, `rules`, `library register`). Overrides the quiz's `profile:` |
| `--config TOML` | Use this config file instead of looking for the nearest `fullmark.toml`. Same commands as `--profile` |
| `--fonts quiz\|all\|none` | Which fonts the page embeds, on every command that writes a page (`build`, `replay`, `serve`, `library take`, `library replay`, `library share`, `library publish`). `quiz`: the quiz's own font; `all`: every font, about 0.5 MB, so a learner can switch freely; `none`: no embedded font, the smallest page. Default: `fonts` in `config.toml`, else `quiz`. `publish` remembers its value in the shelf manifest. See [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 8 |

How the profile and the config are chosen is in [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 5. A malformed config file exits 2 with the config's `file:line`; an unknown profile given with `--profile` exits 2 with a plain message naming the known profiles.

### Several files

Commands that handle each input on its own take `FILE...`: `check`, `build`, `ids`, `grade`, `replay` and `library register`. The rules are the same for all of them:

- **Inputs.** Globs (`signals/*.md`) are expanded by fullmark, since PowerShell does not expand them. They are sorted and repeated names are dropped. A folder is refused, so a `README.md` is never processed by accident.
- **Order and exit.** One after another, in the order given. Every input is attempted, and the exit code is the worst one (`2` over `1` over `0`). `library register` is the exception: it is all or nothing, because it changes the library.
- **Options that name one thing** (`--review`, `--grades`, `--web`, `--serve`, `-n`, `--update`) exit 2 with several inputs. `--quiz` is one quiz for all the results of `grade`; a results file taken on another version fails on its own and the others go on.
- **Output.** `-o` names a folder (created if missing) and each output keeps its input's name. If `-o` names an existing file, the command exits 2 before handling any input. An `-o` ending in `.html` or `.htm` (any letter case) looks like a page, not a folder: the command exits 2 before handling any input. Inputs count as several when more than one is given, usable or not, so `good.md missing.md -o out` makes the folder `out`. If two inputs have the same name in different folders, their outputs would collide: the command exits 2 before handling any input, naming both. Without `-o`, each output goes beside its input as for a single file.
- **Progress.** On a terminal, stderr shows one updating line, `[3/12] signals.md`, and each failure in full. The line is not shown with `--json`, `--plain` or when stderr is not a terminal. After the last input, stdout shows a summary (`10 done, 2 failed`), on a terminal or not; not with `--json`. There is no progress-bar dependency: one file takes milliseconds.
- **`--json`.** One line per input, the command's usual object with `"file"` added, then `{"status": "done", "ok", "failed"}`.

### Paths in output

A path is printed relative to the working directory when it lies under it, else absolute, and always with `/`, on Windows too. A file that cannot be read or written is reported in plain words ("no such file", "is a folder", "permission denied"), not with the operating system's message.

### Names, ids and stamps

- A quiz in the library is named by its **name** or its **id**.
- An attempt is named by its **stamp** (the results file name) or a prefix of at least 4 characters. Default: the newest.
- A version is named by its **hash** or a prefix of at least 4 characters. Default: the current one.
- A section is named by its **slug** or its title, ignoring case. An unknown section exits 2 and lists the valid ones.

### Environment

| Variable | Meaning |
|---|---|
| `FULLMARK_CONFIG` | Path of `config.toml`, in place of `%APPDATA%\fullmark\config.toml` on Windows or `~/.config/fullmark/config.toml` on Linux |
| `FULLMARK_LIBRARY` | Library folder for this shell, overriding the config. `library status` warns when it is set |
| `NO_COLOR` | Same as `--plain` |

### Files

| File | Format | Written by |
|---|---|---|
| `quiz.md` plus `assets/` | fullmark Markdown (`quiz guide`) | the author or an agent |
| `quiz.html` | one self-contained offline page | `build`, `library share` |
| `*-results-*.json` | `results-v2` (serialised Attempt); the page names it `<quiz id>-results-YYYYMMDD-HHMMSS.json`, local time | the page (**Download results**), `serve`, `library take` |
| `*-report.md`, `*-report.json` | `report-v2` (the JSON; TECHNICAL_DESIGN.md, section 6) | `grade`, `library grade` |
| `*-grades.json` | `grades-v2`: the grader's identity, and per question the rubric mode with scores or bands per criterion and notes | template from `grade --json`, filled in by an agent or through `grade --web` |
| `review.json` | `review-v1`: keep, fix or drop per question | `review` |
| `brief.yaml` plus `content/` | brief | `brief` |
| build file (`build.toml`) | what `build --build-file` builds: files, and per entry the `build` options | the user |
| `fullmark.toml` | check config: default profile, custom profiles, rule levels and options, custom checks | the user (agents never edit it to make `check` pass) |
| `config.toml` | machine config: library path, shelf folders (by shelf name; `public` in v1), personal profiles, default `fonts` | `library init`, `library publish`, the user |
| `check.json` | the resolved rules a library version was registered with | `library register` |
| `library.toml` | the library's index of quizzes | `library` commands |
| `fullmark-shelf.json` | shelf manifest | `library publish` |

## Core commands

Core commands work on files. They need no setup and no config, and never touch a library.

### quiz check

**changed**: every finding has a rule id, and there are profiles and config.

```text
quiz check FILE... [--profile P] [--config TOML] [--strict] [--review REVIEW] [--json] [--plain]
```

Validates a quiz under one profile. Reports every issue with a level, a rule id, `file:line` and a fix hint. If a `brief.yaml` sits next to the quiz, `check` also warns when the quiz does not match the brief (count, mix, mode). The first line of human output names the profile and the config files used, for example `profile exam (fullmark.toml:4)`.

| Argument or option | Meaning |
|---|---|
| `FILE...` | The quiz `.md` files. Several: see [Several files](#several-files) |
| `--profile P` | Check under this profile. Default: the quiz's `profile:` (`survey` for a `kind: survey` quiz that names none), then the brief's, then `[check] profile`, then `default` |
| `--config TOML` | This config file instead of the nearest `fullmark.toml` |
| `--strict` | Warnings count as errors (sets `fail-on = "warning"` for this run) |
| `--review REVIEW` | Also fail until every question flagged *fix* has changed or gone and every question flagged *drop* is gone (`review.fix`, `review.drop`); a changed *fix* warns `review.unconfirmed` until the learner judges it again with `review --since`. A review of another quiz exits 2. One quiz only. See [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 4, "`review-v1`" |
| `--json` | `{"status", "profile", "config": [paths], "errors", "warnings", "issues": [{"rule", "level", "file", "line", "message", "fix"}], "ignored": [{"rule", "line", "because"}]}` |

Exit: `0` no errors, `1` errors (or warnings with `--strict` or `fail-on = "warning"`), or an unknown profile named in the quiz (`profile.unknown`); `2` file not found, malformed config (with `file:line`), or unknown `--profile` (a plain message naming the known profiles).

### quiz rules

**new**.

```text
quiz rules [RULE] [--profile P] [--for FILE] [--config TOML] [--json] [--plain]
```

The rule catalogue. Use it to see what a profile checks and why a quiz was held to a rule.

- With no arguments: every rule (built-in and custom) with its kind (fixed or quality), its level and options under the profile, and a one-line description.
- With `RULE`: that rule in full, with what it catches, why it matters, its options, an example that triggers it and how to fix it.
- With `--for FILE`: the effective rules for that quiz, with where each value came from (built-in, the `exam` profile, `fullmark.toml:12`, the user config) and the profile chain (`signals-exam` extends `exam` extends `default`).

| Argument or option | Meaning |
|---|---|
| `RULE` | A rule id, such as `choice.correct-longest` or `custom.two-essays` |
| `--profile P` | Show the rules under this profile. Default: `default`, or the quiz's with `--for` |
| `--for FILE` | Resolve config and profile as `check FILE` would |
| `--json` | `{"profile", "chain", "config", "rules": [{"id", "kind", "level", "options", "origin", "description"}]}`. `kind` is `fixed`, `quality` or `custom` |

Exit: `0`, `2` unknown rule or profile, or malformed config.

### quiz build

**changed**: absorbs `watch`, adds several files, `--build-file`, `--built-at`, `--ui-lang` and `--print`.

```text
quiz build FILE... [-o OUT] [--profile P] [--config TOML] [--strict] [--open]
                [--print [--answers none|key|inline] [--answer-sheet] [--seed S] [--materials none]]
                [--built-at ISO] [--ui-lang en|vi]
                [--watch [--serve] [--port N]]
                [--json] [--plain]
quiz build --build-file BUILD [FILE...] [-o DIR] [--json]
```

Checks the quiz (under the profile, as `check` does), then writes one self-contained HTML page. Nothing is written if `check` finds errors. With several files, each is checked and built on its own, one page per quiz; a page holding several quizzes is a bundle, not in v1 ([proposals/multi-quiz-bundle.md](proposals/multi-quiz-bundle.md)).

| Argument or option | Meaning |
|---|---|
| `FILE...` | One or more quiz `.md` files. Globs (`signals/*.md`) are expanded by fullmark too, since PowerShell does not expand them. A folder is refused, so a `README.md` is never built by accident |
| `-o`, `--output OUT` | Output path. Default: `FILE` with `.html`. With several files, `OUT` is a folder (created if missing) and each page keeps its source's name; a file path exits 2 |
| `--build-file BUILD` | Build what a build file lists (below). `FILE`s given as well build only those of its entries |
| `--strict` | Fail on warnings and write nothing |
| `--open` | Open the page after building, with the system's opener, without waiting. A failed build opens nothing. If the opener cannot start, `warning: cannot open the page: REASON` goes to stderr and the exit stays `0`: the page was built |
| `--print` | Write a static printable paper instead of the interactive page (TECHNICAL_DESIGN.md, section 8). Default output: `FILE` with `-print.html`. Print it, or save it as PDF from the browser |
| `--answers` | With `--print`: `none` (default, an exam paper), `key` (an answer key on a new page after the paper) or `inline` (answers and explanations under each question). Without `--print`, or any other value, exit 2 |
| `--answer-sheet` | With `--print`: after the header, a grid of boxes, one per single-choice and true/false question, where the student writes the letter; the key then lists those answers in the same grid. Other question types are answered in place |
| `--seed S` | With `--print` (without it, exit 2: "`--seed` needs `--print`"; the same for `--answer-sheet`): shuffle questions and options reproducibly, so different seeds give different versions of the same exam, each with a matching key. `S` is 1 to 8 letters or digits (else exit 2) and is printed as the paper's code, "Mã đề" or "Paper code" (TECHNICAL_DESIGN.md, Printable paper) |
| `--materials none` | With `--print`: leave out the materials page that otherwise follows the last question when the quiz has `materials` (TECHNICAL_DESIGN.md, Printable paper). `none` is the only value; another, or no `--print`, exits 2. On a quiz without materials it does nothing |
| `--built-at ISO` | Pin the build time, so a build is byte-identical across runs. Default: now |
| `--ui-lang en\|vi` | Language of the interface for this build, overriding the quiz's `ui_lang`. The questions are not translated, and grading still follows the quiz's `lang`: the key and the quiz's version are unchanged, so a results file from the page grades as before |
| `--watch` | Rebuild whenever `FILE` changes, or any file its version covers (assets, `materials` sheets and their assets), or the build file; changes are gathered for 100 ms. A save with errors prints them and keeps the last good page, on disk and in the server. Works with `--print` too. Runs until Ctrl+C, which exits `0` |
| `--serve` | With `--watch`: serve the last good page on 127.0.0.1 at a token URL, and reload the browser after each rebuild through Server-Sent Events (`GET /events`). This server is not one-shot: it takes no submit and has no autosave, only the reload code, which only the served copy carries, and it runs until Ctrl+C. With several files it serves an index of the pages |
| `--json` | `{"status", "output", "bytes", "errors", "warnings"}`: `status` is `"built"` or `"failed"`, `output` the page's path or null, `errors` and `warnings` the issues in `check --json`'s shape. A failed build has `output` and `bytes` null; a file that cannot be read or written gives `{"status": "error", "file", "message"}`, as `check --json` does. With `--watch`, one JSON line per rebuild. With several files, one such line per file (with `"file"`), then `{"status": "done", "ok", "failed"}` |
| `--plain` | As everywhere: no colours, no progress line |

Exit: `0` built, `1` check errors, `2` I/O error. With several files: every file is still checked and built, and the exit is the worst one.

**Size.** The finished page is checked against `build.size` before it is written: over `warn-mb` (20 MB, 1 MB being 1,000,000 bytes) is a warning at the profile's level (an error with `--strict`), over `max-mb` (100 MB) an error whatever the profile, and nothing is written. Without `--built-at`, the pages of one run share one build time.

**Several files.** As in [Several files](#several-files), with these for `build`:

- Builds run one after another. Parallel builds wait for a measured need.
- `--watch` watches them all. `--open` opens nothing and says so: `--open opens one page; built N` on stderr, exit unaffected. `--strict` applies to each file.

**Build file.** A TOML file listing what to build and how, so a set of pages (a course folder, a printed exam with its key) rebuilds with one command. It is named on the command line; fullmark never looks for one. Paths are relative to the build file.

```toml
# build.toml
out = "site"                          # default folder for every entry
built-at = "2026-10-24T09:00:00+07:00" # pins the build time: byte-identical rebuilds
ui-lang = "vi"

[[build]]
files = ["signals/*.md", "systems/intro.md"]

[[build]]
files = ["exam/final.md"]
print = true
answers = "key"
seed = 7
ui-lang = "en"                        # overrides the top level
```

- **Keys are `build` flag names**, top level as defaults, each `[[build]]` entry overriding them: `out`, `profile`, `config`, `strict`, `fonts`, `ui-lang`, `built-at`, `print`, `answers`, `answer-sheet`, `seed`, `materials`. `files` is required in each entry. A flag on the command line beats both.
- **Not allowed:** `attempt`, `grades`, `watch`, `serve`, `open`, `port`: they are about one run, not about what to build. These and unknown keys exit 2 with `file:line`, as a malformed config does.
- **`out` is always a folder**, even for one file, so adding a file to an entry never changes where pages go. `-o DIR` replaces it for every entry; without either, a page goes beside its source. `out` and `-o` are refused as in [Several files](#several-files): a name ending in `.html` or `.htm`, or an existing file, exits 2.
- **Clashes are found first.** Before anything is built, every page any entry would write is worked out. Two that would write the same path (the same file in two entries, or files of the same name into one folder) exit 2, naming both entries' lines, with the fix "give each entry its own `out`".
- **`FILE`s given with `--build-file`** build only the entries' files that match them (by resolved path), each with its own entry's options. A `FILE` in no entry exits 2 naming it, before anything is built.
- **`built-at` is quoted text**, as the flag takes it. An unquoted TOML date is refused with `` `built-at` must be in quotes ``: TOML rewrites dates when it reads them, and the page keeps the text as written.
- **The printed paper's keys.** `print` and `answer-sheet` are true or false; `answers` is `"none"`, `"key"` or `"inline"` and `materials` `"none"`, refused as the flags are; `seed` is text or a non-negative whole number read as its decimal digits (a leading zero needs quotes: `"007"`). `seed`, `answer-sheet`, `answers` and `materials` need `print = true` in the same entry (a command-line `--print` also counts), else exit 2 with `BUILD:line`; `answer-sheet` with `answers = "inline"` is refused as the flags are.
- **Errors.** Every problem is listed, each with `BUILD:line`: unknown keys, keys about one run, wrong types and values (the flag's own message), an empty or missing `files`, a file with no `[[build]]`. Nothing is built. With `--json` the result is one line, `{"status": "error", "file", "message", "errors": [...]}`.
- **An example.** [examples/build.toml](../../examples/build.toml) builds every example, each into its own folder.
- **`library register --build-file`** reads the same file and registers its `files`.
- `--watch` with a build file also watches the build file.

### quiz serve

**changed**: adds `--section`, takes only the quiz source (0.x also took a built page), and drops `--once`: it always exits after one submit.

```text
quiz serve FILE [--out RESULTS] [--timeout SECONDS] [--open]
                [--focus] [--section S] [--autosave PROGRESS] [--port N]
                [--profile P] [--config TOML] [--fonts quiz|all|none] [--json]
```

Serves the page on 127.0.0.1. When the learner presses **Submit** (or **Finish** in a survey), the page sends the results back, the server writes them and exits. It accepts exactly one submit; there is no mode that keeps serving. For questionnaires and quizzes that a tool or an agent is waiting on.

| Argument or option | Meaning |
|---|---|
| `FILE` | The quiz `.md`. Given a `.html`, `serve` exits 2 with "serve takes the quiz source; to collect results from a built page, use its **Download results** button" |
| `--out RESULTS` | Results file. Default: `<quiz-id>-results-<time>.json` next to the source |
| `--timeout SECONDS` | Default `1800`. `0` waits forever. Exits 2 on timeout |
| `--open` | Open the page in the browser |
| `--focus` | Tick **Focus mode** on the start screen, so pressing Start enters fullscreen with the sidebar closed (TECHNICAL_DESIGN.md, section 8). A page cannot go fullscreen without a click |
| `--section S` | Serve only this section. Results record `plan.source: "section"` |
| `--autosave PROGRESS` | Keep the attempt in progress in this file, so it resumes after the server or the browser closes. The file is a `results-v2` document whose attempt is still in progress, written atomically at most once a second. Started again with the same file, the page offers to resume it. The file is matched by its `quizHash`, which names one quiz and one version; its attempt's phase is `answering`. A file for another version, one that is not a results file, one already submitted, or one for another section exits 1, saying why, and is left alone. The same file as `--out` exits 2, since this one is deleted once the results are written. The browser's storage is not used, so the file is the only copy (owner, 2026-11-03, from 3b's review) |
| `--json` | Two JSON lines. As soon as the server is up: `{"status": "listening", "url", "port", "pid"}`. At the end: `{"status": "submitted", "results", "score"}`, or `{"status": "timeout"}` or `{"status": "interrupted"}` (Ctrl+C), with nothing written. Check errors give one line instead, before any server starts: `{"status": "failed", "errors", "warnings"}`, the issues in `check --json`'s shape, as `build` gives them. A results file that cannot be written gives `{"status": "error", "message"}` as the second line (owner, 2026-11-03). A caller running `serve` in the background reads the URL from the first line |

Exit: `0` submitted, `1` check errors in `FILE`, `2` timeout, interrupted (Ctrl+C), a `.html` given, or usage error.

**One submit, and only a valid one** (owner, 2026-11-03). A submit the server cannot accept (another quiz id, a body that is not a valid attempt at this quiz's version) gets HTTP 400; the page says it could not save and to use **Download results**, and the server keeps waiting. Once a submit is accepted the server is closing and takes no other. If the results file cannot be written, the page is told (HTTP 500) and says it could not save and to use **Download results**, and the command exits 2 with the file named. The same holds for every one-shot server command.

**Why only the source.** Shared pages carry no server code ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 7, foundation 9): a built page has no submit code, no `connect-src` and a CSP hash fixed at build, so serving it would mean injecting code into finished HTML. `serve` builds the page in memory from the source, which is also what `--section` and the check errors of exit 1 need. `library take` builds from the stored source and `bundle serve` takes `BUNDLE.yaml`, so neither needs a built page.

### quiz review

**changed**: drops `--once`, as `serve` does.

```text
quiz review FILE [--out REVIEW] [--since REVIEW] [--open]
                 [--timeout SECONDS] [--port N] [--json]
```

A form where the learner judges every question: keep, fix or drop, with a reason (such as "the answer key is wrong"; for essays and code also "rubric too loose", "points misallocated" or "criterion unclear"). Rubrics are shown with their points. **Finish** writes `review.json` ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 4, "`review-v1`"). Then `quiz check FILE --review review.json` fails until every *fix* question has changed and every *drop* question is gone.

**The form** (owner, 2026-11-03; the look is drawn in step 3's form board):

- **Verdict first.** Each question, rendered as on the page, has three buttons: **Keep**, **Fix**, **Drop**. Keep needs nothing more.
- **Reasons only after Fix or Drop**, as chips for that verdict: Fix shows *Answer key wrong*, *Unclear*, *Other*, and on essays and code also *Rubric too loose*, *Points misallocated*, *Criterion unclear*; Drop shows *Duplicate*, *Off scope*, *Too easy*, *Other*. At least one is required; a note box opens with them, required with *Other*.
- **The rest is fine.** A button in the form's bar marks every question not yet judged as Keep (recorded with `assumed`) and finishes, after saying how many.
- **Finish with questions not judged** asks first: "N questions not judged", with **Go back** (to the first one) and **Mark them Keep and finish**.
- **With `--since`**, each question asked again shows the learner's earlier verdict, reasons and note, and a diff of the question against the version judged.
- Keyboard keys wait for the board.

| Argument or option | Meaning |
|---|---|
| `FILE` | The quiz `.md` only, as for `serve`: a built page is refused with exit 2 |
| `--out REVIEW` | Default: `review.json` next to the quiz. An existing file is merged into |
| `--since REVIEW` | Ask only about questions that are new or changed since this review, and merge into it |
| `--timeout`, `--open`, `--port` | As for `serve`, so the timeout is `1800` seconds. The server exits after the first **Finish** |
| `--json` | `{"status", "review", "keep", "fix", "drop"}` |

Exit: `0` written, `1` check errors in `FILE`, or a question without an id (nothing is served; the message says to run `quiz ids FILE` first, since a verdict follows its question by id), `2` timeout or usage error.

### quiz brief

**changed**: `--tui` is a real terminal form, and both forms check that answers are detailed enough.

```text
quiz brief DIR [--web [--no-open] [--timeout SECONDS] [--port N] | --tui]
               [--purpose P] [--scope TEXT] [--kinds LIST] [--kinds-other TEXT]
               [--elsewhere TEXT] [--count N] [--minutes N] [--mix LIST]
               [--difficulty D] [--mode M] [--weak-topics yes|no] [--commitment N]
               [--language en|vi] [--request TEXT] [--profile P]
               [--accept-defaults] [--json]
```

Writes `DIR/brief.yaml` and an empty `DIR/content/` for a quiz an agent will write. One question file drives the flags, the `--web` form and the `--tui` form, so all three ask the same questions in the same words.

**The question file** (owner, 2026-11-03) is `src/brief/questions.yaml`, shipped with fullmark and checked against a zod schema by a test. One entry per brief key: `key`, `kind` (`choice`, `multi`, `text` or `number`), `label` and `help`, `choices` each with a `label` and `hint`, `min-words` with an `example`, `follow-up` (the text box for *other*), `human-only`, `default`, and `section` (the steps of `--tui`). Every text is given in `en` and `vi`. The flags take their allowed values, defaults, detail rules and `--help` text from it; the forms take everything, in the language of `--language`.

**Detail rules.** The question file can give a text answer a minimum (`min-words`, plus an example of a good answer). The scope needs at least 4 words, for example "lectures 3 to 5, the Fourier transform" rather than "signals". Both forms show the example and ask again when an answer is too short. Through flags, a short answer is accepted with a `brief.vague` warning, which `--json` lists, so the agent can go back to the user.

| Option | Values | Default | Human-only |
|---|---|---|---|
| `--purpose` | `self-study`, `exam-prep`, `classmates`, `survey` | `self-study` | yes |
| `--scope` | text: chapters, lectures, topics | none | yes |
| `--kinds` | comma list: `lecture-slides`, `textbook`, `notes`, `past-exams`, `lab-manual`, `other` | empty | no |
| `--kinds-other` | text, needs `other` in `--kinds` | | no |
| `--elsewhere` | text: material not in `content/` | empty | no |
| `--count` | number of questions | `20` | no |
| `--minutes` | time limit, `0` for none | `0` | no |
| `--mix` | comma list: `recall`, `understanding`, `calculation`, `code`, `essay` | per purpose | no |
| `--difficulty` | `warm-up`, `like-the-exam`, `harder` | `like-the-exam` | no |
| `--mode` | `each-question`, `at-the-end`, `timed-exam` | `at-the-end` | no |
| `--weak-topics` | `yes`, `no` | `no` | no |
| `--commitment` | the score the learner commits to, a percent from 1 to 100; `0` for none. The form asks "What score are you committing to?" and may be left empty. The agent writes it into the quiz as `pass_mark`, and the results card shows it as the goal | `0` | yes |
| `--language` | `en`, `vi`: the quiz's language, written as `lang` and copied into the quiz's front matter | `en` | no |
| `--request` | free text for the agent | empty | no |
| `--profile` | a built-in or configured profile | from purpose: `exam-prep` gives `exam`, `survey` gives `survey`, others `default` | no |

| Other option | Meaning |
|---|---|
| `--web` | Ask in a form in the browser, served once on 127.0.0.1. Waits `1800` seconds by default, as for `serve` |
| `--tui` | Ask in the terminal, for SSH sessions and machines without a browser. It shows the same detail as the web form: every question's label and help, a hint beside each choice, the follow-up text box when *other* is picked, and the sections as steps with progress (*Quiz 1/2*). Human-only questions (purpose, scope) start with nothing selected and cannot be skipped. A summary screen lists every answer, marks which are defaults, and lets you go back to any question before anything is written. Ctrl+C writes nothing. It needs an interactive terminal: without one it exits 2 and suggests `--web` or flags |
| `--accept-defaults` | Also fill human-only values that have a default, recorded as `decided_by: agent`. Only when the user has handed those choices over |
| `--json` | `{"status", "brief", "defaults_applied", "warnings"}`, or `{"status": "needs_input", "missing": [...], "how"}` |

Exit: `0` written, `2` usage error, timeout, form cancelled, or `--tui` without a terminal; `3` purpose or scope missing and no form asked for (nothing written).

**The file.** `brief.yaml` holds every key below, always. `quiz brief` fills the defaults when it writes, so a reader never fills any: `check` treats a missing key like an unknown one, as `brief.invalid` (a warning), and then does not hold the quiz against the brief.

| Key | From | Value |
|---|---|---|
| `purpose`, `scope` | `--purpose`, `--scope` | as the options |
| `content` | `--kinds`, `--kinds-other`, `--elsewhere` | a mapping with exactly `kinds` (a list), `kinds_other` and `elsewhere` (text, empty when not given) |
| `count`, `minutes`, `mix`, `difficulty`, `mode`, `language`, `request` | the option of the same name | as the options; `mix` is a list |
| `weak_topics` | `--weak-topics` | `true` or `false` |
| `commitment` | `--commitment` | a number, `0` for none |
| `focus_tags` | earlier results, when `weak_topics` is true | a list of tags, empty otherwise |
| `profile` | `--profile` | the profile name, resolved from the purpose when not given |
| `decided_by` | | for each key above, who chose it: `user`, `default` or `agent` |

### quiz grade

**changed**: `grades-v2` with rubric modes and a grader, and `--web`.

```text
quiz grade RESULTS... --quiz FILE [-o OUT] [--grades GRADES] [--json] [--plain]
quiz grade RESULTS --quiz FILE --web [--grades GRADES] [--name NAME] [--open]
                   [--timeout SECONDS] [--port N] [--json]
```

Re-grades an attempt with the shared grader and writes a report: score, per-section and per-tag results, every wrong answer with its explanation, and the essays and code laid out for a grader (each question's text, the answer, word count, rubric with criterion ids and maximums, and the sample answer). The rubric modes and the grades format are in [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 6.

| Argument or option | Meaning |
|---|---|
| `RESULTS...` | Results files. Several: see [Several files](#several-files). Each gets a report and, with `--json`, a grades template. `--grades`, `--web` and `--name` take one results file |
| `--quiz FILE` | Required. The quiz source, for the answer key and rubrics. Must match the results' `quizHash` (exit 1 otherwise) |
| `-o`, `--output OUT` | Default: `RESULTS` with `-report.md` (or `-report.json`). With several files, a folder |
| `--grades GRADES` | Validate a filled-in grades file, compute totals and bands from its components, and fold it into the report. Questions left entirely empty stay pending. Only an explicit `--grades` is read: unlike `replay`, `grade` never picks up `<RESULTS>-grades.json` by itself, since that is also the name of the empty template |
| `--json` | Write `*-report.json` instead of Markdown, plus a `*-grades.json` template holding each rubric's structure with empty cells. An existing `*-grades.json` is never overwritten: the template is skipped with a warning that says to delete the file for a fresh one |
| `--web` | Grade by hand in a form: the answer next to the rubric, inputs limited to valid steps or bands, a running total. With `--grades`, that file's grades are pre-filled to accept or adjust. Writes a new grades file with `kind: human` (and `reviewed` naming the earlier grader), then the report. Waits `1800` seconds by default, as for `serve` |
| `--name NAME` | With `--web`: the human grader's name. Without it, the form asks |

Exit:

- `0`: written.
- `1`: hash mismatch, or invalid grades. Nothing is written. Every problem is listed, with one exception: a question whose fixed values (mode, points, maximums, weights, scale) differ from the template has its scores checked only once those match. Problems include a missing grader, a score off its step or above its maximum, an unknown criterion, a lost mark with no note, or a half-filled question.
- `2`: I/O error, timeout, or the form was cancelled.

### quiz replay

**new**. A page already submitted, from a results file, with no library.

```text
quiz replay RESULTS... --quiz FILE [--grades GRADES] [-o OUT] [--open | --no-open]
                    [--fonts quiz|all|none] [--built-at ISO] [--ui-lang en|vi] [--json]
```

Writes the quiz page **already submitted** with the learner's attempt: their answers, right and wrong, the explanations, the agent or human grades for essays and code, and **Retry missed** working. It is the same page the learner saw after pressing Submit, as the Attempt reducer rebuilds it ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 4).

| Argument or option | Meaning |
|---|---|
| `RESULTS...` | The `*-results-*.json` files the page exported. Several: see [Several files](#several-files), one page per attempt (a page holding many attempts is a bundle, which is not in v1) |
| `--quiz FILE` | The quiz `.md` the attempt was taken on. Parsed, but `check` is not run: the attempt already happened on this text |
| `--grades GRADES` | Show these grades for essays and code. Default: `<RESULTS without .json>-grades.json` beside the results file, if it exists (the name `grade --json` writes); otherwise they show as pending. A grades file is checked against the quiz as `quiz grade` does, so one for another version of the rubric exits 1. One results file only |
| `-o`, `--output OUT` | Output path. Default: `RESULTS` with `-replay.html`, so a replay never overwrites a page built from the source. With several files, a folder |
| `--open` / `--no-open` | Open the page after writing it. Default: open for one file; with several, nothing is opened |
| `--built-at`, `--ui-lang`, `--fonts` | As for `build` |
| `--json` | `{"status", "output", "bytes", "attempt", "graded"}` |

Exit: `0` written, `1` the attempt's `quizHash` does not match `FILE` (the output names the version it was taken on), `FILE` does not parse, or `GRADES` is invalid; `2` I/O or usage error.

### quiz stats

**changed**: scores per question and per tag, so partial attempts (section, missed) count correctly.

```text
quiz stats RESULTS... [--quiz FILE] [--json]
```

Progress across several attempts at one quiz: score by date, percent per tag, the weakest tags, the questions missed most often, and for graded essays and code the percent (or average band) per rubric criterion. For surveys, an "Answers over time" table.

| Argument or option | Meaning |
|---|---|
| `RESULTS...` | Two or more results files of the same quiz (any versions). Questions are matched across versions by id; a question without one is matched by its question hash, so it is counted per version and marked "no id" |
| `--quiz FILE` | The current source, to name questions and tags |
| `--json` | `{"attempts": [...], "tags": [...], "weakest": [...], "questions": [...]}` |

Exit: `0` done, `2` the files belong to different quizzes.

### quiz inspect

**same**.

```text
quiz inspect FILE [--review REVIEW] [--json]
```

Summarises a quiz: question types, points, sections, tags, banks and the spread of answer positions. With `--review`, counts of kept, to fix and to drop.

**Output** (owner, 2026-11-03). The quiz is checked first; whenever it parses, the summary is printed, then the issues as `check` prints them.

```text
rust-basics · Rust basics · version 9f3a
18 questions · 25 points · 3 sections · time limit 25m
Types      single 8 (10 points) · multi 3 (5) · code 2 (6) · essay 1 (4)
Sections   ownership 6 questions, 8 points · collections 6, 10, pick 4 · traits 6, 7
Tags       rust 18 · borrowing 5 · no tag 2
Positions  A 5 · B 6 · C 3 · D 2
```

Points count a bank's `pick`, not its pool: each question in a bank carries `pick` over the pool's size of its points, so types, tags and sections add up to the total (a share may show as a decimal). Question counts are the pool's. Untagged questions are the last row of Tags, "no tag" (`{"tag": null}` in JSON). The Positions row is left out when no question has a right answer (a survey); the JSON keeps the zeros. A quiz that does not parse prints only its issues, with `"quiz": null`. `errors` and `warnings` are the issue objects of `check --json`. **Positions** counts the correct choices of `single` and `multi` questions by letter, in source order, as `answers.position-skew` does. `--json`: `{"status": "done" | "failed", "quiz": {"id", "title", "hash", "short"}, "questions", "points", "timeLimit", "types": [{"type", "count", "points"}], "sections": [{"id", "title", "questions", "points", "pick", "time"}], "tags": [{"tag", "count", "points"}], "positions": {"A": 5, …}, "review", "errors", "warnings"}`; `review` is `{"keep", "fix", "drop", "notJudged"}` with `--review`, else null.

Exit: `0` done, `1` check errors, `2` I/O error.

### quiz new

**changed**: starts from a user template or an existing quiz as well as a built-in template. `templates` is now `quiz template list`.

```text
quiz new TEMPLATE [PATH] [--json]
quiz new --from FILE [--skeleton] [PATH] [--json]
```

Copies a template and its assets to `PATH` (default: the current folder). `PATH` is a folder, where the quiz is written as `quiz.md`, or a file ending in `.md`, written under that name (owner, 2026-11-03). Never overwrites: an existing file exits 2. **A new quiz gets its own identity** (owner, 2026-11-03): the copy drops every question's `id` and writes a fresh quiz `id` into the front matter, the target's name slugged: the folder's name when the file is `quiz.md` (`quiz new rust demo/` gives `id: demo`), else the file's name (`quiz new rust signals/week3.md` gives `id: week3`). `new` ends by saying to run `quiz ids FILE`. Otherwise two quizzes would share ids, and their histories would mix in a library. The built-in templates are built from `examples/` and `templates/blank/` into the package, so each has one source. A template folder is copied whole; `--from FILE` copies only the assets and `materials` sheets the quiz references, so unrelated files never travel. `--json`: `{"status": "written", "file", "template"}` (`template` is null with `--from`), or `{"status": "error", "message"}`.

| Option | Meaning |
|---|---|
| `TEMPLATE` | A built-in or user template (`quiz template list`) |
| `--from FILE` | Start from an existing quiz `.md` and its assets, in place of a named template |
| `--skeleton` | With `--from`: keep the structure and drop the content (below) |

**`--from` and `--skeleton`.** Without `--skeleton`, `--from` is a copy of the quiz and its assets. With it, the copy keeps every field [QUIZ_SYNTAX.md](QUIZ_SYNTAX.md) marks as structure and empties every field it marks as content (its section 9): front matter, section titles, instructions, times and picks, each question's type, points and tags, the shape of each answer, and rubrics are kept; prompts, choices' text, keys, hints, explanations, passages, sample answers and question ids are emptied. A skeleton fails `check` until it is filled in; that is intended. `quiz ids` then gives the new questions fresh ids, so no review or attempt history is carried over.

`--from` takes a file, since `new` is a core command and never touches a library. To start from a library quiz, run `quiz library share NAME --source` first and pass its folder's `.md` here, or store it as a template with `quiz library template add`.

Exit: `0` copied, `1` the `--from` file does not parse, `2` unknown template or target exists.

### quiz ids

**new**.

```text
quiz ids FILE... [--dry-run] [--json] [--plain]
```

Gives every question without an `id` a random one and writes it into the file ([QUIZ_SYNTAX.md](QUIZ_SYNTAX.md), ids). An id is `q-` and six characters from `a-z0-9`, unique within the file. It is added at the end of the heading's `{…}` block, or as a new block when there is none. Nothing else in the file changes, byte for byte, and an existing id is never changed, so running it again is safe. It does not run `check`.

- **Duplicates are reported, not fixed:** which copy keeps the id is the author's choice. Delete the id from the copy and run it again.
- A file with a duplicate id or a heading whose `{…}` block does not parse is left untouched, and the problems are listed.

| Option | Meaning |
|---|---|
| `--dry-run` | List the ids it would add, and write nothing. The status is `unchanged`, with `added` listing what a real run would add, and the JSON has `"dryRun": true` |
| `--json` | `{"status": "written" \| "unchanged" \| "problems", "file", "added": [{"line", "id"}], "problems": [{"rule", "line", "message"}]}` |

Exit: `0` written or nothing to add, `1` a duplicate id or a heading that does not parse (that file untouched), `2` I/O error.

### quiz template

**new**. Replaces `quiz templates` and keeps the templates you start quizzes from.

```text
quiz template list [--json]
quiz template add FILE [--as NAME] [--skeleton] [--replace] [--json]
quiz template rm NAME [--yes] [--json]
```

**User templates.** A `templates/` folder next to `config.toml` holds your own. Each is a folder with one quiz `.md` (the only `.md` at its top level) and its `assets/` and `materials/`, named by the folder, so `templates/signals-week/` is used as `quiz new signals-week`. `quiz template add` writes these folders; you can also make one by hand. No other location is searched, not even a project folder. Built-in templates: `calculus`, `rust`, `ielts`, `medical`, `exam`, `survey`, `blank`. **Built-in names are reserved**: a user template cannot take one, so a name means one template. Core commands need no library, so templates do not either.

**`template list`.** Every template with its source: `built-in`, or `user` and its path. A user folder whose name is, or later becomes, a built-in one (a release added that template after you made yours) is listed as `ignored`, with a note to rename the folder; `quiz new` uses the built-in one and says that it ignored a user template. A user folder that does not hold exactly one `.md` at its top level is listed as `invalid`, with the reason, and cannot be used (owner, 2026-11-03). `--json`: `[{"name", "source", "path", "ignored", "invalid"}]`, `invalid` the reason or null.

**`template add FILE`.** Stores a quiz and its assets as a user template. The name is `--as NAME`, else the file name slugged.

| Option | Meaning |
|---|---|
| `--as NAME` | Template name: a slug |
| `--skeleton` | Store the structure without the content, as for `new --from --skeleton` |
| `--replace` | Overwrite one of your templates of that name |

- **Checks.** A full quiz must pass `check` under its own profile, so a broken template does not hand its errors to every quiz started from it. A skeleton fails `check` by design, so it gets a structural check instead: the front matter parses, sections and questions are well formed, the profile exists, the assets are there. Either must hold at least one question.
- **Name collisions.** A name taken by a built-in template is refused (exit 1) and `--replace` does not change that. A name taken by one of your templates exits 1 and suggests a free name; `--replace` overwrites it. Adding content identical to what is stored under that name is `unchanged` (exit 0).

**`template rm NAME`.** Deletes a user template's folder, after asking unless `--yes`. One template per command. A built-in template is refused (exit 1). With `--json` and without `--yes` it exits 2, since `--json` never prompts.

**`--json`** (owner, 2026-11-03): `add` gives `{"status": "added" | "replaced" | "unchanged" | "failed" | "error", "name", "path"}`, with the issues on `failed`; `rm` gives `{"status": "removed" | "error", "name", "path"}`.

Exit: `0` listed, added, unchanged or removed, `1` check errors, name taken or a built-in refused, `2` unknown template or I/O error.

### quiz guide, quiz agent-guide

**changed**: styled output in a terminal.

```text
quiz guide [--lang en|vi] [--plain] [--no-pager]
quiz agent-guide [--plain] [--no-pager]
```

`guide` prints the authoring reference (the Markdown format), in English or, with `--lang vi`, Vietnamese. `agent-guide` prints the instructions for AI agents (`AGENTS.md`), in English only.

In a terminal, the Markdown is rendered: headings, lists, tables, wrapping to the terminal width, and code blocks highlighted with the same highlighter the pages use. Output taller than the screen goes through `$PAGER`, or `less` if found. When stdout is not a terminal (piped, redirected, or run by an agent), or with `--plain` or `NO_COLOR`, the output is the Markdown source byte for byte, so `quiz agent-guide > AGENTS.md` writes the real file.

| Option | Meaning |
|---|---|
| `--lang en\|vi` | `guide` only. Default: `en` |
| `--plain` | The Markdown source, even in a terminal |
| `--no-pager` | Styled, but printed straight to the terminal |

## Library commands

All under `quiz library`. A library is one folder under git that holds each quiz's versions (sources, `materials` sheets and assets, never HTML), results and reports. fullmark commits after every command that changes it and **never pushes**.

### quiz library init

**same**.

```text
quiz library init [PATH] [--force] [--no-git] [--json]
```

Makes `PATH` (default: here) this machine's library and records it in the config. A new, missing or empty folder is set up. An existing library is adopted. A folder with other files is refused.

| Option | Meaning |
|---|---|
| `--force` | Switch from another library already in the config |
| `--no-git` | Don't make a git repository. `rm` then needs `--force` |

Exit: `0` done, `2` folder refused or another library is set without `--force`.

### quiz library status

**changed**: also checks the library's config.

```text
quiz library status [--plain] [--json]
```

Diagnostics: config, library path, git (repository, uncommitted changes, remote), counts, snapshots whose content no longer matches their hash, orphan files, and a library `fullmark.toml` that does not parse or names unknown rules.

Exit: `0` healthy, `1` problems, `2` no library.

### quiz library register

**changed**: records the resolved rules with the version, and takes several files.

```text
quiz library register FILE... [-n NAME | --update NAME] [--profile P] [--config TOML]
                           [--strict] [--review REVIEW] [--json]
quiz library register --build-file BUILD [FILE...] [--json]
```

Checks the quiz, then copies its source, assets and brief into the library as a version, together with the resolved rules (`check.json`), and commits. Re-checking that version later uses the stored rules, even if the config changed. The original file can be deleted afterwards.

| Option | Meaning |
|---|---|
| `-n`, `--name NAME` | Name for a new quiz. Default: the slugged title |
| `--update NAME` | Add a version to this existing quiz. Warns when an attempt is in progress on the old version (an autosave from `take`); the attempt stays tied to the version it started on, and the exit is still `0` |
| `--build-file BUILD` | Register the files a build file lists (`quiz build`), so a folder of quizzes registers without a long command. Only `files`, `profile`, `config` and `strict` are read, top level and per entry; the delivery keys (`out`, `lang`, `print` and the rest) are for `build` and are ignored here. A file listed in several entries (a quiz built both as a page and as a printed paper) is registered once; entries that give it different `profile`, `config` or `strict` exit 2. `FILE`s given as well register only those of its entries |
| `--profile`, `--config`, `--strict`, `--review` | As for `check`. The config is looked up from `FILE`, then from the library root |
| `--json` | `{"status": "registered" \| "unchanged" \| "problems", "registered": [{"file", "name", "version"}], "unchanged": [{"file", "name", "version"}], "refused": [{"file", "reason", "suggest"}], "committed"}`. One file gives the same object as several, with one entry |

Exit: `0` registered or unchanged, `1` check errors, name taken (the output suggests a free name) or a survey refused, `3` no library.

**Surveys are refused.** A quiz whose kind is `survey` (following `extends`) is refused with the rule `library.survey`, and exits `1` like any other refusal. The library is one learner's history of their own attempts, and surveys are mostly sent to other people; `serve` and `stats` handle them without a library. `library import` applies the same refusal. Allowing surveys in a shared library later is additive: `take` works, `grade` exits 2 with no score, `--missed` refuses. There is no separate survey-library kind.

**One file** behaves as a batch of one: content that is already the current version is skipped as `unchanged` (exit `0`), and `--json` has the same shape as for several files.

**Several files**, for moving a folder of quizzes in at once. Globs and the batch rules are as in [Several files](#several-files), except that this is all or nothing.

- **All or nothing, like `import`.** Every file is checked and every name resolved first; if any file has check errors or a taken name (including two files in the batch slugging to the same name), nothing is registered, every problem is listed, and the exit is 1. Otherwise one commit holds them all.
- Each quiz gets its slugged title as its name. `-n` and `--update` name one quiz, so with several files they exit 2.
- A file whose content is already the current version of the quiz registered from it is skipped as `unchanged`, so re-running the same command after adding one quiz registers only the new one. A file registered before and since edited is refused with the `--update NAME` command to run.
- Progress on a terminal as for `build`: `[3/12] signals.md`.
- Updating several quizzes in one go (matching each file to the quiz registered from it) is left out until a need shows; `list` already flags changed sources.

### quiz library list

**changed**: adds a `public` column (a quiz with an entry on the shelf named `public`).

```text
quiz library list [--plain] [--json]
```

Every quiz with its versions, attempts, last score, whether it is public, and a note when its original source still exists and has changed.

With `--json`: `{"quizzes": [ROW, ...]}`, sorted by name with the fixed comparison (TECHNICAL_DESIGN.md, section 7, foundation 6). The row has every field below, always present, so a script or `jq` can filter on any of them. These names are fixed: filters on `list` may come later ([proposals/library-query.md](proposals/library-query.md)) and will be a function over these rows, so a field is never renamed and new ones are only added.

| Field | Type | Value |
|---|---|---|
| `name`, `id`, `title` | string | |
| `kind`, `lang`, `profile` | string | of the current version |
| `tags`, `types` | string[] | every question tag and question type in the current version, sorted |
| `shelves` | string[] | the names of the shelves the quiz has an entry on |
| `questions`, `points` | number | in the current version |
| `versions`, `attempts` | number | attempts across all versions |
| `score`, `best` | number \| null | percent of the last and best attempt; `null` if never taken |
| `weak` | string[] | the three weakest tags over all attempts, weakest first; empty if never taken |
| `added`, `updated` | string | ISO date of the first and current version |
| `taken` | string \| null | ISO date of the last attempt; `null` if never taken |
| `changed` | boolean | the original source still exists and differs from the current version |
| `ungraded` | boolean | an attempt has essays or code not yet graded |

Exit: `0`, `2` no library.

### quiz library info

**new**.

```text
quiz library info NAME [--version HASH] [--plain] [--json]
```

Everything about one quiz in one place, so you need not run `inspect`, `list` and `stats` and read the library folder. It reads only what those commands already compute, and writes nothing. `inspect` stays the command for a quiz file outside the library.

| Block | What it shows |
|---|---|
| Identity | name, id, title, kind, language, profile, `generated_by` |
| Source | the original file, and whether it still exists and has changed |
| Content | sections with question counts and points, question types, tags, banks |
| Versions | hash, date added, and questions added, removed or changed against the one before |
| Shelves | the quiz's shelf entries |
| Attempts | count, first and last date, last and best score, the three weakest tags, attempts with essays or code still ungraded |
| Path | the quiz's folder in the library |

| Option | Meaning |
|---|---|
| `--version HASH` | Show the content of this version. Default: the current one |
| `--json` | The quiz's `library list` row, with the same field names and meanings, plus `{"generated_by", "source": {"path", "exists"}, "sections": [{"slug", "title", "questions", "points"}], "banks", "history": [{"hash", "added", "added_questions", "removed_questions", "changed_questions"}], "first_taken", "path"}`. With `--version HASH`, the fields that describe content (`kind`, `lang`, `profile`, `tags`, `types`, `questions`, `points`, `sections`, `banks`) are that version's |

Exit: `0`, `2` unknown quiz or version, `3` no library.

### quiz library take

**changed**: adds `--section` and `--missed`.

```text
quiz library take NAME [--section S] [--missed] [--focus] [--no-open]
                       [--timeout SECONDS] [--port N] [--json]
```

Builds the current version with the installed fullmark, serves it, files the result next to that version and commits. Progress is autosaved, so closing the tab or the server resumes the attempt.

| Option | Meaning |
|---|---|
| `--section S` | Only this section |
| `--missed` | Only questions that are wrong or partly right in an earlier attempt and not answered fully right since, across all attempts and versions. Questions changed since they were missed are included and marked. Ungraded essays and code are skipped. With `--section`, the missed questions in that section |
| `--focus` | Tick **Focus mode** on the start screen, as for `serve` |
| `--timeout SECONDS` | Default `0` (no limit) |
| `--json` | `{"status", "results", "score", "plan": {"source", "questions"}}`, or `{"status": "nothing_missed"}` |

Exit: `0` filed, or nothing missed (with a message); `2` unknown quiz or section, or timeout.

### quiz library replay

**new**.

```text
quiz library replay NAME [--attempt STAMP] [-o DIR] [--no-open] [--json]
```

Opens a past attempt as a page that is already submitted, showing your answers, right and wrong, explanations, and **Retry missed** working. It finds the version the attempt was taken on, embeds the grades from the newest report for that attempt if there is one, builds into a temp folder (or `DIR`) and opens it. This is `quiz replay` with the lookup done for you. Writes nothing in the library.

| Option | Meaning |
|---|---|
| `--attempt STAMP` | Default: the newest attempt |
| `-o`, `--output DIR` | Write the page here instead of a temp folder |
| `--json` | `{"status", "page", "attempt", "version", "graded"}` |

Exit: `0` built, `2` unknown quiz or attempt.

### quiz library share

**same**.

```text
quiz library share NAME [-o DIR] [--version HASH] [--source]
```

Writes the clean offline page to share, or with `--source` the editable folder (the original file name, assets, brief, and a `fullmark.toml` with the custom profile the quiz uses, if any). Default `DIR`: here.

Exit: `0` written, `2` unknown quiz or version.

### quiz library template add

**new**.

```text
quiz library template add NAME [--as TEMPLATE] [--version HASH] [--skeleton] [--replace] [--json]
```

Stores a quiz from the library as a user template (`quiz template add`, for a library quiz): its source and assets at the current version, or at `--version HASH` as for `share`. The version is checked under the rules it was registered with (`check.json`), so a version that registered can be stored; the other options and the name rules are those of `quiz template add`. It reads the library and does not change it, so nothing is committed. This is the only `library template` command: templates live in your config folder, not in the library, so you list and remove them with `quiz template list` and `quiz template rm`.

Exit: `0` added or unchanged, `1` check errors or name taken, `2` unknown quiz, `3` no library.

### quiz library grade

**changed**: adds `--web`, and keeps every grades file.

```text
quiz library grade NAME [--attempt STAMP] [--grades FILE] [--json]
quiz library grade NAME --web [--attempt STAMP] [--name NAME] [--timeout SECONDS] [--port N] [--json]
```

Grades an attempt against the version it was taken on and writes the report into `quizzes/<id>/reports/` (never `results/`). With `--json`, also the grades template. `--web` opens the grading form as for `quiz grade`, pre-filled with the newest grades for that attempt. Every grades file is kept, and the newest counts. Commits.

Exit: `0` written, `1` invalid grades, `2` unknown quiz or attempt, timeout, or the form was cancelled.

### quiz library stats

**changed**: per question and per tag, as for `quiz stats`.

```text
quiz library stats NAME [--json]
```

Progress over every attempt at a quiz, across versions, using the grades each attempt was made with. Writes nothing.

Exit: `0`, `2` unknown quiz or no attempts.

### quiz library rename

**same**.

```text
quiz library rename OLD NEW [--json]
```

Changes a quiz's name. Its id and folder stay, and so do its shelf entries. Commits. One quiz per command: a batch rename is a pattern language for a rare job.

Exit: `0`, `1` name taken, `2` unknown quiz.

### quiz library rm

**same**.

```text
quiz library rm NAME [--yes] [--force] [--json]
```

**Deletes** a quiz with its versions and results, and commits, so `git -C LIBRARY revert HEAD` brings it back. Asks for confirmation unless `--yes`. Refused when the library is not its own git repository or the quiz folder has uncommitted changes (`--force` skips both). A quiz on the `public` shelf is removed from it at the next `publish`. One quiz per command, on purpose: a glob or a list makes a mass deletion one typo away, and each deletion is its own commit to revert.

Exit: `0` deleted, `1` refused, `2` unknown quiz.

### quiz library path

**same**.

```text
quiz library path [NAME]
```

Prints the library folder, or a quiz's folder.

### quiz library publish

**new**. Two forms: mark a quiz, or sync the shelf.

```text
quiz library publish NAME --on | --off [--json]
quiz library publish [DIR] [--with-brief | --no-brief] [--ui-lang en|vi] [--dry-run] [--json]
```

Keeps a separate folder (a public repository, GitHub Pages) holding the current Markdown, assets and built page of every quiz on the `public` shelf, plus an index page, a `fullmark-shelf.json` manifest and a `fullmark.toml` with the custom profiles those quizzes use (written only when there are any). Results, reports, progress and older versions are never copied. Briefs are copied only with `--with-brief`.

- **`NAME --on | --off`** adds or removes the quiz's entry on the shelf named `public` and commits in the library. It writes nothing to any shelf.
- **Shelf entries.** A quiz's record in `library.toml` holds `shelves = [{ shelf = "public", kind = "quiz" }]`; `version` is reserved (optional, unused in v1). The folder to publish into is kept per machine in `config.toml`, keyed by shelf name. v1 commands touch only the shelf named `public` and only `kind = "quiz"` entries. Entries they do not know (another shelf name, `kind = "bundle"`) are kept as they are, never rejected, and never published. The `shelf ...` commands and several shelves are a proposal ([proposals/shelves.md](proposals/shelves.md)).
- **The index page** lists every quiz on the shelf, whatever its language, each marked with its `lang` (`EN`, `VI`): one learner's courses can be taught in several languages, such as an English-taught programme at a Vietnamese university. Each quiz's page keeps its own `ui_lang`; `--ui-lang` sets only the index page's own chrome.
- **The sync** builds every quiz on the `public` shelf into memory first, with `built_at` pinned to the version's `added` time, so the same library state always gives the same bytes. If any build fails, nothing is written. It then writes only the files that changed, removes only paths listed in the old manifest, and leaves everything else (README, LICENSE, `.github/`) alone. If `DIR` is its own git repository, it commits only the paths it wrote or removed. It never pushes.

| Argument or option | Meaning |
|---|---|
| `DIR` | The shelf folder. Remembered in the config after the first successful sync |
| `--with-brief`, `--no-brief` | Copy briefs or not. Default: not. Remembered in the manifest |
| `--ui-lang en\|vi` | The index page's interface language. Default: `en`. Remembered in the manifest |
| `--dry-run` | Print what would be added, updated and removed, and write nothing |
| `--json` | `{"status": "published" \| "unchanged", "dir", "added", "updated", "removed", "committed", "warnings"}` |

Exit:

- `0`: published or unchanged.
- `1`: a build failed, or a quiz folder in `DIR` is not in the manifest (nothing written).
- `2`: `DIR` is inside the library or contains a `library.toml`, or the manifest is foreign or newer.
- `3`: no `DIR` given and none remembered.

### quiz library import

**new**.

```text
quiz library import DIR [--into PATH] [--json]
```

Registers the quizzes of a published folder into a library, keeping ids and names, so a shelf restores into a new library. The shelf's `fullmark.toml`, if any, supplies the custom profiles. All or nothing, as batch `library register` is: every quiz must pass `check` under its profile, and none may be a survey (`library.survey`, as for `register`), before anything is written. Commits once at the end.

- **With a manifest:** each listed quiz is registered under its id and name with an entry on the `public` shelf, with the manifest's `added` time. A quiz already in the library with the same hash is unchanged. A different hash adds a version, with a warning if the file was edited after publishing.
- **Without a manifest:** every `DIR/*/*.md` whose front matter parses is registered with a new id and its slugged title.
- The output ends by noting that a published folder holds no results, reports or older versions, so import is not a backup.

| Option | Meaning |
|---|---|
| `--into PATH` | Create a library at `PATH` first, with the rules of `library init`. The location is the user's choice, so agents pass it only when the user named it |
| `--json` | `{"status": "imported" \| "unchanged" \| "problems", "library", "imported", "unchanged", "refused": [{"name", "reason", "suggest"}], "warnings", "committed"}` |

Exit: `0` imported or unchanged, `1` a quiz refused or check errors (nothing imported), `2` `--into` folder refused, `3` no library and no `--into`.

## Removed or merged

| 0.x | 1.0 |
|---|---|
| `quiz watch FILE [--serve]` | `quiz build FILE --watch [--serve]` |
| `quiz templates` | `quiz template list` |
| `quiz review --tui` | Dropped. Reviewing a question needs it rendered (math, code, images), which a terminal does badly; `review` stays web-only |
| `quiz brief --tui` | Built for real (it only exited 2 in 0.x) |
| `quiz serve --once`, `quiz review --once` | Dropped. Both always exit after one submit, so the flag has nothing to switch |
| `quiz serve PAGE.html` | Dropped. `serve` takes only the quiz source, so shared pages carry no server code. To collect results from a built page, use its **Download results** button |
