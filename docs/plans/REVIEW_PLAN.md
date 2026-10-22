# Plan: `quiz review`, `quiz serve --tui` and `quiz brief`

A work list for an agent, one task per commit. Written on 2026-10-21 at quizmd 0.5.0. Follow the rules at the top of `BUILD_PLAN.md`:

- read `AGENTS.md` and the CLI guide first;
- grading lives twice;
- page changes rebuild the examples;
- obey the UI rules the tests enforce;
- all localStorage goes through `store()`;
- strike items through in `docs/PLANNED.md`;
- never publish.

Also read the tooling principles in your own setup. It is binding: the spec file is the truth, `check` defines done, `--json` output, exit codes `0` done / `1` errors / `2` usage or timeout / `3` needs input, and human-only decisions are enforced by the tool.

The three parts are independent. **Order, changed by the user on 2026-10-21: A, then C, then B.** Part C ships without `--tui` (flags and `--web` only; `--tui` exits 2 with "terminal form not built yet; use --web or flags"). Part B is not started.

| Part | Status |
|---|---|
| A. `quiz review` | **Done** (0.6.0); the page counts cards and hides flag boxes since 0.7.1 |
| C. `quiz brief` | **Done** (0.7.0), flags and `--web` only; `--tui` exits 2 |
| B. `quiz serve --tui` | not started; needs the user's go-ahead |

## Why

- **A. Review.** Agents write quizzes from the user's material. The real risk is a **wrong answer key**, or a question about something that is not in the material. Only the learner can judge that, and today there is no structured way to say "question 7 is wrong". `quiz review` gives the learner a form per question and gives the agent a file that says exactly what to fix. `quiz check` then holds the agent to it.
- **B. A terminal form.** presentation-kit built its own Textual form for `deck new --tui`. Every tool that asks the user something (deck, the future `fig`, the context intake) would do the same. If quizmd can show any survey in a terminal, including over SSH on the lab machines, every tool gets a web form and a terminal form from one survey file.
- **C. A quiz brief.** This is the `deck new --web` idea for quizzes: purpose, scope, material, count, mix, difficulty and mode, written to `brief.yaml` for an agent to pick up. It is the least urgent, because two answers (purpose and scope) usually fit in one chat message, and it is cheap once A and B exist.

## A. `quiz review` (decided; done in 0.6.0)

```text
quiz review FILE.md [--out review.json] [--since review.json] [--open] [--once] [--timeout 1800] [--port 0] [--json] [--tui]
quiz check FILE.md --review review.json
```

**The form.**

- `quiz review` generates a **survey** from the quiz, in memory, and serves it with the `quiz serve` machinery. It writes nothing beside the source except the review file. One review card per question, in document order.
- **What a card shows:**
  - the question exactly as it is rendered (code, math, images);
  - the answer key: correct choices, accepted answers, tolerance, model answer or rubric, as the type has them;
  - the explanation;
  - points, tags, the question id and the source line.
- **What a card asks:**
  - **Verdict:** a single choice of `Keep`, `Fix {input="What should change?"}` or `Drop {input="Why?"}`. This uses the 0.5.0 follow-up inputs.
  - **Problems:** an optional multi. `The answer key is wrong`, `Not in my material`, `Unclear wording`, `Too easy`, `Too hard`, `Duplicate of another question`.
  - **Note:** an optional short text.
- A card with no verdict counts as not reviewed. Finish is allowed with cards left unreviewed, because partial reviews are normal.
- `--since review.json` shows only the questions that are new or changed since that review (see matching below), so a re-review after the agent's fixes is short.
- The review survey's own `quiz.id` is `<quiz-id>-review`. The served page reuses the survey page; no new page type. The form carries the front-matter marker `review: true` (0.7.1), which makes the page count cards instead of fields and hide the flag checkbox.

**The file, `review.json`** (add `review-v1.schema.json`):

```json
{
  "version": 1,
  "quiz": {"id": "calc1-derivatives", "source_hash": "…"},
  "reviewed_at": "2026-10-21T21:05:00+07:00",
  "items": {
    "q7": {"hash": "…", "verdict": "fix", "text": "the derivative of sin is cos, not -cos",
           "problems": ["key-wrong"], "note": ""},
    "q9": {"hash": "…", "verdict": "drop", "text": "not covered in lecture 3", "problems": ["not-in-material"]}
  }
}
```

- `hash` is the SHA-256 (first 16 hex characters) of that question's normalized source block: heading line to the end of the block, line endings normalized.
- `quiz review --out` merges with an existing file of the same name. Newer items replace older ones, items not shown are kept, and there is no silent overwrite: write `-2` as `quiz serve` does, or merge into the file `--since` names.
- **Matching.** Questions are matched to items by id first. If the id is missing or the default `qN` changed, they are matched by `hash`.
  - `quiz review` warns (exit 0) when questions have no explicit `{id=…}`. Reviews then survive only by hash, so the warning suggests adding ids.
  - Never write ids into the user's source.

**The check, `quiz check FILE --review review.json`.**

| Rule | Level | When |
|---|---|---|
| `review.drop` | error | A question marked `drop` is still in the quiz, matched by id or hash. |
| `review.fix` | error | A question marked `fix` still has the same hash, so it was not changed. The message includes the reviewer's text. |
| `review.changed` | info | A `fix` question changed. Re-review it with `--since`. |
| `review.unreviewed` | warning | A question with no item, or with a changed hash after `keep`. |
| `review.key-wrong` | error | `key-wrong` is ticked and the hash is unchanged, even if the verdict is `keep`. |

- Exit 1 on errors. `--json` adds `review` issues to the usual output.
- `quiz inspect --review review.json` shows counts: kept, to fix, to drop, unreviewed.

**Human-only.** The verdicts are the user's. The agent guide and the skill must say:

- After writing a quiz from material, run `quiz review FILE --once --open --json` and wait.
- Fix what is flagged, by changing the source.
- Run `quiz check --review`.
- Offer a `--since` re-review.

The agent never writes or edits `review.json` itself. `quiz check` cannot enforce that, so `review.json` carries `"by": "quiz review"`, and the guide says so.

**Tests:**

- generating the review survey for every example, and that it passes `quiz check`;
- serve round trip, POSTed with `urllib` as the serve tests do;
- merge and no-overwrite;
- every `review.*` rule, with fixtures;
- id and hash matching, including after reordering;
- `--since`;
- the schema;
- e2e: fill two cards in Edge, Finish, and check the file;
- an axe check of the review page.

**Docs:**

- `guide.md` and `docs/GUIDE.md`: "Review a quiz an agent wrote".
- `docs/SPEC.md`: a new section.
- `agents.md`, then sync it.
- `skill/SKILL.md`: one paragraph, and `tests/test_skill.py` must pass.
- `README.md`, `docs/PLANNED.md`.
- Version 0.6.0.

### A. Tasks

1. The review survey generator and `quiz review` on top of `serve.py`, with `--since`, merge, the schema, and unit and serve tests.
2. The `quiz check --review` rules, `quiz inspect --review`, and fixtures.
3. e2e and axe tests; rebuild the examples if the page changed.
4. Docs, skill, the agent guide and the version.

## B. `quiz serve FILE --tui` (proposal; ask the user before starting)

- The same command and the same output as the web form: `--out`, `--json`, `--timeout`, `--once`, exit codes. Only the front end changes. A tool switches between the two forms with one flag.
- **Surveys only** (`mode: survey`) in the first version. The supported types:
  - `single` and `multi`, with follow-up inputs;
  - `fields`;
  - short text and number;
  - `essay` (multi-line TextArea);
  - `scale`;
  - `ordering` (move with keys; a "Keep this order" action).
- Any other type (code, matching, image questions) exits 2: "use the web form".
- Graded quizzes in the terminal come later, if ever. The web page is the place to take a quiz.
- **The result file is identical to the web export** for the same answers, apart from times and the user agent. Write a parity test that answers the survey example both ways, compares the JSON, and checks both against `results-v1.schema.json`.
- **Layout:**
  - sections become headings in one scrolling form;
  - help text sits under each question;
  - Required answers are marked;
  - vim keys `j`/`k` move between questions;
  - Finish asks for confirmation, as the page does.
  - Follow `the setups-manager project` for Textual structure and style.
- **Dependency:** Textual as an **optional extra**, `quizmd[tui]`. The base install stays light. Without it, `--tui` exits 2 with the install hint (`uv tool install --editable <path to this repo>[tui] --force`).
- With no TTY, it exits 2. Test only with Textual's `run_test` pilot; never launch it in a real terminal.
- `quiz review --tui` works as soon as this exists, because a review is a survey. Use plain-text fallbacks for math and images (show the TeX and the alt text).
- **Follow-up, not part of this plan:** presentation-kit can replace `src/deck/brief_tui.py` with `quiz serve --tui` on its generated survey. Record this in presentation-kit's plan when B is done; do not edit presentation-kit from here.

## C. `quiz brief DIR` (decided; done in 0.7.0 without `--tui`)

`quiz new TEMPLATE [PATH]` already exists and copies a template, so the brief gets its own command:

```text
quiz brief DIR [--web | --tui] [--purpose …] [--scope …] [--count N] [--minutes N] [--mix …] [--difficulty …]
              [--mode …] [--weak-topics yes|no] [--language en|vi] [--request …] [--accept-defaults] [--json]
```

- It writes `DIR/brief.yaml` and `DIR/content/` (with a README), as in presentation-kit's phase 8.1. It does not write the quiz: the agent writes `quiz.md` from the brief and the material.
- **One question list,** `src/quizmd/brief_questions.yaml`: id, label, help, type, choices with hints, default, `delegable`. It feeds the flags, the survey for `--web` and `--tui` (parts B and serve), and a three-way agreement test. Copy the idea, not the code, from presentation-kit `src/deck/brief_questions.yaml`.
- **Questions:**

  | id | Type | Default | Delegable |
  |---|---|---|---|
  | `purpose`: self-study, exam prep, quizzing classmates, survey or form | single | — | **no** |
  | `scope`: chapters, lectures or topics | short text | — | **no** |
  | `kinds`: lecture slides, textbook chapter, notes, past exams, lab manual, something else (with a follow-up box) | multi | — | yes |
  | `elsewhere`: material not in `content/` | short text | empty | yes |
  | `count` | number | 20 | yes |
  | `minutes`: time limit, 0 for none | number | 0 | yes |
  | `mix`: recall, understanding, calculation, code, essay | multi | recall, understanding | yes |
  | `difficulty`: warm-up, like the exam, harder than the exam | single | like the exam | yes |
  | `mode`: feedback after each question, only at the end, timed exam | single | at the end | yes |
  | `weak_topics`: focus on weak topics from earlier attempts | yes/no | yes, if results exist | yes |
  | `language` | single | en | yes |
  | `request`: what Claude should do, what to stress, what to avoid | long text | empty | yes |

- **Weak topics.** If results files for a quiz in DIR exist (`*-results-*.json`), pre-fill `weak_topics` from `quiz stats --json`. Record the weak tags in `brief.yaml` as `focus_tags`.
- **Exit 3** when `purpose` or `scope` is missing and neither form was asked for (`--json` lists what is missing and the form commands). `--accept-defaults` and `decided_by: user|default|agent` behave as in presentation-kit.
- **Check.** `quiz check` with `brief.yaml` beside the quiz, at warning level:
  - the question count is outside ±20% of `count`;
  - a `mix` type is missing;
  - `past-exams` is ticked but the agent's quiz has no `source` notes pointing to them;
  - the `content.kinds` folder check, as in deck 8.1.
- **Past exams.** The skill tells the agent to mirror their structure: types, the split of marks, length.
- At the end it prints the hand-off: `Next: tell Claude: "Write the quiz in <DIR> (brief.yaml is ready)."`. With `--json` it also prints `next`.

## Not in scope

Several reviewers, comments threaded per question, reviewing in the quiz page itself, graded quizzes in the terminal (B), and generating questions in code (that is the agent's job).
