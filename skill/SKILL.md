---
name: quiz
description: Make a self-grading HTML quiz, practice test or exam from study material with the `quiz` CLI (fullmark), or grade a learner's exported results.json. Use when the user wants a quiz, practice test, flashcard-style check or exam from notes, a PDF, a chapter or a topic, or asks to grade or review quiz results (essays, code, weak topics, progress over attempts). Also for a questionnaire, survey or intake form with no score, whose answers can be sent straight back with `quiz serve`. Output is one offline HTML file that opens by double-click.
---

# quiz

`quiz` turns a Markdown file into one self-contained HTML quiz (offline, phone-friendly) that grades itself and exports the learner's answers as JSON. You write the Markdown; the tool validates, lints, builds and grades.

This file is the workflow and the judgment. The syntax and every flag are in the tool itself, which is always current:

- `quiz agent-guide`: instructions for agents (syntax summary, grading JSON fields, schemas). **Run it once per session before writing or grading.**
- `quiz guide`: the full authoring reference with a minimal example of every question type.

Do not write syntax from memory; read those first.

## Make a quiz

1. **Read the material.** Ask only what you cannot infer: topic, length, difficulty, language, time limit. Defaults: 10 to 15 questions, mixed types, untimed unless an exam is asked for. List the defaults you chose (length, difficulty, time limit, types) in your final message.
2. **Start from a template** (`quiz templates` lists them): `quiz new <template> [folder]`. Pick by shape:
   - `calculus`: math, LaTeX, numeric answers
   - `rust`: code snippets, blanks in code, code answers
   - `ielts`: timed essays with band scores
   - `medical`: pathways (ordering), matching, calculations with units
   - `exam`: closed book, time limit, no feedback until the end, a question bank
   - `survey`: a questionnaire with no score (see Make a questionnaire)
   - `blank`: one example of every type
3. **Write the questions** from the material (rules below). Put the page or section in each explanation where possible. For drills, write extra questions and use a question bank (`pick`), so each attempt differs.
4. **Check:** `quiz check quiz.md --strict` and fix every error and warning, including the weak-question lints (short explanation, "all of the above", a correct option much longer than the rest, answer in the question text, skewed answer positions). Re-run until it is clean.
5. **Inspect coverage:** `quiz inspect quiz.md` shows types, points, sections, tags and answer positions. Compare the tags with the material's topics; fill gaps, and spread the correct answers.
6. **Build or register.** Run `quiz library status --json`. If it reports a library (`status` is not `no_library`), register instead of building: `quiz library register quiz.md --json`, and give the user the `take` line from its JSON (`quiz library take NAME`); never run `init` yourself (see Keep it in the library below). With no library, build as before: `quiz build quiz.md --strict`. Put the quiz next to the material it tests, with images in `assets/` beside the `.md`. Tell the user the HTML path, and how to hand back results: press **Submit**, then **Export answers**, then give the `results.json` back. Open it (`--open`) only if the user wants to see it now. If the user takes it now and wants it graded, skip the download: run `quiz serve quiz.html --once --open --json` in the background; **Submit** sends the results, and you grade the file it writes. Mention once that `quiz library init PATH` exists if the user has no library and keeps making quizzes.

While iterating with the user watching, `quiz watch quiz.md --serve` rebuilds on every save and reloads the browser. It keeps running: start it only when the user asks, and never in a way that blocks you.

## Keep it in the library

`quiz library` files the user's own quizzes and their results in one folder under git. The agent's loop is `check` then (`review`) then `quiz library register FILE.md --json`; `quiz agent-guide` (Job 4) has the full contract. Rules that matter here:

- **Exit 3 from `register` means there is no library: ask the user where it should go and give them `quiz library init PATH` to run. Never run `init` on your own** (without a path it would make the current folder the library). `init` refuses a folder that has other files.
- On a name clash use the suggested name with `-n` and say so. To change a registered quiz: `quiz library share NAME --source -o DIR`, edit, `quiz check`, then `quiz library register DIR/NAME/FILE.md --update NAME`. Registering a file that is already registered always needs `--update NAME`; without it the command exits 1.
- End with the `take` line. Never push, and never edit files inside the library. Results are in `quiz library path NAME`/results. Grade the newest attempt with `quiz library grade NAME --json` (or `--attempt STAMP`): it uses the version the attempt was taken on and writes `reports/<stamp>-report.json` and, for essays and code, an empty `reports/<stamp>-grades.json`. Fill that in, then `quiz library grade NAME --grades <that file> --json`. `quiz library stats NAME --json` shows progress over all attempts.
- **Never run `quiz library rm` or `rename` unless the user asked for that exact quiz.** `rm` deletes it with its results; never add `--yes` or `--force` on your own.

## Make a questionnaire

Prefer a survey file over asking more than about five questions in chat, or when the user wants to keep the answers (an intake form, a project kickoff, a self-review, course feedback).

1. Start from `quiz new survey`. Set `mode: survey` in the front matter: every question is ungraded and the page shows no score.
2. Use `single`, `multi` (write `{type=multi}`; no `[x]`), `short`, `fields`, `essay`, `ordering` (a ranking) and `scale` (`{type=scale}` with `min`, `max` and `labels` in an `answer` block). For one "how sure are you?" question inside a real quiz, add a `scale` question, or `graded=false` on a heading.
   For an "Other" choice, end it with `{input="What is it?"}`: a text field appears when it is picked, and `answer_text` reads `Other: the text`.
3. Check, build and hand over the HTML as for a quiz; the respondent presses **Finish**, then **Export answers**.
4. When you are waiting for the answers, do not ask for a download: run `quiz serve quiz.md --once --open --json` in the background. The respondent presses **Finish**, the answers are written next to the quiz file, and the command exits 0 (2 if `--timeout` passes). Read the path from its JSON output.
5. Read the answers with `quiz grade results.json --quiz quiz.md --json`: each question has `answer_text`, and nothing is scored or sent for AI grading.

## Provenance

Set `generated_by` in the front matter to your exact model ID as your environment states it (for example `claude-opus-5-5`); never guess a version from memory; if you do not know it, leave the field out. When you edit a quiz someone else wrote, set it to yourself.

## Start from a brief

The quiz `.md` can live in a scratch folder when it will be registered in the library, since the library keeps its own copy. For a new quiz, look for `brief.yaml` in the quiz folder and read it before asking anything. It records the purpose, scope, material in `content/`, count, mix, difficulty, mode, weak topics (`focus_tags`: stress these) and language. If `request` is filled in, do not ask the brief questions again.

- The human-only values are **purpose and scope**. Without a brief, when the user asks to set up a quiz, run `quiz brief DIR --web` in the background (with `--timeout`) so they answer in the form; ask in chat only when the message already gives purpose and scope, or the user says to skip the form; `quiz brief DIR` exits 3 until both are given. Never fill them in yourself, and pass `--accept-defaults` only when the user handed those choices over (then list what you chose).
- When `past-exams` is ticked, mirror the structure of those exams (types, split of marks, length) and cite them in the explanations as `Source: file, question N`.
- `quiz check` warns when the quiz drifts from the brief (`brief.count`, `brief.mix`, `brief.past-exams`, `brief.content-kinds`): fix the quiz, not the brief.
- When you are done, tell the user the brief values you used, and offer `quiz review`.

## Review what you wrote

An agent-written quiz can have a wrong answer key, or a question that is not in the material. Only the learner can judge that.

1. After writing a quiz from material, offer `quiz review quiz.md`. If the user agrees, run `quiz review quiz.md --once --open --json` in the background and wait; it exits 0 when the learner presses **Finish** (2 on `--timeout`). Its JSON lists the `flagged` questions and the counts.
2. Fix what is flagged by changing the quiz source, then run `quiz check quiz.md --review review.json`. It fails until every dropped question is gone and every fix or wrong-key question has changed.
3. Offer `quiz review quiz.md --since review.json` so the learner sees only what changed.

**Never write or edit `review.json`.** It is the learner's verdict, written only by `quiz review`. Give questions `{id=...}` so a review survives reordering.

## Rules for good questions

- Never put the answer, or a giveaway, in the question text. Never reuse the explanation's wording in the prompt.
- Distractors must be plausible: common misconceptions, off-by-one values, near-synonyms. No joke options.
- One concept per question. Numeric answers need units, a tolerance and a dot decimal.
- Mix types to fit the content: `numeric` or `fields` for calculations, `blanks` for definitions and code gaps, `ordering` for sequences, `matching` for pairs, `essay` and `code` for open work.
- Figures: add one only when reading it is the skill being tested (a trace, a plot, a circuit, a micrograph) or the user's past exams use figures; otherwise match the exam's text-and-equations style, and never add one as decoration. Take figures from the material first (crop them into `assets/` and cite them), or plot them from an equation with a script kept beside the quiz. Never draw diagrams yourself. Use a web image only when the user allows it or the topic cannot be tested without one and the material has none, and name its source.
- Every auto-graded question gets an explanation that says why the answer is right and what the wrong options get wrong.
- Essay and code questions need a rubric of three to five checkable lines; they are what you grade against later.
- Match the requested length and difficulty. If the material is thin, make fewer questions; never invent facts.
- Content must be correct. For code, verify claims with the real compiler or interpreter (for Rust: `rustc --edition 2021`) before writing "this compiles" or "this prints".
- The answer key is in the HTML, only lightly obfuscated. Never describe a quiz as secure or cheat-proof.

## Grade results

1. **Report:** `quiz grade results.json --quiz quiz.md --json`. Python re-grades from the quiz source and is the authority. Mention its warnings to the user: a score that differs from the browser's, a quiz changed after the attempt, or a question-bank draw that does not match.
2. **Grade the open answers.** The same command writes an empty `*-grades.json` template. For every question that needs AI grading (essays, code, ungraded fields), read the learner's response against the rubric and fill in `score` (0 to the question's points), `band` (0 to 9 in half steps, only where the question uses bands), `criteria`, `justification` and `improvement`. Be specific: quote the learner's text, name two strengths and two improvements. Judge code by reading it; **never run the learner's code** unless the user asks.
3. **Merge:** run the grade command again with `--grades <file>` to get the final scores in the report. Fix any error it reports (unknown id, score out of range).
4. **Summarize for the learner:** the overall result, the weakest topics, what to restudy, and the wrong answers that show a misunderstanding rather than a slip. Do not edit the learner's answers or the results file.
5. **Progress over attempts:** with several results files for one quiz, `quiz stats a.json b.json ... --quiz quiz.md` shows the score trend and per-topic change; use it to say what improved and what still needs work.
