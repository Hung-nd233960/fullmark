# Proposal: rapid response

**Status: proposal, not in v1 scope.** Raised on 2026-10-28. It needs no new seam: it is another view over the same `Attempt` reducer, plan and grader ([TECHNICAL_DESIGN.md](../TECHNICAL_DESIGN.md), section 4).

## The idea

A quiz played one question at a time: a question fills the screen, the learner answers, and the page moves on to the next. It is for quick drills on short questions, in the spirit of Kahoot, played alone.

- **One question on screen.** Answering moves on: a choice question moves on when a choice is picked; a typed answer moves on with Enter or a Next button. There is no going back.
- **Feedback follows the quiz's `feedback` key**, so it needs no new option: with `instant`, the page shows right or wrong (and the explanation) after each question and moves on when the learner presses Next; with `end`, it hides every answer and score until the last question, then opens the normal results.
- **The end is the normal results page** (section 8): the results card, review, Retry missed and Download results. The exported file is ordinary `results-v2`, and `quiz grade` gives the same score.
- **Short questions only.** `single`, `multi`, `truefalse`, `numeric`, `short` and `blanks`. A quiz in this mode that has `essay`, `code`, `fields`, `ordering`, `matching` or `scale` is a `check` error.

## Keyboard

The one-question view is answered from the keyboard as well as by pointer. On the normal page, with many questions on screen, number keys would not say which question they answer, so this belongs to this view only.

- `1` to `9` pick a choice by its place on screen (so they follow a shuffle); each choice shows its number. In `multi` they tick and untick. In `truefalse`, `1` is True and `2` is False, in every language.
- `Enter` commits the answer and moves on; a number key alone never commits. With `feedback: instant`, a second `Enter` leaves the feedback.
- Typed answers (`numeric`, `short`, `blanks`) also end with `Enter`. Keys never act while a text field has the focus (as for Focus mode, section 8), apart from that `Enter`.

**A choice-only drill is not a separate mode.** A quiz of only `single`, `multi` and `truefalse` is answered with the keyboard alone already. An author who wants that enforced uses a custom check in a profile (`where` on `type`, [TECHNICAL_DESIGN.md](../TECHNICAL_DESIGN.md), section 5) rather than a second mode.

## Not in it

- No points for speed, no streaks, no power-ups, no leaderboard. The score depends only on the source and the answers, as everywhere else.
- No multiplayer and no shared screen: that needs a live server, and fullmark pages are offline files.

## Open questions

1. How a quiz asks for it: a front matter key (`view: rapid`?) or a choice on the start screen. A front matter key lets `check` refuse the long types; a start-screen choice needs no syntax but must hide itself when the quiz has them.
2. A per-question time limit, or only the quiz's `time_limit`. A per-question limit is a new timer rule and a new reason for an unanswered question.
3. How it sits with Focus mode, which was decided as having no one-question view.

## Cost

A new question view and its keyboard flow, a `check` rule for the allowed types, and Playwright tests for both feedback settings. It reuses the question components, the reducer and the results page. About two days after step 2.
