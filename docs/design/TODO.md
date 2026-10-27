# Design gaps to settle

Gaps and contradictions in the 1.0 design docs, found while writing [USER_DESIGN.md](USER_DESIGN.md). Each item says where it is and, when there is one, the suggested fix. Remove an item when the docs are fixed.

## Needs its own design

- [ ] **The quiz syntax.** Draft in [QUIZ_SYNTAX.md](QUIZ_SYNTAX.md) (2026-10-27); settle its open questions. The docs fix what a quiz contains (front matter, sections, questions with type, points, tags, key and explanation, banks, rubrics: [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md), sections 4 and 6) but not how it is written in Markdown. [USER_DESIGN.md](USER_DESIGN.md) defers it to `quiz guide`, which does not exist yet. It is the largest open piece of the design: the parser, `check`'s fixed rules, the guide and its `quiz-example` blocks, the templates, `new --skeleton` and the agent's workflow all depend on it. 1.0 reads no 0.x quiz, so the syntax is open; 0.x's syntax is a source of ideas, not a format to match. Design it in its own document (`QUIZ_SYNTAX.md`) before writing `quiz guide`, not while writing it. Mark each field as **structure** or **content**, so `--skeleton` follows from the syntax (below).

## Waits on the quiz syntax

- [ ] **`new --skeleton` details** ([COMMANDS.md](COMMANDS.md), `quiz new`). The current keep/drop list (keep front matter, section titles, intros and times, each question's type, points and tags; drop text, choices, key, explanation, ids) was written before the syntax and does not cover banks (`pick`), rubrics or per-question options. Proposed: no per-case rules. `--skeleton` keeps every field the syntax marks as structure and drops every field marked as content. Leaning: a bank keeps its `pick` count and blanks each question; a rubric is structure and is kept whole, so no warning about dropping one is needed. Drafted in QUIZ_SYNTAX.md, section 9; settle when the syntax is.
