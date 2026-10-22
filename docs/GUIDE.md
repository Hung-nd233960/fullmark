---
title: "fullmark user guide"
subtitle: "Write a quiz in Markdown, take it in the browser, get it graded"
---

## 1. What fullmark is

fullmark turns **one Markdown file** into **one HTML file** that is a complete quiz. You open the HTML by double-click. It needs no server and no internet, works on a phone, grades itself, and can export your answers as a JSON file so an AI can review them.

The usual loop:

1. An AI (or you) writes the quiz as Markdown.
2. `quiz check` finds mistakes, with line numbers.
3. `quiz build` makes the HTML.
4. The learner answers, submits, and exports `results.json`.
5. `quiz grade` turns that file into a Markdown report; an AI grades essays and code from it.

The page uses a muted pastel palette: soft paper in light mode and soft slate in dark mode. Set `theme: light` or `theme: dark` in the front matter to lock it.

## 2. Install

```powershell
uv tool install --editable <path to this repo>
quiz --help
```

Open a new terminal after installing. After pulling a version that adds a dependency (0.9.0 adds `tomli-w` and `rich`), run `uv tool install --editable <path to this repo> --reinstall`, or the installed `quiz` fails with `ModuleNotFoundError`. For development, run `uv sync` inside the project and use `uv run quiz ...` and `uv run pytest`.

## 3. Quick start

```powershell
mkdir $HOME\quiz-try; cd $HOME\quiz-try
quiz new calculus
quiz check calculus-1.md
quiz build calculus-1.md --open
```

`quiz new` copies a template and its images, plus a `.markdownlint.json` that turns off the three Markdown lint rules the quiz syntax trips (MD013 line length, MD025 several `#` sections, MD028 a hint callout directly followed by an explanation); an existing config is kept. `quiz brief` writes the same file. Do not use HTML comments in a quiz: they show as text. `quiz check` should print `0 error(s), 0 warning(s)`. `quiz build --open` writes `calculus-1.html` and opens it in your browser.

The templates:

| Template | Shows |
|---|---|
| `calculus` | LaTeX math, numeric and labeled-field answers, blanks, a graph, instant feedback |
| `rust` | Highlighted code, blanks inside code, a code answer, shuffled choices |
| `ielts` | A 60-minute timer, two essays, auto-submit, a band-score report |
| `medical` | Anatomy and physiology: an ordered pathway, matching, calculations with units, labeled fields, an essay with a rubric |
| `exam` | A closed-book exam: 20-minute auto-submit, no feedback until the end, shuffling, a question bank, a pass mark |
| `survey` | A questionnaire: no score, choices, scales, a ranking and free text; read it with `quiz grade` |
| `blank` | A short skeleton with one example of every question type |

## 4. Writing a quiz

A quiz file has three layers:

- **Front matter** (YAML between `---` lines): the title and settings.
- **Sections**: optional `#` headings.
- **Questions**: `##` headings. The heading text is the question.

````markdown
---
title: "Capitals: Europe"
time_limit: 10m
feedback: instant
---

# Easy ones

## What is the capital of France? {tags=geography}

- [ ] Lyon
- [x] Paris
- [ ] Nice

> [!hint]
> It has a famous tower.

> [!explanation]
> Paris has been the capital since 987.
````

Put a colon inside a YAML value in quotes, as in the title above.

### Question types

| Type | How to write it |
|---|---|
| `single` | A task list with exactly one `[x]` (type is inferred) |
| `multi` | A task list with two or more `[x]` (inferred), or `{type=multi}` |
| `truefalse` | `{type=truefalse}` and an `answer` block with `value: true` |
| `numeric` | `{type=numeric}` and an `answer` block with `value`, `tolerance` |
| `short` | `{type=short}` and an `answer` block with `accept` and optional `patterns` |
| `blanks` | `{type=blanks}` and `[[answer\|variant]]` written inline in the text |
| `fields` | `{type=fields}` and an `answer` block listing labeled boxes |
| `ordering` | `{type=ordering}` and a list written in the correct order; the page shuffles it |
| `matching` | `{type=matching}` and a list of `left :: right` bullets; `:: right` adds a distractor |
| `essay` | `{type=essay}`, an `answer` block with `min_words` and a `rubric`; optional `sample_answer`, shown after submit with `show_sample: true` |
| `code` | `{type=code}`, an `answer` block with `language`, `starter`, `rubric`; optional `reference`, shown after submit with `show_reference: true` |
| `scale` | `{type=scale}` and an optional `answer` block with `min`, `max`, `labels`; always ungraded |

An `answer` block is a fenced block whose info string is `answer`, containing YAML:

````markdown
## Evaluate $\int_0^1 x^2\,dx$. {type=numeric}

```answer
value: 0.3333
tolerance: 0.001
```
````

Numeric answers accept integers, decimals, `1e-3` and fractions such as `1/3`. Short answers ignore case and extra spaces unless you add `{case=sensitive}`.

### Follow-up text on a choice

End a choice with `{input}` or `{input="Prompt text"}` (default prompt "Please specify") to ask for a few words when it is picked, for example "Something else" followed by "What is it?". It works on `single` and `multi` questions in quizzes and surveys, graded or not.

````markdown
- [ ] A lab project
- [ ] Something else {input="What is it?"}
````

A labelled text field appears under the choice while it is selected and takes focus; unselect the choice and the field hides but keeps the text. The text is never graded. It is exported as `inputs` next to `choice` or `choices` (keys are the original choice numbers), and `quiz grade` shows `Something else: a hackathon`. `{input}` must end the line, the prompt is plain text in double quotes, and it is an error on any other question type.

### Math, code and media

- Math: `$inline$` and `$$display$$` (rendered with KaTeX, embedded only when used).
- Code: fenced blocks with a language are highlighted. Blanks `[[mut]]` also work inside them.
- Blanks: every blank in a question starts at the same width, set by the longest answer, and grows as the learner types.
- Images: `![alt text](assets/chart.png)`. Audio uses the same syntax with `.mp3`, `.ogg`, `.wav` or `.m4a`.

Everything is embedded in the HTML as data, so the file stays self-contained. Video and web URLs are not supported.

### Settings you will use most

| Key | Meaning |
|---|---|
| `mode` | `quiz` (default) or `survey` (every question ungraded, no score) |
| `time_limit` | `90s`, `45m`, `1h30m`; leave out for untimed |
| `on_timeout` | `submit` (default) or `warn` |
| `feedback` | `end` (default) or `instant` |
| `theme` | `auto` (default, with a toggle), or `light` / `dark` to lock it |
| `pick` | question bank: draw this many questions at random per attempt (see below) |
| `shuffle_choices` | shuffle the order of choices |
| `pass_mark` | percent of auto-graded points needed to pass |

Lock `theme: light` for an exam simulation whose real paper is printed (the IELTS template does); leave `auto` for practice drills.

The complete reference is one command away: `quiz guide`.

### Question banks

Write more questions than one attempt needs and let fullmark draw a random subset each time the learner presses Start. Two ways, which cannot be mixed:

```markdown
---
title: Calculus bank
pick: 10              # draw 10 of all questions
---
```

or per section, where sections without `pick` keep every question:

```markdown
# Limits {pick=3}
```

The draw is saved with the attempt, so reloading or resuming shows the same questions. Scores, the progress counter and the export cover the drawn questions only. The export records `attempt.bank` (`seed`, `pool`, `drawn`), and `quiz grade` checks the draw against the quiz settings and warns if it does not fit. `quiz check` rejects a `pick` larger than its pool.

### Questionnaires

Not every question has a right answer. Two front-matter and heading settings turn fullmark into a questionnaire tool:

- `graded=false` on a `##` heading makes that one question **ungraded**: it collects an answer, adds nothing to the score and shows no right or wrong. Use it for "how sure are you?" questions inside a real quiz.
- `mode: survey` makes every question ungraded. The page shows no score, the button reads **Finish**, and the results screen offers **Export answers**.
- `{type=scale}` is a rating row, always ungraded. Its `answer` block takes `min`, `max` (a span of 1 to 10) and optional `labels`.

Ungraded questions can be `single`, `multi` (write no `[x]`, and add `{type=multi}`), `short` (no `answer` block), `fields` (labels only), `essay` (no rubric), `ordering` (a ranking, shown in the written order) and `scale`. The other types need a right answer and are errors. `[x]`, `pass_mark`, `pick`, `feedback: instant` and `multi_scoring` are errors in a survey. Branching, answers from several people and required answers are not supported.

`quiz grade results.json --quiz quiz.md` turns the export into a report titled "Answers" for a survey, or adds an **Answers** section to a quiz report; `--json` gives each answer as `answer_text`. Start from `quiz new survey`. The details, with examples, are in `quiz guide`.

### Collect answers directly

When a tool or an agent is waiting for the answers, skip the download. `quiz serve quiz.md --open` builds the page in memory, serves it on `127.0.0.1` (a free port, this machine only) and opens it. After the usual confirm step, **Finish** or **Submit** also sends the results to the server, which checks them against `results-v1.schema.json` and the quiz id, writes `<quiz-id>-results-<timestamp>.json` next to the source (or `--out`; an existing file is never overwritten, `-2` is added instead) and prints the path. The page then says "Answers sent. You can close this tab." and **Export answers** stays available. If the send fails it says "Could not send; use Export answers" and nothing is lost.

- `--once` exits 0 after the first accepted submit. It is the default when stdout is not a terminal, so scripts and agents never hang. Without it in a terminal, the server keeps accepting attempts (one file each) until Ctrl+C.
- `--timeout SECONDS` (default 1800) exits 2 if nothing arrives; `0` waits for ever. `--port N` picks the port. `--autosave PROGRESS.json` keeps the attempt in progress (see below). `--json` prints `{"status": "submitted" | "timeout", "path": ...}` on exit.
- `--focus` turns on the start screen's Focus mode switch, so Start goes fullscreen with a clock. It works for `quiz library take` too.
- `--autosave PROGRESS.json` keeps the attempt in progress in that file, so it resumes after the server, the terminal or the browser closes, even in a new browser or on a new port (a served page is a new browser origin each run, so the browser's own copy would be lost). The page sends its state to the server as you answer; reloading or reopening shows **Resume**. The file is deleted when the answers are accepted or you press **Start over**. Progress saved for an edited quiz (a different version) is ignored and left alone, and so is a damaged file. The copy in the browser still works, and the newer of the two wins.
- The URL carries a random token, and the server rejects posts without it or from another origin. The file on disk and normal builds still never touch the network; only the copy served here is allowed to talk to its own server. `quiz serve` also accepts a built `.html` file.

### Review a quiz an agent wrote

The risk in an agent-written quiz is a wrong answer key, or a question that is not in your material. `quiz review quiz.md [--out review.json] [--since review.json] [--once] [--open] [--timeout 1800] [--json]` serves a review form: one card per question, showing the question as it is rendered, its answer key, explanation, points, tags and source line. The learner chooses **Keep**, **Fix** (what should change?) or **Drop** (why?), may tick problems (`key-wrong`, `not-in-material`, `unclear`, `too-easy`, `too-hard`, `duplicate`) and add a note. Cards with no verdict count as not reviewed. The page counts cards, not fields: the header reads `Reviewed N/M`, the question nav has one button per card, and a card is reviewed only when it has a verdict (problems and a note alone do not count). The flag checkbox is hidden. **Finish** writes `review.json` beside the quiz (never over an existing file: `review-2.json`; with `--out` or `--since` it is merged into that file). `--since review.json` asks only about questions that are new or changed since that review.

`quiz check quiz.md --review review.json` then fails (exit 1) while a flagged question is still wrong:

| Rule | Level | When |
|---|---|---|
| `review.drop` | error | a question marked drop is still in the quiz |
| `review.fix` | error | a question marked fix is unchanged (the message has the reviewer's text) |
| `review.key-wrong` | error | `key-wrong` is ticked and the question is unchanged, whatever the verdict |
| `review.changed` | info | a fix question changed; re-review it with `--since` |
| `review.unreviewed` | warning | no verdict, or the question changed after it was kept |

Questions match review items by id first, then by a hash of their source block, so a review survives reordering. Add `{id=...}` to the headings: without them a review finds a question again only by its text. `quiz inspect quiz.md --review review.json` shows the counts. Only `quiz review` writes `review.json`; never edit it by hand. A terminal form (`--tui`) is not built yet.

### Brief a quiz before an agent writes it

`quiz brief DIR [--purpose ...] [--scope ...] [--count N] [--minutes N] [--mix ...] [--difficulty ...] [--mode ...] [--weak-topics yes|no] [--language en|vi] [--kinds ...] [--elsewhere ...] [--request ...] [--web] [--accept-defaults] [--json]` writes `DIR/brief.yaml` and `DIR/content/` (with a README) for an agent to read. It does not write the quiz. Every flag is also a question in the form that `--web` serves (`--no-open` prints the address instead of opening the browser). `--tui` exits 2: the terminal form is not built yet.

- **Human-only values:** `purpose` (self-study, exam-prep, classmates, survey) and `scope` (which chapters, lectures or topics). When either is missing and no form was asked for, nothing is written and the exit code is 3; `--json` lists what is missing and the form command. `--accept-defaults` hands `purpose` over (default `self-study`, recorded as `decided_by: agent`) but never `scope`: it has no default.
- Everything else has a default (20 questions, no time limit, mix `recall,understanding`, difficulty `like-the-exam`, feedback `at-the-end`, language `en`). `decided_by` in `brief.yaml` says for each value whether the user, the default or the agent decided it. `quiz brief` never overwrites an existing `brief.yaml`.
- **Material:** put the files in `content/` and tick their `--kinds` (`lecture-slides`, `textbook`, `notes`, `past-exams`, `lab-manual`, `other` with `--kinds-other TEXT`). Material that lives elsewhere goes in `--elsewhere`. Past exams are mirrored in structure: types, split of marks, length.
- **Weak topics:** if the folder holds results files (`*-results-*.json`) of a quiz, `weak_topics` defaults to yes and `focus_tags` lists the topics under 80% in the latest attempt (the data of `quiz stats`, at most three).
- The last line says what to tell Claude: `Next: tell Claude: "Write the quiz in DIR (brief.yaml is ready)."`
- **`quiz check` reads the brief.** With a `brief.yaml` beside the quiz it adds warnings: `brief.count` (the question count is outside 20% of `count`), `brief.mix` (a kind of question in `mix` is missing), `brief.past-exams` (past exams are ticked but no question has a `Source:` note) and `brief.content-kinds` (a ticked kind has no matching file in `content/`).

### Checking your file

`quiz check quiz.md` prints one line per finding:

```text
quiz.md:37: error: q4 (numeric): 'value' must be a number, got 'one'
quiz.md:52: warning: q6 (single): no explanation
```

Errors stop the build; warnings do not. Besides structural problems, `quiz check` warns about weak questions: a missing or very short explanation, duplicate choices, "all/none of the above", a correct choice much longer than every distractor, a question text that already contains the answer, and a single-choice key that favors one position (when choices are not shuffled). It also warns about an essay or code question without a rubric, a scale without labels, an ungraded single-choice question with fewer than three choices, an image with empty alt text and a code language it cannot highlight. Exit code 0 means no errors, 1 means errors, 2 means a usage or file problem. Add `--json` for machine-readable output. Add `--strict` (also on `quiz build`) to treat warnings as errors, for CI: the exit code is 1 if there is any finding, and `quiz build --strict` writes nothing.

## 5. Taking a quiz

1. **Start screen**: a cover sheet with the number of questions, the points, the time allowed and the feedback mode, then the sections with their suggested times and the total. It says when the attempt would end if you start now: with a time limit, when the time runs out; without one, when you would finish at the suggested pace. Turn on **Focus mode** there to go fullscreen with a clock when you press Start (the browser only allows fullscreen from a click; the page remembers the choice). If you have an attempt in progress on this device you can **Resume** it or **Start over**; with a time limit it shows when that attempt's time runs out.
2. **Questions**: all on one page, grouped by section. The numbered pills show what you answered and what you flagged: in a panel on the right of a wide screen (with the timer, "Answered 7/20", a progress bar and a key), in a row under the title on a narrow one. After you submit, each pill also shows its result with a symbol (✓ correct, ✗ wrong, ½ partly correct, ? waiting for AI grading, – not answered), and the panel shows your score. Use **Flag for review** to mark a question you want to come back to. **Focus** (where the browser allows fullscreen) fills the screen, hides the text size, theme and export buttons and shows a clock; press Esc to leave. It only removes clutter, it does not lock anything.
3. **Hints** are hidden behind a button.
4. **Instant feedback** quizzes have a **Check** button per question. It locks the answer, shows right or wrong, the correct answer and the explanation. Pressing **Enter** in a one-line answer box does the same.
5. **Timer**: it keeps counting if you reload the page. It warns at 5 minutes and 1 minute. When time runs out, the quiz either submits automatically or counts overtime, depending on `on_timeout`.
6. **Submit** shows the score, a per-topic breakdown, and which questions still wait for AI review (essays and code). Essays and code show the sample answer or reference solution when the quiz allows it. The results screen has:
   - **All questions** / **Needs review (N)**: show every question, or only the wrong, partial and unanswered ones.
   - **Retry missed (N)**: a new attempt with only those questions. It asks first, and warns if you have not exported this attempt, since the retry replaces it. The export records `attempt.retry_of`.
   - **Print**, and **Print with answers** (adds the answer key to the printout).

   In a survey the button reads **Finish** and the page shows no score at all, only **Export answers** and **Print**.

Keyboard and accessibility: everything works with the keyboard. In a code box, **Tab** indents; press **Esc** and then **Tab** to leave the box. The theme button switches between light and dark (hidden when the quiz locks its theme) and remembers your choice. **A−** and **A+** make all text smaller or larger in five steps; the size is remembered on this device for every quiz.

Progress is saved in your browser (`localStorage`) for this exact quiz file. If the browser blocks storage the quiz still works, you just cannot resume.

## 6. Exporting and grading

After you start, **Export answers** is always available. It offers a download (`<id>-results-<date>.json`), a **Copy JSON** button, and a text box if the clipboard is blocked.

Then:

```powershell
quiz grade results.json --quiz quiz.md
```

This writes `results-report.md` next to the results file. The report contains:

1. A summary: score, time used, pass or fail, points still pending.
2. A table by topic (tags).
3. A table of all questions.
4. **Review these**: every wrong or partial answer with your answer, the correct one and the explanation.
5. **Pending AI review**: each essay and code answer with the prompt, the rubric and your full response, and an empty **Grading** block for the AI to fill in.

A quiz with ungraded questions also has an **Answers** section (after the question table), listing each ungraded question and the answer. A survey (`mode: survey`) has no score: its report is titled "Answers" and lists every question by section with its answer. Ungraded questions never appear under Pending AI review and never get a grade.

To record an AI's scores in the report, run `quiz grade results.json --json`: it also writes `results-grades.json`, an empty template. Fill in the scores, then run `quiz grade results.json --grades results-grades.json` (add `--json` for the JSON report). The report then shows the grades and a final score that includes them. Band-scored essays show their band but do not add points.

To compare several attempts at the same quiz, run `quiz stats results1.json results2.json ... --quiz quiz.md`. It lists the scores by date, the percent per topic in each attempt and the change, and the three weakest topics of the latest attempt. Ungraded questions are left out of the scores; an **Answers over time** table follows each `scale` and ungraded `single` question across the attempts, and works for surveys too. Add `--json` for data.

Python grades again from the quiz source and is the authority: if the browser's score differs, the command warns and uses its own result. It also warns if the quiz file was edited after the attempt.

With Claude Code, the `/quiz` skill does all of this for you: ask it to make a quiz from your notes, and later to grade the exported results.

### Results and report files

Both files are plain JSON with a `format` and a `version` field, and both have a JSON Schema in `src/fullmark/schemas/` (also installed with the package):

| File | `format` | Written by | Schema |
|---|---|---|---|
| `<id>-results-<date>.json` | `fullmark-results` | the page, on Export answers | `results-v1.schema.json` |
| `<name>-report.json` | `fullmark-report` | `quiz grade --json` | `report-v1.schema.json` |

A response has one shape per question type (`single`: `choice`; `multi`: `choices`; `truefalse`: `value`; `numeric`: `raw` and `value`; `short`: `text`; `blanks`: `blanks`; `fields`: `fields`; `ordering`: `order` (item numbers in source order, so the correct answer is 0, 1, 2, ...); `matching`: `pairs` (for each left item, the number of the chosen right-hand item, or null); `essay`: `text` and `word_count`; `code`: `language` and `code`; `scale`: `value`). An answered ungraded question has `status: "ungraded"` and `earned: null`; `attempt.mode` is `quiz` or `survey`. The tests validate every export against the schemas.

Compatibility rule: a new optional field keeps `version: 1`. Removing or renaming a field, or changing its meaning, bumps the version, and `quiz grade` refuses a version it does not know.

## 7. Keep a library

By default a quiz is a file: you build it, hand it out and the answers land wherever the browser saves them. The **library** is the other way to work. It is one folder on a drive you choose, under git, that owns your own quizzes and files every result next to the version you answered. Core commands stay as they are and need no library. The library commands are `init`, `status`, `register`, `list`, `take`, `share`, `path`, `grade`, `stats`, `rename` and `rm`.

### Set it up: `init`

```powershell
quiz library init D:\quizzes
```

- `init PATH` (default: the current folder) makes PATH this machine's library, runs `git init` and commits, and records the folder in a config file (`%APPDATA%\fullmark\config.toml` on Windows, `~/.config/fullmark/config.toml` on Linux). `FULLMARK_CONFIG` points to another config file and `FULLMARK_LIBRARY` to another folder for one shell; the environment wins over the config.
- A **new or empty folder** is set up. A folder that **has other files and is not a library is refused**: nothing is written, not even the config, and the message suggests a new folder such as `PATH\fullmark-library`. There is no override.
- A folder that **already is a library** is adopted: only the config is written. Use this on a second machine for a folder that a sync service (OneDrive, Syncthing) keeps in step; its git state is left alone.
- A machine has one library. A second `init` elsewhere exits 2 and changes nothing; `--force` switches the config to the new folder and leaves the old one as it is.
- `--no-git` skips the repository. Inside another git repository no nested repository is made, and fullmark will not commit there.

### Add a quiz: `register`

`quiz library register quiz.md` checks the file as `quiz check` does (it refuses on errors; `--strict` also refuses on warnings; `--review review.json` applies a review), then copies the source, its images and its `brief.yaml` into the library and commits. No HTML is stored. The original file can then be deleted: a scratch folder is fine.

- `-n NAME` sets the name (default: the title as a slug, cut to 24 characters at a word break). Commands take the name, the id, or the first 3 or more characters of the id. A name already taken exits 1 and suggests a free one.
- The same file path again, without `--update`, exits 1 and names the quiz it was registered as.
- **`--update NAME`** adds a version of an existing quiz: `unchanged` when nothing changed, `replaced` when nobody has taken the current version yet (so fixing a quiz does not pile up versions), `new-version` when an attempt exists, `updated-assets` when only an image or the brief changed.
- Images and audio must sit **inside the quiz's folder** and be referenced relatively (`assets/x.png`): no drive letter, no leading slash, no `..` above the folder. `register` refuses anything else.
- With no library on the machine `register` exits 3 and says to run `quiz library init PATH`: where the library goes is your decision.

### Take a quiz: `take`

`quiz library take NAME` builds the page on the spot with the installed fullmark, serves it on 127.0.0.1 and opens the browser. **Submit** (or **Finish**) files the result as `quizzes/<id>/results/<date-time>.json` in the library and commits. An attempt in progress is saved in the library too, so closing the tab or the terminal and running `take` again offers **Resume**. If the original source still exists and has changed since you registered it, `take` warns and serves the registered version; run `register --update` to adopt the change. `--no-open` prints the address instead of opening the browser, `--focus` turns on Focus mode on the start screen, `--timeout SECONDS` stops waiting (default: no limit).

### See what you have: `list` and `status`

- `quiz library list` prints one row per quiz: id, name, title, versions, attempts, last taken and last score (a percent, or `survey`), with a note when the source changed.
- `quiz library status` is the health check: the config, the library, git (own repository or not, uncommitted changes, remote or none), the counts, and problems such as a snapshot or image whose content no longer matches its hash. Exit 0 is healthy, 1 means problems, 2 means no library. With no git repository it says how to add history: `git -C "PATH" init`. The next `register` or `take` then commits.
- In a terminal both print colored tables; every state also carries a symbol or a word, so color is never the only signal. `--plain` (or a non-empty `NO_COLOR`) prints plain text, and `--json` is for scripts and agents.

### Share and edit: `share`

- `quiz library share NAME -o DIR` writes `DIR/NAME.html`, the normal standalone page (never overwriting a file). `--version HASH` shares an older version.
- `quiz library share NAME --source -o DIR` writes the editable source instead: `DIR/NAME/<original file name>`, its `assets/` and `brief.yaml`. Edit it, then `quiz library register DIR/NAME/<file> --update NAME`. Quizzes are never edited inside the library.

### Grade and follow progress: `grade` and `stats`

- `quiz library grade NAME` grades the newest attempt against the version it was taken on, even if the quiz was updated since. `--attempt STAMP` picks another one (a results file name, or a prefix of 4 or more characters). The report goes into `quizzes/<id>/reports/<stamp>-report.md` (`--json` writes `-report.json` and, when essays or code need grading, an empty `<stamp>-grades.json` beside it). Reports never go into `results/`, which holds only attempts. When the version is no longer in the library, it warns and uses the grades the browser gave.
- The grading flow for an agent: `quiz library grade NAME --json`, fill in `reports/<stamp>-grades.json`, then `quiz library grade NAME --grades <that file> --json`.
- `quiz library stats NAME [--json]` shows scores by date and percent per topic over all attempts. When every attempt was taken on one stored version it re-grades with it; when they span several versions it keeps the grades each attempt was made with and says so.

### Rename and delete: `rename` and `rm`

- `quiz library rename OLD NEW` changes the name only; the id, the folder and the results stay. The new name must follow the name rule and not be another quiz's name or id.
- `quiz library rm NAME` **deletes** the quiz folder (versions, results, progress) and its entry, then commits, so `git -C LIBRARY revert HEAD` restores it. It refuses (exit 2, nothing deleted) when the library is not its own git repository, or when `quizzes/<id>` has uncommitted changes; `--force` skips both checks. In a terminal it asks `[y/N]`; without a terminal it needs `--yes`. Images in `assets/` stay and show as unused in `status`.

### Git and backups

fullmark commits after each `init`, `register`, `take`, `grade`, `rename` and `rm` when the library folder is its own repository, and it **never pushes**. The history protects against mistakes, not against losing the drive; `status` says "no remote" until you add one or keep the folder in a synced folder. Results hold your answers and the snapshots hold the answer keys, so **any remote must be private**. Snapshots are read-only, and `status` reports an edited one; restoring is your step (`git restore`). To push automatically, add a `post-commit` hook to the library's `.git/hooks`: that hook is yours, not fullmark's.

Results and snapshots are plain files. `quiz library path NAME` prints a quiz's folder, and core `quiz grade` and `quiz stats` still work on the files in it; `quiz library grade` and `stats` just pick the matching snapshot for you.

## 8. Command reference

| Command | What it does |
|---|---|
| `quiz check FILE [--json] [--strict] [--review REVIEW]` | Validate a quiz file; `--strict` fails on warnings too; `--review` also holds it to a `review.json` |
| `quiz build FILE [-o OUT] [--open] [--strict]` | Validate, then write the HTML; `--strict` fails on warnings and writes nothing |
| `quiz watch FILE [-o OUT] [--open] [--serve]` | Rebuild whenever the quiz or its `assets/` change; keeps the last good build when a save has errors. Reload the page after each rebuild, or add `--serve` to serve it on 127.0.0.1 and reload the browser automatically (only the served copy gets the reload code; the file you hand out is unchanged) |
| `quiz serve FILE [--out RESULTS] [--once] [--timeout SECONDS] [--open] [--focus] [--port N] [--autosave PROGRESS] [--json]` | Serve the quiz page on 127.0.0.1 and wait for the answers: **Finish** or **Submit** sends the results to the server, which checks them and writes the JSON file, then exits. `--autosave` keeps an attempt in progress so it resumes after the server or browser closes |
| `quiz review FILE [--out REVIEW] [--since REVIEW] [--once] [--open] [--timeout SECONDS] [--port N] [--json]` | Serve a review form (keep, fix or drop each question) and write `review.json` when the learner presses Finish |
| `quiz brief DIR [--purpose P] [--scope S] [--count N] [--mix M] [--web] [--accept-defaults] [--json] ...` | Write `brief.yaml` and `content/` for a quiz an agent will write; exit 3 when the purpose or scope is missing and no form was asked for |
| `quiz grade RESULTS [--quiz FILE] [-o OUT] [--grades GRADES] [--json]` | Re-grade and write the Markdown report; `--json` writes `*-report.json` and an empty grades template instead; `--grades` folds a filled-in grades file into the report |
| `quiz stats RESULTS... [--quiz FILE] [--json]` | Compare several attempts at one quiz: scores by date, percent per topic, the weakest topics |
| `quiz inspect FILE [--json] [--review REVIEW]` | Summarize a quiz: questions and points by type, section and tag, and where the single-choice answers sit. Use it to check coverage before handing a quiz out |
| `quiz new TEMPLATE [PATH]` | Copy a template (never overwrites) |
| `quiz templates` | List the templates |
| `quiz guide` | Print the authoring reference |
| `quiz agent-guide` | Print the instructions for AI agents (the same text as `AGENTS.md`, shipped in the package) |
| `quiz library` | `init`, `status`, `register`, `list`, `take`, `share`, `path`, `grade`, `stats`, `rename` and `rm`: keep quizzes and results in one folder under git. `take NAME` serves a quiz and files the result in the library; `share NAME` writes a standalone page, or with `--source` an editable folder; `path [NAME]` prints the library or a quiz folder; `grade` and `stats` work on the filed attempts (see section 7). `status` and `list` print colored tables in a terminal; `--plain` or `NO_COLOR` gives plain text, `--json` is for scripts |

## 9. How it is built

| Part | Library |
|---|---|
| Markdown parsing | `markdown-it-py` with `mdit-py-plugins` |
| Front matter | `PyYAML` (`safe_load` only) |
| Models and validation | `pydantic` v2 |
| Code highlighting | `Pygments` with custom pastel styles |
| HTML assembly | `Jinja2` |
| Math | KaTeX 0.16.47, vendored |
| Browser runtime | plain JavaScript and CSS, no framework, no build step |

Source layout (under `src/fullmark/`):

- `parser.py`, `models.py`, `validate.py`: Markdown to models, with line numbers.
- `grading.py` and `static/quiz.js`: the same grading rules in Python and JavaScript.
- `render.py`, `build.py`, `theme.py`, `templates/`, `static/`: the HTML page.
- `report.py`: the Markdown report.
- `library/`: the `quiz library` commands (config, registry, git, terminal tables). It imports the modules above; none of them imports it, and a test enforces that.
- `examples/`: the seven templates (`calculus`, `rust`, `ielts`, `medical`, `exam`, `survey`, `blank`) and their images.

The design decisions are in [SPEC.md](https://github.com/Hung-nd233960/fullmark/blob/main/docs/SPEC.md).

## 10. Testing

```powershell
cd <path to this repo>
uv run pytest -q                       # everything (about 5 minutes)
uv run pytest -q --ignore=tests/e2e    # skip the browser tests
```

The tests cover validation (one fixture per error), the grader (160 golden cases run through both Python and JavaScript), the build, the report, the examples, and real-browser end-to-end flows on `file://` pages. They also check that the page makes no network requests and that text colors meet contrast limits in both themes.

## 11. Limits and tips

- **Not a secure exam.** The answer key is inside the HTML, only lightly scrambled. Anyone determined can read it.
- Code answers are exported, never run.
- Math answers are compared numerically, not symbolically: `2x` and `x*2` are different strings. List accepted variants.
- Large images and audio make the HTML large. You get a warning above 20 MB.
- Write explanations. They are what makes a quiz teach, and `quiz check` warns when one is missing.
- `{input}` goes at the very end of a `- [ ]` choice line, and a prompt needs double quotes: `{input="What is it?"}`.
- If something looks wrong, run `quiz check` first. Most problems are a missing `[x]`, a missing `answer` block, or an unquoted colon in the front matter.
