# Plan: follow-up text inputs on choices

A work list for an agent, one task per commit. Written on 2026-10-21 at quizmd 0.4.0 (commit `cfb6935`). Follow the rules at the top of `BUILD_PLAN.md` (read `AGENTS.md` and the CLI guide first, grading lives twice, syntax changes update `guide.md` and `docs/GUIDE.md`, page changes rebuild the examples, UI rules the tests enforce, all localStorage through `store()`, strike items through in `docs/PLANNED.md`, never publish).

Baseline: 419 tests pass; `ty check` reports 179 diagnostics; ruff is clean.

## Why

Questionnaires often have an "Other" or "Something else" choice that needs a few words of explanation. Today the author must add a separate `short` question and tell the respondent to answer it only if they picked "Other". A follow-up input on the choice keeps the words with the choice.

## Syntax (decided)

A choice item of a `single` or `multi` question can end with `{input}` or `{input="Prompt text"}`. The default prompt is `Please specify`. It works in quiz and survey mode, graded or ungraded. The marker is removed from the displayed choice text. A choice may have both `[x]` and `{input}`.

```markdown
## The knee MRI reading is for... {id=knee}

- [ ] My thesis
- [ ] A lab project
- [ ] Something else {input="What is it?"}
```

Rules and errors (`quiz check`, with line numbers):

- `{input}` on an item of any other question type (ordering, matching, or a choice list under another type), or on a `##` heading: error.
- `{input=""}` (empty prompt): error.
- Any other `{input...}` ending that does not fit (`{input=What is it?}` unquoted, an unclosed quote, `{input = x}`): error with the hint `write {input} or {input="Prompt text"}`.
- The marker is only recognised at the end of the item's last line. The prompt is plain text, not Markdown.

## Page (decided)

- The choice has a hidden follow-up row right after it: a real `<label>` and a text input. Selecting the choice shows it and moves focus into the input on click, Space or Enter; unselecting hides it. Arrow keys that move a radio selection do not steal focus (the input is next in the tab order); a live-region message says the field appeared.
- The radio or checkbox gets `aria-controls` (and `aria-expanded` where ARIA allows it) pointing at the row.
- Typed text is kept while hidden, also across reloads (it is saved in the attempt state through `store()`).
- Inputs lock on Submit and Check like every other control.
- Shuffled choices keep their input (the row is tied to the choice index, not the position).
- After Submit, ungraded answers read `Something else: a hackathon` under "Your answer".

## Response format (decided)

`response` for `single` and `multi` keeps its exact shape. When at least one selected choice has non-empty follow-up text, it gains `"inputs": {"<original choice index>": "text"}`. Only selected choices appear (text typed and then hidden is not an answer). Text is trimmed; empty text is left out. `results-v1.schema.json` gets this optional property under `single` and `multi`; the version stays 1 (new optional field, old files stay valid). `serve.py`'s built-in validator gains the two schema keywords it needs (`patternProperties`, `additionalProperties`) and its test a mutation.

## Grading (decided)

The text never affects the score. Neither grader reads `inputs`. Golden cases for answered, unanswered and hidden-text (an `inputs` entry for an unselected choice) in `tests/make_grading_cases.py`.

## Reports (decided)

`quiz grade` Markdown and JSON show `Something else: a hackathon` for the selected choice, in the per-question table, Answers section and `answer_text`. The JSON report also carries the raw `inputs`. An `inputs` entry for a choice that is not selected is ignored. `quiz stats` "Answers over time" shows the choice text only.

## Tasks

1. **Plan** (this file).
2. **Syntax, model, validation.** `parser.py`, `models.py` (`Choice.input`), `validate.py`, `lint.py` if needed; fixtures for each new error in `tests/fixtures/make_fixtures.py`; tests in `test_validate.py` and a parser test.
3. **Format and grading.** Schema, `serve.py` validator and test, `docs/SPEC.md` decision, golden cases.
4. **The page.** `build.py` (page data), `quiz.js`, `quiz.css`; e2e tests (reveal, focus, keep text, keyboard, shuffle, locked after submit, export, storage blocked, phone width, both themes); sync and rebuild the examples.
5. **Reports.** `report.py` (Markdown and JSON), `stats.py` stays choice-text only; tests in `test_report.py`, `test_stats.py`.
6. **Docs, template, release.** `guide.md`, `docs/GUIDE.md` (syntax plus a common-mistakes line), `agents.md` then sync, `skill/SKILL.md` (one line), `README.md`, one `{input}` choice in the survey example (packaged and top-level, synced), `docs/PLANNED.md`, version 0.5.0, rebuild docs and examples.
7. **Verify.** Full `uv run pytest -q`, ruff, `ty check` against the baseline, then a Playwright run on the survey example (pick, type, switch away and back, Finish, `quiz serve` or export, `quiz grade`), with screenshots in light and dark.

## Not in scope

Inputs on `truefalse`, `ordering` or `matching`; Markdown in the prompt; required follow-up text; several inputs per choice. Deferred, with no use case yet.
