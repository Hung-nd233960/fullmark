---
title: "How well do you know fullmark?"
description: A quiz about the fullmark project itself. It uses every question type, so it doubles as a demo.
id: fullmark-project
time_limit: 20m
feedback: instant
pass_mark: 70
tags: [fullmark]
---

# The big picture

## What does `quiz build quiz.md` produce? {tags=basics}

- [ ] A folder with an HTML file, a CSS file and a JavaScript file
- [x] One self-contained HTML file with the CSS, JavaScript, math fonts, images and audio embedded
- [ ] A PDF of the questions
- [ ] A web server that you must keep running

> [!hint]
> Think about what "opens by double-click" requires.

> [!explanation]
> The output is a single file. Everything it needs is embedded, so it works from `file://`, offline, and on a phone.

## Which of these are non-goals of version 1? {type=multi points=3 tags=basics}

- [x] Secure exams that hide the answers from a determined learner
- [ ] Working offline
- [x] Running the learner's code in the browser
- [ ] LaTeX math
- [x] Telling `2x` and `x*2` apart as equal expressions symbolically

> [!explanation]
> The answer key ships inside the HTML, code answers are exported rather than run, and math answers are compared numerically or as listed text. Offline use and LaTeX math are goals.

## The answer key is encrypted, so a learner cannot read it. {type=truefalse tags=basics}

```answer
value: false
```

> [!explanation]
> The key is XOR-scrambled with a key derived from the quiz hash and then base64-encoded. That only stops casual peeking. It is not security, and the docs say so.

## The page loads KaTeX from a content delivery network when the quiz has math. {type=truefalse tags=build}

```answer
value: false
```

> [!explanation]
> KaTeX is vendored and embedded, and only when the quiz contains math. The page makes no network requests, and a Content Security Policy enforces that.

# Writing and checking

## Which command validates a quiz file? {type=short tags=format}

```answer
accept: ["quiz check", "check"]
```

> [!explanation]
> `quiz check quiz.md` prints line-numbered errors and warnings. `quiz build` runs the same checks first and refuses to build on errors.

## What exit code does `quiz check` return when the quiz has errors? {tags=format}

- [ ] `0`
- [x] `1`
- [ ] `2`
- [ ] `255`

> [!explanation]
> `0` means no errors (warnings are allowed), `1` means errors, and `2` means a usage or file problem such as a missing file.

## A quiz has `time_limit: 1h30m`. How many seconds is that? {type=numeric tags=format}

```answer
value: 5400
unit: seconds
```

> [!explanation]
> One hour is 3600 seconds and thirty minutes is 1800 seconds, so 5400.

## Fill in the format. {type=blanks points=2 tags=format}

A question starts with a [[##|h2]] heading, and a section starts with a [[#|h1]] heading.

> [!explanation]
> `##` starts a question and `#` starts a section. Headings of level 3 or deeper are errors.

## Complete the results file header. {type=blanks points=2 tags=grading}

The export has `format: [[fullmark-results]]` and `version: [[=1]]`.

> [!explanation]
> `quiz grade` refuses files whose format is not `fullmark-results` or whose version is not 1.

## Which language are the code samples in the `rust` template written in? {type=short tags=basics}

```answer
accept: ["rust"]
```

> [!explanation]
> The `rust` template shows highlighted code, blanks inside code, shuffled choices and a `code` answer.

# Grading

## When the browser's score and Python's score differ, which one does `quiz grade` use? {tags=grading}

- [ ] The browser's, because the learner saw it
- [x] Python's, which is the authority, and it prints a warning
- [ ] The average of the two
- [ ] It stops with an error

> [!explanation]
> Grading is implemented in both `grading.py` and `quiz.js`, tested on the same golden cases, but Python decides.

## A `multi` question is worth 3 points and has 3 correct choices. A learner picks 2 correct and 1 wrong. With partial scoring, how many points do they earn? {type=numeric tags=grading}

```answer
value: 1
tolerance: 0.01
```

> [!hint]
> The formula is `points * max(0, (correct_selected - wrong_selected) / correct_total)`.

> [!explanation]
> `3 * (2 - 1) / 3 = 1`. With `all_or_nothing` scoring the answer would be 0.

## Palettes and files {type=fields points=4 tags=build}

The page follows the Catppuccin color palette. Fill in the details.

```answer
fields:
  - label: "Light theme flavor"
    accept: ["Latte"]
  - label: "Dark theme flavor"
    accept: ["Mocha"]
  - label: "Environment variable that overrides the time limit in tests"
    accept: ["FULLMARK_TEST_TIME_LIMIT"]
  - label: "Library that highlights code at build time"
    accept: ["Pygments"]
```

> [!explanation]
> Latte is the light flavor and Mocha the dark one. `FULLMARK_TEST_TIME_LIMIT=10s` is only for the end-to-end tests. Pygments colors the code when the page is built, with custom Catppuccin styles.

# Open questions

## Why is the grader written twice, in Python and in JavaScript, and how are the two kept in agreement? {type=essay points=6 tags=grading}

Write a short explanation in your own words.

```answer
min_words: 40
rubric:
  - Reason for two graders: the browser gives instant feedback offline, and Python re-grades as the authority
  - Mechanism: shared golden cases in grading_cases.json run against both implementations
  - Consequence: what happens when the two disagree
  - Clarity of the explanation
```

## Write `parse_duration` {type=code points=4 tags=format}

Quiz files accept durations such as `90s`, `45m`, `1h` and `1h30m`. Write a Python function `parse_duration(text)` that returns the number of seconds, and raises `ValueError` for anything else (including an empty string and a zero duration).

```answer
language: python
starter: |
  def parse_duration(text: str) -> int:
      ...
rubric:
  - Returns the right number of seconds for 90s, 45m, 1h and 1h30m
  - Raises ValueError for an empty string, text without units, and zero
  - Clear and short, for example one regular expression
reference: |
  import re

  def parse_duration(text: str) -> int:
      m = re.fullmatch(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?", text.strip())
      if not m or not any(m.groups()):
          raise ValueError(f"bad duration {text!r}")
      h, mi, s = (int(g) if g else 0 for g in m.groups())
      total = h * 3600 + mi * 60 + s
      if total <= 0:
          raise ValueError("duration must be greater than zero")
      return total
show_reference: true
```
