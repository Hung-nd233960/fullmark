# Plan: questionnaires (ungraded questions and survey mode)

A work list for an agent, one task per commit. Written on 2026-10-20 at commit `47ed8c1`; the facts below were checked then. Follow the rules at the top of `BUILD_PLAN.md` (read `AGENTS.md` and the CLI guide first, grading lives twice, syntax changes update `guide.md` and `docs/GUIDE.md`, page changes rebuild the examples, UI rules the tests enforce, all localStorage through `store()`, strike items through in `docs/PLANNED.md`, never publish).

## Why

quizmd is used to collect answers that have no right answer: intake forms for Claude (a personal context file, a project kickoff), self-reviews, course feedback, and "how sure are you?" questions inside a real quiz. Today the only way is `fields` with no `value`/`accept`, which the page and the report treat as **pending AI grading**, and the page still shows a score. The first real use (`the private setup repo/claude/intake/context.md`) had to be all text fields with a note telling the user to ignore the score.

## Goal

1. **Ungraded questions** anywhere: a question can collect an answer without a correct one. It never counts toward the score, never shows right or wrong, and is never sent to AI grading.
2. **Survey mode** for a whole file: every question is ungraded, the page shows no score, and the report is a list of answers.
3. A new `scale` question type (1 to 5 and similar), the most common survey question.

## Not in scope

Branching or skip logic, collecting answers from several people, any server or network use, required-answer enforcement beyond the existing "unanswered" warning on submit, analytics across respondents. Write these into `docs/PLANNED.md` under a new "Questionnaires" heading as deferred, with one line of reason each.

## Syntax (decided)

### Front matter

| Key | Values | Default |
|---|---|---|
| `mode` | `quiz` / `survey` | `quiz` |

In `survey` mode: every question is ungraded (no `graded=false` needed); `[x]` on a choice is an **error** ("survey questions have no correct choice; remove the [x]"); `pass_mark`, `pick` (front matter or section), `feedback: instant` and `multi_scoring` are errors; `time_limit`, `shuffle_choices`, `shuffle_questions`, `theme` and `description` stay allowed.

### Heading attribute

`graded=false` on a `##` question in a normal quiz makes that one question ungraded. `graded=true` is the default and only valid in quiz mode.

### Which types can be ungraded

| Type | Ungraded behaviour | Syntax change |
|---|---|---|
| `single`, `multi` | the learner picks; nothing is marked | no `[x]` allowed (error if present) |
| `short` | free text | no `answer` block needed; an `answer` block is an error |
| `fields` | labelled free text | fields without `value`/`accept` (as today); a field with `value`/`accept` is an error |
| `essay` | long text, **not** sent to AI grading | `answer` block optional; `rubric` not required (a rubric is an error: it implies grading); `min_words`/`max_words` still allowed |
| `ordering` | a **ranking**: shown in the written order, the learner reorders it | unchanged list syntax |
| `scale` (new) | always ungraded | see below |
| `truefalse`, `numeric`, `blanks`, `matching`, `code` | not allowed | error: "`graded=false` is not supported for TYPE; use single, short or fields" |

`points=` on an ungraded question is a warning ("ungraded questions have no points") and is ignored. Explanations are optional on ungraded questions and shown after submit under the label "Why this is asked" (from `strings`, if the page has a strings table; otherwise a constant in `quiz.js`).

### `scale`

````markdown
## How confident are you with Fourier transforms? {type=scale}

```answer
min: 1          # default 1
max: 5          # default 5; max - min between 1 and 10
labels:         # optional; keys are scale values, at least the two ends recommended
  1: Not at all
  5: Very confident
```
````

Rendered as a row of radio buttons with the numbers, end labels under the ends, keyboard accessible (arrow keys move within the group). The response is `{"value": N}`. A `scale` is always ungraded, in quiz or survey mode.

## Results, report and schemas

- New status **`ungraded`**: `earned` is `null`, the question is excluded from `possible_auto`, `pending_points` and `possible_total`. Add it to the `status` enum in `results-v1.schema.json` and the report schema. Keep `version` 1: the only consumers are quizmd itself and agents told to ignore unknown values; record the decision in `docs/SPEC.md`.
- Export: `attempt.mode` (`"quiz"` or `"survey"`, new optional field). In survey mode the `score` object is still present (earned 0, possibles 0, percent null) so the schema's required fields hold.
- `quiz grade`:
  - Quiz with some ungraded questions: the report gains an **Answers** section (after the score tables, before Review these) listing each ungraded question and the answer; the JSON report has them with `status: "ungraded"`, `response`, and a readable `answer_text`. They never appear under Pending AI review, and the grades template (`*-grades.json`) never lists them; a `--grades` file that names one is an error.
  - Survey: the Markdown report is titled "Answers", has no score, per-tag or review tables, and lists every question grouped by section with its answer (choices by their text, scale as `4 / 5 (label)` when labelled, rankings as an ordered list). `--json` gives the same data.
- `quiz stats`: ungraded questions are left out of the score trend. For `scale` and `single` ungraded questions, add a small "Answers over time" table (one column per attempt). Surveys work too (no score rows). This is task 6; skip it if time is short and say so.
- `quiz inspect`: show ungraded questions as such (type plus "ungraded"), and in survey mode skip points and answer-position output.
- `quiz check` lints: the weak-question lints and the "no explanation" warning skip ungraded questions. New warnings: a `scale` with no labels; an ungraded `single` with fewer than three choices (suggest adding "Other" or using `short`); an ungraded `multi` with no "none" option is **not** a warning.

## Tasks

### 1. Model and validation

`models.py` (`FrontMatter.mode`, `Question.graded`, a `ScaleSpec`, `AUTO_TYPES` unchanged but a new helper `Question.ungraded`), `parser.py` (allow choice lists without `[x]` when ungraded; parse `graded=` and `type=scale`), `validate.py` (every rule in the tables above, with line numbers). Fixtures for each new error in `tests/fixtures/make_fixtures.py`; tests in `test_validate.py`.

### 2. Grading, both sides

`grading.py`: `grading_spec` emits `{"ungraded": true, ...}` for ungraded questions; `grade_question` returns status `ungraded` (or `unanswered`) with `earned` null; `score_attempt` leaves them out of every total. `static/quiz.js`: the same in `gradeQuestion`/`specOf`/`gradeAll`. Golden cases in `tests/make_grading_cases.py` for each ungraded type, answered and unanswered, so `test_grader_parity.py` checks Python and JS agree.

### 3. The page

`render.py`, `templates/quiz.html.j2`, `static/quiz.js`, `static/quiz.css`:

- Ungraded questions: no Check button, no result badge, no "correct answer" reveal; after submit they show the answer under "Your answer" and the explanation as "Why this is asked".
- `scale` rendering and keyboard behaviour; contrast in both themes.
- Ordering as ranking: initial order is the written order (not shuffled) when ungraded.
- Survey mode: no score anywhere (header, results screen, nav); the submit button reads **Finish**; the results screen says the answers are ready and makes **Export answers** the primary action; no "review wrong answers" or "retry missed". "Answered N of M" stays.
- `attempt.mode` in the export.
- e2e tests in `tests/e2e/test_browser.py`: a survey page shows no score text and no right/wrong badges; a quiz with one ungraded question scores only the graded ones; scale is reachable and operable by keyboard; export validates against the schema; works with storage blocked. Add the survey example to `test_accessibility.py` (axe).

### 4. Report and grades

`report.py` and the JSON report as described above; schema updates; tests in `test_report.py` and `test_grades.py` (ungraded never in the grades template; `--grades` naming one is an error).

### 5. Template, example and docs

- `src/quizmd/examples/survey/quiz.md`: a generic "Study habits check-in" (no personal data): a few `single`, one `multi`, two `scale`, one `ordering` ranking, one `fields`, one ungraded `essay`. Run `scripts/sync_examples.py`; it appears in `quiz templates` and `quiz new survey`.
- Add one `graded=false` confidence `scale` to the `exam` example? **No**: leave existing examples unchanged; put a confidence-question example in `guide.md` instead.
- `guide.md` and `docs/GUIDE.md`: a "Questionnaires" section (mode, `graded=false`, scale, what is not supported), the attribute and front-matter tables, common mistakes. `docs/SPEC.md`: the design decisions (status value, version kept at 1, why no branching). `agents.md` (then sync): when to use a survey, and how to read survey results (`quiz grade --json`). `README.md`.
- `skill/SKILL.md`: a short "Make a questionnaire" section: prefer a survey file over asking more than about five questions in chat, or when the user wants to keep the answers; start from `quiz new survey`; read the answers with `quiz grade results.json --quiz FILE --json`. `tests/test_skill.py` must still pass (it checks commands, flags and templates).
- `docs/PLANNED.md`: the new "Questionnaires" heading with this work struck through as done and the deferred items listed.
- Version bump to 0.3.0 in `pyproject.toml`.

### 6. Stats (optional)

The "Answers over time" table described above, with tests in `test_stats.py`.

### 7. Verify

- `uv run pytest -q` (full suite, including e2e) passes; `ruff check .`, `ty check` and markdownlint are clean.
- Rebuild every example; the five existing examples' grading is unchanged (their golden cases still pass and their HTML differs only where the shared page code changed).
- Manual check for the user: open `examples/survey/quiz.html`, answer, Finish, Export; run `quiz grade` on the export and read the Answers report.
- Report: commits, test counts, any deviation from the syntax decided above and why.

## Ask the user instead of guessing

- If keeping `version` 1 for the new status value breaks a schema test in a way that suggests external consumers.
- If ordering-as-ranking needs a different syntax than the plain list.
- Before any change to the five existing examples' content.
