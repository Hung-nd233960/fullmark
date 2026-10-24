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

### Common options

| Option | Meaning |
|---|---|
| `--json` | Print the outcome as one JSON object on stdout. Human text goes to stderr. With `--json`, a command never prompts. Commands that run the one-shot server (`serve`, `review`, `brief --web`, `grade --web`, `library take`) first print a `listening` line, so the outcome is the second line: see `serve` |
| `--plain` | Plain text with no colours, even in a terminal. `NO_COLOR` does the same |
| `--open` / `--no-open` | Open, or don't open, the page in the default browser |
| `--port N` | Port on 127.0.0.1 for the one-shot server. Default: a free port |
| `--timeout SECONDS` | How long a one-shot server waits for a submit. `0` waits forever |
| `-h`, `--help` | Help for the command |
| `--version` | Print `fullmark X.Y.Z` (top level only) |
| `--acknowledgements` | Print fullmark's MIT licence, then every third-party component shipped in the CLI or in its pages, with version, licence and the notice its licence requires (top level only). See [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 3, "Licences" |
| `--profile P` | The check profile, on every command that runs `check` (`check`, `build`, `serve`, `review`, `inspect`, `rules`, `library register`). Overrides the quiz's `profile:` |
| `--config TOML` | Use this config file instead of looking for the nearest `fullmark.toml`. Same commands as `--profile` |
| `--fonts quiz\|all\|none` | Which fonts the page embeds, on every command that writes a page (`build`, `serve`, `library take`, `library replay`, `library share`, `library publish`). `quiz`: the quiz's own font; `all`: every font, about 0.5 MB, so a learner can switch freely; `none`: no embedded font, the smallest page. Default: `fonts` in `config.toml`, else `quiz`. `publish` remembers its value in the shelf manifest. See [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 8 |

How the profile and the config are chosen is in [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 5. A malformed config file, or an unknown profile given with `--profile`, exits 2 with the config's `file:line`.

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
| `FULLMARK_LANG` | Tool language, `en` or `vi`, overriding `lang` in `config.toml`. Changes messages only, never rule ids, JSON keys or exit codes. The quiz page's language comes from the quiz's `lang:` instead ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 9) |

### Files

| File | Format | Written by |
|---|---|---|
| `quiz.md` plus `assets/` | fullmark Markdown (`quiz guide`) | the author or an agent |
| `quiz.html` | one self-contained offline page | `build`, `library share` |
| `*-results-*.json` | `results-v2` (serialised Attempt) | the page (**Export**), `serve`, `library take` |
| `*-report.md`, `*-report.json` | `report-v1` | `grade`, `library grade` |
| `*-grades.json` | `grades-v2`: the grader's identity, and per question the rubric mode with scores or bands per criterion and notes | template from `grade --json`, filled in by an agent or through `grade --web` |
| `review.json` | `review-v1`: keep, fix or drop per question | `review` |
| `brief.yaml` plus `content/` | brief | `brief` |
| build file (`build.toml`) | what `build --build-file` builds: files, and per entry the `build` options | the user |
| `fullmark.toml` | check config: default profile, custom profiles, rule levels and options, custom checks | the user (agents never edit it to make `check` pass) |
| `config.toml` | machine config: library path, publish folder, personal profiles, tool language (`lang`), default `fonts` | `library init`, `library publish`, the user |
| `check.json` | the resolved rules a library version was registered with | `library register` |
| `library.toml` | the library's index of quizzes | `library` commands |
| `fullmark-shelf.json` | shelf manifest | `library publish` |

## Core commands

Core commands work on files. They need no setup and no config, and never touch a library.

### quiz check

**changed**: every finding has a rule id, and there are profiles and config.

```text
quiz check FILE [--profile P] [--config TOML] [--strict] [--review REVIEW] [--json]
```

Validates a quiz under one profile. Reports every issue with a level, a rule id, `file:line` and a fix hint. If a `brief.yaml` sits next to the quiz, `check` also warns when the quiz does not match the brief (count, mix, mode). The first line of human output names the profile and the config files used, for example `profile exam (fullmark.toml:4)`.

| Argument or option | Meaning |
|---|---|
| `FILE` | The quiz `.md` |
| `--profile P` | Check under this profile. Default: the quiz's `profile:`, then the brief's, then `[check] profile`, then `default` |
| `--config TOML` | This config file instead of the nearest `fullmark.toml` |
| `--strict` | Warnings count as errors (sets `fail-on = "warning"` for this run) |
| `--review REVIEW` | Also fail until every question flagged *fix* or *drop* in this `review.json` has changed or gone |
| `--json` | `{"status", "profile", "config": [paths], "errors", "warnings", "issues": [{"rule", "level", "file", "line", "message", "fix"}], "ignored": [{"rule", "line", "because"}]}` |

Exit: `0` no errors, `1` errors (or warnings with `--strict` or `fail-on = "warning"`), or an unknown profile named in the quiz; `2` file not found, malformed config, or unknown `--profile`.

### quiz rules

**new**.

```text
quiz rules [RULE] [--profile P] [--for FILE] [--config TOML] [--json]
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
| `--json` | `{"profile", "chain", "config", "rules": [{"id", "kind", "level", "options", "origin", "description"}]}` |

Exit: `0`, `2` unknown rule or profile, or malformed config.

### quiz build

**changed**: absorbs `watch`, adds several files, `--build-file`, `--attempt`, `--grades`, `--built-at`, `--lang` and `--print`.

```text
quiz build FILE... [-o OUT] [--profile P] [--config TOML] [--strict] [--open]
                [--attempt RESULTS [--grades GRADES]]
                [--print [--answers none|key|inline] [--seed S]]
                [--built-at ISO] [--lang en|vi]
                [--watch [--serve] [--port N]]
                [--json]
quiz build --build-file BUILD [FILE...] [-o DIR] [--json]
```

Checks the quiz (under the profile, as `check` does), then writes one self-contained HTML page. Nothing is written if `check` finds errors. With several files, each is checked and built on its own, one page per quiz; a page holding several quizzes is a bundle, not in v1 ([proposals/multi-quiz-bundle.md](proposals/multi-quiz-bundle.md)).

| Argument or option | Meaning |
|---|---|
| `FILE...` | One or more quiz `.md` files. Globs (`signals/*.md`) are expanded by fullmark too, since PowerShell does not expand them. A folder is refused, so a `README.md` is never built by accident |
| `-o`, `--output OUT` | Output path. Default: `FILE` with `.html`. With several files, `OUT` is a folder (created if missing) and each page keeps its source's name; a file path exits 2 |
| `--build-file BUILD` | Build what a build file lists (below). `FILE`s given as well build only those of its entries |
| `--strict` | Fail on warnings and write nothing |
| `--open` | Open the page after building |
| `--attempt RESULTS` | Build the page **already submitted** with this attempt: its answers, right and wrong, explanations, and **Retry missed** working. Exit 1 if the attempt's `quizHash` does not match `FILE`, naming the version the attempt was taken on |
| `--grades GRADES` | With `--attempt`: show these agent grades for essays and code. Without it they show as pending |
| `--print` | Write a static printable paper instead of the interactive page (TECHNICAL_DESIGN.md, section 8). Default output: `FILE` with `-print.html`. Print it, or save it as PDF from the browser |
| `--answers` | With `--print`: `none` (default, an exam paper), `key` (an answer key on a new page after the paper) or `inline` (answers and explanations under each question) |
| `--seed S` | With `--print`: shuffle questions and options reproducibly, so different seeds give different versions of the same exam, each with a matching key |
| `--built-at ISO` | Pin the build time, so a build is byte-identical across runs. Default: now |
| `--lang en\|vi` | Language of the page chrome for this build, overriding the quiz's `lang:`. The questions themselves are not translated |
| `--watch` | Rebuild whenever `FILE` or its `assets/` change. Keeps the last good page when a save has errors. Runs until Ctrl+C |
| `--serve` | With `--watch`: serve on 127.0.0.1 and reload the browser after each rebuild. Only the served copy gets the reload code |
| `--json` | `{"status", "output", "bytes", "warnings"}`. With `--watch`, one JSON line per rebuild. With several files, one such line per file (with `"file"`), then `{"status": "done", "built", "failed"}` |

Exit: `0` built, `1` check errors, `2` I/O error. With several files: every file is still checked and built, and the exit is the worst one.

**Several files.**

- Built one after another, in the order given (globs sorted). Parallel builds wait for a measured need.
- `--attempt`, `--grades` and `--serve` take one file; with several they exit 2. `--watch` watches them all. `--open` opens nothing and says so. `--strict` applies to each file.
- **Progress:** on a terminal, stderr shows one updating line, `[3/12] signals.md`, then each failure in full and a summary (`10 built, 2 failed`). Nothing is shown with `--json`, `--plain` or when stderr is not a terminal. No progress-bar dependency: a build takes milliseconds.

**Build file.** A TOML file listing what to build and how, so a set of pages (a course folder, a printed exam with its key) rebuilds with one command. It is named on the command line; fullmark never looks for one. Paths are relative to the build file.

```toml
# build.toml
out = "site"                          # default folder for every entry
built-at = "2026-10-24T09:00:00+07:00" # pins the build time: byte-identical rebuilds
lang = "vi"

[[build]]
files = ["signals/*.md", "systems/intro.md"]

[[build]]
files = ["exam/final.md"]
print = true
answers = "key"
seed = 7
lang = "en"                           # overrides the top level
```

- **Keys are `build` flag names**, top level as defaults, each `[[build]]` entry overriding them: `out`, `profile`, `config`, `strict`, `fonts`, `lang`, `built-at`, `print`, `answers`, `seed`. `files` is required in each entry. A flag on the command line beats both.
- **Not allowed:** `attempt`, `grades`, `watch`, `serve`, `open`, `port`: they are about one run, not about what to build. These and unknown keys exit 2 with `file:line`, as a malformed config does.
- **`library register --build-file`** reads the same file and registers its `files`.
- **`bundle`** is reserved: in v1 it exits 2 with "bundles are not in v1". When bundles come, `bundle = "course.html"` on an entry builds its files as one page.
- `--watch` with a build file also watches the build file.

### quiz serve

**changed**: adds `--section`.

```text
quiz serve FILE [--out RESULTS] [--once] [--timeout SECONDS] [--open]
                [--focus] [--section S] [--autosave PROGRESS] [--port N] [--json]
```

Serves the page on 127.0.0.1. When the learner presses **Submit** (or **Finish** in a survey), the page sends the results back, the server writes them and exits. For questionnaires and quizzes that a tool or an agent is waiting on.

| Argument or option | Meaning |
|---|---|
| `FILE` | The quiz `.md`, or a page built from it |
| `--out RESULTS` | Results file. Default: `<quiz-id>-results-<time>.json` next to the source |
| `--once` | Exit after the first accepted submit. Default when stdout is not a terminal |
| `--timeout SECONDS` | Default `1800`. `0` waits forever. Exits 2 on timeout |
| `--open` | Open the page in the browser |
| `--focus` | Start with Focus mode on (fullscreen with a clock) |
| `--section S` | Serve only this section. Results record `plan.source: "section"` |
| `--autosave PROGRESS` | Keep the attempt in progress in this file, so it resumes after the server or the browser closes. Deleted on submit |
| `--json` | Two JSON lines. As soon as the server is up: `{"status": "listening", "url", "port", "pid"}`. At the end: `{"status": "submitted" \| "timeout", "results", "score"}`. A caller running `serve` in the background reads the URL from the first line |

Exit: `0` submitted, `1` check errors in `FILE`, `2` timeout or usage error.

### quiz review

**same**.

```text
quiz review FILE [--out REVIEW] [--since REVIEW] [--once] [--open]
                 [--timeout SECONDS] [--port N] [--json]
```

A form where the learner judges every question: keep, fix or drop, with a reason (such as "the answer key is wrong"; for essays and code also "rubric too loose", "points misallocated" or "criterion unclear"). Rubrics are shown with their points. **Finish** writes `review.json`. Then `quiz check FILE --review review.json` fails until the flagged questions are fixed.

| Argument or option | Meaning |
|---|---|
| `FILE` | The quiz `.md` |
| `--out REVIEW` | Default: `review.json` next to the quiz. An existing file is merged into |
| `--since REVIEW` | Ask only about questions that are new or changed since this review, and merge into it |
| `--once`, `--timeout`, `--open`, `--port` | As for `serve` |
| `--json` | `{"status", "review", "keep", "fix", "drop"}` |

Exit: `0` written, `2` timeout or usage error.

### quiz brief

**changed**: `--tui` is a real terminal form, and both forms check that answers are detailed enough.

```text
quiz brief DIR [--web [--no-open] [--timeout SECONDS] [--port N] | --tui]
               [--purpose P] [--scope TEXT] [--kinds LIST] [--kinds-other TEXT]
               [--elsewhere TEXT] [--count N] [--minutes N] [--mix LIST]
               [--difficulty D] [--mode M] [--weak-topics yes|no]
               [--language en|vi] [--request TEXT] [--profile P]
               [--accept-defaults] [--json]
```

Writes `DIR/brief.yaml` and an empty `DIR/content/` for a quiz an agent will write. One question file drives the flags, the `--web` form and the `--tui` form, so all three ask the same questions in the same words.

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
| `--language` | `en`, `vi`: the quiz's language, written as `lang` and copied into the quiz's front matter | `en` | no |
| `--request` | free text for the agent | empty | no |
| `--profile` | a built-in or configured profile | from purpose: `exam-prep` gives `exam`, `survey` gives `survey`, others `default` | no |

| Other option | Meaning |
|---|---|
| `--web` | Ask in a form in the browser, served once on 127.0.0.1 |
| `--tui` | Ask in the terminal, for SSH sessions and machines without a browser. It shows the same detail as the web form: every question's label and help, a hint beside each choice, the follow-up text box when *other* is picked, and the sections as steps with progress (*Quiz 1/2*). Human-only questions (purpose, scope) start with nothing selected and cannot be skipped. A summary screen lists every answer, marks which are defaults, and lets you go back to any question before anything is written. Ctrl+C writes nothing. It needs an interactive terminal: without one it exits 2 and suggests `--web` or flags |
| `--accept-defaults` | Also fill human-only values that have a default, recorded as `decided_by: agent`. Only when the user has handed those choices over |
| `--json` | `{"status", "brief", "defaults_applied", "warnings"}`, or `{"status": "needs_input", "missing": [...], "how"}` |

Exit: `0` written, `2` usage error, timeout, form cancelled, or `--tui` without a terminal; `3` purpose or scope missing and no form asked for (nothing written).

### quiz grade

**changed**: `grades-v2` with rubric modes and a grader, and `--web`.

```text
quiz grade RESULTS [--quiz FILE] [-o OUT] [--grades GRADES] [--json]
quiz grade RESULTS --quiz FILE --web [--grades GRADES] [--name NAME] [--open]
                   [--timeout SECONDS] [--port N] [--json]
```

Re-grades an attempt with the shared grader and writes a report: score, per-section and per-tag results, every wrong answer with its explanation, and the essays and code laid out for a grader (each question's text, the answer, word count, rubric with criterion ids and maximums, and the sample answer). The rubric modes and the grades format are in [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 6.

| Argument or option | Meaning |
|---|---|
| `RESULTS` | A results file |
| `--quiz FILE` | The quiz source. Needed for the answer key and rubrics. Must match the results' `quizHash` (exit 1 otherwise) |
| `-o`, `--output OUT` | Default: `RESULTS` with `-report.md` (or `-report.json`) |
| `--grades GRADES` | Validate a filled-in grades file, compute totals and bands from its components, and fold it into the report. Questions left entirely empty stay pending |
| `--json` | Write `*-report.json` instead of Markdown, plus a `*-grades.json` template holding each rubric's structure with empty cells |
| `--web` | Grade by hand in a form: the answer next to the rubric, inputs limited to valid steps or bands, a running total. With `--grades`, that file's grades are pre-filled to accept or adjust. Writes a new grades file with `kind: human` (and `reviewed` naming the earlier grader), then the report |
| `--name NAME` | With `--web`: the human grader's name. Without it, the form asks |

Exit:

- `0`: written.
- `1`: hash mismatch, or invalid grades. Every problem is listed and nothing is written. Problems include a missing grader, a score off its step or above its maximum, an unknown criterion, a lost mark with no note, or a half-filled question.
- `2`: I/O error, timeout, or the form was cancelled.

### quiz stats

**changed**: scores per question and per tag, so partial attempts (section, missed) count correctly.

```text
quiz stats RESULTS... [--quiz FILE] [--json]
```

Progress across several attempts at one quiz: score by date, percent per tag, the weakest tags, the questions missed most often, and for graded essays and code the percent (or average band) per rubric criterion. For surveys, an "Answers over time" table.

| Argument or option | Meaning |
|---|---|
| `RESULTS...` | Two or more results files of the same quiz (any versions) |
| `--quiz FILE` | The current source, to name questions and tags |
| `--json` | `{"attempts": [...], "tags": [...], "weakest": [...], "questions": [...]}` |

Exit: `0` done, `2` the files belong to different quizzes.

### quiz inspect

**same**.

```text
quiz inspect FILE [--review REVIEW] [--json]
```

Summarises a quiz: question types, points, sections, tags, banks and the spread of answer positions. With `--review`, counts of kept, to fix and to drop.

Exit: `0` done, `1` check errors, `2` I/O error.

### quiz new

**changed**: starts from a user template or an existing quiz as well as a built-in template. `templates` is now `quiz template list`.

```text
quiz new TEMPLATE [PATH]
quiz new --from FILE [--skeleton] [PATH]
```

Copies a template and its assets to `PATH` (default: the current folder). Never overwrites: an existing file exits 2.

| Option | Meaning |
|---|---|
| `TEMPLATE` | A built-in or user template (`quiz template list`) |
| `--from FILE` | Start from an existing quiz `.md` and its assets, in place of a named template |
| `--skeleton` | With `--from`: keep the structure and drop the content (below) |

**`--from` and `--skeleton`.** Without `--skeleton`, `--from` is a copy of the quiz and its assets. With it, the copy keeps:

- the front matter (profile, look, time limit, language and so on);
- each section's title, intro and suggested time;
- for each question: its type, points and tags.

It drops each question's text, choices, answer key and explanation, and the question ids, so the new quiz gets fresh ones and no review or attempt history is carried over. A skeleton fails `check` until it is filled in; that is intended.

`--from` takes a file, since `new` is a core command and never touches a library. To start from a library quiz, run `quiz library share NAME --source` first and pass its folder's `.md` here, or store it as a template with `quiz library template add`.

Exit: `0` copied, `1` the `--from` file does not parse, `2` unknown template or target exists.

### quiz template

**new**. Replaces `quiz templates` and keeps the templates you start quizzes from.

```text
quiz template list [--json]
quiz template add FILE [--as NAME] [--skeleton] [--replace] [--json]
quiz template rm NAME [--yes] [--json]
```

**User templates.** A `templates/` folder next to `config.toml` holds your own. Each is a folder with one quiz `.md` (the only `.md` in it) and its `assets/`, named by the folder, so `templates/signals-week/` is used as `quiz new signals-week`. `quiz template add` writes these folders; you can also make one by hand. No other location is searched, not even a project folder. Built-in templates: `calculus`, `rust`, `ielts`, `medical`, `exam`, `survey`, `blank`. **Built-in names are reserved**: a user template cannot take one, so a name means one template. Core commands need no library, so templates do not either.

**`template list`.** Every template with its source: `built-in`, or `user` and its path. A user folder whose name is, or later becomes, a built-in one (a release added that template after you made yours) is listed as `ignored`, with a note to rename the folder; `quiz new` uses the built-in one and says that it ignored a user template. `--json`: `[{"name", "source", "path", "ignored"}]`.

**`template add FILE`.** Stores a quiz and its assets as a user template. The name is `--as NAME`, else the file name slugged.

| Option | Meaning |
|---|---|
| `--as NAME` | Template name: a slug |
| `--skeleton` | Store the structure without the content, as for `new --from --skeleton` |
| `--replace` | Overwrite one of your templates of that name |

- **Checks.** A full quiz must pass `check` under its own profile, so a broken template does not hand its errors to every quiz started from it. A skeleton fails `check` by design, so it gets a structural check instead: the front matter parses, sections and questions are well formed, the profile exists, the assets are there. Either must hold at least one question.
- **Name collisions.** A name taken by a built-in template is refused (exit 1) and `--replace` does not change that. A name taken by one of your templates exits 1 and suggests a free name; `--replace` overwrites it. Adding content identical to what is stored under that name is `unchanged` (exit 0).

**`template rm NAME`.** Deletes a user template's folder, after asking unless `--yes`. One template per command. A built-in template is refused (exit 1).

Exit: `0` listed, added, unchanged or removed, `1` check errors, name taken or a built-in refused, `2` unknown template or I/O error.

### quiz guide, quiz agent-guide

**changed**: styled output in a terminal.

```text
quiz guide [--plain] [--no-pager]
quiz agent-guide [--plain] [--no-pager]
```

`guide` prints the authoring reference (the Markdown format) in the tool language. `agent-guide` prints the instructions for AI agents (`AGENTS.md`), in English only.

In a terminal, the Markdown is rendered: headings, lists, tables, wrapping to the terminal width, and code blocks highlighted with the same highlighter the pages use. Output taller than the screen goes through `$PAGER`, or `less` if found. When stdout is not a terminal (piped, redirected, or run by an agent), or with `--plain` or `NO_COLOR`, the output is the Markdown source byte for byte, so `quiz agent-guide > AGENTS.md` writes the real file.

| Option | Meaning |
|---|---|
| `--plain` | The Markdown source, even in a terminal |
| `--no-pager` | Styled, but printed straight to the terminal |

## Library commands

All under `quiz library`. A library is one folder under git that holds each quiz's versions (sources and assets, never HTML), results and reports. fullmark commits after every command that changes it and **never pushes**.

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
| `--update NAME` | Add a version to this existing quiz |
| `--build-file BUILD` | Register the files a build file lists (`quiz build`), so a folder of quizzes registers without a long command. Only `files`, `profile`, `config` and `strict` are read, top level and per entry; the delivery keys (`out`, `lang`, `print` and the rest) are for `build` and are ignored here. A file listed in several entries (a quiz built both as a page and as a printed paper) is registered once; entries that give it different `profile`, `config` or `strict` exit 2. `FILE`s given as well register only those of its entries |
| `--profile`, `--config`, `--strict`, `--review` | As for `check`. The config is looked up from `FILE`, then from the library root |
| `--json` | One file: `{"status": "registered", "name", "version"}`. Several: `{"status": "registered" \| "problems", "registered": [{"file", "name", "version"}], "unchanged", "refused": [{"file", "reason", "suggest"}], "committed"}` |

Exit: `0` registered, `1` check errors or name taken (the output suggests a free name), `3` no library.

**Several files**, for moving a folder of quizzes in at once. Globs are expanded as for `build`.

- **All or nothing, like `import`.** Every file is checked and every name resolved first; if any file has check errors or a taken name (including two files in the batch slugging to the same name), nothing is registered, every problem is listed, and the exit is 1. Otherwise one commit holds them all.
- Each quiz gets its slugged title as its name. `-n` and `--update` name one quiz, so with several files they exit 2.
- A file whose content is already the current version of the quiz registered from it is skipped as `unchanged`, so re-running the same command after adding one quiz registers only the new one. A file registered before and since edited is refused with the `--update NAME` command to run.
- Progress on a terminal as for `build`: `[3/12] signals.md`.
- Updating several quizzes in one go (matching each file to the quiz registered from it) is left out until a need shows; `list` already flags changed sources.

### quiz library list

**changed**: adds a `public` column.

```text
quiz library list [--plain] [--json]
```

Every quiz with its versions, attempts, last score, whether it is public, and a note when its original source still exists and has changed.

Exit: `0`, `2` no library.

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
| `--focus` | Start with Focus mode on |
| `--timeout SECONDS` | Default `0` (no limit) |
| `--json` | `{"status", "results", "score", "plan": {"source", "questions"}}`, or `{"status": "nothing_missed"}` |

Exit: `0` filed, or nothing missed (with a message); `2` unknown quiz or section, or timeout.

### quiz library replay

**new**.

```text
quiz library replay NAME [--attempt STAMP] [-o DIR] [--no-open] [--json]
```

Opens a past attempt as a page that is already submitted, showing your answers, right and wrong, explanations, and **Retry missed** working. It finds the version the attempt was taken on, embeds the grades from the newest report for that attempt if there is one, builds into a temp folder (or `DIR`) and opens it. This is `quiz build --attempt` with the lookup done for you. Writes nothing in the library.

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

Changes a quiz's name. Its id and folder stay, and it stays public if it was. Commits. One quiz per command: a batch rename is a pattern language for a rare job.

Exit: `0`, `1` name taken, `2` unknown quiz.

### quiz library rm

**same**.

```text
quiz library rm NAME [--yes] [--force] [--json]
```

**Deletes** a quiz with its versions and results, and commits, so `git -C LIBRARY revert HEAD` brings it back. Asks for confirmation unless `--yes`. Refused when the library is not its own git repository or the quiz folder has uncommitted changes (`--force` skips both). A public quiz is removed from the shelf at the next `publish`. One quiz per command, on purpose: a glob or a list makes a mass deletion one typo away, and each deletion is its own commit to revert.

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
quiz library publish [DIR] [--with-brief | --no-brief] [--dry-run] [--json]
```

Keeps a separate folder (a public repository, GitHub Pages) holding the current Markdown, assets and built page of every public quiz, plus an index page, a `fullmark-shelf.json` manifest and a `fullmark.toml` with the custom profiles those quizzes use (written only when there are any). Results, reports, progress and older versions are never copied. Briefs are copied only with `--with-brief`.

- **`NAME --on | --off`** sets or clears the quiz's `public` flag and commits in the library. It writes nothing to any shelf.
- **The sync** builds every public quiz into memory first, with `built_at` pinned to the version's `added` time, so the same library state always gives the same bytes. If any build fails, nothing is written. It then writes only the files that changed, removes only paths listed in the old manifest, and leaves everything else (README, LICENSE, `.github/`) alone. If `DIR` is its own git repository, it commits only the paths it wrote or removed. It never pushes.

| Argument or option | Meaning |
|---|---|
| `DIR` | The shelf folder. Remembered in the config after the first successful sync |
| `--with-brief`, `--no-brief` | Copy briefs or not. Default: not. Remembered in the manifest |
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

Registers the quizzes of a published folder into a library, keeping ids and names, so a shelf restores into a new library. The shelf's `fullmark.toml`, if any, supplies the custom profiles. Every quiz must pass `check` under its profile before anything is written. Commits once at the end.

- **With a manifest:** each listed quiz is registered under its id and name as public, with the manifest's `added` time. A quiz already in the library with the same hash is unchanged. A different hash adds a version, with a warning if the file was edited after publishing.
- **Without a manifest:** every `DIR/*/*.md` whose front matter parses is registered with a new id and its slugged title.
- The output ends by noting that a published folder holds no results, reports or older versions, so import is not a backup.

| Option | Meaning |
|---|---|
| `--into PATH` | Create a library at `PATH` first, with the rules of `library init`. The location is the user's choice, so agents pass it only when the user named it |
| `--json` | `{"status": "imported" \| "unchanged" \| "problems", "library", "imported", "unchanged", "refused": [{"name", "reason", "suggest"}], "warnings", "committed"}` |

Exit: `0` imported or unchanged, `1` a quiz refused (the others still import) or check errors, `2` `--into` folder refused, `3` no library and no `--into`.

## Removed or merged

| 0.x | 1.0 |
|---|---|
| `quiz watch FILE [--serve]` | `quiz build FILE --watch [--serve]` |
| `quiz templates` | `quiz template list` |
| `quiz review --tui` | Dropped. Reviewing a question needs it rendered (math, code, images), which a terminal does badly; `review` stays web-only |
| `quiz brief --tui` | Built for real (it only exited 2 in 0.x) |
