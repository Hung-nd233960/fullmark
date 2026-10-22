# fullmark: specification

Status: **implemented** (all milestones, 2026-10-20). Deviations from the first draft: Catppuccin palette (section 7.7); `scoring: band` for essays; project `.markdownlint-cli2.jsonc` and `biome.json`; JSON embedded in the page escapes every `<` as `<`. Originally: approved design, ready to implement. Written 2026-10-20 as a handoff: an implementer should be able to build the whole tool from this file without any other context.

## 1. Purpose

`fullmark` turns a Markdown file into **one self-contained HTML quiz** that opens by double-click (no server, no network), grades itself, and exports the learner's answers as JSON so an AI can review them.

Typical loop:

1. An AI reads study material and writes a quiz in fullmark Markdown.
2. `quiz check` validates it; the AI fixes errors until it passes.
3. `quiz build` produces `quiz.html`; the learner opens it in a browser.
4. The learner answers, submits, and exports `results.json`.
5. `quiz grade results.json` produces a Markdown report; an AI grades essays and code from that report.

### 1.1 Goals

- Markdown format that an AI writes reliably and a human can read as plain text.
- Single-file HTML output: CSS, JS, KaTeX, images and audio embedded. Works from `file://`, offline, on desktop and phone.
- Question types: single choice, multiple answer, true/false, numeric, short answer, fill-in-the-blank, labeled fields, essay, code.
- LaTeX math, highlighted code, images, audio, timers.
- Rule-based grading for everything except essay and code; those are exported for AI grading.
- Precise, line-numbered validation errors (the AI's feedback loop).
- Polished example quizzes that double as templates (`quiz new`): six, plus a blank skeleton.

### 1.2 Non-goals (v1)

- Secure exams: the answer key ships inside the HTML. Obscure it lightly (section 7.8), but do not pretend it is secret.
- Running code in the browser. `type=code` answers are exported, not executed.
- Symbolic math equivalence (`2x` vs `x*2`). Use numeric answers or list accepted variants.
- Server, accounts, sync, analytics, any network request.
- Spaced repetition, question banks, multiple attempts history (possible later).

## 2. Decisions already made

| Topic | Decision |
|---|---|
| Implementation language | Python 3.13 (a Rust port may come later; keep the HTML/JS output independent of the build language) |
| Packaging | uv project, installed with `uv tool install --editable`; command name `quiz` |
| Project location | a local git repo, **no GitHub remote** for now |
| Math | KaTeX, vendored, embedded only when the quiz contains math, rendered in the browser on load |
| Media | Embedded as data URIs; warn when the HTML exceeds 20 MB |
| Answer boxes | Fill-in-the-blank, short typed answer, and labeled multi-field answers are all required |
| Code | Required: highlighted code in prompts/choices, blanks inside code, and a `code` answer type |
| Frontend | Plain JavaScript (ES2020) and CSS, no framework, no frontend build step |
| Export | JSON (versioned schema, section 8) |

## 3. Stack

| Part | Library | Notes |
|---|---|---|
| CLI | `argparse` (stdlib) | Subcommands: `check`, `build`, `watch`, `serve`, `grade`, `stats`, `inspect`, `review`, `brief`, `new`, `templates`, `guide`, `agent-guide` |
| Markdown | `markdown-it-py`, `mdit-py-plugins` | Plugins: `front_matter`, `attrs` (heading attributes), `tasklists`, `dollarmath` (keeps `$...$` intact) |
| Front matter | `PyYAML` (`safe_load` only) | |
| Models and validation | `pydantic` v2 | Every question type is a model; errors carry source line numbers |
| Code highlighting | `Pygments` | Build time, CSS classes; custom Catppuccin Latte (light) and Mocha (dark) style classes, no extra dependency |
| HTML assembly | `Jinja2` | One template, everything inlined |
| Math | KaTeX 0.16.x (MIT) | Vendor `katex.min.js`, `katex.min.css`, `contrib/auto-render.min.js`, `fonts/*.woff2`; record the exact version in `vendor/katex/VERSION` |
| Tests | `pytest`; `playwright` (Python) for browser tests | Chromium is already installed on this machine (`playwright install chromium` was run for another env; the browser cache is shared) |

Runtime dependencies: `markdown-it-py`, `mdit-py-plugins`, `pyyaml`, `pydantic>=2`, `jinja2`, `pygments`. Dev group: `pytest`, `playwright`.

## 4. Project layout

```text
fullmark/
  pyproject.toml          # [project.scripts] quiz = "fullmark.cli:main"
  README.md               # install, usage, link to SPEC.md
  docs/SPEC.md            # this file (plus docs/GUIDE.md and the project quiz)
  src/fullmark/
    __init__.py           # __version__
    cli.py
    models.py             # pydantic models: Quiz, Section, Question subclasses, Answer specs
    parser.py             # Markdown -> models (keeps source line numbers)
    validate.py           # semantic checks beyond the models; warnings
    render.py             # models -> HTML fragments (markdown, pygments, media, blanks)
    build.py              # assemble final HTML via Jinja2, size report
    grading.py            # authoritative grading (Python)
    report.py             # results.json -> Markdown report
    guide.md              # the authoring reference printed by `quiz guide` (section 5, condensed)
    templates/quiz.html.j2
    static/quiz.css
    static/quiz.js
    vendor/katex/...      # + LICENSE + VERSION
    examples/
      calculus-1.md
      rust-basics.md
      ielts-writing.md
      blank.md
      assets/             # images used by examples (committed PNGs)
      make_assets.py      # regenerates the PNGs (matplotlib)
  tests/
    fixtures/all-types.md # kitchen sink: every type, image, audio, math, code
    fixtures/assets/beep.wav
    fixtures/invalid/*.md # one file per validation error
    grading_cases.json    # shared golden cases for Python AND JavaScript graders
    test_parser.py
    test_validate.py
    test_grading.py
    test_build.py
    test_report.py
    e2e/test_browser.py   # Playwright, file:// only
```

## 5. Authoring format

A quiz is one UTF-8 Markdown file: YAML front matter, optional sections, questions. Everything is CommonMark plus the plugins listed in section 3. Files must pass markdownlint with the user's rules (ATX headings, `-` list markers, blank lines around blocks, fenced code with a language, no skipped heading levels). Because sections are H1s and hint/explanation are adjacent blockquotes, the project ships `.markdownlint-cli2.jsonc`: the user's rules with MD025 and MD028 disabled. Example quizzes are linted with that file.

### 5.1 Front matter

```yaml
---
title: Calculus I: derivatives            # required
description: Chapter 3 review.            # optional, Markdown allowed
id: calc1-derivatives                     # optional; default: file name stem
time_limit: 30m                           # optional; "90s", "45m", "1h", "1h30m"; omit = untimed
on_timeout: submit                        # submit (default) | warn (keep going, count overtime)
feedback: end                             # end (default) | instant
shuffle_questions: false                  # default false (sections keep their order; questions shuffle within a section)
shuffle_choices: false                    # default false; per-question override via {shuffle=...}
multi_scoring: partial                    # partial (default) | all_or_nothing
review: false                            # only `quiz review` sets this (true, with mode: survey); see 5.8
pass_mark: 70                             # optional percent of auto-gradable points
tags: [calculus, derivatives]             # optional
---
```

Unknown keys are an error (catches typos like `time_limt`).

### 5.2 Sections

An H1 heading starts a section. Optional; a quiz without H1 headings has one implicit section.

```markdown
# Task 1 {time=20m}

Paragraphs here are the section introduction, shown above its questions.
```

Section attributes: `time` = suggested time, display only (the only enforced timer is `time_limit`).

### 5.3 Questions

An H2 heading starts a question. The heading text is the question's prompt line (Markdown, math and inline code allowed). Content after the heading up to the answer part is the rest of the prompt: paragraphs, lists, code blocks, images, audio, tables.

```markdown
## Which ion's efflux drives phase 3 repolarization? {points=1 tags=cardio}
```

Heading attributes (all optional):

| Attribute | Meaning |
|---|---|
| `type` | `single`, `multi`, `truefalse`, `numeric`, `short`, `blanks`, `fields`, `essay`, `code`. Default: inferred (see below) |
| `points` | Number > 0. Default 1 |
| `id` | Stable id for results. Default `q1`, `q2`, ... in document order |
| `tags` | Comma-separated, used for the per-topic breakdown |
| `shuffle` | `true` / `false`, overrides `shuffle_choices` |
| `case` | `sensitive` / `insensitive` (default) for `short`, `blanks`, `fields` text matching |

Type inference: a question with a task list and no `type` is `single` when exactly one item is checked, `multi` when two or more are checked. Everything else must declare `type`.

Special blocks inside a question:

| Block | Meaning |
|---|---|
| Task list (`- [ ]`, `- [x]`) | Choices for `single` / `multi`. A choice may contain inline Markdown and indented code blocks |
| Fenced block with info string `answer` | YAML answer specification for the non-choice types |
| `> [!hint]` blockquote | Hint, hidden behind a "Show hint" button |
| `> [!explanation]` blockquote | Shown after the question is checked (instant) or after submit (end) |

Any other blockquote is ordinary prompt content.

### 5.4 Question types

#### single

````markdown
## Which ion's efflux drives phase 3 repolarization?

- [ ] Na⁺
- [x] K⁺
- [ ] Ca²⁺

> [!explanation]
> Delayed-rectifier K⁺ currents dominate phase 3.
````

Exactly one checked item; at least two items. Rendered as radio buttons. Score: full or zero.

#### multi

````markdown
## Select all that prolong the QT interval {type=multi points=2}

- [x] Hypokalemia
- [ ] Hyperkalemia
- [x] Hypocalcemia
````

At least one checked item; at least two items. Checkboxes. Scoring:

- `all_or_nothing`: full points only if the selected set equals the correct set.
- `partial`: `points * max(0, (correct_selected - wrong_selected) / correct_total)`, rounded to 2 decimals.

#### truefalse

````markdown
## Every differentiable function is continuous. {type=truefalse}

```answer
value: true
```
````

Rendered as two buttons, True and False.

#### numeric

````markdown
## Evaluate $\int_0^1 x^2\,dx$. {type=numeric}

```answer
value: 0.3333
tolerance: 0.001        # absolute; or rel_tolerance: 0.01 (1 %); default tolerance 0
unit: ""                # optional, displayed after the input box
```
````

Accepted input: integers, decimals, scientific notation (`1e-3`), and simple fractions `a/b`. Leading/trailing spaces ignored. A comma decimal separator is rejected with a visible hint ("use a dot"). Optional `values: [..]` instead of `value` for several correct answers.

#### short

````markdown
## What does `println!("{}", 7 / 2);` print? {type=short case=sensitive}

```answer
accept: ["3"]
patterns: []            # optional regexes (full match), e.g. ["^3(\\.0)?$"]
```
````

Matching: trim, collapse internal whitespace, compare case-insensitively unless `case=sensitive`. Correct if any `accept` string or `patterns` regex (Python `re`, JavaScript-compatible subset only: no lookbehind, no named groups) matches.

#### blanks

Blanks are written inline as `[[answer|variant|variant]]`. Numeric blanks use `[[=value±tolerance]]`, e.g. `[[=0.5±0.01]]`.

````markdown
## Complete the rules. {type=blanks points=2}

The derivative of $\sin x$ is [[cos x|cos(x)]], and $\frac{d}{dx} e^{x}$ = [[e^x|exp(x)]].
````

Blanks may also appear inside fenced code blocks (Rust exercises):

````markdown
## Make it compile. {type=blanks}

```rust
fn main() {
    let [[mut]] v = Vec::new();
    v.push(1);
    print_len([[&]]v);
}
```
````

Each blank is worth `points / number_of_blanks`. Matching rules as `short`. Blanks are not allowed inside math (`$...$`); validation error if found. Implementation note for code blanks: replace each `[[...]]` with a unique identifier-like placeholder (`QZBLANK0`) before Pygments highlighting, then swap the placeholder's span for an `<input>`.

#### fields

Labeled answer boxes for multi-part questions.

````markdown
## Let $f(x) = x^3 - 3x$. {type=fields points=4}

![Graph of f](assets/cubic.png)

```answer
fields:
  - label: "$f'(x)$ ="
    accept: ["3x^2-3", "3x^2 - 3", "3(x^2-1)"]
  - label: "Number of critical points"
    value: 2
  - label: "Local maximum at $x$ ="
    value: -1
  - label: "Local minimum at $x$ ="
    value: 1
    tolerance: 0
```
````

Each field is numeric if it has `value`/`values`, text if it has `accept`/`patterns`, and ungraded (exported for AI) if it has neither. Labels are Markdown (math allowed). Points split equally across graded fields unless a field sets `points`.

#### essay

````markdown
## Describe the trend shown in the chart. {type=essay points=10}

```answer
min_words: 150
max_words: 0            # 0 = no maximum
rubric:
  - Task achievement: covers the key features and an overview
  - Coherence and cohesion
  - Lexical resource
  - Grammatical range and accuracy
sample_answer: ""       # optional; shown after submit only if show_sample: true
show_sample: false
scoring: points       # points (default) | band: the report asks the AI for a band (0-9, half bands) per criterion and overall
```
````

Rendered as a large text area with a live word counter (words = whitespace-separated tokens containing a letter or digit). Turns amber below `min_words`, red above `max_words`. Never auto-graded: status `pending`.

#### code

````markdown
## Write `largest`. {type=code points=3}

Return the largest value in a non-empty slice.

```answer
language: rust
starter: |
  fn largest(v: &[i32]) -> i32 {
      todo!()
  }
rubric:
  - Correct for all non-empty slices
  - Does not clone or allocate unnecessarily
reference: |
  fn largest(v: &[i32]) -> i32 {
      *v.iter().max().unwrap()
  }
show_reference: true
```
````

Monospace text area pre-filled with `starter`; Tab inserts 4 spaces, Shift+Tab outdents, the textarea keeps undo working. Not executed, not auto-graded: status `pending`. `reference` (highlighted) shown after submit if `show_reference: true`.

### 5.5 Media, math, code

- Images: `![alt](relative/path.png)`; png, jpg, jpeg, gif, webp, svg. Path relative to the quiz file. Embedded as data URI. Missing file = error. `alt` required (warning if empty).
- Audio: same image syntax with an audio extension (mp3, ogg, wav, m4a) renders `<audio controls>`. Use the alt text as the caption.
- Video: not supported in v1 (error with a clear message).
- Math: `$inline$` and `$$display$$` anywhere Markdown is allowed, including choices, field labels and explanations. Not inside code.
- Code: fenced blocks with a language are highlighted by Pygments; unknown language falls back to plain text with a warning.
- Size: after build, warn when the HTML exceeds 20 MB; error above 100 MB.

### 5.6 Questionnaires: ungraded questions, survey mode and `scale`

Some questions have no right answer (intake forms, self-reviews, course feedback, "how sure are you?"). The design, decided on 2026-10-20:

- **Ungraded question.** `graded=false` on a `##` heading, any question in a `mode: survey` file, and every `scale`. It collects an answer, never counts toward any total, shows no right or wrong and is never sent to AI grading. Only `single`, `multi`, `short`, `fields`, `essay`, `ordering` and `scale` can be ungraded; the others (`truefalse`, `numeric`, `blanks`, `matching`, `code`) are an error, because their value lies in a right answer.
- **Syntax stays the old syntax.** Choices are `- [ ]` items with no `[x]` (an `[x]` is an error). An ungraded `short` takes no `answer` block, an ungraded `fields` has labels only, an ungraded `essay` has no rubric. An ungraded `ordering` is a **ranking**: the plain list in the written order, which the learner reorders; the page adds a **Keep this order** button, because an untouched ranking would otherwise count as unanswered. No new syntax was needed for it.
- **`mode: survey`.** Every question is ungraded; `pass_mark`, `pick`, `feedback: instant` and `multi_scoring` are errors (nothing to score, draw, check or weigh). `time_limit`, `shuffle_*`, `theme` and `description` stay. The page shows no score, the submit button reads **Finish**, and the results screen leads with **Export answers**.
- **Results.** A new status `ungraded` (an answered ungraded question; a blank one is `unanswered`). `earned` is `null` for both, `points` is 0, and the question is excluded from `possible_auto`, `pending_points` and `possible_total`. `attempt.mode` (`quiz` or `survey`) is a new optional field; in a survey `score` is still present (zeros and `percent_auto: null`) so the required fields hold. **`version` stays 1**: the only consumers are fullmark itself and agents that are told to ignore values they do not know, and every change is an addition (a status value, a question type, an optional field). The tests validate every export against the schema.
- **Reports.** `quiz grade` adds an **Answers** section to a quiz report; a survey report is titled "Answers", has no score or tables, and lists every question by section. `--json` adds `mode` and, on ungraded questions, `ungraded`, `response` and `answer_text`. A grades file naming an ungraded question is an error.
- **Why no branching.** Skip logic needs a way to refer to earlier answers, which turns a Markdown outline into a program and breaks the one-line-per-finding validation; a survey that needs it is better split into two files. Collecting answers from several people, any server, and required answers (beyond the existing "unanswered" warning on submit) are out of scope for the same reason: the product is one offline file for one person.

## 6. Validation (`quiz check`)

Output, one line per finding, sorted by line:

```text
quiz.md:37: error: q4 (numeric): 'value' must be a number, got 'one'
quiz.md:52: warning: q6 (single): no explanation
```

- `--json` prints the findings as a JSON array (`file`, `line`, `severity`, `question`, `message`).
- Exit code 0 = no errors (warnings allowed), 1 = errors, 2 = usage or I/O problem.

Required checks (each gets a fixture in `tests/fixtures/invalid/` and a test):

- Front matter: missing `title`, unknown keys, bad `time_limit` syntax, bad enum values.
- Heading levels: H3+ used as question/section (error: "use ## for questions").
- Duplicate question ids.
- `single`: not exactly one checked item, fewer than two items.
- `multi`: no checked item, fewer than two items.
- Missing `answer` block for types that need one; `answer` block on a choice type.
- YAML errors inside `answer` blocks, reported at the correct file line.
- Numeric: non-numeric `value`, negative tolerance, both `tolerance` and `rel_tolerance`.
- Short/blanks/fields: empty accept list without patterns (except ungraded fields); invalid regex; regex using unsupported features (lookbehind, named groups).
- Blanks: question of type `blanks` with no `[[...]]`; `[[...]]` used in a non-blanks question; blank inside math.
- Media: missing file, unsupported extension, video.
- Warnings: no explanation on an auto-graded question, empty alt text, essay without rubric, code without rubric, HTML size over 20 MB (from `build`).

## 7. Build (`quiz build`) and the HTML runtime

```text
quiz build quiz.md [-o quiz.html] [--open]
```

Runs all checks first and refuses to build on errors. Default output: next to the source with `.html`. Prints the output path and size. `--open` opens it in the default browser.

### 7.1 Embedded data

The page contains one `<script type="application/json" id="quiz-data">` with: quiz metadata, the source hash (SHA-256 of the UTF-8 source, first 16 hex chars), fullmark version, build time, and per-question render data. The answer key is stored separately (section 7.8).

### 7.2 Page structure

1. **Start screen**: title, description, number of questions, total points, time limit, feedback mode, Start button. If saved progress exists for this hash: "Resume" and "Start over".
2. **Quiz**: sticky header (title, timer, answered x/y, theme toggle, Export, Submit). All questions on one scrolling page, grouped by section, each in a card with number, points, tags. A compact question navigator (numbered pills, colored by answered/flagged state). A "flag for review" toggle per question.
3. **Results** (after submit): score (auto-graded points, percent, pass/fail if `pass_mark`), pending points from essay/code, per-question status, correct answers and explanations, per-tag breakdown, Export button.

### 7.3 Feedback modes

- `end`: nothing is revealed until Submit.
- `instant`: each auto-graded question has a Check button. Checking locks the question, shows correct/incorrect, the correct answer and the explanation. Essay and code questions behave as in `end`.

### 7.4 Timer

- Starts when the learner presses Start; survives reloads (stored start time, not a running counter).
- Visual warnings at 5 minutes and 1 minute (color change plus `aria-live` announcement).
- `on_timeout: submit`: at zero, inputs lock and the quiz submits automatically; results show "Time's up".
- `on_timeout: warn`: the timer turns red and counts overtime; overtime is recorded in the export.
- Untimed quizzes show elapsed time instead.

### 7.5 Persistence

- `localStorage` key `fullmark:<hash>`: answers, flags, start time, check state, submitted flag, timestamps.
- Save on every change (debounced 300 ms). Wrap all storage access in try/catch; the quiz must work with storage blocked (just no resume).
- "Start over" clears the key after a confirmation.

### 7.6 Export

- "Export answers" is available after Start and on the results screen.
- Downloads `<id>-results-<YYYYMMDD-HHMM>.json` via a Blob link; also offers "Copy JSON". If the clipboard is unavailable (common on `file://`), show the JSON in a read-only textarea, pre-selected.
- Export before submit is allowed; the JSON says `"submitted": false`.

### 7.7 Look and accessibility

- Light and dark themes following `prefers-color-scheme`, with a manual toggle (remembered in storage).
- **Palette: Catppuccin.** Light theme = **Latte**, dark theme = **Mocha**. Define every color as a CSS custom property on `:root[data-theme=light]` / `:root[data-theme=dark]` using the official Catppuccin hex values; no color literals elsewhere in the CSS.
  - Surfaces: page `base`, cards `mantle`/`surface0`, borders `surface1`/`overlay0`, text `text`, secondary text `subtext0`.
  - Accent `mauve` (buttons, focus ring, progress); correct `green`; incorrect `red`; partial/warning (timer 5 min, word count below minimum) `yellow`/`peach`; pending (essay/code) `blue`; flagged `pink`; hints `sky`; links `blue`.
  - Text on accent fills uses `base`. Check contrast of body text and status colors (WCAG AA, 4.5:1) in both themes; status is never conveyed by color alone (also an icon or label).
  - Code highlighting uses Catppuccin token colors (keywords `mauve`, strings `green`, numbers `peach`, comments `overlay1`, functions `blue`, types `yellow`, operators `sky`) via two custom Pygments styles (`CatppuccinLatte`, `CatppuccinMocha`).
  - KaTeX math inherits the theme `text` color.
- Readable on a 360 px wide phone; no horizontal page scroll (code blocks scroll inside their box).
- All inputs labelled; full keyboard use; visible focus rings; choices selectable by clicking the whole row.
- Print stylesheet for the results screen.
- Content Security Policy meta tag: `default-src 'none'; img-src data:; media-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'`. The page makes **no network requests**; the e2e test asserts this.

### 7.8 Answer key

Store the key as JSON, XOR-obfuscated with a key derived from the quiz hash, then base64. This only stops casual peeking; document that it is not security.

### 7.9 Rendering details

- KaTeX auto-render runs once after the DOM is built, with `$`/`$$` delimiters, `throwOnError: false`. Include KaTeX only if any math was detected at build time.
- KaTeX CSS fonts are rewritten to `data:font/woff2;base64,...` URIs; only woff2 files are embedded.
- Pygments CSS for the Catppuccin Latte and Mocha styles, scoped under `[data-theme=light]` and `[data-theme=dark]`.
- Shuffling happens once per attempt in the browser (seeded by the attempt start time, stored), so a reload keeps the order. Exported responses always refer to original choice indices.

### 5.7 Follow-up text on a choice (`{input}`)

A choice of a `single` or `multi` question can end with `{input}` or `{input="Prompt text"}` (default prompt "Please specify") to ask for a few words when it is picked ("Something else", then "What is it?"). Decided on 2026-10-21:

- **Syntax.** The marker is recognised only at the end of the item's last line, so ordinary text with braces is untouched. It is stripped from the shown text. It works in quiz and survey mode, graded or not, and can sit on a `[x]` choice. On any other question type, on a heading, with an empty prompt or in any other malformed shape it is an error with a line number and a hint. The prompt is plain text.
- **The text is never graded.** Neither grader reads it; the choice is scored exactly as before. Golden cases cover answered, unanswered and hidden-text responses.
- **Results.** `response` keeps its exact shape and gains an optional `inputs` object, `{"<original choice index>": "text"}`, only when a selected choice has non-empty text. Text typed under a choice that was then unselected is kept on the page but is not an answer, so it is not exported (and a stray `inputs` entry for an unselected choice is ignored by the report). **`version` stays 1**: the field is optional and old files remain valid, and consumers already ignore keys they do not know. `results-v1.schema.json` describes it, and the built-in validator of `quiz serve` gained `patternProperties` and `additionalProperties` to check it.
- **Reports.** The chosen choice reads `Something else: a hackathon` in `quiz grade`; the JSON report gives `answer_text` the same way plus the raw `inputs`. `quiz stats` counts choices only.
- **Not done.** Inputs on `truefalse`, `ordering` or `matching`, Markdown in the prompt, required text and several inputs per choice: no use case yet.

### 5.8 Review (`quiz review`)

Decided on 2026-10-21. An agent writes the quiz from the learner's material; only the learner can say that a key is wrong or a question is not in the material. `quiz review` gives that judgement a structured form, and `quiz check --review` holds the author to it.

- **The form is a survey made in memory** (`quiz.id` is `<quiz-id>-review`) and served by the `quiz serve` machinery, so it is the ordinary survey page with one marker, the front-matter key `review: true` (an error without `mode: survey`; the page data carries `review`). The marker changes only the counting: see below. Each question becomes a section whose intro shows the question as the quiz shows it (title, prompt, choices, hint, with blanks hidden), then the answer key (as the type has it) and the explanation, followed by three ungraded questions: a verdict (`Keep`, `Fix {input}`, `Drop {input}`), problems (multi) and a note (short). The results go to a temporary folder and are converted, so the only file written beside the source is the review file.
- **`review.json`** (`review-v1.schema.json`, `"by": "quiz review"`): `quiz.id`, `quiz.source_hash`, `reviewed_at` and `items` keyed by question id, each with `hash`, `verdict`, `text`, `problems` and `note`. `hash` is the first 16 hex characters of the SHA-256 of the question's source block, from its `##` line to the line before the next question or section heading, with line endings normalized and trailing blank lines removed. Agents never write the file; the check cannot enforce that, so the field `by` and the guides say so.
- **Matching** is done in three passes on what is left: id and hash both equal; hash equal (the id is missing, or a default `qN` that moved); id equal (the question was edited). Items for questions that no longer exist are kept in the file and ignored.
- **Writing.** The default is `review.json` beside the quiz, or `review-2.json` and so on when it exists. `--out FILE` and `--since FILE` merge into that file: newer items replace older ones (also an older item with the same hash under another id), items not shown are kept. `--since` shows only new or changed questions; with nothing new it exits 0 without serving.
- **Check rules** (`quiz check --review`): `review.drop`, `review.fix` and `review.key-wrong` are errors; `review.changed` is info; `review.unreviewed` is a warning. Findings gained an optional `rule` (`--json` shows it); the info level never counts for `--strict`. A review of another quiz id is a usage error (exit 2).
- **Not done:** several reviewers, threads per question, reviewing in the quiz page itself, and the terminal form (`--tui` exits 2 until `quiz serve --tui` exists).
- **Cards, not fields (0.7.1).** With the marker the header reads `Reviewed N/M` (cards with a verdict), the question nav has one button per card numbered by the quiz's question number, Finish warns about "review cards without a verdict", and the "Flag for review" checkbox is hidden. Problems and a note alone never make a card reviewed. The results export and `review.json` have the same shape as before. `quiz brief --web` is an ordinary survey and keeps the flag boxes and the `Answered N/M` counter.

### 5.9 Brief (`quiz brief`)

Decided on 2026-10-21; the idea is `deck new --web` of presentation-kit (its `brief_questions.yaml`, `brief.yaml` with `decided_by`, `content/` and the `content.kinds` check), with the quiz questions.

- **One question list**, `brief_questions.yaml`: id, label, help, type, choices with hints, default, `delegable`. The flags, the survey of `--web` and the fields of `brief.yaml` are built from it, and a test checks that the three agree. `--tui` exits 2 with "terminal form not built yet; use --web or flags" until `quiz serve --tui` exists.
- **Human-only:** `purpose` and `scope`. A missing one exits 3 (nothing written) with the missing questions and the form command in `--json`. `--accept-defaults` fills only a human-only value that has a default (`purpose`: `self-study`, recorded as `agent`); `scope` has none, so it always needs the user.
- **`brief.yaml`** has `purpose`, `scope`, `content` (`kinds`, `kinds_other`, `elsewhere`), `count`, `minutes`, `mix`, `difficulty`, `mode`, `weak_topics`, `focus_tags`, `language`, `request` and `decided_by` (`user`, `default` or `agent` per value). It is never overwritten; `content/` and its README are made if absent and nothing in them is touched. `request` is free text for the agent: when it is filled in, the agent does not ask the brief questions again.
- **`--web`** builds the survey (id `quiz-brief`) in memory, serves it with the `quiz serve` machinery and reads the answers back; a flag beats the form, questions given as flags are left out, nothing but `brief.yaml` and `content/` is written. A timeout exits 2.
- **Weak topics:** results files `*-results-*.json` in the folder (graded attempts of the quiz attempted last) go through the same code as `quiz stats`; topics under 80% in the latest attempt, at most three, become `focus_tags`, and `weak_topics` defaults to yes when such files exist.
- **`quiz check`** reads a `brief.yaml` beside the quiz and adds warnings: `brief.count` (outside 20%), `brief.mix` (no question of a type that can show a kind in `mix`: recall = single, multi, truefalse, short, blanks, matching; understanding = single, multi, ordering, matching, essay, short; calculation = numeric, fields; code; essay), `brief.past-exams` (no line starting `Source:` anywhere in the quiz) and `brief.content-kinds` (a ticked kind has no file with a matching extension in `content/`, unless `elsewhere` is set). The skill tells the agent to mirror past exams and to cite them with `Source:` notes.

## 8. Results JSON (`format: fullmark-results`, version 1)

```json
{
  "format": "fullmark-results",
  "version": 1,
  "quiz": {
    "id": "ielts-writing",
    "title": "IELTS Academic Writing practice",
    "hash": "3f9c2a1b7d4e5f60",
    "source_file": "ielts-writing.md",
    "built_at": "2026-10-20T09:00:00Z",
    "fullmark_version": "0.10.0"
  },
  "attempt": {
    "submitted": true,
    "started_at": "2026-10-20T10:00:00Z",
    "submitted_at": "2026-10-20T11:00:00Z",
    "elapsed_seconds": 3600,
    "time_limit_seconds": 3600,
    "timed_out": true,
    "overtime_seconds": 0,
    "user_agent": "..."
  },
  "score": {
    "earned": 0,
    "possible_auto": 0,
    "pending_points": 30,
    "possible_total": 30,
    "percent_auto": null,
    "passed": null
  },
  "questions": [
    {
      "id": "q1",
      "index": 1,
      "section": "Task 1",
      "type": "essay",
      "title": "Summarise the chart",
      "points": 10,
      "tags": ["task1"],
      "flagged": false,
      "status": "pending",
      "earned": null,
      "response": { "text": "The chart illustrates ...", "word_count": 163 },
      "correct": null,
      "first_answered_at": "2026-10-20T10:01:12Z",
      "last_changed_at": "2026-10-20T10:19:40Z",
      "changes": 412
    }
  ]
}
```

`status` is one of `correct`, `partial`, `incorrect`, `unanswered`, `pending`. `percent_auto` is `null` when there are no auto-graded points.

Per-type `response` / `correct` shapes:

| Type | `response` | `correct` |
|---|---|---|
| single | `{"choice": 1}` (original index), plus optional `"inputs": {"1": "text"}` | `{"choice": 1}` |
| multi | `{"choices": [0, 2]}`, plus optional `"inputs": {"2": "text"}` | `{"choices": [0, 2]}` |
| truefalse | `{"value": true}` | `{"value": true}` |
| numeric | `{"raw": "1/3", "value": 0.3333}` | `{"value": 0.3333, "tolerance": 0.001}` |
| short | `{"text": "3"}` | `{"accept": ["3"], "patterns": []}` |
| blanks | `{"blanks": ["cos x", "e^x"]}` | `{"blanks": [["cos x", "cos(x)"], ["e^x", "exp(x)"]]}` plus per-blank `results` |
| fields | `{"fields": ["3x^2-3", "2", "-1", "1"]}` | per-field spec plus per-field `results` |
| essay | `{"text": "...", "word_count": 163}` | `null` (rubric is in the report) |
| code | `{"language": "rust", "code": "..."}` | `null` |

Unanswered questions have `"response": null`.

## 9. Grading and report (`quiz grade`)

```text
quiz grade results.json [--quiz quiz.md] [-o report.md]
```

- Validates the JSON (format, version).
- If `--quiz` is given (or `<source_file>` exists next to the results file): re-grades every auto-graded question in Python from the source. Python is the authority. If the browser's score differs, print a warning and use the Python result. Warn when the source hash differs from `quiz.hash` (quiz edited after the attempt).
- Writes a Markdown report (default `<results-stem>-report.md`) that passes markdownlint:
  1. Summary: title, date, time used, score, pass/fail, pending points.
  2. Per-tag breakdown table (earned/possible, percent).
  3. Question table: number, type, status, points.
  4. "Review these": every incorrect/partial question with the prompt, the learner's answer, the correct answer, and the explanation.
  5. "Pending AI review": one subsection per essay/code question with the prompt (text, image paths noted), rubric, word count vs limits, the full response in a fenced block, and an empty "Grading" block for the AI to fill in (score per rubric line, overall score out of `points`, two strengths, two improvements).

Grading must be implemented identically in `grading.py` and `quiz.js`. `tests/grading_cases.json` holds cases (`type`, `spec`, `response`, `expected_earned`, `expected_status`) that both implementations are tested against (Python in pytest, JavaScript by loading `quiz.js` in a Playwright page and calling its exported grader).

## 10. Other commands

- `quiz new <template> [path]`: copy an example (`calculus`, `rust`, `ielts`, `medical`, `exam`, `survey`, `blank`) plus its assets to `path` (default: current folder). Refuse to overwrite existing files.
- `quiz review FILE [--out] [--since] [--once] [--open] [--timeout] [--port] [--json]` and `quiz check FILE --review review.json` (5.8).
- `quiz brief DIR [flags] [--web]` (5.9).
- `quiz stats RESULTS... [--quiz FILE] [--json]` (5.6) and `quiz inspect FILE [--json] [--review REVIEW]`: progress across attempts, and a summary of a quiz.
- `quiz templates`: list templates with a one-line description.
- `quiz guide`: print `guide.md`, a condensed version of section 5 for AI authors (every type with a minimal example, the attribute table, the common mistakes).
- `quiz agent-guide`: print `agents.md`, the instructions for AI agents (the root `AGENTS.md` is a synced copy).

### `quiz serve --autosave PROGRESS.json`

Resume lives in localStorage, which belongs to one origin, and `quiz serve` uses a new port (a new origin) each run. With `--autosave` the server keeps the attempt in progress in a file and hands it back to the page.

- **Route.** `POST /progress`, only when `--autosave` is given (404 otherwise). Same checks, in the same order, as `/submit` (body read, origin, token, `Content-Length` and `MAX_BODY`, JSON). Body: `{"hash": <quiz hash>, "saved": <ms>, "state": <object> | null}`. A `hash` other than the served quiz's gives 400; a `state` that is neither an object nor null gives 400.
- **File.** `{"hash", "saved", "state"}`, written atomically (a temp file beside it, then `os.replace`) under the server lock. The state is the page's own internal object and is not validated further.
- **Page.** `GET /` reads the file on every request. The snippet carries `progress` (the state) only when the file parses, its `hash` matches, `state` is an object and `state.submitted` is falsy. The start screen then offers **Resume**. The page keeps `savedAt` in its state; when both localStorage and the server hold an attempt, the larger `savedAt` wins (a tie goes to localStorage). The snippet is placed before the data block so it has run when `quiz.js` builds the start screen.
- **Escaping.** The snippet is JSON with `<` written as `<`, because the state holds the learner's own text and `</script>` in an essay must not end the script. `<` is valid JSON and JavaScript.
- **Delete rules.** `state: null` or a submitted state deletes the file (the page sends null on submit and on **Start over**), and so does an accepted `/submit` when the file is for this quiz. A file for another hash (the quiz was edited) is never injected and never deleted by a submit; a malformed file is ignored, never deleted, and never crashes the server.
- **Page requests** go one at a time, in order, so a late save cannot land after the delete that follows a submit. They exist only when the snippet declares `autosave`; a page opened from disk makes none.

## 10a. Library (`quiz library`, 0.9.0; grade, stats, rename and rm in 0.9.1)

The library keeps the user's own quizzes and every result in one folder. It is a layer on top of core, not a part of it. The work plan and the reasons are in [plans/LIBRARY_PLAN.md](plans/LIBRARY_PLAN.md).

### Layers and the import rule

```text
quiz check | build | serve | grade | stats ...     core: files in, files out
quiz library init | status | register | list | take | share | path    library: owns one folder, calls core
quiz library grade | stats | rename | rm                                  wrappers: find files in the library, call core
```

- `fullmark.library` is a subpackage (`library/`: `config.py`, `store.py`, `git.py`, `quizzes.py`, `commands.py`, `pretty.py`, `fsutil.py`). It must always match the runtime it builds with, so it is not a separate app.
- **Imports go one way.** `library/` imports core modules. No core module imports `library/`, and `cli.py` imports it only inside a function (the `library` handler), so `quiz check` and the rest never load it. `tests/test_layers.py` parses every module with `ast` and enforces both rules, and a subprocess test checks that importing `fullmark.cli` loads no library module.
- The library calls core functions (`load_quiz`, `build_html`, `serve_loop`, `check_file`), never the CLI through a subprocess. Git is the only subprocess.
- Core works with no library and no config. Nothing is created until `quiz library init`.
- Dependencies added for the library: `tomli-w` (writing TOML; reading uses the stdlib `tomllib`) and `rich` (colored tables, imported only on the terminal path).

### Config and its precedence

One machine-wide TOML file records which library this machine uses:

| OS | Location |
|---|---|
| Windows | `%APPDATA%\fullmark\config.toml` (without `APPDATA`: `~\AppData\Roaming\fullmark\config.toml`) |
| Linux | `$XDG_CONFIG_HOME/fullmark/config.toml`, otherwise `~/.config/fullmark/config.toml` |
| macOS | `~/Library/Application Support/fullmark/config.toml` |

`FULLMARK_CONFIG` overrides the location (an `XDG_CONFIG_HOME` set by the user is honoured on Windows too). `[library] path = "D:/quizzes"` names the library; `FULLMARK_LIBRARY` overrides it for one shell. **Precedence: environment, then config.** Unknown keys are kept when the file is rewritten. Every write is atomic (a temp file in the same folder, then `os.replace`).

### Folder layout

```text
<library>/
  .git/                            # made by init
  .gitignore                       # progress.json, *.tmp
  library.toml                     # the registry
  assets/<sha256>.<ext>            # every image or audio file, stored once
  quizzes/<id>/
    versions/<hash>.md             # source snapshot of one version (read-only)
    versions/<hash>.assets.toml    # that version's assets: path as written -> sha256
    versions/<hash>.brief.yaml     # the brief, when one sat next to the source
    results/<YYYYMMDD-HHMMSS>.json # one file per finished attempt
    reports/<stamp>-report.md|json # written by `library grade`, with <stamp>-grades.json; never in results/
    progress.json                  # attempt in progress (autosave); deleted on submit; not in git
```

### `library.toml`

```toml
format = "fullmark-library"
version = 1
created = 2026-10-22T14:03:00

[[quiz]]
id = "k7f3q2"                 # 6 random base32 characters, fixed for the life of the quiz
name = "signals-week3"        # unique slug the user types
title = "Signals, week 3"
source = "C:/.../quiz.md"     # where it was last registered from; informational
current = "a1b2c3d4e5f60718"
registered = 2026-10-22T14:03:00

[[quiz.versions]]
hash = "a1b2c3d4e5f60718"     # the quiz's source hash (16 hex characters), as in results quiz.hash
file = "quiz.md"              # the original file name; the build needs it (quiz id, source_file)
added = 2026-10-22T14:03:00
```

A newer `version` than the tool knows is a `status` problem ("upgrade"). The registry holds no scores: results and progress files are the history, and `list` reads them on demand. A name resolves by exact name, then exact id, then a unique id prefix of at least 3 characters; an ambiguous prefix lists the candidates and exits 2.

### Snapshots, assets and builds

- **Snapshots are read-only** on disk and **hash-checked**: `status` re-hashes every snapshot and every asset and reports a mismatch as a problem. Old attempts are graded against the snapshot, so a hand edit would silently change those grades. Recovery is a human step (`git restore`).
- **The asset store.** At `register`, each file the source references is copied to `assets/<sha256>.<ext>`, stored once and shared by versions and quizzes; the version's `.assets.toml` maps each reference to it. `register` requires portable references: relative, inside the quiz folder, no drive letter, no leading slash, no `..` above the folder. The same Markdown with a changed asset is a change.
- **No HTML is stored.** `take` and `share` build the page in memory with the installed fullmark, so pages are never stale.
- **Staging.** To build, the snapshot is written under its original file name in a temporary folder, each asset is copied to the path the Markdown uses and `brief.yaml` beside it; then the normal `load_quiz` and `build_html` run there. Core is unchanged.
- `register` outcomes: `registered`, `unchanged`, `replaced` (the current version has no attempts), `new-version` (it has), `updated-assets` (same hash, changed asset or brief, with attempts).

### Git

| The tool does | Only the user does |
|---|---|
| `git init` in `init` (default; `--no-git` skips it) and write `.gitignore` | restore, revert, check out an old state |
| after each command that writes (`init`, `register`, a result saved by `take`): `git add -A` and `git commit` | add a remote, push |
| `status`: repo or not, uncommitted changes, remote or none | read history |

- **Commit only when the library owns its repository** (the folder is the root of a repo). A library inside another repository gets no nested repo and no commits; adopting a library leaves its git state alone. Without a repo, `status` says how to add one (`git -C "<path>" init`); the next `register` or `take` then commits. No flag runs `git init` after `--no-git`.
- **Never push.** fullmark never contacts a remote. Results hold the learner's answers and the snapshots hold answer keys, so any remote the user adds must be private.
- **A commit never fails a command.** Missing git, a mid-rebase repo, a locked index or a missing identity (`user.name`, `user.email`) gives one warning, and the command still succeeds.

### `init` and the exit codes

- A missing or empty folder is set up. A folder that **has other files and is not a library is refused** (exit 2, nothing written, not even the config; `--json` gives `status: "refused"` and a `reason`), and there is no override. An existing library is adopted. A second `init` for another folder exits 2 unless `--force`.
- Exit codes across the library: **0** done, **1** problems (`status`) or a refused quiz (`register`), **2** usage error, no library or ambiguous name, **3** needs input.

### The exit-3 contract

Where the library goes is human-only. `register` with no library configured exits **3** with, under `--json`, `{"status": "needs_input", "written": false, "message": ..., "missing": [...], "fix": "quiz library init PATH"}` (the shape of `quiz brief --json`). An agent asks the user and never runs `init` itself. `register --json` otherwise prints `{"status", "id", "name", "name_defaulted", "hash", "version_count", "committed", "take"}`.

### Grade, stats, rename and rm (0.9.1)

These wrap core and hold no grading, scoring or stats logic (the work order is [plans/LIBRARY_HOUSEKEEPING_PLAN.md](plans/LIBRARY_HOUSEKEEPING_PLAN.md)). `grade` calls `grade_run.run_grade`, the function behind `quiz grade`; `stats` calls `stats.collect`.

- **`reports/`.** `read_results` and `status` treat every `results/*.json` as an attempt, so `grade` writes its report and grades template into `quizzes/<id>/reports/` (created on demand) and commits them.
- **`grade NAME [--attempt STAMP] [--grades FILE] [--json]`.** The newest attempt by default; `--attempt` takes a file stem or a unique prefix of 4+ characters (no match or several: list the attempts, exit 2). The version is the results' `quiz.hash`, staged like a build; a version that is not stored gives a warning and the browser's grades. Agent flow: `grade --json`, fill `reports/<stamp>-grades.json`, `grade --grades <file> --json`.
- **`stats NAME [--json]`.** Oldest attempt first. One stored version for all attempts: pass the quiz to `stats.collect`. Otherwise pass no quiz, so an old attempt is never re-graded against a newer key, and warn `attempts span N versions`. A `ResultsError` (for example, the quiz id changed) exits 2. Nothing is written.
- **`rename OLD NEW`.** Changes `name` in `library.toml` only (folders are keyed by id); NEW must match the name rule and differ from every other quiz's name and id.
- **`rm NAME [--yes] [--force]`.** A real delete, made recoverable by git. Checks in order, each exiting 2 with nothing deleted: the library owns its repository; `quizzes/<id>` has no uncommitted changes (`--force` skips both); confirmation (`--yes`, or a `[y/N]` prompt on a terminal, otherwise exit 2; under `--json` `--yes` is required, and a declined prompt exits 1). The entry is removed from `library.toml` first, then the folder (read-only version files are made writable on the way); a folder that cannot be deleted exits 1 with a note to delete `quizzes/<id>` by hand. Commit `rm: NAME (ID)`; `git revert HEAD` restores it. Images stay in `assets/`.

### Terminal output

`status` and `list` print colored Rich tables when stdout is a terminal and plain text otherwise (pipes, agents, tests), and always with `--json`, `--plain` or a non-empty `NO_COLOR`. Color is never the only signal: states also carry a symbol or a word.

## 11. Example quizzes (shipped templates)

These are both the user's sample tests and the default templates. Write them with care: they are what an AI will imitate. Every auto-graded question has an explanation. Content must be correct.

### 11.1 `calculus-1.md` (math)

- Front matter: `time_limit: 30m`, `feedback: instant`, `tags: [calculus]`, `pass_mark: 70`.
- About 12 questions over limits, continuity, derivative rules (power, product, chain), the derivative as a rate, the fundamental theorem of calculus, and a basic definite integral.
- Must include at least: two `single` with LaTeX in every choice; one `multi` ("which functions are continuous at 0"); one `truefalse` ("differentiable implies continuous"); two `numeric` (an integral with tolerance, a derivative value at a point); one `blanks` with expression answers and variants; one `fields` question on $f(x) = x^3 - 3x$ (derivative, number of critical points, local max x, local min x) with the graph image `assets/cubic.png`; one short `essay` (explain the Mean Value Theorem in your own words, `min_words: 60`).
- `make_assets.py` draws the cubic with matplotlib (run it with `uv run python make_assets.py`); commit the PNG.

### 11.2 `rust-basics.md` (code)

- Front matter: `time_limit: 25m`, `feedback: end`, `shuffle_choices: true`, `tags: [rust]`.
- About 10 questions on ownership, moves, borrowing (`&`, `&mut`), `String` vs `&str`, `Vec`, `match`/`Option`, integer division, shadowing.
- Must include at least: two "what does this print" `short` questions with `case=sensitive` and a code block in the prompt; one `multi` whose choices are code snippets ("which of these compile?"); one `truefalse` on borrowing rules; one `single` about `&mut` aliasing; one `blanks` question with blanks **inside** a `rust` code block; one `code` question (`largest` over a slice) with starter, rubric and reference.
- All code must be valid Rust (2021 edition) where the quiz claims it compiles; verify claims with `rustc` (rustup stable is installed).

### 11.3 `ielts-writing.md` (timer, essays, export)

- Front matter: `title: IELTS Academic Writing practice`, `time_limit: 60m`, `on_timeout: submit`, `feedback: end`.
- Section `# Task 1 {time=20m}`: one `essay` question, `points: 10`, `min_words: 150`, describing a chart (`assets/ielts-chart.png`, generated by `make_assets.py`: invented data, clearly fictional, e.g. "Share of commuters by transport mode in a fictional city, 2000–2020").
- Section `# Task 2 {time=40m}`: one `essay` question, `points: 20` (Task 2 counts double), `min_words: 250`, an opinion/discussion prompt.
- Rubric lines name the four criteria (Task achievement / Task response, Coherence and cohesion, Lexical resource, Grammatical range and accuracy), each paraphrased in one line. **Do not copy official IELTS band descriptors** (copyrighted); paraphrase.
- The report's grading block for this quiz asks the AI for a band (0–9, half bands) per criterion and an overall band.

### 11.3a `survey.md` (questionnaire)

A generic "Study habits check-in" with `mode: survey` and no personal data: three `single`, one `multi`, two `scale`, one `ordering` ranking, one `fields` and one ungraded `essay`. Nothing is scored.

### 11.4 `blank.md`

Minimal skeleton: front matter with every key commented, one example of each question type, very short.

### 11.5 Test fixture `tests/fixtures/all-types.md`

Not a template. Every type, a section with intro text, an image, an audio clip (`assets/beep.wav`, a 0.5 s sine tone generated with the `wave` module), display math, a hint, code blanks, and a field without a spec (ungraded). Used by the browser tests.

## 12. Claude Code skill

Create `~/.claude/skills/quiz/SKILL.md` (name `quiz`, user-invocable as `/quiz`). Content:

- When to use: the user wants a quiz, practice test or exam from study material, or wants quiz results graded.
- Workflow to make a quiz: read the material; run `quiz guide`; start from the closest template (`quiz new ...`) or write fresh; write questions grounded in the material (cite page/section in explanations where possible); run `quiz check` and fix until it passes; `quiz build --open`; tell the user the path.
- Workflow to grade: run `quiz grade results.json --quiz quiz.md`; read the report; fill in each "Grading" block for essays/code against the rubric; summarise weak tags and suggest what to restudy.
- Rules: never put answers in prompts; distractors must be plausible; one concept per question; mix types; respect the requested length and difficulty.

## 13. Environment notes for the implementer

- Machine: Windows 11. Shells: PowerShell 7 (PowerShell tool) and Git Bash (Bash tool). Read the repo's `AGENTS.md` before running commands.
- Python: use uv only. Inside the project: `uv sync`, `uv run pytest`. Never `pip install` into global or conda base Python.
- A Claude Code hook formats and lints every edited file (ruff for Python, Biome for JS/CSS/JSON, Prettier for HTML, markdownlint for Markdown, lint-only). Fix what it reports. Jinja templates use the `.j2` extension so Prettier leaves them alone.
- Git: `git init` in the project, commit at each milestone; no remote; end commit messages with the attribution line from the session's instructions.
- Install for use: `uv tool install --editable <path to this repo>`, then `quiz --help` must work in a new terminal.
- KaTeX: download the release tarball for the pinned 0.16.x version (npm registry or GitHub release), verify it, vendor only the files listed in section 3 plus `LICENSE`.

## 14. Milestones

Commit after each, with tests passing.

1. **Skeleton**: pyproject, CLI stub with all subcommands, `__version__`, README.
2. **Parser + models + `quiz check`**: all types, line numbers, every check in section 6 with fixtures and tests.
3. **Grading core**: `grading.py`, `grading_cases.json` (at least 60 cases covering every type and edge case: fractions, tolerances, case rules, regex, partial multi, blanks splits, ungraded fields).
4. **`quiz build`**: template, CSS, JS runtime (start screen, cards, timer, persistence, feedback modes, results, export), Pygments, KaTeX, media embedding, answer-key obfuscation, CSP.
5. **JS grader parity**: Playwright test runs `grading_cases.json` through `quiz.js`.
6. **`quiz grade`**: re-grading, report generation, tests.
7. **Examples**: the three templates plus `blank.md`, assets, `make_assets.py`; `quiz new`, `quiz templates`, `quiz guide`.
8. **End-to-end tests** (section 15).
9. **Install + skill + docs**: tool install, `SKILL.md`, README; add a short "Quizzes" section to both CLI guides.

## 15. Acceptance tests (end-to-end, Playwright, `file://` URLs only)

- **Calculus**: build, open, Start; answer half correctly and half wrongly using instant Check; assert per-question feedback, KaTeX rendered (`.katex` elements present, no raw `$` left in rendered prompts), image visible, final score equals the Python re-grade.
- **Rust**: build, open; assert code is highlighted (Pygments classes present), code blanks render as inputs inside the code block, choices shuffle but exported indices are original; fill the `code` answer with Tab indentation working; submit; export; `quiz grade` shows the code under "Pending AI review".
- **IELTS**: build with the time limit overridden to 10 seconds via a test-only environment variable (`FULLMARK_TEST_TIME_LIMIT=10s`); type text into both essays; assert live word counts; wait for timeout; assert auto-submit, inputs locked, "Time's up"; export JSON; assert `timed_out: true`, both essays `pending` with correct `word_count`; run `quiz grade` and assert the report contains both essays and the band-scoring grading blocks.
- **Kitchen sink** (`all-types.md`): every type answerable; audio element present with a `data:` source; reload mid-quiz and assert answers and timer resume; "Start over" clears them; storage disabled (Playwright context with storage blocked) still works.
- **Offline**: for every quiz, record network requests; assert zero requests other than the `file://` page itself.
- **Size**: built calculus quiz under 2 MB; a quiz without math contains no KaTeX.
- **Lint**: every example `.md` passes markdownlint with the user's config; `quiz check` passes on all examples with no errors.
