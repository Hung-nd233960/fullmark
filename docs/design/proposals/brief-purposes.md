# Proposal: briefs that fit the subject

**Status: proposal, not in v1 scope** (raised by the owner on 2026-11-03, in step 3's planning). v1 has one brief for every subject: the four purposes, their default mix (COMMANDS.md, `quiz brief`), and the machine config's `[brief.purpose.<purpose>]` tables, which change a purpose's defaults for every subject.

## The problem

The purpose says *why* a quiz is made (self-study, exam prep), not *what* it is about. An IELTS learner is shown `code` and `calculation` in the mix, and a default mix that may hold them. Nothing is wrong (they untick them), but the brief cannot know the subject. In fullmark the subject lives in the template (`quiz new ielts`), and nothing links a brief to a template.

## The ideas

### 1. Template overrides (the next step)

A template folder may hold `brief-questions.yaml`, read by `quiz brief DIR --template NAME`. It may only narrow the built-in question file (`src/brief/questions.yaml`): hide choices (IELTS hides `code` and `calculation`), change defaults, add a hint. It never adds or renames a key, so `brief.yaml`'s keys stay fixed and `check` and agents can rely on them. Overrides are validated against the built-in file, with `file:line` errors. About a day with its tests.

### 2. The brief as a survey quiz (later, if surveys prove themselves)

A brief is a questionnaire, and fullmark already has questionnaires: `kind: survey` quizzes, served by `serve`. `brief --web` would serve a built-in `brief.md`, and its results would become `brief.yaml`; a template could ship its own. It would replace the brief's own web form. Against it: the quiz syntax would need brief-only attributes (the key a question fills, human-only, defaults, `min-words`, `decided_by`); a survey is in one language, so each brief would be two files that can drift; and `--tui` and the flags would have to read survey quizzes. A redesign of the brief, not a layer on it.

### 3. A dedicated Markdown syntax for briefs (considered, not chosen)

A `BRIEF_SYNTAX.md` with its own parser, IR and error rules. Three to five days, a second Markdown dialect to learn, no natural place for a second language, and against "three data formats, and no fourth" (TECHNICAL_DESIGN.md, section 7): a brief's questions are structure, which is YAML's job. The YAML question file already is a dedicated format with an IR.

## What v1 keeps open

Nothing here changes a v1 file format: `brief.yaml`'s keys are fixed, and the question file holds each purpose's defaults, so idea 1 adds a file and a flag, nothing more.
