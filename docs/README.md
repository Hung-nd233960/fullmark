# fullmark 1.0 docs

The design of fullmark 1.0 (the TypeScript rewrite) and the plans it is built from. The design docs say what 1.0 is; the plans say how it is being built, step by step. Where the two disagree, the design docs win.

## Where to start

- **Working on the code:** read the Handoff at the top of the current step's plan ([plans/STEP3.md](plans/STEP3.md)) first. It says what is done, what waits for the owner and what comes next.
- **Learning the design:** [USER_DESIGN.md](design/USER_DESIGN.md) (why), then [TECHNICAL_DESIGN.md](design/TECHNICAL_DESIGN.md) (how), then [COMMANDS.md](design/COMMANDS.md) and [QUIZ_SYNTAX.md](design/QUIZ_SYNTAX.md) as references.

## Design (`design/`)

| File | What it holds |
|---|---|
| [USER_DESIGN.md](design/USER_DESIGN.md) | What fullmark is for, who uses it, and how people and agents work with it. The intent the other docs are judged against |
| [TECHNICAL_DESIGN.md](design/TECHNICAL_DESIGN.md) | How 1.0 is built: stack, IR, Plan and Attempt, rules and profiles, grading and rubrics, architecture and budgets, pages and themes, languages, library, testing, and the order of work (section 12) |
| [COMMANDS.md](design/COMMANDS.md) | The command reference: every command's arguments, output, files and exit codes, and the conventions they share |
| [QUIZ_SYNTAX.md](design/QUIZ_SYNTAX.md) | How a quiz is written in Markdown, with every field and every syntax rule. Settled |
| [TODO.md](design/TODO.md) | Design gaps still to settle, grouped by the step that needs them |
| [fullmark-migration.md](design/fullmark-migration.md) | Why 1.0 is a rewrite rather than a migration of 0.x, and the version plan |
| [proposals/](design/proposals/) | Ideas outside v1. Each says its status and the v1 seam it relies on, if any |

## The steps

The full table, with what each step contains and when it is done, is [TECHNICAL_DESIGN.md, section 12](design/TECHNICAL_DESIGN.md#12-order-of-work). In short:

| Step | Content | Plan |
|---|---|---|
| 0 | The quiz syntax, and 0.x's test data rewritten in it | done |
| 1 | The core: parser, rules and profiles, grader and rubrics; `check`, `rules`, `grade`, `ids` | done: [plans/STEP1.md](plans/STEP1.md) |
| 2 | `build`, the page runtime, themes and fonts, `replay`, the printable paper | done: [plans/STEP2.md](plans/STEP2.md) |
| 3 | `serve`, `review`, `grade --web`, `brief`, `stats`, `inspect`, `new`, `template`, `build --watch` | drafted: [plans/STEP3.md](plans/STEP3.md) |
| 4 | The library | not written yet |
| 5 | `publish` and `import` | not written yet |
| 6 | Moving the owner's 0.x history into a 1.0 library | not written yet |

## Plans (`plans/`)

One file per step (`STEP1.md`, `STEP2.md` and so on), written when the step starts. Each is cut into slices small enough to hand to one agent and review before the next. A slice's brief is written in full before it is delegated; the Handoff at the top of the file keeps the current state.

## Proposals

| File | Idea |
|---|---|
| [app-window.md](design/proposals/app-window.md) | Knowing when the quiz window closes, and an app window |
| [background-serve.md](design/proposals/background-serve.md) | `--background` for the one-shot server |
| [brief-purposes.md](design/proposals/brief-purposes.md) | Briefs fitted to a subject: template overrides, the brief as a survey |
| [cli_integration.md](design/proposals/cli_integration.md) | Shell completion, prediction, a tldr page, Starship |
| [guide-web.md](design/proposals/guide-web.md) | `quiz guide --web`: the authoring guide with live examples |
| [import-clone.md](design/proposals/import-clone.md) | `library import --clone` from a Git URL |
| [interactions.md](design/proposals/interactions.md) | Open questions on how the features combine |
| [japanese-support.md](design/proposals/japanese-support.md) | Japanese quizzes, JLPT N5 to N3 |
| [library-query.md](design/proposals/library-query.md) | Filters on `library list` |
| [markdown-export.md](design/proposals/markdown-export.md) | Plain Markdown export for Word and Typst |
| [multi-quiz-bundle.md](design/proposals/multi-quiz-bundle.md) | Several quizzes in one HTML file |
| [rapid-response.md](design/proposals/rapid-response.md) | One question at a time that moves on when answered, for drills |
| [reference-sheet.md](design/proposals/reference-sheet.md) | Reference sheets: formulas, constants, unit conversions |
| [self-host.md](design/proposals/self-host.md) | A library server for a homelab |
| [shelves.md](design/proposals/shelves.md) | Several shelves and commands to manage them |
| [small_quirks_from_old_project_need_fixed.md](design/proposals/small_quirks_from_old_project_need_fixed.md) | Small 0.x quirks to fix in 1.0 |
| [vi-typo-check.md](design/proposals/vi-typo-check.md) | Vietnamese typo checks in `check` |
