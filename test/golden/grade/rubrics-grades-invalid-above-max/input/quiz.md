---
title: Rubric modes
pass_mark: 50
---

# Mixed

## Pick the prime. {type=single id=prime tags=numbers}

- [ ] Four
- [x] Seven
- [ ] Nine

::: explanation
Seven has no divisors but one and itself.
:::

## Describe the process. {type=essay id=add points=3 tags=writing}

```answer
rubric:
  mode: additive
  step: 0.25
  criteria:
    - id: defs
      text: Define the terms
      points: 0.5
    - id: derive
      text: Derive the result
      points: 1.5
    - id: interp
      text: Interpret it
      points: 1
sample_answer: |
  Define the terms, derive the result step by step, then say what it means.
```

## To what extent do you agree? {type=essay id=ielts points=9 tags=writing}

```answer
rubric:
  preset: ielts-writing-task2
```

## Compare the two designs. {type=essay id=banded points=6 tags=writing}

```answer
rubric:
  mode: banded
  scale: {min: 0, max: 6, step: 1}
  round: down
  criteria:
    - {id: content, text: Content, weight: 2}
    - {id: style, text: Style}
```

## Explain aliasing. {type=essay id=holistic points=4 tags=writing}

```answer
rubric:
  - Names the Nyquist rate
  - Gives an example
  - Explains how to avoid it
```

## Write `double`. {type=code id=code points=2 tags=code}

```answer
language: python
rubric:
  mode: additive
  criteria:
    - id: works
      text: Returns twice its argument
      points: 1
    - id: style
      text: Is short and clear
      points: 1
sample_answer: |
  def double(x):
      return 2 * x
```

