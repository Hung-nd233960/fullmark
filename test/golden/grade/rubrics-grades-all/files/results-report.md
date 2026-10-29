# Report: Rubric modes

- **Quiz:** quiz.md
- **Version:** `2792abce882e`
- **Questions:** 6 (full)
- **Started:** 2026-10-23T16:02:00
- **Submitted:** 2026-10-23T16:30:00
- **Time used:** 28 min

## Score

**19.25 of 25 points (77%)**

Goal 50%: reached

## Warnings

- results_hash differs from this attempt: these grades were made for another results file

## By section

| Name | Questions | Earned | Points | Percent |
| --- | --- | --- | --- | --- |
| Mixed | 6 | 19.25 | 25 | 77% |

## By tag

| Name | Questions | Earned | Points | Percent |
| --- | --- | --- | --- | --- |
| code | 1 | 1.5 | 2 | 75% |
| numbers | 1 | 1 | 1 | 100% |
| writing | 4 | 16.75 | 22 | 76.14% |

## Questions to review

### add - partly right (2.25 / 3)

> Describe the process.

**Your answer:** The transform maps a signal to the frequency domain. Starting from the definition we apply it to the input and divide by the transform of the output, which gives the transfer function.

### ielts - partly right (6.5 / 9)

> To what extent do you agree?

**Your answer:** I agree to a large extent. Cities that invest in cycling routes see less traffic, cleaner air and healthier residents, although some trips still need a car.

### banded - partly right (5 / 6)

> Compare the two designs.

**Your answer:** Design A is cheaper but slower; design B costs more and is easier to maintain.

### holistic - partly right (3 / 4)

> Explain aliasing.

**Your answer:** Aliasing happens when a signal is sampled below twice its highest frequency, as with a wagon wheel on film.

### code - partly right (1.5 / 2)

> Write `double`.

**Your answer:**

```
def double(x):
    return x + x
```

## Essays and code

### add (3 points) - 32 words

> Describe the process.

**Answer:**

```
The transform maps a signal to the frequency domain. Starting from the definition we apply it to the input and divide by the transform of the output, which gives the transfer function.
```

Mode: additive, step 0.25

| Criterion | id | Maximum |
| --- | --- | --- |
| Define the terms | defs | 0.5 |
| Derive the result | derive | 1.5 |
| Interpret it | interp | 1 |

**Sample answer:**

```
Define the terms, derive the result step by step, then say what it means.
```

**Grades:** Graded by Claude Opus 5.5 (ai). 2.25 / 3

| Criterion | Earned | Maximum | Note |
| --- | --- | --- | --- |
| Define the terms | 0.5 | 0.5 |  |
| Derive the result | 1.25 | 1.5 | Skips the zero initial-conditions assumption. |
| Interpret it | 0.5 | 1 | Does not link the result to stability. |

**Justification:** Solid derivation; the interpretation is the weak part.

**To improve:** Say why the result matters.

### ielts (9 points) - 27 words

> To what extent do you agree?

**Answer:**

```
I agree to a large extent. Cities that invest in cycling routes see less traffic, cleaner air and healthier residents, although some trips still need a car.
```

Mode: banded, scale 0 to 9, step 0.5, rounding ielts

| Criterion | id | Weight |
| --- | --- | --- |
| Task Response | TR | 1 |
| Coherence and Cohesion | CC | 1 |
| Lexical Resource | LR | 1 |
| Grammatical Range and Accuracy | GRA | 1 |

**Grades:** Graded by Claude Opus 5.5 (ai). 6.5 / 9. Overall band 6.5

| Criterion | Band | Weight | Note |
| --- | --- | --- | --- |
| Task Response | 6 | 1 | Room to improve here. |
| Coherence and Cohesion | 6.5 | 1 | Room to improve here. |
| Lexical Resource | 6.5 | 1 | Room to improve here. |
| Grammatical Range and Accuracy | 6 | 1 | Room to improve here. |

**Justification:** A clear position with some thin support.

**To improve:** Develop the second argument.

### banded (6 points) - 15 words

> Compare the two designs.

**Answer:**

```
Design A is cheaper but slower; design B costs more and is easier to maintain.
```

Mode: banded, scale 0 to 6, step 1, rounding down

| Criterion | id | Weight |
| --- | --- | --- |
| Content | content | 2 |
| Style | style | 1 |

**Grades:** Graded by Claude Opus 5.5 (ai). 5 / 6. Overall band 5

| Criterion | Band | Weight | Note |
| --- | --- | --- | --- |
| Content | 5 | 2 | One comparison is missing. |
| Style | 6 | 1 |  |

**Justification:** Good content, fluent style.

**To improve:** Compare costs as well.

### holistic (4 points) - 19 words

> Explain aliasing.

**Answer:**

```
Aliasing happens when a signal is sampled below twice its highest frequency, as with a wagon wheel on film.
```

Mode: holistic

- Names the Nyquist rate (`names-the-nyquist-rate`)
- Gives an example (`gives-an-example`)
- Explains how to avoid it (`explains-how-to-avoid-it`)

**Grades:** Graded by Claude Opus 5.5 (ai). 3 / 4

| Criterion | Verdict |
| --- | --- |
| Names the Nyquist rate | met |
| Gives an example | partly |
| Explains how to avoid it | missed |

**Justification:** Names the rate and gives an example but not the fix.

**To improve:** Mention an anti-aliasing filter.

### code (2 points)

> Write `double`.

**Answer:**

```python
def double(x):
    return x + x
```

Mode: additive, step 0.5

| Criterion | id | Maximum |
| --- | --- | --- |
| Returns twice its argument | works | 1 |
| Is short and clear | style | 1 |

**Sample answer:**

```python
def double(x):
    return 2 * x
```

**Grades:** Graded by Claude Opus 5.5 (ai). 1.5 / 2

| Criterion | Earned | Maximum | Note |
| --- | --- | --- | --- |
| Returns twice its argument | 1 | 1 |  |
| Is short and clear | 0.5 | 1 | x + x works, but 2 * x is the usual form. |

**Justification:** Correct and readable.

**To improve:** Prefer the multiplication.
