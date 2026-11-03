---
title: Rubric modes
id: rubrics
---

## Add it up {type=essay id=r-add points=4}

```answer
rubric:
  mode: additive
  criteria:
    - Definitions (1 pts)
    - Derivation (3 pts)
sample_answer: |
  A model answer.
```

## Band it {type=essay id=r-band points=9}

```answer
rubric:
  mode: banded
  scale: {min: 0, max: 9, step: 0.5}
  round: down
  criteria:
    - {id: tr, text: Task response, weight: 2}
    - {id: cc, text: Coherence}
```

## Say it {type=essay id=r-hol points=4}

```answer
rubric:
  - Clear thesis
  - Good evidence
```

## Letter {type=essay id=r-ielts points=9}

```answer
rubric:
  preset: ielts-writing-task2
```
