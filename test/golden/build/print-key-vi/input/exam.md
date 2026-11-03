---
title: "Signals and Systems: midterm practice"
id: paper-exam
time_limit: 45m
shuffle_questions: true
shuffle_choices: true
---

# Signals {id=signals}

Answer every question. Calculators are not allowed.

## Which signal is periodic? {type=single id=zqid1 points=1 tags=zqtag}

- [ ] x(t) = $e^{-t}$
- [x] x(t) = $\cos(4\pi t)$
- [ ] x(t) = t·u(t)
- [ ] x(t) = δ(t − 1)

::: hint
zq-hint-one
:::

::: explanation
zq-explain-one because the cosine repeats every half second.
:::

## Which of these are conditions of the sampling theorem? {type=multi id=zqid2 points=2}

- [x] zq-right-one the signal is band-limited
- [ ] The signal is periodic
- [x] zq-right-two fs is more than twice the highest frequency
- [ ] The samples are quantised to 16 bits

## An even signal satisfies x(t) = x(−t). {type=truefalse id=zqid3 points=1}

```answer
value: true
```

::: explanation
zq-explain-three since even symmetry is exactly this definition.
:::

# Short answers {id=short}

## What is the fundamental period, in seconds, of sin(5πt)? {type=numeric id=zqid4 points=1}

```answer
value: 0.4
tolerance: 0.001
unit: s
```

## Name the effect when frequencies above fs/2 fold back. {type=short id=zqid5 points=1}

```answer
accept: [zq-accept-aliasing]
```

## A system whose output depends only on present and past inputs is called [[zq-causal]]. {type=blanks id=zqid6 points=1}

## Calculations {type=fields id=zqid7 points=2}

```answer
fields:
  - label: "Gain (dB)"
    value: 4242.5
    tolerance: 0.1
  - label: "Note"
    accept: [zq-field-name]
```

## How sure are you? {type=scale id=zqid8}

```answer
min: 1
max: 5
labels:
  1: Not at all
  5: Very sure
```

# Long answers {id=long}

## Put the steps of a build in order. {type=ordering id=zqid9 points=3}

1. zq-parse
2. zq-check
3. zq-render

## Match each tool to its job. {type=matching id=zqid10 points=3}

- rect(t) :: sinc
- 1 :: δ(ω)
- δ(t) :: 1
- :: zq-unused distractor

## Explain why sampling below the Nyquist rate causes aliasing. {type=essay id=zqid11 points=4}

```answer
max_words: 60
rubric:
  mode: additive
  criteria:
    - zq-criterion-one (2 pts)
    - zq-criterion-two (1 pts)
    - zq-criterion-three (1 pts)
sample_answer: |
  zq-sample-essay: the spectral copies overlap.
```

::: explanation
zq-explain-essay the copies overlap and fold about half the rate.
:::

## Write `zqlargest`. {type=code id=zqid12 points=3}

```answer
language: rust
starter: |
  fn zqlargest(v: &[i32]) -> i32 {
      todo!()
  }
rubric:
  - zq-code-criterion-one
  - zq-code-criterion-two
  - zq-code-criterion-three
sample_answer: |
  fn zqlargest(v: &[i32]) -> i32 { *v.iter().max().unwrap() }
```
