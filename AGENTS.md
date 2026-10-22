# AGENTS.md: working with fullmark

fullmark turns one Markdown file into one offline, self-grading HTML quiz. This file is for AI agents. It covers **using** fullmark (Jobs 1, 2 and 4: write, grade and file quizzes) and **changing** it (Job 3: develop the tool).

## Quick facts

- CLI: `quiz` (installed with `uv tool install --editable <path to this repo>`). In the repo, use `uv run quiz ...`.
- Full authoring reference: run `quiz guide`. This file: run `quiz agent-guide` (it works without the repo). It is the source of truth for syntax. Read it before writing a quiz; do not guess.
- Examples to copy from: `examples/calculus/`, `examples/rust/`, `examples/ielts/`, `examples/medical/`, `examples/exam/` (each has `quiz.md`, a built `quiz.html`, and `assets/` where needed). `quiz new calculus|rust|ielts|medical|exam|blank [PATH]` copies a template and never overwrites.
- Exit codes for `check` and `build`: 0 = ok (warnings allowed), 1 = quiz errors, 2 = usage or I/O problem. With `--strict`, any warning is also 1 (use it in CI; `build --strict` writes nothing).
- Nothing needs the network. Do not add network requests to the page; tests assert there are none.

## Job 1: author a quiz

1. Read the source material, then run `quiz guide`.
2. Write `quiz.md`: YAML front matter (`title` required; quote it if it contains a colon), optional `#` sections, `##` questions.
3. Run `quiz check quiz.md` (add `--json` to parse findings). Output is `file:line: error|warning: qN (type): message`. Fix every error; fix warnings too, usually a missing `> [!explanation]`. `quiz check` also lints for weak questions (short explanation, "all of the above", a correct option much longer than the rest, answer in the question text, skewed answer positions). Fix those too; they are the usual agent mistakes. `quiz inspect quiz.md` shows types, points, sections, tags and answer positions, so you can check coverage against the source material.
4. While iterating, `quiz watch quiz.md` rebuilds on every save (reload the page after each rebuild, or use `--serve` to have the browser reload by itself).
5. Run `quiz build quiz.md` to write `quiz.html` beside it (`-o OUT` to choose, `--open` to launch it). Give the learner that one file.

Rules that avoid most errors:

- Choice questions: every item needs `[ ]` or `[x]`. One `[x]` is single, two or more is multi.
- `truefalse`, `numeric`, `short`, `fields`, `essay` and `code` need a fenced block whose info string is `answer`, containing YAML (`value`, `tolerance`, `accept`, `patterns`, `min_words`, `rubric`, `language`, `starter`).
- `ordering`: write an ordered list in the **correct** order (the page shuffles it). `matching`: bullets `left :: right`; a bullet `:: right` is a distractor. Neither takes an `answer` block. Both follow `multi_scoring` (`partial` or `all_or_nothing`).
- `blanks` use inline `[[answer|variant]]`, also inside code blocks.
- Heading attributes go at the end of the `##` line: `{type=numeric points=2 id=q-area tags=limits}`. Tags have no spaces; they drive the per-topic report.
- Numeric answers are compared as numbers, not symbolically. For `short` answers list every accepted spelling.
- Question banks: write extra questions and set `pick: N` (front matter) or `{pick=N}` on sections so each attempt draws a random subset. The export records the draw (`attempt.bank`) and `quiz grade` checks it. Use it for practice drills, not when everyone must see the same questions.
- Questionnaires: `mode: survey` (front matter) makes every question ungraded and the page shows no score; `graded=false` on a `##` heading does that for one question; `{type=scale}` is a rating row. Ungraded questions are `single`, `multi`, `short`, `fields`, `essay`, `ordering` (a ranking) and `scale`; write no `[x]`, no `answer` block on `short`, no rubric on `essay`. Use a survey instead of asking more than about five questions in chat, or when the user wants to keep the answers. Start from `quiz new survey`. When you are waiting for the answers, collect them directly: run `quiz serve quiz.md --once --open --json` in the background (it exits 0 when the respondent presses Finish, 2 on `--timeout`) and read the results file named in its JSON output; never start it in a way that blocks you.
- Follow-up text on a choice: end a `single` or `multi` choice with `{input}` or `{input="What is it?"}` (default prompt "Please specify") to ask for a few words when it is picked, for example "Something else". It works in quizzes and surveys, graded or not, and never changes the score. The export adds `response.inputs` (`{"2": "text"}`, original choice indices) and `quiz grade` shows `Something else: text` (`answer_text`, plus the raw `inputs`, in the JSON report). The marker must end the line and the prompt needs double quotes; on any other question type it is an error.
- Brief: for a new quiz, look for `brief.yaml` in the quiz folder first and read it. It holds the purpose, scope, material (`content/`), count, mix, difficulty, mode, weak topics (`focus_tags`) and language. If `request` is filled in, do not ask the brief questions again. The human-only values are **purpose and scope**: if `brief.yaml` is missing and the user has not said them, ask, or run `quiz brief DIR --web` for them; `quiz brief DIR ...` exits 3 until both are given, and `--accept-defaults` never gives you the scope. Use `--accept-defaults` only when the user handed those choices over, and list what you chose. When `past-exams` is ticked, mirror their structure (types, split of marks, length) and cite them in explanations as `Source: file, question N`. `quiz check` warns when the quiz drifts from the brief (`brief.count`, `brief.mix`, `brief.past-exams`, `brief.content-kinds`).
- Review what you wrote: an agent-written quiz can have a wrong key or a question that is not in the material, and only the learner can judge that. After writing a quiz from material, offer `quiz review quiz.md`; when the user agrees, run `quiz review quiz.md --once --open --json` in the background and wait for it (exit 0 when the learner presses Finish, 2 on `--timeout`). Its JSON lists `flagged` questions (verdict, text, problems, note) and counts. Fix what is flagged **by changing the source**, then run `quiz check quiz.md --review review.json`: `review.drop`, `review.fix` and `review.key-wrong` are errors until the questions change. Offer `quiz review quiz.md --since review.json` for the changed ones. `review: true` in front matter is set only by the generated review form; never write it in a quiz. Never write or edit `review.json` yourself: it is the learner's verdict (it says `"by": "quiz review"`), and the check cannot tell. Give questions `{id=...}` so a review survives reordering; matching otherwise uses a hash of the question text.
- Put images in `assets/` and reference them relatively (`![alt](assets/x.png)`); they are embedded as data URIs. No video, no web URLs.
- Give every auto-graded question an explanation. Write essay and code rubrics concretely, because they are what you will grade against later.
- The answer key is in the HTML, only lightly obfuscated. Never describe the quiz as secure.

## Job 2: grade results

The learner presses Submit, then Export answers, which produces `<id>-results-<date>.json`. Its JSON Schema is `src/fullmark/schemas/results-v1.schema.json`; the `--json` report has `report-v1.schema.json` beside it. Both carry a `version`; new optional fields keep it, so ignore keys you do not know.

```powershell
quiz grade results.json --quiz quiz.md        # writes results-report.md next to the results
quiz grade results.json --quiz quiz.md --json # writes results-report.json instead (preferred for agents)
```

- A learner can press **Retry missed** after Submit. That export has `attempt.retry_of` (the earlier attempt's `started_at`) and `attempt.bank.drawn` lists only the missed questions; `quiz grade` accepts it without a draw warning.
- Python re-grades from the quiz source and is the authority. If it disagrees with the browser score it warns and uses its own number. It also warns if `quiz.md` changed after the attempt.
- Prefer `--json`. It has `summary`, `by_topic` and a `questions` list; each question has `status`, `earned`, `points`, `your_answer`, `correct_answer`, `explanation`, `needs_review` and `needs_ai_grading`. Essay, code and ungraded-field questions also carry an `ai_grading` object: `rubric`, `criteria`, `scoring`, and the learner's `response` (plus `word_count`, `language` and so on).
- Ungraded questions (`graded=false`, `scale`, every question in a survey) have `status: "ungraded"` (or `unanswered`), `earned: null`, `ungraded: true`, the raw `response` and a readable `answer_text`; they are never in `needs_review` or `needs_ai_grading`, and the grades template never lists them. To read a survey: `quiz grade results.json --quiz quiz.md --json` and read `answer_text` per question (`attempt.mode` and the top-level `mode` say `survey`); the Markdown report of a survey is titled "Answers" and has no score.
- The Markdown report has a summary, a per-tag table, a per-question table, an **Answers** section (only when the quiz has ungraded questions), **Review these** (wrong or partial answers with correct answer and explanation), and **Pending AI review**.
- Your job is the **Pending AI review** section: for each essay and code answer, read the learner's response against the rubric and fill in the empty **Grading** block (score out of the question's points, short justification, one concrete improvement). Code answers are never executed; judge by reading.
- Preferred way to record grades: `quiz grade results.json --quiz quiz.md --json` also writes `<results>-grades.json`, an empty template (schema `grades-v1.schema.json`). Fill `score` (0 to the question's points), `band` (0-9, half steps), `criteria`, `justification` and `improvement` for each id, then run the same command with `--grades <file>`. Errors (unknown id, score out of range, bad band) exit 1. The report then carries each grade under `ai_grading.result` and `summary.final_earned`, `final_possible` and `final_percent`. Band questions are reported but never add to the points. An existing template is never overwritten.
- To see progress over several attempts at one quiz: `quiz stats a.json b.json c.json [--quiz quiz.md] [--json]` prints scores by date, per-topic percent per attempt with the change from first to last, and the three weakest topics of the latest attempt, plus an "Answers over time" table for `scale` and ungraded `single` questions (ungraded questions never enter the scores; surveys work too). Different quizzes exit 2; a changed quiz only warns.
- Then summarize for the learner: weak tags first, what to revisit, and corrections for each wrong answer. Do not edit the learner's answers or the JSON.
- Essays with `scoring: band` (set in the `answer` block, IELTS style) ask for a 0-9 band; give one per rubric criterion if the rubric lists criteria.

In Claude Code the `/quiz` skill wraps both jobs. Its source is `skill/SKILL.md` in this repo (linked into `~/.claude/skills/quiz`); `tests/test_skill.py` fails if it names a command, flag or template the CLI does not have.

## Job 3: develop fullmark

Layout (`src/fullmark/`):

| Path | Role |
|---|---|
| `parser.py`, `models.py`, `validate.py` | Markdown to pydantic models, with line numbers; all error messages |
| `grading.py` and `static/quiz.js` | The same grading rules twice (Python authority, JS in the page). Change both together |
| `render.py`, `build.py`, `theme.py`, `templates/`, `static/quiz.css` | The HTML page. Colors live only in `theme.py`; the CSS uses `var(--name)` |
| `report.py` | Markdown report |
| `checking.py`, `serve.py` | The findings behind `quiz check`; the local servers (`watch --serve`, `serve`, `review`, `take`) and `serve_loop` |
| `library/` | `quiz library`: config, registry, git, terminal tables. It imports core; core never imports it (`tests/test_layers.py`); `cli.py` imports it only inside the `library` handler |
| `cli.py`, `templates_cmd.py`, `guide.md`, `agents.md` | CLI, `quiz new`, the text printed by `quiz guide` and `quiz agent-guide` |
| `examples/` | Packaged templates used by `quiz new` and the tests |
| `vendor/katex/` | Vendored KaTeX 0.16.47. Do not edit |

Top-level `examples/` holds copies of the three example quizzes with built HTML. They are not read by the package. The packaged files are the source. After editing a packaged example, `quiz.css` or `quiz.js`, run `uv run python scripts/sync_examples.py` to copy them over and rebuild the HTML; a test fails when they drift. The same script copies `src/fullmark/agents.md` (the source of this file) to the root `AGENTS.md`; edit the packaged one.

Workflow:

```powershell
uv sync
uv run pytest -q                       # full suite, about 5 min, includes real-browser tests
uv run pytest -q --ignore=tests/e2e    # skip the browser tests
```

- Grader changes: add a golden case (`uv run python tests/make_grading_cases.py`); cases run through both Python and JS and must agree.
- New validation error: add one fixture (`tests/fixtures/make_fixtures.py`).
- Docs: `docs/GUIDE.md` (user guide), `docs/SPEC.md` (design decisions), `src/fullmark/guide.md` (authoring reference). Keep the syntax tables in `guide.md` and `GUIDE.md` consistent, then run `uv run python docs/build_docs.py` to rebuild the HTML.
- Example images: `uv run python src/fullmark/examples/make_assets.py`.
- UI rules the tests enforce: no network requests, contrast limits in light and dark, keyboard access. Do not use color alone to signal right or wrong; badges carry a symbol.
- Style: Python is linted by ruff, JS/JSON by Biome, Markdown by markdownlint. A hook formats edited files; fix what it reports.

Working rules (every change):

- Read this file before changing anything.
- One task, one commit. Run `uv run pytest -q` before every commit; it must pass. A known flake under load: Windows socket aborts (WinError 10053); rerun the test alone before treating it as a failure. In browser tests, wait for what a resize or a click changes (`wait_for_selector`, `wait_for_function`) instead of asserting at once.
- A change to syntax updates `src/fullmark/guide.md` **and** `docs/GUIDE.md`. A change to the page (CSS, JS, template) or a packaged example ends with `uv run python scripts/sync_examples.py`.
- Put all localStorage access through the `store()` wrapper in `quiz.js`; it copes with blocked storage.
- Keep `ruff check`, `ruff format --check`, `biome lint src/fullmark/static/quiz.js` and `ty check src/fullmark/library src/fullmark/serve.py` clean.
- A new dependency changes the installed tool: say in the README that `uv tool install --editable <path to this repo> --reinstall` is needed.
- Never touch the user's real library or config (`quiz library path` shows it) except to read it; tests and manual checks use a scratch `FULLMARK_CONFIG`, `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_NOSYSTEM` (the `lib` fixture in `tests/conftest.py`).
- Stop and ask the user before anything that needs an account, a remote or a publish. Never push; never publish to a package index.
- Plans: the roadmap is `docs/PLANNED.md` (strike items through when done: `~~item~~: done`). A work order for a larger change goes in `docs/plans/NAME_PLAN.md` and gets a line in `docs/plans/README.md`. The root holds only `README.md` and `AGENTS.md`.

## Job 4: the library

`quiz library` keeps the user's own quizzes and results in one folder under git. Commands: `init`, `status`, `register`, `list`, `take`, `share`, `path`, `grade`, `stats`, `rename`, `rm`. Exit codes: 0 done, 1 problems or a refused quiz, 2 usage error or no library, 3 needs input. The tool commits after each write and **never pushes**. Everything below is the contract; the user's library may or may not exist.

- **Check first.** `quiz library status --json`: `status` is `no_library` when nothing is set up (exit 2), `ok` or `problems` otherwise. Read it; never change the library or the config by hand.
- **The loop** for a quiz you write: `quiz check quiz.md` (fix errors and warnings), optionally `quiz review`, then `quiz library register quiz.md --json`. No `quiz build` is needed for the user's own quizzes; the `.md` and its `assets/` can sit in your scratch folder. Images must be inside the quiz's folder and referenced relatively.
- **Exit 3 means ask.** With no library, `register` exits 3 with `{"status": "needs_input", "missing": [...], "fix": "quiz library init PATH"}`. Ask the user where the library goes. **Never run `init` yourself**: without PATH it makes the current folder (often the project) the library, and the location is theirs to choose. `init` refuses a folder that has other files (exit 2); give it a new or empty one, for example `D:\quizzes`. Pass `--force` only after the user said yes to switching libraries.
- **A name clash** exits 1 and suggests a free name: register again with `-n` and that name, and tell the user which name you used. The default name is the slugged title, and the JSON says when it was defaulted (`name_defaulted`).
- **Changing a quiz** is explicit. Export the source with `quiz library share NAME --source -o DIR`, edit the file it prints, run `quiz check`, then `quiz library register DIR/NAME/FILE.md --update NAME`. Never guess which quiz a file belongs to, and never edit files inside the library. Registering the same file again without `--update` exits 1 and names the quiz; with `--update NAME` it is safe: `unchanged`, or `replaced` while nobody has taken that version.
- **`register --json`** prints `{"status": "registered"|"replaced"|"new-version"|"updated-assets"|"unchanged", "id", "name", "name_defaulted", "hash", "version_count", "committed", "take": "quiz library take <name>"}`. **End your message with the `take` line** so the user can start the quiz.
- **Grading.** Results are in `quiz library path NAME`/results, one JSON file per attempt, named by date and time. Grade with `quiz library grade NAME --json` (the newest attempt, or `--attempt STAMP`): it finds the version the attempt was taken on and writes `reports/<stamp>-report.json`, plus an empty `reports/<stamp>-grades.json` when essays or code need grading. Fill that template, then run `quiz library grade NAME --grades reports/<stamp>-grades.json --json`. Reports go in `reports/`, never `results/`. `quiz library stats NAME [--json]` shows progress over all attempts. The results files are the learner's: read them, do not edit them.
- **`rm` and `rename` are the user's call.** Never run `quiz library rm` or `rename` unless the user asked for that exact quiz. `rm` deletes the quiz with its versions and results (git can revert it); never pass `--yes` or `--force` on your own.
- **Never push**, and never run git commands in the library. Results hold the learner's answers and the snapshots hold the answer keys, so any remote the user adds must be private; that is their step.
