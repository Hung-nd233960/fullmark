# Report: Rubric modes

- **Quiz:** quiz.md
- **Version:** `2792abce882e`
- **Questions:** 6 (full)
- **Started:** 2026-10-23T16:02:00
- **Submitted:** 2026-10-23T16:30:00
- **Time used:** 28 min

## Score

**4 of 5 points (80%)**

20 points are waiting for a grader and are not in the score

Goal 50%: reached*

## By section

| Name | Questions | Earned | Points | Percent |
| --- | --- | --- | --- | --- |
| Mixed | 6 | 4 | 5 | 80% |

## By tag

| Name | Questions | Earned | Points | Percent |
| --- | --- | --- | --- | --- |
| code | 1 | 0 | 0 |  |
| numbers | 1 | 1 | 1 | 100% |
| writing | 4 | 3 | 4 | 75% |

## Questions to review

### holistic - partly right (3 / 4)

> Explain aliasing.

**Your answer:** Aliasing happens when a signal is sampled below twice its highest frequency, as with a wagon wheel on film.

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

**Grades:** waiting for a grader

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

**Grades:** waiting for a grader

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

**Grades:** waiting for a grader

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

**Grades:** waiting for a grader
