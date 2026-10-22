---
title: Fixture survey
id: fixture-survey
mode: survey
---

# About you

## How do you usually study? {id=how}

- [ ] Alone
- [ ] With a friend
- [ ] In a group
- [ ] Other

> [!explanation]
> Tells the course team which rooms to book.

## Which of these help? {type=multi id=help}

- [ ] Past papers
- [ ] Videos
- [ ] Office hours

## Your name {type=short id=name}

## Course details {type=fields id=details}

```answer
fields:
  - label: Course
  - label: Year
```

# Confidence

## How confident are you with Fourier transforms? {type=scale id=conf}

```answer
min: 1
max: 5
labels:
  1: Not at all
  5: Very confident
```

## How many hours do you sleep? {type=scale id=sleep}

```answer
min: 0
max: 10
```

## Rank these by how much they matter to you {type=ordering id=rank}

1. Sleep
2. Exercise
3. Study

## Anything else? {type=essay id=more}

Tell us in a few sentences.
