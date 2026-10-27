# Quiz syntax

**Status: settled (2026-10-27).** It will be proven by the parser and by every guide example passing `check`; a change found then is made here first. How a quiz is written in Markdown for fullmark 1.0. It starts from 0.10.2's authoring guide and changes what the 1.0 design needs; the changes are listed in [section 11](#11-changes-from-0102). 1.0 reads no 0.x quiz, so nothing here has to stay compatible. `quiz guide` is written from this document, and every example in the guide is a `quiz-example` block that passes `check` ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), seams).

Each field is marked **S** (structure) or **C** (content). `quiz new --skeleton` keeps every structure field and empties every content field ([section 9](#9-structure-and-content)), so the skeleton rules follow from these marks and need no list of their own.

## 1. A quiz file

- One UTF-8 Markdown file: YAML front matter, then optional `#` sections, then `##` questions. `###` and deeper headings are errors.
- Assets (images, audio) sit in the quiz's folder or below it and are referenced by relative path. A path that leaves the folder is a fixed-rule error (`asset.outside`).
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
| `time_limit` | `90s`, `45m`, `1h30m` | untimed | S |
| `on_timeout` | `submit` \| `warn` | `submit` | S |
| `feedback` | `end` \| `instant` | `end` | S |
| `pass_mark` | 0 to 100, percent of auto-graded points | none | S |
| `shuffle_questions`, `shuffle_choices` | `true` \| `false` | `false` | S |
| `partial` | `true` \| `false`: partial credit in `multi`, `ordering` and `matching` | `true` | S |
| `theme` | `auto`, `light`, `dark`, `oled`, `white`, `paper` | `auto` | S |
| `font` | `system`, `sans`, `serif`, `readable` | `system` | S |
| `look` | `free` \| `locked` | `free` | S |
| `tags` | list, describing the whole quiz | none | S |
| `generated_by` | the exact model id that wrote this version, one line | none | C |

`reference` is reserved ([section 10](#10-reserved)).

## 3. Sections

A `#` heading starts a section. A quiz with no `#` heading is one section without a title, and the page shows no section list.

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

**A passage** is the text several questions share: a reading text, a case, a data table. It goes in a `::: passage` container in the intro and is content.

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
Hidden behind a "Show hint" button.
:::

::: explanation
Shown after Check (instant feedback) or after Submit. Say why the answer is right and what the wrong ones get wrong.
:::
```

Both are content. A question has at most one of each.

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

Every item needs `[ ]` or `[x]`. A choice may hold a fenced code block indented two spaces under it. Choice text and `[x]` are content; the number of choices is structure.

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
- Blanks also work inside fenced code; never inside maths.
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

A field takes the keys of `numeric` or of `short`, not both. A field with neither is ungraded and carries no points.

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

`left :: right`; a bullet that starts with `::` adds a distractor. At least two pairs, unique right-hand items. With `partial`, scored per pair.

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

The rubric syntax is defined with the grading model in [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 6: a list of bullets (`holistic`, the default), or `mode: additive | banded` with `criteria`, the `(0.5 pts)` shorthand, explicit `id`s, `scale`, `weights`, `round`, or `preset: ielts-writing-task1 | ielts-writing-task2`. `show_rubric` (default `true`) shows the criteria on the page before submit. A rubric is structure and is kept whole by `--skeleton`.

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

Video and remote URLs are not supported.

## 8a. Errors

Every rule below is a **fixed rule**: an error that no profile can change or ignore ([TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), section 5). The ids are a contract that agents and scripts match on, so a rule is never renamed. Quality rules (`choice.correct-longest`, `explanation.short`...) are in TECHNICAL_DESIGN.md.

| Rule | When |
|---|---|
| `syntax.front-matter` | no front matter, YAML that does not parse, or no `title` |
| `syntax.unknown-key` | an unknown front-matter key, attribute or `answer` key |
| `syntax.value` | a value outside its allowed set or range (`feedback: sometimes`, `points=0`, `time_limit: soon`) |
| `syntax.attributes` | a `{…}` block that does not parse, or a name given twice |
| `syntax.heading-level` | a `###` or deeper heading |
| `syntax.container` | an unknown or unclosed `:::` container, or one in the wrong place (`passage` outside a section intro) |
| `syntax.reserved` | a reserved name ([section 10](#10-reserved)) |
| `markdown.raw-html` | any HTML tag or comment |
| `asset.missing`, `asset.outside`, `asset.type`, `asset.remote` | a missing file, a path outside the quiz folder, an unsupported format, a URL |
| `theme.unknown`, `theme.unknown-font` | a theme or font fullmark does not have |
| `section.id-duplicate` | two sections with the same id |
| `section.pick` | `pick` below 1 or above the section's question count |
| `question.type-missing` | a question without `type` |
| `question.id-missing` | a question without `id`. The fix names the command: `quiz ids FILE` |
| `question.id-duplicate`, `question.id-format` | two questions with one id; an id that is not a valid slug |
| `question.prompt-empty` | a heading with no prompt text |
| `question.container-twice` | two hints or two explanations on one question |
| `question.answer-block` | an `answer` block missing where the type needs one, or present where it takes none |
| `question.ungraded` | `graded=false` on a type that cannot be ungraded ([section 7](#7-ungraded-questions-and-surveys)) |
| `choice.marker` | a choice without `[ ]` or `[x]` |
| `choice.count` | fewer than two choices |
| `choice.correct-count` | a graded `single` without exactly one `[x]`, a graded `multi` with none, or any `[x]` in an ungraded question |
| `choice.input` | `{input}` anywhere but the end of a choice, an unquoted or empty prompt |
| `numeric.value` | no `value` or `values`, both, a number that does not parse, both tolerances, a negative tolerance |
| `short.key` | a graded `short` with neither `accept` nor `patterns` |
| `short.regex` | a pattern that is not valid in JavaScript's `u` mode |
| `blanks.none`, `blanks.outside`, `blanks.in-math`, `blanks.syntax` | a `blanks` question without blanks, `[[…]]` in another type, inside maths, or malformed |
| `fields.empty`, `fields.key`, `fields.points` | no fields; a field with both numeric and text keys; points that are mixed or do not add up |
| `ordering.items` | fewer than two items, or duplicates |
| `matching.pairs` | fewer than two pairs, a bullet without `::`, or a right-hand item used twice |
| `essay.words` | `min_words` above a non-zero `max_words` |
| `scale.range` | `max - min` outside 1 to 10, or a label outside the range |
| `rubric.*` | the rubric rules of TECHNICAL_DESIGN.md, section 6 |
| `survey.forbidden` | in a survey: `[x]`, `pass_mark`, `pick`, `feedback: instant`, `partial` or `graded=` |
| `ignore.invalid` | `check-ignore` without `because`, or naming a fixed rule |

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

| Name | For | v1 behaviour |
|---|---|---|
| `reference` in the front matter | reference sheets ([proposals/reference-sheet.md](proposals/reference-sheet.md)) | error `syntax.reserved`: "`reference` is reserved for a later version" |
| `::: passage` layout | side-by-side reading layout | renders in place |

The quiz hash will cover the files `reference` names, as it covers assets.

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
| `sample_answer`, `show_sample` (essay); `reference`, `show_reference` (code) | `sample_answer` for both, always shown after Submit | one name for the model answer, and no switch: present means shown, like an explanation; `reference` is kept for reference sheets |
| `scoring: points \| band`, rubric as a list of strings | rubric modes, criterion ids, presets | TECHNICAL_DESIGN.md, section 6 |
| A comma decimal is rejected | accepted as a decimal comma when `lang: vi` | Vietnamese writes `2,5` |
| HTML comments shown as text | `markdown.raw-html` error | no raw HTML, said once |
| — | `check-ignore`, `because` | inline ignores with a reason |
| — | `::: passage` | shared texts, and the seam for a reading layout |

## 12. Left to proposals

- **Japanese** (furigana, `lang="ja"` spans): left to [proposals/japanese-support.md](proposals/japanese-support.md); nothing here blocks it.
