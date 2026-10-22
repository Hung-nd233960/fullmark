---
title: My quiz
# description: Shown on the start screen. Markdown is allowed.
# id: my-quiz                  # default: the file name
# time_limit: 30m              # 90s, 45m, 1h, 1h30m; leave out for untimed
# on_timeout: submit           # submit | warn
# feedback: end                # end | instant
# shuffle_questions: false
# shuffle_choices: false
# multi_scoring: partial       # partial | all_or_nothing
# pass_mark: 70                # percent of auto-graded points
# tags: [topic]
---

# Section one

Text under a `#` heading is the section introduction.

## Single choice: one item is checked. {tags=topic}

- [ ] Wrong
- [x] Right
- [ ] Also wrong

> [!hint]
> Hints stay hidden behind a button.

> [!explanation]
> Shown after the question is checked or after submit.

## Multiple answer: two or more items are checked. {points=2}

- [x] Right
- [ ] Wrong
- [x] Also right

> [!explanation]
> Partial credit by default.

## True or false: the statement is a claim. {type=truefalse}

```answer
value: true
```

> [!explanation]
> Say why the statement is true or false.

## Numeric: what is $1 / 4$? {type=numeric}

```answer
value: 0.25
tolerance: 0.001
unit: ""
```

> [!explanation]
> Fractions such as `1/4` are accepted as input.

## Short answer: name the capital of France. {type=short}

```answer
accept: ["Paris"]
```

> [!explanation]
> Matching ignores case and extra spaces.

## Fill in the blanks. {type=blanks points=2}

Water boils at [[100]] degrees Celsius and freezes at [[=0±0.1]] degrees.

> [!explanation]
> Variants are separated by `|`; numbers use `=value±tolerance`.

## Labeled fields. {type=fields points=2}

```answer
fields:
  - label: "Square root of 9"
    value: 3
  - label: "Chemical symbol for sodium"
    accept: ["Na"]
```

> [!explanation]
> A field with neither `value` nor `accept` is not graded; it is exported for an AI.

# Written work

## Ordering: put the steps in order. {type=ordering}

1. Wake up
2. Get dressed
3. Eat breakfast

> [!explanation]
> List the items in the correct order; the page shuffles them.

## Matching: pair each country with its capital. {type=matching points=2}

- France :: Paris
- Italy :: Rome
- :: Madrid (a distractor: no country on the left)

> [!explanation]
> A bullet that starts with `::` adds a wrong option.

## Essay: discuss one idea in your own words. {type=essay points=5}

```answer
min_words: 50
rubric:
  - Content: answers the question
  - Clarity: organised and easy to follow
```

## Code: write a function that adds two numbers. {type=code points=3}

```answer
language: python
starter: |
  def add(a, b):
      pass
rubric:
  - Returns the sum for integers and floats
reference: |
  def add(a, b):
      return a + b
show_reference: true
```
