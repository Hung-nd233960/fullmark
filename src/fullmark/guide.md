# fullmark authoring guide

A quiz is one UTF-8 Markdown file: YAML front matter, optional `#` sections, and `##` questions.
Check it with `quiz check quiz.md` (`--strict` makes warnings fail too), build it with `quiz build quiz.md`.

## Skeleton

````markdown
---
title: "Calculus I: derivatives"   # required. Quote it if it has a colon inside
time_limit: 30m                    # optional: 90s, 45m, 1h, 1h30m
feedback: instant                  # end (default) | instant
---

# Section name {time=10m}

Intro text for the section.

## The question text? {points=2 tags=limits}

Extra prompt: paragraphs, lists, code, images, math.
````

## Front matter keys

| Key | Values | Default |
|---|---|---|
| `title` | text (required) | |
| `description` | Markdown | |
| `id` | name used in results | file name |
| `mode` | `quiz` / `survey` (survey: every question is ungraded and nothing is scored; see Questionnaires) | `quiz` |
| `time_limit` | `90s`, `45m`, `1h30m` | untimed |
| `on_timeout` | `submit` / `warn` | `submit` |
| `feedback` | `end` / `instant` | `end` |
| `pick` | question bank: draw N questions at random per attempt (or `{pick=N}` on a section; not both) | all |
| `theme` | `auto` (follow the device, with a toggle) / `light` / `dark` (locked, no toggle) | `auto` |
| `shuffle_questions` | `true` / `false` | `false` |
| `shuffle_choices` | `true` / `false` | `false` |
| `multi_scoring` | `partial` / `all_or_nothing`; also applies to `ordering` and `matching` | `partial` |
| `pass_mark` | 0-100 (percent of auto-graded points) | none |
| `tags` | list | none |

Lock `theme: light` for an exam simulation whose real paper is printed (the IELTS template does); leave `auto` for practice drills.

Unknown keys are errors. (`review: true` is a key only `quiz review` writes into its form; never put it in a quiz.)

## Heading attributes

Written at the end of a `##` heading: `## Question {type=numeric points=2 id=q-area tags=calculus,limits}`.

| Attribute | Meaning |
|---|---|
| `type` | `single`, `multi`, `truefalse`, `numeric`, `short`, `blanks`, `fields`, `ordering`, `matching`, `essay`, `code`, `scale`. Inferred for choice questions |
| `points` | number greater than 0 (default 1) |
| `id` | stable id (default `q1`, `q2`, ...) |
| `tags` | comma-separated, no spaces; used for the per-topic breakdown |
| `shuffle` | `true` / `false`, overrides `shuffle_choices` |
| `case` | `sensitive` / `insensitive` (default) for `short`, `blanks`, `fields` |
| `graded` | `false` makes this question ungraded (see Questionnaires); `true` is the default |

Section headings (`#`) accept `{time=20m}` (a suggestion only) and `{pick=N}` (question bank: draw N of the section's questions each attempt; sections without it keep all). `pick` in the front matter draws N from the whole quiz instead; do not use both.

## Hints and explanations

````markdown
> [!hint]
> Hidden behind a "Show hint" button.

> [!explanation]
> Shown after Check (instant) or after Submit. Every auto-graded question should have one.
````

## Question types

### single and multi

One checked item gives `single`; two or more give `multi` (or write `{type=multi}`). Every item needs `[ ]` or `[x]`.

````markdown
## Which ion drives phase 3 repolarization?

- [ ] Na⁺
- [x] K⁺
- [ ] Ca²⁺
````

A choice can hold a fenced code block: indent it by two spaces under the item.

#### Follow-up text on a choice

End a choice with `{input}` or `{input="Prompt text"}` to ask for a few words when it is picked. The default prompt is "Please specify". It works on `single` and `multi`, in quizzes and surveys, graded or not; a choice may also be `[x]`.

````markdown
## The knee MRI reading is for... {id=knee}

- [ ] My thesis
- [ ] A lab project
- [ ] Something else {input="What is it?"}
````

The marker is removed from the shown choice. When the choice is selected, a labelled text field appears under it and takes focus; when it is unselected, the field hides but keeps what was typed. The text never changes the score. It is exported as `response.inputs` (`{"2": "a hackathon"}`, original choice indices) and `quiz grade` reports `Something else: a hackathon`. The marker must be the last thing on the choice's line; the prompt is plain text in double quotes. `{input}` on any other question type, an empty prompt or an unquoted prompt is an error.

### truefalse

````markdown
## Every differentiable function is continuous. {type=truefalse}

```answer
value: true
```
````

### numeric

````markdown
## Evaluate $\int_0^1 x^2\,dx$. {type=numeric}

```answer
value: 0.3333
tolerance: 0.001     # absolute; or rel_tolerance: 0.01. Not both. Default 0
unit: ""             # optional, shown after the box
```
````

Use `values: [2, -2]` for several correct numbers. Input may be an integer, decimal, `1e-3` or a fraction `1/3`. A comma decimal is rejected.

### short

````markdown
## Which rule differentiates a composition? {type=short}

```answer
accept: ["chain rule", "the chain rule"]
patterns: ['^3(\.0)?$']      # optional regexes, full match
```
````

Matching trims, collapses spaces and ignores case unless `{case=sensitive}`. Regexes must work in JavaScript too: no lookbehind, no named groups, no inline flags like `(?i)`.

### blanks

Write blanks inline as `[[answer|variant]]`. Numeric blanks are `[[=0.5±0.01]]`.

````markdown
## Complete the rules. {type=blanks points=2}

The derivative of $\sin x$ is [[cos x|cos(x)]] and half is [[=0.5±0.01]].
````

Blanks also work inside a fenced code block:

````markdown
## Make it compile. {type=blanks}

```rust
let [[mut]] v = Vec::new();
```
````

Not allowed inside math (`$...$`). Blanks questions take no `answer` block. Points are split equally among blanks. Every blank in a question starts at the same width, set by the longest answer, and grows as the learner types.

### fields

````markdown
## Let $f(x) = x^3 - 3x$. {type=fields points=4}

```answer
fields:
  - label: "$f'(x)$ ="
    accept: ["3x^2-3", "3x^2 - 3"]
  - label: "Number of critical points"
    value: 2
  - label: "Notes (not graded)"      # no value/accept: exported for the AI
```
````

A field has `value`/`values`/`tolerance`/`rel_tolerance` (numeric) or `accept`/`patterns` (text). An optional `points` on a field sets its weight.

### ordering

````markdown
## Put the steps in order. {type=ordering points=2}

1. Check the base case.
2. Assume the claim for $n = k$.
3. Prove it for $n = k + 1$.
````

Write the list **in the correct order**; the page shows it shuffled (never in the right order) with Move up / Move down buttons; the items can also be dragged (mouse or touch). Needs at least two items, no duplicates, no `answer` block. `partial` scoring gives each item that sits in its correct position an equal share of the points; `multi_scoring: all_or_nothing` gives all or nothing.

### matching

````markdown
## Match each language to its tool. {type=matching points=3}

- Rust :: cargo
- Python :: pip
- JavaScript :: npm
- :: make
````

Each bullet is `left :: right`. A bullet that starts with `::` adds a wrong option (a distractor). The page shows a drop-down list of every right-hand item, shuffled, next to each left item. Needs at least two pairs, `::` on every bullet, and unique right-hand items. No `answer` block. Scoring is per pair, or all or nothing with `multi_scoring: all_or_nothing`.

### essay

````markdown
## Describe the trend. {type=essay points=10}

```answer
min_words: 150
max_words: 0           # 0 = no maximum
scoring: points        # or: band (the report asks for 0-9 bands)
rubric:
  - Task achievement: covers the key features
  - Coherence and cohesion
```
````

Never auto-graded: the report asks an AI to grade it against the rubric. Always write a rubric.

### code

````markdown
## Write `largest`. {type=code points=3}

```answer
language: rust
starter: |
  fn largest(v: &[i32]) -> i32 {
      todo!()
  }
rubric:
  - Correct for all non-empty slices
reference: |
  fn largest(v: &[i32]) -> i32 { *v.iter().max().unwrap() }
show_reference: true   # show the reference after submit
```
````

The answer is exported, not executed.

## Questionnaires: ungraded questions and surveys

Some questions have no right answer: intake forms, self-reviews, course feedback, "how sure are you?" inside a real quiz. fullmark collects those without scoring them.

- `graded=false` on a `##` heading makes that one question **ungraded** in a normal quiz. It never counts toward the score, shows no right or wrong, has no Check button and is never sent to AI grading. After Submit the page shows "Your answer" and, if you wrote one, the explanation under "Why this is asked".
- `mode: survey` in the front matter makes **every** question ungraded. The page shows no score anywhere, the button reads **Finish**, and the results screen offers **Export answers**.
- `type=scale` is a rating row (1 to 5 and similar). It is always ungraded, in a quiz or a survey.

| Type | Ungraded behaviour | What to write |
|---|---|---|
| `single`, `multi` | the learner picks; nothing is marked | a list of `- [ ]` items, no `[x]`. Without a `[x]` the type is `single`: add `{type=multi}` for several answers |
| `short` | free text | no `answer` block |
| `fields` | labelled free text | fields with only a `label` (no `value`/`accept`) |
| `essay` | long text, not sent to AI grading | `answer` block optional; no `rubric`; `min_words`/`max_words` allowed |
| `ordering` | a ranking: shown in the written order, the learner reorders it | the usual list |
| `scale` | always ungraded | see below |
| `truefalse`, `numeric`, `blanks`, `matching`, `code` | not allowed | error |

````markdown
## How confident are you with Fourier transforms? {type=scale}

```answer
min: 1          # default 1
max: 5          # default 5; max - min must be 1 to 10
labels:         # optional; label at least the two ends
  1: Not at all
  5: Very confident
```
````

A scale is a row of numbered radio buttons with the labels under them; the arrow keys move along it. The response is `{"value": N}`.

A confidence question inside a real quiz:

````markdown
## Which ion drives phase 3 repolarization? {id=ion}

- [ ] Na⁺
- [x] K⁺
- [ ] Ca²⁺

## How sure are you of that answer? {type=scale id=ion-sure}

```answer
labels:
  1: Guessing
  5: Certain
```
````

In `survey` mode `[x]`, `pass_mark`, `pick` (front matter or section), `feedback: instant` and `multi_scoring` are errors. `time_limit`, `shuffle_choices`, `shuffle_questions`, `theme` and `description` still work. `points=` on an ungraded question is a warning and is ignored. `graded=true` is the default and is not allowed in a survey.

Read the answers with `quiz grade results.json --quiz quiz.md` (a report titled "Answers" for a survey, an **Answers** section for a quiz) or `--json` (each ungraded question has `status`, `response` and a readable `answer_text`). Not supported: branching or skip logic, answers from several people, required answers (the page only warns about unanswered questions on submit).

## Collect answers directly

`quiz serve FILE.md|FILE.html [--out results.json] [--once] [--timeout 1800] [--open] [--port 0] [--autosave progress.json] [--json]` serves the page on 127.0.0.1 and writes the results when the respondent presses Finish or Submit, then (with `--once`, the default when stdout is not a terminal) exits 0; exit 2 on timeout. The file is `<quiz-id>-results-<timestamp>.json` beside the source and is never overwritten. If sending fails the page tells the respondent to use Export answers. `--autosave` keeps an attempt in progress in the given file, so it resumes after the server or the browser closes; the file is deleted on submit.

## Review a quiz an agent wrote

The risk in an agent-written quiz is a wrong answer key, or a question that is not in your material. `quiz review quiz.md [--out review.json] [--since review.json] [--once] [--open] [--timeout 1800] [--json]` serves a review form: one card per question, showing the question as it is rendered, its answer key, explanation, points, tags and source line. The learner chooses **Keep**, **Fix** (what should change?) or **Drop** (why?), may tick problems (`key-wrong`, `not-in-material`, `unclear`, `too-easy`, `too-hard`, `duplicate`) and add a note. Cards with no verdict count as not reviewed. **Finish** writes `review.json` beside the quiz (never over an existing file: `review-2.json`; with `--out` or `--since` it is merged into that file). `--since review.json` asks only about questions that are new or changed since that review.

`quiz check quiz.md --review review.json` then fails (exit 1) while a flagged question is still wrong:

| Rule | Level | When |
|---|---|---|
| `review.drop` | error | a question marked drop is still in the quiz |
| `review.fix` | error | a question marked fix is unchanged (the message has the reviewer's text) |
| `review.key-wrong` | error | `key-wrong` is ticked and the question is unchanged, whatever the verdict |
| `review.changed` | info | a fix question changed; re-review it with `--since` |
| `review.unreviewed` | warning | no verdict, or the question changed after it was kept |

Questions match review items by id first, then by a hash of their source block, so a review survives reordering. Add `{id=...}` to the headings: without them a review finds a question again only by its text. `quiz inspect quiz.md --review review.json` shows the counts. Only `quiz review` writes `review.json`; never edit it by hand. A terminal form (`--tui`) is not built yet.

## Brief a quiz before an agent writes it

`quiz brief DIR [--purpose ...] [--scope ...] [--count N] [--minutes N] [--mix ...] [--difficulty ...] [--mode ...] [--weak-topics yes|no] [--language en|vi] [--kinds ...] [--elsewhere ...] [--request ...] [--web] [--accept-defaults] [--json]` writes `DIR/brief.yaml` and `DIR/content/` (with a README) for an agent to read. It does not write the quiz. Every flag is also a question in the form that `--web` serves (`--no-open` prints the address instead of opening the browser). `--tui` exits 2: the terminal form is not built yet.

- **Human-only values:** `purpose` (self-study, exam-prep, classmates, survey) and `scope` (which chapters, lectures or topics). When either is missing and no form was asked for, nothing is written and the exit code is 3; `--json` lists what is missing and the form command. `--accept-defaults` hands `purpose` over (default `self-study`, recorded as `decided_by: agent`) but never `scope`: it has no default.
- Everything else has a default (20 questions, no time limit, mix `recall,understanding`, difficulty `like-the-exam`, feedback `at-the-end`, language `en`). `decided_by` in `brief.yaml` says for each value whether the user, the default or the agent decided it. `quiz brief` never overwrites an existing `brief.yaml`.
- **Material:** put the files in `content/` and tick their `--kinds` (`lecture-slides`, `textbook`, `notes`, `past-exams`, `lab-manual`, `other` with `--kinds-other TEXT`). Material that lives elsewhere goes in `--elsewhere`. Past exams are mirrored in structure: types, split of marks, length.
- **Weak topics:** if the folder holds results files (`*-results-*.json`) of a quiz, `weak_topics` defaults to yes and `focus_tags` lists the topics under 80% in the latest attempt (the data of `quiz stats`, at most three).
- The last line says what to tell Claude: `Next: tell Claude: "Write the quiz in DIR (brief.yaml is ready)."`
- **`quiz check` reads the brief.** With a `brief.yaml` beside the quiz it adds warnings: `brief.count` (the question count is outside 20% of `count`), `brief.mix` (a kind of question in `mix` is missing), `brief.past-exams` (past exams are ticked but no question has a `Source:` note) and `brief.content-kinds` (a ticked kind has no matching file in `content/`).

## Keep a library

To keep your own quizzes and results in one folder under git, register the finished file with `quiz library register quiz.md` instead of handing out a build; see `quiz agent-guide` (Job 4) and the user guide.

## Math, code, media

- Math: `$inline$` and `$$display$$` anywhere Markdown is allowed (also in choices, labels and explanations), never inside code.
- Code: fenced blocks with a language are highlighted.
- Images: `![alt text](assets/chart.png)`, path relative to the quiz file; png, jpg, gif, webp, svg. Always write alt text.
- Audio: same syntax with mp3, ogg, wav or m4a; the alt text becomes the caption.
- Video and remote URLs are not supported.

## Common mistakes

- An unquoted title with a colon and a space inside it (YAML error): write `title: "Part 1: Limits"`.
- Using `###` headings: only `#` (section) and `##` (question) are allowed.
- No `[x]` in a choice question, or two `[x]` in a `single`.
- A missing `answer` block (numeric, short, truefalse, fields, code) or an `answer` block on a choice, blanks, ordering or matching question.
- Regex with lookbehind or named groups.
- A `[x]` in a survey or in a `graded=false` choice question (there is no correct choice), or an `answer` block on an ungraded `short`.
- `graded=false` on a `numeric`, `truefalse`, `blanks`, `matching` or `code` question: only `single`, `multi`, `short`, `fields`, `essay`, `ordering` and `scale` can be ungraded.
- `[[...]]` in a question that is not `type=blanks`, or inside `$...$`.
- Putting the answer in the question text.
- `{input}` anywhere but the end of a `- [ ]` choice of a `single` or `multi` question, or `{input=What is it?}` without double quotes: write `{input="What is it?"}`.
- A rubric line such as `- Name: detail` is fine; a description with another colon-and-space inside is not (quote the line).

## Writing good questions

- One concept per question; mix types; plausible distractors; keep a numeric answer unambiguous (give units and tolerance).
- Cite the source page or section in the explanation where possible, but also say *why* the answer is right and what the wrong ones get wrong. "Slide 23." is not an explanation.
- Pick the type by what you test:
  - `single` for one fact or a judgment; `multi` for "which of these apply" (4-6 options, 2-3 right).
  - `truefalse` only for statements with one clear reading; avoid absolutes like "always" as a cue.
  - `ordering` for a process or pipeline; `matching` for term-to-definition or part-to-function pairs (add a `:: distractor` to stop elimination).
  - `numeric`, with `unit` and a tolerance, for calculations; `blanks` for definitions and code gaps; `short` for one recalled word (list every spelling).
  - `essay` or `code` only when judgment is needed, always with a concrete rubric of 3-5 lines.
- Distractors: real misconceptions, off-by-one values, near-synonyms. Keep options about the same length; the longest option is picked more often. Avoid "all/none of the above".
- Points: 1 for recall, 2 for a multi-step or multi-part question, more for essays. Tag every question (`tags=`); the tags drive the per-topic report.
- For lecture slides or a PDF: render the pages to images and read them (the figures hold facts the text does not), tag by lecture section, and check coverage with `quiz inspect` (questions and points per section and tag).
- `quiz check` also warns about weak questions: a missing or one-line explanation, duplicate choices, "all/none of the above", a correct option much longer than the rest, a question that already contains the answer, and a correct answer that sits in the same position too often. Fix the warnings, or use `--strict` in CI.
- Run `quiz check` until there are no errors, then `quiz build --open`.
