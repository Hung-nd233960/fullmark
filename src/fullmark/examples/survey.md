---
title: Study habits check-in
description: A two-minute check-in about how you study. There are no right answers and nothing is scored.
mode: survey
id: study-habits
---

Answer what is true for you, not what sounds best. Skip any question you prefer not to answer.

# How you study

## Where do you usually study? {id=where}

- [ ] At home
- [ ] In the library
- [ ] In a classroom or lab
- [ ] Somewhere else {input="Where?"}

> [!explanation]
> It helps decide which rooms stay open in the evening.

## How do you usually prepare for an exam? {id=prepare}

- [ ] I start several weeks before
- [ ] I start about a week before
- [ ] I start in the last two days
- [ ] It depends on the course

## Which of these do you use? {type=multi id=tools}

- [ ] Lecture notes
- [ ] Past papers
- [ ] Videos
- [ ] A study group
- [ ] Flashcards

## Rank these by how much they help you learn {type=ordering id=rank}

1. Practice problems
2. Reading the textbook
3. Watching lectures
4. Talking it through with other people

> [!explanation]
> The ranking shows which kind of support to offer first.

# How it feels

## How confident are you about the next exam? {type=scale id=confidence}

```answer
min: 1
max: 5
labels:
  1: Not at all
  5: Very confident
```

## On how many days a week do you study? {type=scale id=days}

```answer
min: 0
max: 7
labels:
  0: Never
  7: Every day
```

## Your routine {type=fields id=routine}

```answer
fields:
  - label: Usual time of day
  - label: Hours per week
```

## What would help you study better? {type=essay id=ideas}

A few sentences are plenty.
