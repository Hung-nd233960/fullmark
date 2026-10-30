# Quiz syntax

**Status: settled (2026-10-27).** It will be proven by the parser and by every guide example passing `check`; a change found then is made here first. How a quiz is written in Markdown for fullmark 1.0. It starts from 0.10.2's authoring guide and changes what the 1.0 design needs; the changes are listed in [section 11](#11-changes-from-0102). 1.0 reads no 0.x quiz, so nothing here has to stay compatible. `quiz guide` is written from this document, and every example in the guide is a `quiz-example` block that passes `check` ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), seams).

Each field is marked **S** (structure) or **C** (content). `quiz new --skeleton` keeps every structure field and empties every content field ([section 9](#9-structure-and-content)), so the skeleton rules follow from these marks and need no list of their own.

## 1. A quiz file

- One UTF-8 Markdown file: YAML front matter, then optional `#` sections, then `##` questions. `###` and deeper headings are errors.
- Assets (images, audio) sit in the quiz's folder or below it and are referenced by a path relative to the file that names them (the quiz file, or a `materials` sheet), matching the file's letter case exactly, so a quiz that passes on Windows also works on Linux and macOS. A path that leaves the quiz folder is a fixed-rule error (`asset.outside`).
- No raw HTML (`markdown.raw-html`); the extensions in [section 8](#8-markdown-inside-a-quiz) cover what HTML was used for. An HTML comment is raw HTML too.
- Hashes are taken over normalised text (LF, NFC, no BOM, trailing whitespace trimmed), so line endings and editors do not split a quiz's history.

````markdown
---
title: "Signals: the Laplace transform"
lang: en
time_limit: 45m
---

# Definitions {time=10m}

Answer every question in this part.

## Which region of convergence makes $\frac{1}{s+2}$ causal? {type=single points=2 tags=roc id=roc-causal}

- [ ] $\operatorname{Re}(s) < -2$
- [x] $\operatorname{Re}(s) > -2$
- [ ] all $s$

::: explanation
A causal signal's ROC is a right half-plane, to the right of the rightmost pole at $s = -2$.
:::
````

## 2. Front matter

Unknown keys are errors.

| Key | Values | Default | S/C |
|---|---|---|---|
| `title` | text (required). Quote it if it holds a colon followed by a space | | C |
| `description` | Markdown, shown on the start screen | none | C |
| `id` | slug used in results and page storage | the file name, slugged | C |
| `kind` | `quiz` \| `survey` (every question ungraded, no score; [section 7](#7-ungraded-questions-and-surveys)) | `quiz` | S |
| `lang` | `en` \| `vi`: the language the quiz is **written in**. It decides how numbers in answers are read (a decimal comma in `vi`), `lang` on the question text, and the language a grader writes feedback in. One quiz has one language | `en` | S |
| `ui_lang` | `en` \| `vi`: the language of the **interface**: page chrome, report headings, printed labels, the `review` and `grade --web` forms. Never affects grading | `lang` | S |
| `profile` | a built-in or custom check profile | `default` (`survey` for a survey) | S |
| `time_limit` | `90s`, `45m`, `1h30m`. When it runs out the page submits; there is no soft limit (`on_timeout` was dropped on 2026-10-29 and is `syntax.unknown-key`) | untimed | S |
| `feedback` | `end` \| `instant`. With `instant`, each auto-graded question has a Check button that shows its result and explanation and locks the answer; Submit still grades everything ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md) section 8, "Instant feedback") | `end` | S |
| `pass_mark` | 0 to 100, percent of auto-graded points; shown on the results card as the goal. A quiz made from a brief takes it from the brief's `commitment` | none | S |
| `shuffle_questions`, `shuffle_choices` | `true` \| `false` | `false` | S |
| `partial` | `true` \| `false`: partial credit in `multi`, `ordering` and `matching`. `blanks` and `fields` always give partial credit (an equal share per blank, or each field's points) and ignore it | `true` | S |
| `theme` | `auto`, `light`, `dark`, `oled`, `white`, `paper` | `auto` | S |
| `font` | `system`, `sans`, `serif`, `readable` | `system` | S |
| `look` | `free` \| `locked` | `free` | S |
| `tags` | list, describing the whole quiz | none | S |
| `generated_by` | the exact model id that wrote this version, one line | none | C |
| `materials` | a list of Markdown files, relative paths inside the quiz folder: sheets (formula tables, identities, constants) the learner can open at any time, also printed after the paper | none | C |

**Materials.** Materials are the sheets an exam hands out: a formula table, constants, a z-table. They travel inside the page, the printed paper and the library with the quiz and are covered by its hash, so everyone who takes a shared quiz works from the same sheet, never from their own version of it. They are not for open-book material: the learner's own notes stay outside the quiz, on paper or in another window. A sheet is ordinary Markdown, with maths, tables and images, and holds no questions. It starts with one `#` heading, its name in the page (`materials.heading`); `##` to `######` headings may follow, as in any Markdown file. A sheet holds no `:::` containers (`syntax.container`): hints, explanations and passages belong to questions and sections. Keep sheets in a subfolder (`materials/formulas.md`), as images sit in `assets/`, so a glob such as `signals/*.md` never takes a sheet for a quiz. The quiz's `materials:` list is the only thing that makes a file a sheet: a sheet has no front matter and no marker, and `check` and `build` reach it only through the quiz that lists it, reporting its problems at the sheet's own path and line. It is rendered at build, in the order listed, and the quiz hash covers it like an asset, so editing a sheet makes a new version. A sheet's image paths are relative to the sheet's own folder, as Markdown previews read them, and must stay inside the quiz folder: from `materials/formulas.md`, the quiz's shared images are `../assets/z-table.png`. One `assets/` folder for questions and sheets alike is the layout the guide and templates show; any other folder inside the quiz folder works. Sheets follow the asset rules (inside the quiz folder, no URLs) and the Markdown rules of [section 8](#8-markdown-inside-a-quiz), except that `##` to `######` headings are allowed. A sheet can give away an answer; the author decides what it holds. How the page and the paper show them: TECHNICAL_DESIGN.md, section 8.

## 3. Sections

A `#` heading starts a section. A quiz with no `#` heading is one section without a title, and the page shows no section list.

Nothing but blank lines may come between the front matter and the first heading (`syntax.preamble`). A text for the whole quiz goes in `description`, which the start screen shows; a text for a section goes in its intro. One place each. In a quiz that has sections, a question before the first `#` is `syntax.preamble` too: every question belongs to a titled section, or none does.

A quiz without `#` headings has one untitled section whose `id` is empty. A title whose slug is empty (`# 日本語`) needs an explicit `id=` (`syntax.value`).

```markdown
# Part 2: Reading {id=reading time=20m pick=5}
```

| Attribute | Meaning | S/C |
|---|---|---|
| title | the heading text | S |
| `id` | the section's slug, used by `--section`, links (`#reading/q12`) and results. Default: the title, slugged (`đ` maps to `d`) | S |
| `time` | a suggested time. The page shows it next to the section with the time spent there; nothing locks when it passes. The quiz's `time_limit` is the only hard limit (and, later, each paper of a bundle: [proposals/multi-quiz-bundle.md](proposals/multi-quiz-bundle.md)) | S |
| `pick` | a bank: each attempt draws this many of the section's questions | S |

**The intro** is the Markdown between the `#` heading and the first `##`. Instructions ("Answer every question in this part") are structure.

**A passage** is the text several questions share: a reading text, a case, a data table. It goes in a `::: passage` container in the intro and is content. A section has at most one; two short texts go in one passage.

```markdown
# Part 2: Reading {id=reading}

Read the text, then answer questions 6 to 10.

::: passage
The Fourier transform was first used to solve the heat equation...
:::
```

In v1 a passage renders in place, above the section's questions. The container exists so that a later side-by-side layout (IELTS and JLPT reading: [proposals/japanese-support.md](proposals/japanese-support.md)) needs no change to the syntax.

**Banks** are per section only. To draw from the whole quiz, put the questions in one section.

## 4. Questions

A `##` heading starts a question. The heading text is the question's prompt; Markdown between the heading and the answer is more of the prompt (paragraphs, lists, code, images, maths). Attributes go in `{…}` at the end of the heading:

```markdown
## Evaluate $\int_0^1 x^2\,dx$. {type=numeric points=2 tags=integrals id=int-x2 source="Lecture 4, slide 12"}
```

### Where attributes start and end

The same rule holds for a section heading, a question heading and `{input}` on a choice. (An image's `{width=…}` is different: it follows the image's `)` directly.)

1. **The block is the last `{` on the line that is outside maths and code and not escaped, up to the `}` that ends the line** (trailing spaces ignored). Braces in `$\frac{1}{s+2}$` or in `` `f{x}` `` are never a block.
2. **Every question heading has one,** since `type` is required, so a heading is never read as a prompt that happens to end in braces.
3. **A literal `{` at the end of a prompt is escaped** as `\{`, or written inside maths (`$\{1, 2\}$`).
4. **Inside the block:** pairs `name=value` separated by spaces. A value with a space, `=`, `{`, `}` or `"` is double-quoted, and inside quotes `\"` and `\\` are the only escapes. `input` alone, without a value, is the one bare name.
5. **No guessing:** a trailing block that does not parse, an unknown name or a name given twice is an error (`syntax.attributes`, `syntax.unknown-key`), never read as text.

| Attribute | Meaning | Default | S/C |
|---|---|---|---|
| `type` | one of the types in [section 6](#6-question-types). Required | | S |
| `points` | a number greater than 0 | `1` | S |
| `tags` | comma-separated, no spaces | none | S |
| `id` | the question's identity across versions. Required; `quiz ids` writes it ([below](#ids)) | | C |
| `source` | where in the material the question comes from, quoted | none | C |
| `graded` | `false` makes this question ungraded ([section 7](#7-ungraded-questions-and-surveys)) | `true` | S |
| `shuffle` | overrides `shuffle_choices` | | S |
| `partial` | overrides `partial` | | S |
| `case` | `sensitive` \| `insensitive`, for `short`, `blanks` and `fields` | `insensitive` | S |
| `check-ignore`, `because` | `check-ignore="choice.correct-longest" because="the long answer is the point"`. The reason is required; several rules are comma-separated and share it | | S |

### Ids

An id is how fullmark knows that a question in a new version is the same question as before. Results, `--missed`, `stats`, reviews, grades, replay, autosave and survey answers all follow it; if an id changes, that question's history starts over.

- **Required on every question.** Nothing is derived from position (which shifts on every insertion) or from content (which changes on every typo fix).
- **Nobody has to invent one.** Leave `id` out while writing, then run `quiz ids FILE` ([COMMANDS.md](COMMANDS.md)): it gives every question without an id a random one such as `id=q-k7m2qx` and changes nothing else. It never changes an id that exists, so it is safe to run at any time. The randomness happens once, in that command; builds and grading stay deterministic.
- **Hand-written ids are welcome** (`id=roc-causal`). Format: lowercase letters, digits and `-`, starting with a letter, at most 64 characters.
- **Unique within the quiz** (`question.id-duplicate`). A copied question keeps its id: delete it from the copy and run `quiz ids` again.
- **The id lives in the file you edit.** `library register` reads it and never stamps one, or the next `register --update` would see new ids and break every history.
- **Changes stay visible.** Each question also has a content hash, so a question edited since it was missed is marked as changed; the id keeps its identity.

**Section ids** are slugged from the title unless `id=` is given. Two sections with the same id are an error (`section.id-duplicate`), never given a suffix, since a suffix would depend on order.

### Type

**Every question states its `type`.** Nothing is guessed or defaulted, so a forgotten type is reported as a missing `type`, not as a question that does not fit the type it was assumed to be, and the type can be read off the heading. A `single` has exactly one `[x]` (none when ungraded). Checkboxes need `type=multi`, even when only one choice is right.

## 5. Hints, explanations and answers

Containers, written the same way everywhere:

```markdown
::: hint
Hidden behind a "Hint" button.
:::

::: explanation
Shown after Check (instant feedback) or after Submit. Say why the answer is right and what the wrong ones get wrong.
:::
```

Both are content. A question has at most one of each.

**Order in a question:** the prompt, then the answer (the choices, list or `answer` block; for blanks the prompt holds the answer), then the hint and the explanation in either order. Nothing else may follow the answer (`question.trailing-text`). The choices are the last list before the hint or explanation; a list inside the prompt that comes right before them uses a different bullet (`*`), or Markdown joins the two into one list.

**Answers** are written in the question's body for choices, blanks, ordering and matching, and in a fenced `answer` YAML block for every other type. Inside an `answer` block, keys that give the key (`value`, `accept`, `sample_answer`...) are content; keys that shape the question (`unit`, `min_words`, `language`, `rubric`...) are structure. Each type below says which.

## 6. Question types

### single and multi

```markdown
## Which ion drives phase 3 repolarization? {type=single}

- [ ] Na⁺
- [x] K⁺
- [ ] Ca²⁺
```

```markdown
## Which of these are LTI operations? {type=multi}

- [x] Convolution with a fixed kernel
- [ ] Squaring the signal
- [x] Differentiation
```

Every item needs `[ ]` or `[x]` (`[X]` is the same). A choice may hold a fenced code block indented two spaces under it, with or without text before it. On a choice, a trailing `{…}` is an input block only when it starts with `input`; any other ending in braces, such as `{1, 2}`, is the choice's text. Choice text and `[x]` are content; the number of choices is structure.

**Follow-up text on a choice:** end a choice with `{input}` or `{input="What is it?"}` to ask for a few words when it is picked. It never changes the score. It works on `single` and `multi`, graded or not.

### truefalse

````markdown
## Every differentiable function is continuous. {type=truefalse}

```answer
value: true
```
````

### numeric

````markdown
## The pole of $H(s) = \frac{1}{s+2}$ is at $s = $ {type=numeric}

```answer
value: -2          # or values: [2, -2]
tolerance: 0.01    # absolute; or rel_tolerance: 0.01. Not both. Default 0
unit: ""           # shown after the box
```
````

- In the source, numbers use a decimal point, whatever the quiz's `lang`. `value`, `values` and the tolerances take the same forms as a learner's answer, read by the same function: an integer, a decimal, `1e-3` or a fraction (`value: 1/3`). With a fraction and no tolerance, `1/3` and `0.333333333333` match and `0.33` does not.
- The learner may type an integer, a decimal, `1e-3` or a fraction `1/3`. With `lang: vi`, a decimal comma (`2,5`) is accepted too, and `1,000` is never read as a thousands separator. With `lang: en`, the box says at once that a comma is not a decimal point, so `2,5` is never silently marked wrong.
- This follows `lang`, never `ui_lang`: the score depends only on the quiz source and the answers, never on how the page was built.
- `value`, `values` and the tolerances are content; `unit` is structure.

### short

````markdown
## Which rule differentiates a composition? {type=short}

```answer
accept: ["chain rule", "the chain rule"]
patterns: ['^chain( rule)?$']   # optional, full match
```
````

Matching trims, collapses spaces, applies NFC and ignores case unless `case=sensitive`. Case-folding is the same in the page and in `grade`, `Đ` included. Regexes must be valid in JavaScript's `u` mode: no lookbehind, no inline flags. `accept` and `patterns` are content.

### blanks

```markdown
## Complete the rules. {type=blanks points=2}

The derivative of $\sin x$ is [[cos x|cos(x)]] and half of one is [[=0.5±0.01]].
```

- `[[answer|variant]]` is a text blank; `[[=0.5±0.01]]` a numeric one. `+-` is the same as `±` (`[[=0.5+-0.01]]`), for keyboards without it.
- Blanks may be in the heading or the body (paragraphs, lists, quotes, table cells), and inside fenced code; never inside maths, link text or an image's alt text (`blanks.syntax`). In a table cell, the `|` between variants is written `\|` (`[[cos x\|cos(x)]]`), as Markdown asks for any `|` in a cell.
- `\[[` is a literal `[[`, not a blank.
- Points are split equally among blanks. No `answer` block.
- The answers are content; the number of blanks is structure.

### fields

````markdown
## Let $f(x) = x^3 - 3x$. {type=fields points=4}

```answer
fields:
  - label: "$f'(x)$ ="
    accept: ["3x^2-3", "3x^2 - 3"]
    points: 2
  - label: "Number of critical points"
    value: 2
    points: 2
  - label: "Notes (not graded)"
```
````

A field takes the keys of `numeric` or of `short`, not both, and needs a `label`. A field with neither is ungraded and carries no points. A graded `fields` question needs at least one graded field.

**Points are absolute.** Either every graded field has `points` and they add up to the question's `points`, or no field has them and the question's points are split equally among the graded fields. Anything else is an error (`fields.points`), as an additive rubric that does not add up is (`rubric.sum`). Labels and points are structure; keys are content.

### ordering

```markdown
## Put the steps in order. {type=ordering points=2}

1. Check the base case.
2. Assume the claim for $n = k$.
3. Prove it for $n = k + 1$.
```

Written in the correct order; the page shows it shuffled, never in the right order. At least two items, no duplicates. With `partial`, each item in its right place earns an equal share.

### matching

```markdown
## Match each transform to its domain. {type=matching points=3}

- Laplace :: continuous time
- Z :: discrete time
- DTFT :: discrete time, on the unit circle
- :: frequency only
```

`left :: right`; a bullet that starts with `::` adds a distractor. At least two pairs, unique right-hand items. With `partial`, scored per pair. The page always shows the right-hand items (distractors included) shuffled, never in source order, whatever `shuffle_choices` says, so the answers never sit opposite their left items.

### essay

````markdown
## Explain why the ROC of a causal system is a right half-plane. {type=essay points=6}

```answer
min_words: 120
max_words: 0          # 0 = no maximum
rubric:
  mode: additive
  criteria:
    - Defines causality in time (1 pts)
    - Links causality to the Laplace integral's convergence (3 pts)
    - Concludes about the poles (2 pts)
sample_answer: |
  A causal signal is zero for t < 0, so...
```
````

- Never auto-graded: the report hands the answer and rubric to a grader ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 6).
- `sample_answer` is the model answer. The page shows it after Submit, under the learner's answer, as it shows an explanation; leave it out to show nothing. `review` shows it, and `build --print --answers key` prints it with the rubric.
- `min_words`, `max_words` and `rubric` are structure; `sample_answer` is content.

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
  - Correct for every non-empty slice
  - Does not panic on a one-element slice
  - Idiomatic iterator use
sample_answer: |
  fn largest(v: &[i32]) -> i32 { *v.iter().max().unwrap() }
```
````

The answer is exported, never run. `language` and `rubric` are structure; `starter` and `sample_answer` are content. The page shows `sample_answer` after Submit, as for an essay.

### scale

````markdown
## How confident are you with Fourier transforms? {type=scale}

```answer
min: 1          # default 1
max: 5          # default 5; max - min from 1 to 10
labels:
  1: Not at all
  5: Very confident
```
````

Always ungraded. All its keys are structure.

### Rubrics

The rubric syntax is defined with the grading model in [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 6: a list of bullets (`holistic`, the default), or `mode: additive | banded` with `criteria`, the `(0.5 pts)` shorthand, explicit `id`s, `scale`, `weights`, `round`, or `preset: ielts-writing-task1 | ielts-writing-task2`. `show_rubric` (default `true`, a key of the `answer` block beside `rubric`) shows the criteria on the page before submit. A rubric of the wrong shape is `syntax.value`, and an unknown key in it `syntax.unknown-key`; the `rubric.*` rules check that a well-formed rubric is consistent. A rubric is structure and is kept whole by `--skeleton`.

## 7. Ungraded questions and surveys

- `graded=false` makes one question ungraded inside a quiz: no score, no right or wrong, never sent to a grader.
- `kind: survey` makes every question ungraded; the page shows no score, and the button reads **Finish**.
- `scale` is always ungraded.

| Type | Ungraded | What to write |
|---|---|---|
| `single`, `multi` | yes | choices with no `[x]` |
| `short` | yes | no `answer` block |
| `fields` | yes | fields with only a `label` |
| `essay` | yes | `answer` optional, no `rubric` |
| `ordering` | yes: a ranking, shown in the written order | the usual list |
| `scale` | always | |
| `truefalse`, `numeric`, `blanks`, `matching`, `code` | no: error | |

In a survey, `[x]`, `pass_mark`, `pick`, `feedback: instant` and `partial` are errors, and `graded=` is not allowed. `points=` on an ungraded question is a warning and is ignored.

## 8. Markdown inside a quiz

| Need | Syntax |
|---|---|
| maths | `$inline$`, `$$display$$`, anywhere text is allowed (choices, labels, explanations), never in code |
| code | fenced blocks with a language, highlighted |
| image | `![alt text](assets/chart.png)`, optionally `{width=300}`. Alt text is required. png, jpg, gif, webp, svg |
| audio | `![Track 1](track1.mp3)`: an audio player; the alt text is the caption. mp3, ogg, wav, m4a |
| subscript, superscript | `H~2~O`, `m^2^` |
| highlight, underline | `==NOT==`, `++NOT++` |
| line break in a table cell | a trailing `\` |
| hint, explanation, passage | `::: hint`, `::: explanation`, `::: passage` |

Video and remote URLs are not supported. An image without alt text is `asset.alt`.

**Markdown edge cases**, decided so that every parser agrees:

- Only ATX headings (`#`, `##`) count. An underlined (setext) heading is text.
- A heading inside a `:::` container is the container's content, not a question.
- Containers do not nest. A stray closing `:::` or an unclosed container is `syntax.container`; an unclosed one ends at the next heading, so the questions after it still parse.

## 8a. Errors

Every rule below is a **fixed rule**: an error that no profile can change or ignore ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 5). The ids are a contract that agents and scripts match on, so a rule is never renamed.

- **One mistake, one rule.** When a specific rule and a general one both match the same mistake, only the specific one is reported: an unquoted `{input=…}` prompt is `choice.input`, not `syntax.attributes`; a missing file is `asset.missing`, not `asset.type`.
- **Lines.** An issue reports the line of the offending key, attribute, item or blank (a rubric problem with one criterion, such as its weight or step, reports that criterion's line). A problem with a whole question or section (a missing `type`, too few choices, an `answer` block that is missing or not allowed) reports its heading line; a conflict between two keys reports the first of them. A YAML error reports the line the YAML parser gives. A problem with the whole quiz (`quiz.empty`) reports line 1.

 Quality rules (`choice.correct-longest`, `explanation.short`...) are in TECHNICAL_DESIGN.md.

| Rule | When |
|---|---|
| `syntax.front-matter` | no front matter, front matter whose YAML does not parse, or no `title`. With no front matter at all, the message adds that a materials sheet is checked through the quiz that lists it |
| `syntax.yaml` | an `answer` block whose YAML does not parse |
| `syntax.preamble` | text between the front matter and the first heading, or a question before the first `#` in a quiz that has sections |
| `quiz.empty` | a quiz with no questions |
| `syntax.unknown-key` | an unknown front-matter key, attribute or `answer` key |
| `syntax.value` | a value outside its allowed set or range (`feedback: sometimes`, `points=0`, `time_limit: soon`) |
| `profile.unknown` | a `profile:` that is neither built in nor in the config |
| `syntax.attributes` | a `{…}` block that does not parse, or a name given twice |
| `syntax.heading-level` | a `###` or deeper heading |
| `syntax.container` | an unknown, unclosed, nested or stray `:::` container, one in the wrong place (`passage` outside a section intro), or a second passage in a section |
| `markdown.raw-html` | any HTML tag or comment |
| `asset.missing`, `asset.outside`, `asset.type`, `asset.remote` | a missing file (or one whose letter case differs from the path's: the fix names the file as it is), a path outside the quiz folder, an unsupported format, a URL. Checked in that order of precedence: remote, outside, missing, type |
| `asset.alt` | an image without alt text |
| `materials.missing` | a `materials` file that does not exist (a path outside the folder or a URL is `asset.outside` or `asset.remote`) |
| `materials.heading` | a sheet that does not start with a `#` heading, or has a second `#` heading |
| `materials.question` | question syntax in a sheet: a `{type=…}` attribute, a choice list with `[x]` or `[ ]`, an `answer` block, or a blank `[[…]]` (it would never be scored; write a worked example as text. Sample questions: [proposals/sample-questions.md](proposals/sample-questions.md)) |
| `theme.unknown`, `theme.unknown-font` | a theme or font fullmark does not have |
| `section.id-duplicate` | two sections with the same id |
| `section.pick` | `pick` below 1 or above the section's question count |
| `question.type-missing` | a question without `type` |
| `question.id-missing` | a question without `id`. The fix names the command: `quiz ids FILE` |
| `question.id-duplicate`, `question.id-format` | two questions with one id; an id that is not a valid slug |
| `question.prompt-empty` | a heading with no prompt text |
| `question.container-twice` | two hints or two explanations on one question |
| `question.answer-block` | an `answer` block missing where the type needs one, or present where it takes none |
| `question.trailing-text` | anything after the answer other than a hint or an explanation |
| `question.ungraded` | a type that cannot be ungraded, made ungraded by `graded=false` or by `kind: survey` ([section 7](#7-ungraded-questions-and-surveys)); or `graded=` on a `scale` |
| `question.ungraded-key` | an answer key or rubric on an ungraded question: `[x]`, `value`, `values`, `accept`, `patterns`, `rubric` |
| `choice.marker` | a choice without `[ ]` or `[x]` |
| `choice.count` | fewer than two choices |
| `choice.correct-count` | a graded `single` without exactly one `[x]`, or a graded `multi` with none |
| `choice.input` | `{input}` anywhere but the end of a choice, an unquoted or empty prompt |
| `numeric.value` | no `value` or `values`, both, a number that does not parse, both tolerances, a negative tolerance |
| `short.key` | a graded `short` with neither `accept` nor `patterns` |
| `short.regex` | a pattern that is not valid in JavaScript's `u` mode, in `short` or in a field |
| `blanks.none`, `blanks.outside`, `blanks.in-math`, `blanks.syntax` | a `blanks` question without blanks, `[[…]]` in another type, inside maths, or malformed or inside link text or an image's alt text |
| `math.syntax` | maths between `$` signs (inline or display, in a question, in the strings of an `answer` block that the page renders such as field and scale labels, rubric criteria and `sample_answer`, or in a materials sheet) that KaTeX cannot parse; the message is KaTeX's own |
| `fields.empty`, `fields.key`, `fields.points` | no fields, or a graded question with no graded field; a field with both numeric and text keys; points that are mixed or do not add up |
| `ordering.items` | fewer than two items, or duplicates |
| `matching.pairs` | fewer than two pairs, a bullet without `::`, an empty right-hand side (`a ::`), or a right-hand item used twice |
| `essay.words` | `min_words` above a non-zero `max_words` |
| `scale.range` | `max - min` outside 1 to 10, or a label outside the range |
| `code.language` | a `code` question without `language` |
| `rubric.*` | the rubric rules of TECHNICAL_DESIGN.md, section 6 |
| `survey.forbidden` | in a survey: `pass_mark`, `pick`, `feedback: instant`, `partial` or `graded=` (an `[x]` is `question.ungraded-key`) |
| `ignore.invalid` | `check-ignore` without `because`, `because` without `check-ignore`, or naming a fixed or unknown rule |

One quality rule belongs here because the syntax raises it: `question.points-ignored` (warning) for `points=` on an ungraded question.

## 9. Structure and content

`quiz new --skeleton` keeps every **S** field above and empties every **C** field:

- Front matter: kept, except `title`, `description`, `id` and `generated_by`, which are emptied (`title` to a placeholder).
- Sections: titles, ids, times, picks and instructions kept; passages emptied.
- Questions: heading attributes kept except `id` and `source`; the prompt, hint and explanation emptied.
- Answers: the shape is kept (the number of choices with every `[x]` cleared, the number of blanks, fields and their labels, the length of an ordering or matching list), the key is emptied.
- Rubrics: kept whole.
- Banks: the `pick` count kept, every question in the bank blanked.

A skeleton fails `check` by design, with one error per empty field, which is the author's to-do list. Once the questions are written, `quiz ids` gives them new ids, so no history from the source quiz is carried over.

## 10. Reserved

No key is reserved: an unknown key is already `syntax.unknown-key`, so a later version can give a name meaning without changing what a v1 quiz says. (`reference`, once reserved, is now an unknown key like any other; `syntax.reserved` is retired.) Planned, with its v1 behaviour:

| Name | For | v1 behaviour |
|---|---|---|
| `::: passage` layout | side-by-side reading layout | renders in place |

## 11. Changes from 0.10.2

| 0.10.2 | 1.0 | Why |
|---|---|---|
| `mode: quiz \| survey` | `kind: quiz \| survey` | the name the library and its JSON use |
| `> [!hint]`, `> [!explanation]` | `::: hint`, `::: explanation` | one container syntax for hint, explanation and passage; no blockquote rules for markdownlint to trip (MD028) |
| One `[x]` gives `single`, several give `multi` | `type` is required on every question | the type never depends on the answer, and a forgotten type is reported as such |
| `multi_scoring: partial \| all_or_nothing` | `partial: true \| false`, also per question | it applied to `ordering` and `matching` too |
| `pick` in the front matter or on a section, not both | on a section only | one place, one rule |
| `{time=10m}` on a section was a suggestion | still a guide, now shown with the time spent | one hard limit (`time_limit`); hard limits on parts of an exam come from bundles |
| `theme: auto \| light \| dark` | six themes, `font`, `look` | TECHNICAL_DESIGN.md, section 8 |
| — | `lang` (written in), `ui_lang` (interface), `profile` | grading follows the quiz's language, the chrome can differ; check profiles |
| `[[=0.5±0.01]]` | also `[[=0.5+-0.01]]` | `±` is not on most keyboards |
| default question id `q1`, `q2`... | `id` required; `quiz ids` writes random ones (`q-k7m2qx`) where missing | ids by position broke on every insertion, and ids from content would break on every typo fix |
| a numeric `value` was a decimal | also a fraction (`1/3`), read by the same function as the learner's answer | exact answers without a tolerance; one number reader |
| a field's `points` was a weight | absolute points that add up to the question's, or none and an equal split | no hidden scaling, the same rule as an additive rubric |
| — | section `id`, slugged from the title | `--section` and links |
| `Source:` as a note in the explanation | `source="..."` on the heading | custom checks can `require` it |
| `sample_answer`, `show_sample` (essay); `reference`, `show_reference` (code) | `sample_answer` for both, always shown after Submit | one name for the model answer, and no switch: present means shown, like an explanation; `reference` would read as the reference sheets, which are `materials` |
| `scoring: points \| band`, rubric as a list of strings | rubric modes, criterion ids, presets | TECHNICAL_DESIGN.md, section 6 |
| A comma decimal is rejected | accepted as a decimal comma when `lang: vi` | Vietnamese writes `2,5` |
| HTML comments shown as text | `markdown.raw-html` error | no raw HTML, said once |
| — | `check-ignore`, `because` | inline ignores with a reason |
| — | `::: passage` | shared texts, and the seam for a reading layout |

## 12. Left to proposals

- **Japanese** (furigana, `lang="ja"` spans): left to [proposals/japanese-support.md](proposals/japanese-support.md); nothing here blocks it.
