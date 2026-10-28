# Proposal: sample questions in materials sheets

**Status: unlikely; kept as a record.** Raised on 2026-10-28, and set aside the same day: materials are the sheets an exam hands out (QUIZ_SYNTAX.md, section 2), and worked examples are study material, the learner's own side, so they do not fit that purpose. In v1 a `materials` sheet holds no question syntax at all: a `{type=…}` attribute, an `answer` block, a `- [x]` or `- [ ]` choice line or a `[[…]]` blank is `materials.question`, an error ([QUIZ_SYNTAX.md](../QUIZ_SYNTAX.md), sections 2 and 8a). Worked examples are written as text. Starting strict keeps this open: no v1 sheet uses that syntax, so a later version can give it a meaning without breaking one.

## The idea

A sheet may hold worked examples written as fullmark questions, so that every question anywhere in a quiz folder has one format and is checked by one parser. A sample question is shown, never answered or scored, and its answer is optional: with one, the sheet shows it; without one, the question stands as a prompt to think about.

## What it needs to settle

- **Which `##` is a question.** In a quiz every `##` is a question; in a sheet `##` and `###` are ordinary headings, so linters stay happy. Likely: in a sheet, a `##` is a sample question only with a `{type=…}` attribute.
- **An answer-free form for each type.** `single` and `multi`: every choice `[ ]`. `truefalse`, `numeric`, `short`, `fields`: no `answer` block. `essay`, `code`, `scale`: as now. Open: `blanks`, whose answer is the blank itself (`[[cos x]]`), and `ordering` and `matching`, whose answer is the list order and the pairs.
- **The parser's mode.** The quiz parser runs on a sheet with the answer rules relaxed and every other rule kept; an answer that is given is checked in full.
- **Ids and history.** Sample questions take no ids and no question hashes, are never in a plan, a score, `results-v2` or `stats`, and `quiz ids` skips them. The sheet's text stays in the quiz hash as now.
- **Display.** In the sidebar, in review and replay: the question read-only (ticks shown as ✓ and ☐, never as inputs), the answer below it when given. On the printed materials page the same, in black ink.
- **Giving answers away.** As for any sheet, the author decides; the guide suggests examples whose numbers differ from the quiz's.

## Not affected

Prose examples ("Find the mean of 2, 4, 6. Answer: 4") are text in v1 and stay text.
