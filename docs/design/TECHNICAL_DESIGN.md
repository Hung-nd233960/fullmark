# fullmark 1.0: technical design

The design of fullmark 1.0, a rewrite in TypeScript. fullmark 0.x (Python, last 0.10.2 at commit `1359b71`) was the prototype: 1.0 keeps its ideas and fixes what it could not fix cheaply. 0.10.2 stays as the MVP, now mainly for surveys, and 1.0 may diverge from its behaviour ([fullmark-migration.md](fullmark-migration.md)). What fullmark is for and how people and agents work with it is [USER_DESIGN.md](USER_DESIGN.md); the command reference is [COMMANDS.md](COMMANDS.md); why 1.0 is a rewrite and not a migration is in [fullmark-migration.md](fullmark-migration.md).

**No compatibility with 0.x.** fullmark has one user, so 1.0 reads no 0.x quiz, results, grades or library format, and copies no 0.x behaviour for its own sake. Two things carry over as knowledge, not as compatibility: 0.x's grading test cases (`grading_cases.json`) and fixtures become 1.0's starting tests, and the owner's own history is converted once by a throwaway script outside the product (section 12).

**Status: v1 components frozen on 2026-10-24.** New features go to `proposals/`. How the features combine (bundles, shelves, printing and the rest) is still open, in [proposals/interactions.md](proposals/interactions.md); settle it before the full feature set is committed.

**Amended 2026-10-25:** the library format keeps shelf membership as a list of entries, not a `public` flag: a quiz has `shelves = [{ shelf = "public", kind = "quiz" }]`, with an optional `version` reserved, and the per-machine shelf folder in `config.toml` is keyed by shelf name. v1 commands touch only the shelf named `public` (`quiz library publish NAME --on | --off` stays the interface) and keep entries they do not know. The `shelf ...` commands stay a proposal ([proposals/shelves.md](proposals/shelves.md)). Also amended: shared pages carry no server code (section 7, foundation 9).

## 1. What stays

These ideas are the product, and the rewrite keeps them unchanged.

- **Markdown in, one offline HTML file out.** Opens by double-click, a CSP blocks every network request, and **Export** writes a versioned `results.json`.
- **`check` is the definition of done.** Every issue has a level, a rule id, a `file:line` location and a message that says how to fix it. `--json` everywhere results matter. Exit codes `0` done, `1` errors, `2` usage or I/O, `3` needs input.
- **The loop:** brief, write, check, build, take, grade. Essays and code go to an AI through the report and `grades.json`.
- **Core and library are separate layers.** Core works on files with no setup. The library is a git-backed folder that calls core. Core never imports the library.
- **The one-shot local server** (`serve`, `review`, `brief --web`, `library take`) is the only network exception. It binds to 127.0.0.1, uses a token and exits after one submit or a timeout.
- **Human-only decisions are enforced by the tool** (`brief` exits 3 on a missing purpose or scope, and `--accept-defaults` records `decided_by: agent`).

## 2. What changes, and why

| Flaw in 0.x | Fix in the design |
|---|---|
| The grading rules exist twice (`grading.py` and `quiz.js`) and already disagree on non-ASCII case folding and a leading BOM | **One pure TS grader** (`core/grade`) is bundled into the page and also run by `quiz grade`. Normalisation (NFC, case folding, BOM, whitespace) lives in one function. Both sides use the same regex engine, so the `check_regex` portability rules go away |
| 2,870 lines of untyped page JavaScript | The page runtime is typed TS. State is a **serialisable reducer** over an `Attempt` (section 4), so autosave, resume, retry-missed, replay and partial takes all come from the same state |
| Builds are not reproducible (`built_at` is the current time) | **Deterministic from day one:** `built_at` can be pinned, keys are sorted, and nothing reads the clock or a random seed without an input. Byte-level golden tests become possible |
| Most of the ~600 tests call internals | **Contract tests run the CLI as a program**: exit codes, messages, JSON checked against the schemas, the bytes of built files |
| `check` thresholds are hard-coded in `brief.py`, `lint.py` and `build.py`, and most findings have no rule id (only `brief.*` and `review.*` do) | **Every finding has a rule id.** A **rule registry**, `fullmark.toml` and **profiles** (named rule sets, such as `exam` or `draft`) exist from v1. A quiz picks its profile, and custom declarative checks can be added per profile (section 5) |
| JSON Schemas are written by hand | zod schemas are the source. The TS types and the JSON Schemas (`results`, `report`, `grades`, `review`, `fullmark-shelf`) are generated from them |
| Essay and code rubrics are plain strings; grades have an untyped `criteria` map and no grader identity | **Declared rubric modes** (`holistic`, `additive`, `banded`) with criterion ids, `grades-v2` with a required grader, and totals computed by the tool, not the grader (section 6) |
| Questions match across versions only through an explicit `{id}` | **Every question has a stable id** (required; `quiz ids` writes one where missing) plus a per-question content hash, so stats, `--missed` and replay work across versions |

## 3. Tech stack

| Concern | Choice | Reason |
|---|---|---|
| Language and runtime | TypeScript, Node 22 or later, npm | One language for CLI and page. Node is already installed. Starts in about 0.1 s against 0.5 s today |
| CLI framework | `commander` (or `citty`) | Subcommand groups and generated help, with little magic |
| Markdown | `markdown-it` with the container plugin; attributes, task-list markers and blanks are parsed by fullmark's own code, which follows QUIZ_SYNTAX.md exactly | The original of markdown-it-py, so plugin behaviour carries over. `token.map` gives line numbers |
| YAML | `yaml` (eemeli) with `LineCounter` | Front matter and briefs with exact positions |
| Validation and schemas | zod v4 | Types, runtime checks and JSON Schema export from one definition. Code bundled into the page (the answer shapes) uses `zod/mini` from the same package, which keeps the runtime small; the full `zod` alone was 110 KB gzipped (decided 2026-10-28) |
| Code highlighting | Shiki at build time, colours generated from the theme tokens (section 8) | One highlighter for pages, print and the terminal guide |
| Fonts | `@fontsource` packages (Be Vietnam Pro, Source Serif 4, Lexend), pinned, WOFF2 inlined as data URIs | Offline and versioned, with Vietnamese subsets included (section 8) |
| Math | KaTeX `renderToString` at build time, with CSS and fonts embedded only when used | As today |
| Page UI | Preact with signals (about 5 KB) | One set of components renders static HTML at build time (`preact-render-to-string`) and hydrates in the page, so there is no Jinja and no second template language. Vanilla TS is the fallback if zero page dependencies matter more |
| Bundling | esbuild for the page (one IIFE string inlined into the HTML), tsup for the CLI | Fast, and produces a single file |
| Local server | `node:http` | One-shot, with a token and no framework |
| Git | `execFile('git', ...)` | As today, with no wrapper library |
| Config | `smol-toml` | `config.toml`, `library.toml`, `fullmark.toml` |
| Terminal output | `picocolors` and a small table helper, respecting `NO_COLOR` | Replaces Rich |
| Languages | Typed message catalogs (`en.ts`, `vi.ts`), no library | A missing translation is a compile error; no page weight from an i18n framework (section 9) |
| Terminal form | `@clack/prompts` | `brief --tui` only: select with hints, multi-select, text with validation. Textual or Ink would be overkill for a flat form |
| Watching | `node:fs.watch` with `recursive` | Works on Windows with Node 22 |
| Tests | vitest; Playwright and axe-core in TS | E2E tests now share a language with the code |
| Lint and format | Biome | Already used by the format hook |
| Distribution | npm package `fullmark` with the bins `quiz` and `fullmark`. A single binary later, through `bun build --compile` or Node SEA, if needed | |

**Licences.** fullmark is MIT. The CLI is bundled into one file and the pages embed Preact, KaTeX and fonts, so the dependencies' own licence files do not travel with them, and their notices must:

- **`quiz --acknowledgements`** prints fullmark's licence, then each third-party package in the CLI bundle or the page: name, version, licence id, copyright lines, and the licence text, each distinct text printed once. The list is generated at release from esbuild's metafile and each package's `license` field and licence file, and committed as `THIRD_PARTY_NOTICES.md`; nobody writes it by hand.
- **Every page** carries the notices for what that page embeds and nothing else: Preact always; KaTeX only when it has maths; each font's OFL notice only when the font is embedded (`--fonts`). The MIT and OFL texts appear once each. **They are shown, not hidden in the source** (owner, 2026-10-30, replacing "one HTML comment at the end"): a small muted ⓘ button at the foot of the page, after the last question (and at the foot of the start screen), never floating over content, named **Licences** ("Giấy phép"); it opens a small popup listing each embedded package or font with its version, licence and copyright line, then the MIT and OFL texts in a scrolling area. Esc or a click outside closes it and the focus returns to the button. In Focus mode the button is not rendered at all (nothing to tab to), and leaving Focus mode brings it back. Shiki output is plain coloured HTML and carries no code, so it needs no notice.
- **A test fails the build** when a bundled package has no entry, or has a licence outside an allow-list (MIT, ISC, BSD, Apache-2.0, OFL-1.1). A new dependency with another licence is a decision, not an accident.

## 4. Core data model

### Quiz IR

`parse(md, assets) -> Quiz` with source positions on every node. A quiz has front matter, sections (each with a stable slug), questions (each with a stable id, a content hash, a type, points, tags, an answer key and an explanation) and banks (`pick`).

### Plan and Attempt

Banks, `--section`, `--missed`, **Retry missed** and replay all answer the same question: which questions does this attempt get, and in which order. That answer is one type:

```ts
type Plan = {
  source: "full" | "bank" | "section" | "missed" | "retry";
  section?: string;                            // slug
  questions: QuestionId[];                     // drawn and ordered
  optionOrder?: Record<QuestionId, number[]>;  // only when options are shuffled
  seed?: string;
};

type Attempt = {
  quizHash: string;     // the version this attempt was taken on
  plan: Plan;
  state: AttemptState;  // answers, timer, per-section progress, flags
  phase: "start" | "answering" | "submitted";
};
```

- **Seeds** (decided 2026-10-28). Every order is drawn from the source order, `shuffle(seed, items)`, with its own stream per purpose (`seed`, what is shuffled, the section or question id), so editing one question never reshuffles another. The page draws a random seed when the learner presses Start; `build --print --seed S` takes the teacher's. Without one, the seed is the quiz's **short version**, the first 4 hex characters of `quizHash` (as the replay banner and the paper show it), so a build is still deterministic. Questions and choices are shuffled only when `shuffle_questions`, `shuffle_choices` or `shuffle=` ask; `ordering` items and `matching` right-hand items always are, so neither is ever shown in the right order. The plan records the seed and the order it produced (`questions`, `optionOrder`); replay and grading read that record and never shuffle again. A seed that is not 1 to 8 letters or digits exits 2; there is never a silent fallback.
- `results.json` (format `results-v2`) is a serialised `Attempt`. Formats start at version 2 so that a 0.x file, which says version 1, is never mistaken for a 1.0 one: it is refused with a pointer to the conversion script.
- **Core** builds and serves the quiz restricted to a given plan. It does not know why the plan was chosen.
- **The library** chooses the plan (`--missed` reads the attempt history). The plan reaches core through its TS API, not through a CLI flag, so the layering holds.
- Scores are kept per question and per tag, never only per attempt, so a section-only attempt is not counted as 20 % of the whole quiz in `stats`.

### `results-v2`

Decided 2026-10-28 from slice 1d's proposal. The file is `{"format": "fullmark-results", "version": 2}` followed by the `Attempt` fields, plus the optional `bundle` of section 7 (seams for later features). Every known key is required except `plan.section`, `plan.optionOrder`, `plan.seed` and `bundle`; unknown keys are ignored. A version 1 or 0.x file is refused with a pointer to the move-in script (section 12, step 6).

```ts
type AttemptState = {
  answers: Record<QuestionId, Answer | null>;  // null, or no entry: unanswered
  startedAt: string | null;                    // ISO, as the page wrote it
  submittedAt: string | null;
  timeUsed: number;                            // seconds, from the page's timer
  sectionTime: Record<SectionId, number>;      // seconds per visited section; "" for an untitled one. Time a timed page spent closed is in timeUsed and in no section, so these can sum to less
  flagged: QuestionId[];                       // flagged for review by the learner
  checked: QuestionId[];                       // feedback: instant: answers the learner checked, now locked; [] otherwise
  timedOut: boolean;                           // time_limit ran out and the page submitted; submittedAt is then the deadline
};
```

**Indices are source order.** Every index in an answer refers to the order in the quiz source, never to the order the page showed, so grading never depends on a shuffle. `plan.optionOrder` records what the page showed, for replay: the choices of `single` and `multi`, the items of `ordering`, and the right-hand items (distractors included) of `matching`, each as source indices in display order.

| Type | Answer |
|---|---|
| `single` | `{choice, inputs?}`: a choice index; `inputs` maps a choice index to the text typed in its `{input}` |
| `multi` | `{choices, inputs?}` |
| `truefalse` | `{value}`: `true` or `false` |
| `numeric` | `{raw}`: the text as typed; the grader reads it, with a decimal comma when the quiz's `lang` uses one |
| `short`, `essay` | `{text}` |
| `blanks` | `{blanks}`: one text per blank, in order |
| `fields` | `{fields}`: one text per field, in order, ungraded fields included |
| `ordering` | `{order}`: `order[i]` is the source index of the item placed at position `i` |
| `matching` | `{pairs}`: `pairs[i]` is the right-hand item (an index into the pairs' right-hand sides in source order, then the distractors) matched to left item `i`, or `null` |
| `code` | `{code, language}`: the grader uses the question's `language`, not this one |
| `scale` | `{value}`: an integer on the scale |

An essay's word count is not stored: the grader counts it.

**The exported file** is named `<quiz id>-results-YYYYMMDD-HHMMSS.json`, the stamp in the learner's local time (decided 2026-10-28).

### Rules

```ts
type Level = "error" | "warning" | "info" | "off";
type Rule = {
  id: string;                 // "choice.correct-longest"
  kind: "fixed" | "quality";  // fixed rules cannot be configured
  level: Level;               // the built-in default
  options?: z.ZodObject;      // thresholds, validated like any other input
  run(quiz, ctx): Issue[];
};
type Issue = { rule: string; level: Level; file: string; line: number; message: string; fix?: string };
```

## 5. Check configuration and profiles

### Two kinds of rule

- **Fixed rules** say whether a quiz can work at all: syntax, answer keys, matching pairs, banks, missing media, review flags. The syntax rules and their ids are listed in [QUIZ_SYNTAX.md](QUIZ_SYNTAX.md), section 8a. They are always errors and no config can change them. A profile that tries to change one is a config error.
- **Quality rules** say whether a question is good: a correct choice that gives itself away, a short explanation, skewed answer positions, a quiz that does not match its brief, a large page. Their level and thresholds are configurable.

### Rule catalogue (v1)

Quality rules carried over from 0.x, now with ids and options. Their defaults start from 0.x's thresholds and may be tuned. The dotted ids are the codes: there are no numeric codes (like `E501`), and a test pins every id so none changes by accident. Numeric aliases could be added later.

| Rule | Default | Options (default) |
|---|---|---|
| `choice.duplicate` | warning | |
| `choice.all-none-above` | warning | |
| `choice.correct-longest` | warning | `min-length` (40), `ratio` (1.8) |
| `choice.in-stem` | warning | `min-length` (12) |
| `explanation.short` | warning | `min-words` (4) |
| `answers.position-skew` | warning | `max-share` (0.5), `min-questions` (8) |
| `code.unknown-language` | warning | |
| `brief.count` | warning | `tolerance` (0.2) |
| `brief.mix`, `brief.content-kinds`, `brief.past-exams` | warning | |
| `brief.mode` | warning | (`each-question` expects `feedback: instant`; `timed-exam` expects a `time_limit` and `look: locked`) |
| `brief.invalid` | warning | (a `brief.yaml` that does not parse, or has an unknown or missing key; the quiz is then not held against it) |
| `brief.generated-by` | warning | (a quiz written from a brief by an agent must set `generated_by` in its front matter, naming the agent and model; a hand-written quiz leaves it out) |
| `build.size` | warning | `warn-mb` (20), `max-mb` (100, always an error above it). Registered from step 1 so profiles can set it; checked from step 2 |
| `materials.empty` | warning | (a `materials` sheet with nothing after its heading; the fixed rules `materials.missing`, `materials.heading` and `materials.question` are in QUIZ_SYNTAX.md) |

New quality rules, off in `default` so behaviour does not change, and used by the stricter built-in profiles:

| Rule | Default | Options |
|---|---|---|
| `explanation.missing` | off | |
| `question.untagged` | off | (tags drive `stats` and `--missed`) |
| `quiz.no-time-limit` | off | |

### Profiles

A profile is a named set of rule levels, options and custom checks. It can extend another profile.

| Built-in profile | For | Differences from `default` |
|---|---|---|
| `default` | everything | none |
| `draft` | writing in progress | every quality rule that is on in `default` is `info`, so only fixed rules fail |
| `exam` | mock exams | every quality rule that is on in `default` is an error; `explanation.missing` and `question.untagged` are errors (`quiz.no-time-limit` stays off); `explanation.short` needs 8 words; `answers.position-skew` max share 0.4; `brief.count` tolerance 0.1; inline ignores are not allowed |
| `survey` | questionnaires | `choice.correct-longest`, `choice.in-stem`, `explanation.short`, `explanation.missing` and `answers.position-skew` are off. Picked automatically for `kind: survey` |

`brief` maps its purpose to a profile and writes it into `brief.yaml`: `self-study` and `classmates` give `default`, `exam-prep` gives `exam`, `survey` gives `survey`.

### The config file

`fullmark.toml` holds custom profiles and changes to built-in ones. Overrides live only in files, so they are in git and can be reviewed. There is no `--rule` flag.

```toml
[check]
profile = "practice"   # profile when the quiz names none
fail-on = "error"      # "warning" is what --strict sets

[profiles.practice]
extends = "default"
rules."explanation.short" = { level = "error", min-words = 6 }
rules."answers.position-skew" = "off"

[profiles.signals-exam]
extends = "exam"
rules."brief.count" = { tolerance = 0.05 }

[[profiles.signals-exam.checks]]
id = "custom.two-essays"
kind = "count"
where = { type = "essay" }
max = 2
level = "error"
message = "The real exam has two essays at most."

[[profiles.signals-exam.checks]]
id = "custom.total-100"
kind = "count"
measure = "points"
min = 100
max = 100
message = "The paper is marked out of 100."
```

### Custom checks

These are declarative, from a fixed vocabulary, so they stay deterministic, safe and validated with `file:line` errors. There are no JavaScript plugins in v1.

| Kind | Fields | Meaning |
|---|---|---|
| `count` | `where`, `measure` (`questions` or `points`), `min`, `max` | The questions matching `where` (or their points) stay in range |
| `require` | `where`, `field` (`tags`, `explanation`, `id`, `points`, `source`) | Every question matching `where` has that field |
| `forbid` | `where` | No question matches `where` |

`where` filters on `type`, `tag`, `section` and `graded`, and an empty `where` matches every question. A custom check's id must start with `custom.`, and its level defaults to `error`.

### Where the config comes from

1. Built-in rule defaults.
2. The user config (`config.toml`): `[profiles.*]` there are personal profiles, available everywhere.
3. The nearest `fullmark.toml`, looking up from the quiz and stopping at a git root or the library root. A profile here replaces a personal profile of the same name from step 2. Files are not merged beyond these two layers.

A profile in either file named like a built-in (`[profiles.exam]`), with no `extends` of its own, overlays the built-in: its rule settings and checks are applied on top, and the rest of the built-in stays. `[check]` is read from `fullmark.toml` only; in `config.toml` it is ignored.

The profile is chosen in this order, first match wins: `--profile` on the command line, then `profile:` in the quiz's front matter (a `kind: survey` quiz that names none gets `survey` at this step), then `profile` in `brief.yaml`, then `[check] profile`, then `default`. An unknown profile in front matter is the fixed rule `profile.unknown`. An unknown one on the command line exits 2 with a plain message naming the known profiles; a malformed config exits 2 with `file:line`.

### Ignoring one finding

A question can carry `{check-ignore="choice.correct-longest" because="the long answer is the point"}`. The reason is required. Every ignore is reported as `info` (`config.ignored`), so nothing is silently hidden, and profiles with `allow-ignore = false` (such as `exam`) turn ignores into errors. Fixed rules cannot be ignored. An ignore without `because`, a `because` without `check-ignore`, and an ignore naming a fixed or unknown rule are all `ignore.invalid`.

### Rules for agents

The profile is the user's choice, like the brief's purpose. An agent never changes `profile:`, edits `fullmark.toml` or adds a `check-ignore` to make `check` pass; it fixes the quiz. `check` output always names the profile and the config files used, so loosening is visible.

### In the library

`register` resolves the profile and stores the resolved rules with the version (`check.json`), so re-checking an old version later gives the same answer even if `fullmark.toml` changed or is gone. `share --source` and `publish` write a `fullmark.toml` holding just the custom profiles their quizzes use, and `import` reads it back.

`register` and `import` also refuse a survey, with the rule `library.survey`. It is a refusal, not a check finding: `check` does not report it and no config can change it ([COMMANDS.md](COMMANDS.md), `quiz library register`).

## 6. Rubrics and grading essays and code

In 0.x, `rubric:` is a list of plain strings, `scoring` is `points` or `band`, and `grades-v1` has an untyped `criteria` map, with no record of who graded or which rubric was applied. 1.0 replaces that with declared rubric modes, criterion ids and a grader identity. Essays and code use the same model.

### Three rubric modes

| Mode | For | The grader gives | The tool computes |
|---|---|---|---|
| `holistic` (default) | Loose rubrics: the bullets guide, judgement is free | one score from 0 to the question's points; optionally a verdict per bullet (`met`, `partly`, `missed`), not scored | nothing |
| `additive` | Points per criterion: "Establish the definitions (0.5 pts)" | points per criterion, from 0 to its maximum, in multiples of `step` | the total, as the sum |
| `banded` | Criteria scored on a scale and combined, such as IELTS (TR, CC, LR, GRA) | a band per criterion on the declared `scale` | the overall band (weighted mean, then the declared `round` rule) and the points (`points × band / scale.max`) |

Two principles:

1. **The grader gives components, and the tool does the arithmetic.** In `additive` and `banded` mode, a grade has no question-level score field, so an AI cannot add or round wrongly.
2. **The mode is declared whenever criteria carry points or bands.**

```yaml
rubric:
  mode: additive
  step: 0.25                                  # optional, default 0.5
  criteria:
    - Establish the definitions (0.5 pts)     # shorthand, parsed strictly at the end of the bullet
    - Derive the transfer function (1.5 pts)
    - id: interp                              # long form: explicit id
      text: Interpret the poles
      points: 1
```

```yaml
rubric:
  preset: ielts-writing-task2   # TR, CC, LR, GRA; equal weights; scale 0-9 step 0.5; IELTS rounding
```

- **Criterion ids** are explicit or slugged from the text. Grades refer to ids, so rewording a criterion keeps its history.
- **Built-in presets:** `ielts-writing-task1` (TA, CC, LR, GRA) and `ielts-writing-task2` (TR, CC, LR, GRA) only. A preset takes no criteria or text of its own; the IELTS descriptors are public. Any other banded rubric declares its scale, its rounding and its criteria, each with an optional `weight` (default 1), so reordering criteria never moves a weight:

  ```yaml
  rubric:
    mode: banded
    scale: {min: 0, max: 9, step: 0.5}
    round: nearest-step        # nearest-step | down | ielts
    criteria:
      - {id: tr, text: Task response, weight: 2}
      - {id: cc, text: Coherence and cohesion}
  ```

  `ielts` rounds .25 up to the half band and .75 up to the next whole band, to the nearest half band from 0 whatever the scale's step. `round` defaults to `nearest-step`: the nearest step counted from `scale.min`, a tie going up. A band's points (`points × band / scale.max`) are rounded half up to 2 decimals. All this arithmetic is exact (integer steps), so no float error can move a band. `rubric.scale` catches a scale whose `step` does not divide `max - min`, and `rubric.weights` a weight that is not a positive number.
- **`step`** defaults to 0.5 in `additive`. A `holistic` rubric has no step unless it declares one: any score from 0 to the points.
- **`show_rubric`** (default `true`) shows the criteria and their points on the page before submit. Practice benefits from it, and a mock exam can set `false`.

Fixed-rule errors in `check`:

- `rubric.mode-missing`: points, a scale, `round` or weights appear without a `mode`.
- `rubric.sum`: an `additive` rubric whose maximums don't add up to the question's points, including one with no criteria or a criterion with no points.
- `rubric.step`: a maximum that isn't a multiple of `step`.
- `rubric.scale`: an invalid scale, or a `banded` rubric with neither a scale nor a preset (at the `rubric` line).
- `rubric.weights`: an invalid weight, or a `banded` rubric with no criteria.
- `rubric.duplicate-id`, in every mode, at the second use.

A preset with any other key, and `scale`, `round` or `weight` outside `banded`, are `syntax.value`.

Quality rules:

- `rubric.missing` (warning): an essay or code question without a rubric.
- `rubric.thin` (warning, fewer than 3 criteria or bullets; option `min`).
- `rubric.points-in-text` (warning): "(0.5 pts)" in a `holistic` bullet, suggesting `mode: additive`.

### The grading loop

```text
results.json ──► quiz grade results.json --quiz quiz.md --json
                   ├─ results-report.json    what to grade: prompt, answer, word count, rubric, sample
                   └─ results-grades.json    template: the rubric's structure, empty cells
grader (AI, or a human through --web) fills in the template
             ──► quiz grade results.json --quiz quiz.md --grades results-grades.json
                   └─ validates, computes, writes the final report
```

In the library, the same steps are `library grade NAME --json`, then filling in, then `library grade NAME --grades FILE`. Reports are filed in `reports/` and committed.

### `grades-v2`

The tool writes the template with every criterion's id, text and maximum (or scale) already in place. The grader fills in only the `null` cells and the text fields, and cannot add criteria or change maximums. The template holds `"grader": null` and one entry per answered essay or code question; each entry's components (`score`, `band`, `verdict`), `note`, `justification` and `improvement` start as `null`. `quiz grade --json` writes it only when no `--grades` is given and no `*-grades.json` exists yet, so a filled-in file is never overwritten.

```json
{
  "format": "fullmark-grades",
  "version": 2,
  "results_hash": "9c1e4f…",
  "grader": { "kind": "ai", "name": "Claude Opus 5.5", "model": "claude-opus-5-5", "at": "2026-10-23T16:02:00" },
  "grades": {
    "laplace-essay": {
      "mode": "additive", "rubric_hash": "51ab07…", "points": 3, "step": 0.25,
      "criteria": {
        "defs":   { "text": "Establish the definitions",    "max": 0.5, "score": 0.5,  "note": "Defines the transform and the ROC." },
        "derive": { "text": "Derive the transfer function", "max": 1.5, "score": 1.25, "note": "Skips the zero initial-conditions assumption." },
        "interp": { "text": "Interpret the poles",          "max": 1,   "score": 0.5,  "note": "Does not link poles to stability." }
      },
      "justification": "Solid derivation; interpretation is the weak part.",
      "improvement": "Say why left-half-plane poles mean a stable system."
    },
    "ielts-task2": {
      "mode": "banded", "rubric_hash": "e3d902…", "points": 9,
      "scale": { "min": 0, "max": 9, "step": 0.5 }, "round": "ielts",
      "criteria": {
        "TR": { "band": 6, "note": "…" }, "CC": { "band": 6.5, "note": "…" },
        "LR": { "band": 6.5, "note": "…" }, "GRA": { "band": 6, "note": "…" }
      },
      "justification": "…", "improvement": "…"
    },
    "explain-aliasing": {
      "mode": "holistic", "rubric_hash": "77c1aa…", "points": 4, "score": 3,
      "bullets": { "nyquist": { "verdict": "met" }, "example": { "verdict": "partly" } },
      "justification": "…", "improvement": "…"
    }
  }
}
```

**Grader identity.** `grader` is required. `kind` is `ai` or `human`, and `name` is required (for an AI, also `model`). A question can carry its own `grader`, for example when one essay is re-graded by hand. A human grade made over an AI grade records `reviewed` with the AI grader. The identity is a declaration: the tool cannot verify which model wrote a file.

**Validation** (exit 1, nothing written). Every problem is listed, except that a question's scores are checked only once its fixed values (mode, points, maximums, weights, scale) match the template:

- `grader` is missing, or its `kind` or `name` is empty.
- A score is below 0, above its maximum, or not a multiple of `step`.
- A band is outside the scale or off its step.
- A criterion, bullet or question id is not in the template.
- A `note` is empty on a criterion scored below its maximum (in `banded`, a band below `scale.max`): a lost mark must say what was missing.
- A `holistic` grade has no `justification`.
- A question is half filled: some components filled and some `null`. A question whose components are all `null` stays pending, whatever its text fields say, so a partly graded file is allowed.
- A question's `points`, `mode`, a maximum, a weight, the scale or `round` differs from the template, or a hash is missing.

Warnings: `rubric_hash` differs from the current rubric ("graded against an older rubric"); `results_hash` differs from the attempt.

**The two hashes are over content, not bytes,** so reformatting a file, an editor's or git's line endings, or a re-indented YAML block never raises a false warning. Both are SHA-256, lowercase hex, over canonical JSON: keys sorted at every level, no whitespace, UTF-8.

- `rubric_hash`: over the parsed rubric: `mode`, `step`, `scale`, `round`, `preset`, and each criterion's `id`, `text`, maximum and `weight`. Changing a criterion's wording, points or weight changes it; YAML layout and comments do not.
- `results_hash`: over the parsed results file, every key included.

**Computed.** With the example above:

- `laplace-essay` scores 0.5 + 1.25 + 0.5 = **2.25 / 3**.
- `ielts-task2` averages 6, 6.5, 6.5, 6 = 6.25, which IELTS rounding makes **band 6.5**, so **6.5 / 9** points.
- `explain-aliasing` is **3 / 4** as given.

The final report holds, for each question, `earned`, `points`, `status`, `graded_by`, `rubric_current` and a criteria list with `earned`, `max` and `note`. The JSON report is `{"format": "fullmark-report", "version": 2}` (versions start at 2, as for `results-v2`) with `quiz`, `attempt`, `score` (`null` for a survey), `sections`, `tags`, `questions`, `wrong`, `open`, `grades` and `unknown`. A report carries no time of its own making, so the same inputs give the same bytes.

**The score while grades are pending.** The score and the pass mark are judged on the points scored so far: auto-graded questions and graded essays and code. Essays and code still waiting for a grade are left out of both earned and possible points until graded; an unanswered one counts as 0 of its points. So whether the goal is reached can change once grades come in. The Markdown report words the goal as the results card does (section 8): "Goal 60%: reached" or "Goal 60%: not reached yet", never "failed", with an asterisk after the verdict while grades are pending ("Goal 60%: reached*"). Every word in it comes from the `ui_lang` catalog, the attempt's source (full, a part, a retry) included.

**Re-grading never overwrites.** Each grades file stays in `reports/`. The newest counts unless another is chosen, which keeps a later comparison between graders possible.

### Where grades show up

| Where | What |
|---|---|
| Page before submit | The rubric with its points, when `show_rubric` is true |
| Page after submit, and replay | For each essay or code answer: a table of criterion, awarded and maximum, with the note. For `banded`: the band per criterion, the overall band and the points. A line naming the grader and the date. Ungraded: the same table with empty cells, marked pending |
| `quiz review` | The rubric with its points, and the review problems "rubric too loose", "points misallocated" and "criterion unclear" |
| `quiz grade --web`, `library grade --web` | A grading form: the answer next to the rubric, inputs that only accept valid steps or bands, a running total, and AI grades pre-filled to accept or adjust. It writes the same grades file with `kind: human` |
| Report | A table per criterion, the grader, and a warning for grades made against an older rubric |
| `stats`, `library stats` | Criteria aggregate across attempts like tags, for example "LR is your weakest IELTS criterion over 6 attempts" or "`interp` lost marks in 4 of 5 attempts" |

Not in v1: comparing two graders on the same answer (AI against AI, or AI against you). The format keeps every grades file, so this can be added later without changing it.

## 7. Architecture

```text
src/
  core/        pure TS: no node:* imports, so it runs in the browser too
    ir.ts        zod schemas for Quiz, Plan, Attempt, results, report, grades, review, shelf manifest
    parse/       Markdown and YAML to IR, with positions
    rules/       rule registry, custom checks; check(quiz, {brief?, review?, profile}) -> Issue[]
    config/      resolve profiles (built-in, user, fullmark.toml), validate with positions
    grade/       normalise(); grade(quiz, attempt, grades?) -> Score     <- the one grader
    rubric/      rubric modes and presets; grades template, validation, totals and bands
    plan/        draw (banks), restrict (section, question list), shuffle with a seed
    report/      Markdown and JSON reports, grades merge
    stats/       per-question and per-tag history across attempts and versions
  page/        browser runtime: Attempt reducer, components, autosave, export; imports core
  build/       IR -> HTML: shell, Shiki, KaTeX, assets as data URIs, obfuscated key, CSP
  serve/       one-shot 127.0.0.1 server used by serve, review, brief --web, library take; also the small browser module those pages get (foundation 9)
  library/     git-backed store; uses core's public API only
  cli/         commands, --json, exit codes, messages
```

Lint rules enforce the boundaries: `core` cannot import `node:*`, and nothing in `core`, `build` or `serve` imports `library`, and `build` and `serve` stay bundle-agnostic.

Data flow: `quiz.md -> parse -> Quiz -> check -> build(Quiz, plan?, attempt?) -> quiz.html`. The page writes `results.json`, and `grade(Quiz, Attempt)` writes the report. The same `grade` function runs in the page and in the CLI.

`core/config` receives the files' text and parses it, and the CLI reads the files from disk, so `core` stays free of `node:*` imports.

### Files, formats and safe writes

Everything is stored in plain files, never a database, because the library is a git repository: every change is a readable diff and `git revert` undoes it. If `stats` ever becomes slow over thousands of attempts, the answer is a git-ignored SQLite cache rebuilt from the files, never a second source of truth.

**Three data formats, and no fourth:**

| Format | For | Examples |
|---|---|---|
| TOML | configuration people write | `config.toml`, `library.toml`, `fullmark.toml`, build files |
| YAML | structured content people write | quiz front matter, `brief.yaml`, the brief question file |
| JSON | anything the tool or the page writes | results, reports, grades, review, manifests, `check.json` |

Markdown is the content itself (quizzes, reports, guides), not a data format.

**Every write is atomic.** A file is written to a temporary file in the same folder, flushed, then renamed over the old one, so a crash or Ctrl+C leaves either the old file or the new one, never half of each. On Windows a rename can fail briefly while an editor, a sync client or an antivirus holds the file open, so it is retried for up to a second before exiting 2 with the file named.

**Library and shelf writes take a lock.** A command that changes the library (or writes a shelf) creates `.fullmark.lock` in its root, holding the process id, the command and the start time, and removes it when done, git commit included. Commands that only read never lock.

- A second writer waits up to 10 seconds, then exits 2 naming the command that holds the lock.
- A lock whose process is no longer running is stale: it is removed with a warning and the command goes ahead.
- The lock file is git-ignored.

### Technical foundations

Decisions that change file formats, stored data or security, and so are settled before code.

**1. Hashes survive machines.** `quizHash` and the per-question hashes are taken over a normalised text: LF line endings, NFC, no BOM, trailing whitespace trimmed. Git's line-ending conversion, an editor's BOM or a decomposed file name on macOS must not split a quiz's history. Changing this later would orphan every attempt. What is hashed: a **question hash** is SHA-256 over the normalised text of the question's block, from its `##` line to the line before the next heading, with the `id=…` pair removed, so adding an id or moving a question never changes it. The **quiz hash** is SHA-256 over the normalised file text followed, for each referenced file (assets, `materials` sheets and the assets they reference) sorted by path, by `"\n" + path + "\n" + sha256hex(content)`. A sheet's content is its normalised text, as for the quiz file, so line endings never split a history; an asset's is its bytes, never normalised. Paths are relative to the quiz folder, with `/`. Normalising trims every line's trailing whitespace, drops trailing blank lines and ends the text with one `\n`, so an editor that adds a final newline does not make a new version. The question block ends at the next `#` or `##` heading. Hashes are lowercase hex; commands accept a prefix of 4 or more.

**2. Page storage is namespaced.** Chrome gives every local `file://` page one shared `localStorage`, so all keys start with `fullmark:v1:<quiz id>:<quiz hash>:` (autosave, look, sidebar), the full `quizHash`, not the short version. Old versions' entries are removed when a newer version of the same quiz opens. Every read and write is wrapped, because Firefox isolates `file://` storage and Safari may refuse it; when storage fails, the page works without resume and says so once, so an essay is never lost silently.

**3. Content from others is untrusted.** Quizzes arrive through `import` and shelves, so:

- **Assets and `materials` sheets stay inside the quiz folder.** Paths are resolved, symlinks included, and anything outside the folder is a fixed-rule error (`asset.outside`). Otherwise a quiz could embed a file such as an SSH key into a page that is then published.
- **No raw HTML in quiz Markdown.** markdown-it runs with `html: false`, and a fixed-rule error (`markdown.raw-html`) names any tag found, with the syntax to use instead. What authors used HTML for has its own syntax:

  | Need | Syntax |
  |---|---|
  | subscript, superscript | `H~2~O`, `m^2^` |
  | highlight, underline | `==NOT==`, `++NOT++` |
  | image size | `![Heart](heart.png){width=300}` |
  | collapsible hint | `::: hint` … `:::` |
  | audio (listening questions) | `![Track 1](track1.mp3)`, rendered as an audio player and embedded like an image |
  | line break in a table cell | a trailing `\` |

- **The CSP allows only the page's own script, by hash** (`script-src 'sha256-…'`), computed at build so builds stay deterministic. `default-src 'none'`; images and fonts from `data:` only; no `connect-src` except in pages served by the one-shot server, which may post to their own origin (foundation 9).
- **No `style` attributes.** The CSP allows the page's own style sheets, by hash, and no inline `style="…"`. What KaTeX writes as inline styles becomes classes at build (each distinct style one class, `fm-s0`, `fm-s1`, …, with `!important`, in the page's KaTeX style sheet), and Shiki's colours are classes (`fm-tk-<kind>`) on CSS variables (`--fm-code-…`), never colour literals (decided 2026-10-29).
- **YAML** is parsed with alias expansion capped, and quiz names are validated slugs, passed to git after `--`.

**4. The one-shot server is locked down.** It binds 127.0.0.1 only, with a random token in the URL. It checks the `Host` header (against DNS rebinding) and `Origin`, accepts only the expected POST at one path, caps the body at 10 MB, and exits after one submit or the timeout.

**5. The answer key is obfuscated, not secret.** It stops a learner from seeing answers by accident, not someone who reads the page source. The guide says so; printed papers without `--answers` carry no key at all.

**6. Every data file is versioned.** Each JSON file has `format` and `version`. From 1.0 on, readers accept every older 1.x version, writers write the current one, and every migration has a fixture. 0.x files are refused (section 4).

**7. Output-shaping dependencies are pinned.** Shiki, KaTeX, the fonts and Preact decide the bytes of every page, so they are pinned through the lockfile with the Node major version, and upgrading one is a deliberate commit that updates the golden files. Install scripts stay blocked (pnpm's default).

**8. Where pages work.** Desktop: evergreen browsers of the last two years, no polyfills. Phones: supported through a shelf over https (GitHub Pages). A file opened directly on a phone is best effort: iOS previews local HTML without running scripts, and Android may not keep storage. The guide says to share with phone users through a shelf.

**9. Shared pages carry no server code.** Pages written by `build`, `share` and `publish` have no submit, autosave, heartbeat or reload code at all, not even dormant. The page core exposes a small attach point (events such as ready, progress and submit), and a separate server module, the browser half of `serve/`, hooks into it. The module is added only when the page is built in memory for serving: `serve`, `review`, `brief --web`, `grade --web`, `library take`, and the reload code of `build --watch --serve`. The served copy gets its own CSP, with the script hashes of the page and the module and `connect-src 'self'`; a shared page keeps its CSP without `connect-src`. **Export** works with no server present. A test checks that a `build` page is byte-identical with and without the server features built in. This is also the seam for the heartbeat of [proposals/app-window.md](proposals/app-window.md).

**Budgets**, each enforced by a test:

| Budget | Limit |
|---|---|
| CLI startup, `--version` and `check` on a small quiz | fullmark's own share, the CLI's time minus a bare `node -e ""` timed in the same run (decided 2026-10-30, replacing "under 150 ms", since the laptop's bare Node swings from 90 to 230 ms), under 60 ms for `--version` and 180 ms for `check`, set in slice 2h2 as the largest share of three measured runs times 1.5 (`--version` 35 ms, `check` 114 ms after the split; the first limit, 60 ms, was an estimate: measured, `check`'s share was 100 to 180 ms, about 100 ms of it loading the 1.9 MB bundle). **A command loads only what it uses** (owner, 2026-10-30): `check`, `rules`, `ids` and `grade` never load the page builder, the page renderer or the build's Markdown-to-HTML path, so the CLI may be bundled into a few files rather than one. Shiki uses its JavaScript regex engine (no WASM) and loads only the languages a quiz uses; KaTeX loads only for math; the CLI turns on Node's compile cache (`module.enableCompileCache()`, cached in the system temp folder; decided 2026-10-29) |
| Page runtime (Preact and fullmark's code, gzipped) | under 60 KB, before fonts, math and images |
| A 300-question quiz with images | interactive in under 1 s on a mid-range laptop |

**Left until measured:** no disk cache in v1 (`build --watch` keeps work in memory; the stats cache waits for a measured need). The page renders every question at build, which also serves print and search, unless the 300-question budget fails. Large images get the size warning, not recompression.

**Temporary files:** `serve`, `take`, `brief --web` and `grade --web` serve from memory and write only on submit. `replay` writes its page under `%TEMP%\fullmark\` (or `$TMPDIR/fullmark/`), since the browser opens it after fullmark exits, and each run removes files there older than a day.

**Also:**

- No telemetry and no network use outside the one-shot server, stated in the README.
- An unexpected exception exits 2 with "this is a bug in fullmark" and the command line; the stack trace only with `--debug`.
- Quiz names are compared ignoring case, since Windows file systems do. Fixtures include long paths and Vietnamese file names.

### Seams for later features

Some features are not in v1 but would force a rewrite of the core if v1 assumed they never come. v1 builds the seams, not the features.

**Several quizzes in one page** (a whole course as one HTML file, [proposals/multi-quiz-bundle.md](proposals/multi-quiz-bundle.md)). v1 pages hold one quiz, but nothing assumes it:

1. **Build takes a list.** `build(quizzes[], options)`, called with one quiz in v1.
2. **Page state is keyed by quiz.** The runtime holds `Map<QuizId, Attempt>`; autosave keys, timers and the export are per quiz. There is no global attempt.
3. **The DOM is scoped.** Element ids and URL fragments carry the quiz id (`#signals/q12`), so two quizzes in one document never collide.
4. **Assets are stored once per page** by content hash and referenced by hash, so quizzes sharing images, fonts or KaTeX don't repeat them.
5. **The page can render a quiz from its IR in the browser**, not only hydrate pre-rendered HTML. The same Preact components do both, so a bundle can pre-render only the open quiz.
6. **The one-shot server takes submits keyed by quiz id and ends on a predicate.** For `serve` the predicate is "the first accepted submit"; a bundle server would supply "Finish pressed, or the last paper submitted". `serve`, `review`, `brief --web`, `grade --web` and `library take` all run on this one module, so a bundle server never reshapes it.

Formats need one reserved key: the `results-v2` schema allows an optional `bundle` object (`hash`, `sitting`), written only by bundle pages, so the files of one sitting can be grouped. It needs no version bump, since consumers ignore keys they do not know. The look (`theme`, `font`) belongs to the page, not to each quiz. A test checks the seams: a two-quiz page built through the internal API renders, autosaves and exports both quizzes independently, and a server with two quiz ids accepts both submits, writes two files and ends only when its predicate says so.

**A visual guide** (`quiz guide --web`, [proposals/guide-web.md](proposals/guide-web.md)). Every syntax example in the authoring guide is a fenced `quiz-example` block holding a valid quiz fragment, in both languages. In v1 this already pays off: a test runs `check` on every example, so the guide cannot document syntax the parser rejects. The terminal renderer shows these blocks as ordinary highlighted Markdown.

**Running the server in the background** (`--background`, [proposals/background-serve.md](proposals/background-serve.md)). With `--json`, every one-shot server prints a `listening` line (URL, port, pid) before it waits, so a background flag is only a wrapper that starts a detached copy, forwards that line and exits.

## 8. Page UI and themes

### Start from 0.x's look, build it fresh

**The mockup is the visual reference** (decided 2026-10-29): [docs/mockup/](../mockup/README.md) holds the Design canvas's boards; the page takes its colours, sizes, spacing, borders, radii and shadows from them. The rows below win where they differ. Choices keep a native radio or checkbox, visually hidden, and the letter badge shows the selection (filled in the accent when picked).

- **0.x's visual design is the starting point, not a constraint:** the muted colours in light and dark, the start screen with sections and suggested times, question cards, and the side panel with timer, progress and question map. It worked in use, so 1.0 begins there and changes what the new features need (a top bar with a status line and a docked sidebar in place of the side panel, the segmented map, materials, the themes). There is no pixel comparison against 0.x.
- **The runtime is new.** 0.x's `quiz.js` updated the DOM imperatively over HTML rendered separately in Python. 1.0's runtime is Preact components driven by the `Attempt` reducer (section 4). The same components render static HTML at build time and hydrate in the page, so there is one set of components and no template language. The page core knows nothing about a server: it only emits events (ready, progress, submit) that a server module can hook into (section 7, foundation 9).
- **CSS stays hand-written** and uses only tokens (`var(--name)`). It is split per component and ordered with cascade layers. There is no Tailwind and no component library: they would add weight to every offline file and solve no problem fullmark has.

### New UI for the v1 features

| Feature | UI |
|---|---|
| Start screen and part picker | Every page opens on the start screen (also called the launch page). It lists **the whole quiz**, pinned above and marked Recommended, then the parts in a list that shows 5 rows and scrolls. Single choice: the whole quiz or one part, on every page, not only served ones; one part records `plan.source: "section"`. `serve --section S` serves only that part and skips the choice. **Resume** (decided 2026-10-29): when the page opens on an autosaved attempt, the start screen offers **Continue**, with how far it got ("12 of 40 answered · 18 min used"), and **Start over**, which asks to confirm. **The clock:** with `time_limit` the deadline is Start plus the limit, on the wall clock, so closing the page does not pause it and a page reopened after the deadline submits at once (`timedOut`); without one, `timeUsed` counts only the time the page is visible. **After Submit** the submitted attempt stays saved, so the page reopens on the results until the learner presses **New attempt**. **Decided 2026-10-29 (after 2v):** the resume banner's line is "Started 26 Oct · 13 of 32 answered · 21:18 left on the clock" ("· 18:00 used" when untimed); the Points tile, and the points in the whole-quiz line, are shown only when the total is fixed before Start (not when a bank draws from questions with different points), and a part row leaves out its points for the same reason (decided after 2c4); the description is shown on the start screen only; a closed hint is a "Show hint" button, never an empty box; after Submit a typed answer shows only the "Your answer" and "Accepted answers" boxes. **Settled after 2d** (2026-10-29): with one part chosen, the whole `time_limit` applies; a deadline that passes while the start screen is open is caught at Continue, which submits; when storage is blocked, the notice shown after Start stays until Submit; the key blob is decoded at Start, because the plan needs it, and nothing from it shows before Submit; while answering, nothing is marked right or wrong (no `data-correct` before Submit) |
| Answering ordering, matching, essay, code | Native controls only, so keyboard, phone and screen reader work without a library (decided 2026-10-28). **`ordering`:** the items in their shuffled order, each with ↑ and ↓ buttons; dragging is added on top of the buttons (slice 2c4) and never changes what is stored. **Dragging is the default with a mouse or touch** (owner, 2026-10-29: reordering by buttons alone is frustrating with a mouse): every item has a visible drag handle and can be dragged to any place; the buttons stay for the keyboard and screen readers. **What drags** (owner, 2026-10-30): with a mouse or a pen the whole row drags, once the pointer has moved a few pixels (so a click is still a click), except on the Up and Down buttons; on touch only the handle drags, so the page still scrolls under a finger. **The Up and Down buttons** (owner, 2026-10-30) are compact and inline at the row's end, labelled "↑ Up" and "↓ Down" ("Lên" and "Xuống" in `vi`), the arrows drawn as icons; about 32 px high with a mouse and 44 px on a touch screen (`pointer: coarse`). **While dragging** (decided after 2c4) the numbers follow the landing order live, the lifted item showing the number of the slot it is over; the ↑ and ↓ glyphs are `--text`, `--muted` when disabled. **`matching`:** each left item has a dropdown of the right-hand items (shuffled, distractors included) and "—" for none. **`essay`:** a text box with a live word count against the target ("87 / 120 words minimum"); it never blocks Submit; the rubric is shown above it when `show_rubric` is true (above a `code` box too). **`code`:** a monospaced text box filled with `starter`; Tab moves the focus as everywhere, so it is never a keyboard trap. Clearing the box leaves it empty, so a learner can start from nothing; while it is empty and the question has a `starter`, a "Reset to starter" button under it puts the starter back (decided 2026-10-28). **Unanswered** (the page stores `null`): an `ordering` the learner has not moved yet (it never starts in the right order), a `matching` with every dropdown at "—", an empty essay, a `code` box empty or still exactly the `starter`. **After Submit:** `ordering` marks each item right or wrong with its correct position; `matching` marks each pair, with the right match when wrong; `essay` and `code` stay readable (read-only, not disabled) and show "Waiting for a grader" (status `pending`), then `sample_answer` when there is one. **Unanswered after Submit**, as an empty blank: an untouched `ordering` marks no item right or wrong and only gives each item's correct position ("belongs at N"), under the result line's "Not answered" (no second line); a pair left at "—" says "No answer" with the right match. **Moving by keyboard:** after a move the focus stays on the same button of the moved item, or on its other button when that one is now disabled |
| Question card (owner, 2026-10-30, over the Quiz board) | **Header:** "Question 1" in bold, 1em, `--accent`; then "· 1 point" in `--muted` at 0.85em; tags in `--hint`. **Choice rows** in harmony with their letter badge: the badge 32 px square (8px radius, 0.9em bold), the badge sits the same distance, 12px, from the row's top, bottom and left edges (owner, 2026-10-30, replacing "10px 16px padding": the inset was uneven), so a one-line row is 56 px inside its border; a row whose text wraps keeps the badge at the top, 12px from the top and left; 14px between badge and text; the text 1.06em; true/false, `ordering` and `matching` rows the same. **One answer or several** (owner, 2026-10-30, as they looked alike): a `single` question's letter badges are round, a `multi` question's square (8px radius); a picked `multi` row also ends with a ✓ in `--accent` while answering. The header says which, after the points: "Choose one" or "Choose all that apply" ("Chọn một đáp án", "Chọn tất cả đáp án đúng"), in `--accent` on a light accent wash, as a small tag. True/false is a `single` and is round, with no hint (two choices say it). |
| Results (after Submit) | The same page in the submitted state, not a separate screen; Submit leaves Focus mode, and the sidebar keeps its open or closed state and takes its tabs form (Sidebar, below). A **results card** above the first question, with no heading or label of its own (decided 2026-10-29): the score as a large percentage, under it two labelled cells side by side, **Points** ("23.5 / 33") on one line and **Time used** ("27:14 / 30:00" with a thin neutral bar) on the line below, then the goal, when the quiz has a `pass_mark` (from the brief's **Commitment**, or set by an exam template): "Goal 80% · reached ✓" or "Goal 80% · not reached yet" (warning colour, an arrow, never "failed"), one wording for every quiz, with the asterisk while grades are pending, one row per part (a bar split by result in the question map's colours, flags left out, with the counts in its label; points; percentage by points), then **Retry missed (N)** (its tooltip says it has no time limit) and **Download results** (on a served page, "Sent" instead). No per-tag breakdown; that is `stats`. With grades pending, the card says how many answers wait and that the score covers the rest (section 4); the overall score and every part with an answer waiting show their points and percentage in italics with an asterisk ("71%*", "23.5 of 33 points + 4*"; "4 / 8 + 4*", "50%*"), and the note starts with the matching "*". A question card's header (decided 2026-10-29, as on the mockup, docs/mockup/): on the left, in muted small text, "Question 19 · 1 point · #tag" ("· flagged" added after Submit); on the right, the flag toggle while answering and the result (icon, word, points: "✕ Incorrect · 0 / 1") after Submit, or after Check. Every question shows its result as icon, word and points in one of five states: correct, wrong, partly right, unanswered, waiting for a grade; the question map uses the same five (with a glyph and a label, not colour alone) and a flagged mark. Choice questions mark "Your answer" and "Correct answer"; typed answers show the learner's answer beside the accepted one with its tolerance (a `short` question with only `patterns` shows its result and no accepted answer: a pattern is never shown); essays and code show the answer, then the grade table of section 6 and a line naming the grader and date. Explanations open under every question. The page never calls an AI: an essay stays waiting until `grade` has run and the attempt is opened with `replay` or `library take` |
| Review filter | A bar under the top bar: **All · Missed · Flagged**, each with its count and no other text. Missed is wrong, partly right or unanswered; an essay counts once graded below full marks, as for `--missed` (said in the button's tooltip). The submitted time goes in the status line |
| Retry missed | A new attempt of the missed questions only (`plan.source: "retry"`), same feedback setting, **no time limit**, options shuffled again. **Decided 2026-10-29:** the questions are the missed ones of this attempt's own plan (wrong, partly right or unanswered; an essay or code answer waiting for a grade is not missed), in a plan drawn with a fresh seed by the same rules as Start; its results card scores only them, and `quiz grade` grades its export. The page keeps one saved attempt per quiz, so the retry replaces it: the button asks to confirm (a dialog like Start over's, which says to download the results first). With nothing missed there is no button and the card says "Nothing missed". A retry can be retried, with no special case |
| Instant feedback | `feedback: instant` (decided 2026-10-29). Each auto-graded question has a **Check** button under its answer, enabled once it is answered. Check shows the question's result and its explanation, as after Submit, and locks the answer (read-only, recorded in `checked`), so it cannot be re-checked. Essays, code and `graded=false` questions have no Check and are graded after Submit, as with `feedback: end`. Submit grades every answer, checked or not; the results are the same as with `feedback: end`. Resume and replay show checked questions locked with their result |
| Replay | The results page opened from a saved attempt, with a banner: "Replay · Attempt of 20 Oct 2026 · version `a3f9` · grades from the report of 21 Oct" (or "grades pending"). No Submit; Retry missed starts a fresh attempt in the browser |
| `--missed` | A banner: "12 missed questions, 3 changed since", with the changed questions marked |
| Top bar and status line | Chrome docks to the edges and content floats as cards; the 0.x side panel is gone. The **top bar** holds the title, the sidebar button (below), **Focus mode**, A− / A+, the look (an icon with a label for screen readers) and **Submit**. Under it, a **status line** of plain segments divided by thin rules: the quiz's time left (the time elapsed when untimed); when parts are timed, the current part's ("Part 2 of 3, Fourier transform: 04:10 left"); the current question ("Question 20 of 32"); progress ("19 of 32 answered", a thin bar, "59%", the bar a `progressbar` with that label); and the flag count when there are flags. The timer is never hidden. After Submit the line reads "Submitted 26 Oct, 14:32" (in replay "Replay of the attempt submitted 26 Oct, 14:32"), what was taken ("The whole quiz · 32 questions") and "Time used 27:14 of 30:00". Segments wrap on narrow screens rather than truncate. **Clocks** (decided 2026-10-29) are `mm:ss`, minutes padded to two digits ("04:10"), and `h:mm:ss` from an hour. **On a phone** (decided 2026-10-29, the MaterialsPhone board) the top bar is compact: the title with one line under it, the time and progress only ("18:42 left · 19 of 32 answered"), and the buttons beside it; the title is left out of the bar on a phone (decided 2026-10-30: four buttons cut it and the line), so the line is never cut |
| Sidebar | One sidebar, docked flush to the right edge (a left border, the card colour, no radius or shadow), opened and closed by one top-bar button named for what it holds: **Questions & materials**, or **Questions** when the quiz has no materials. It opens at the tab last used; `Q` and `M` open it at that tab, `Esc` closes it. When it is closed the question column is centred at a reading width. Open or closed is kept in the browser's storage like the look, and allowed even under `look: locked`, since it changes layout, not colours; it starts open on wide screens and closed on narrow ones. Two forms: **while answering, stacked**, 40% of the width: the question map on top, then a **Materials** heading over the sheets, so the place and the sheet are seen together; **after Submit and in replay, tabs**, Questions (the results map) and Materials, 320 px wide on Questions and 40% on Materials. A quiz without materials has a plain Questions sidebar in both phases. On a phone the sidebar takes the whole screen, with a back link and the two tabs |
| Question map | Segmented by part. **While answering**, a master and detail split 35/65 by a rule. Left: the parts as a vertical tab list, each entry "Part N" over its name, with a completion ring at its start (an arc in the accent colour for the share answered; when every question is answered, a filled accent disc with a tick cut out in the card colour, so it reads in light and dark) and, when the part has flagged questions, a flag dot pinned in the entry's top-right corner. The chosen entry is outlined in the accent; the current part is chosen at first. Each entry's accessible name gives its counts ("Part 2, Fourier transform: 7 of 12 answered, 1 flagged"). Right: the chosen part's heading ("Part 2 · Fourier transform"), its counts ("7 of 12 answered · 1 flagged") and its grid of question numbers, 8 columns, scrolling after about 5 rows; then a one-line legend (answered, flagged, current). A quiz with one part shows the grid without the list. **A quiz without materials** (owner, 2026-10-29, after the Quiz board) has no split: while answering its 320 px Questions sidebar lists the parts as collapsible headings ("1 · Signals", the counts "12/12" or "7/12 · 1 flag", a chevron), the current part open, each over its grid of 6 columns; the split is the stacked sidebar's, with materials. **Decided after 2f2** (2026-10-29): after Submit a question with no points (a `scale`) is a sixth, neutral "not scored" cell, in the legend only when the quiz has one; an untitled part is "Part N" in the maps and on the results card alike (not "Other questions"); a one-part quiz or a retry shows one grid without a heading row in both phases; the legend's "waiting for a grader" takes the full width, on one line. **Jumping from a part heading** (owner, 2026-10-30): a double-click on a part's heading in the collapsible list jumps to its first unanswered question while answering (its first question when all are answered), and after Submit to its first question the review filter shows; the double-click leaves the heading open or closed as it was, without opening and closing on the way: a click's toggle waits out the double-click (about 250 ms) and a second click cancels it (owner, 2026-10-30, replacing a visible flicker). The jump from a heading scrolls smoothly to the question (instantly under `prefers-reduced-motion`), and the focus moves to it without a second scroll. Enter on a focused heading does the same jump (Space still opens and closes it). **A part with one question** has no grid: its heading row is the cell, so one click jumps to the question, and the row shows that question's state (answered, flagged, current while answering; its result after Submit), in both phases. **After Submit**, every part is a heading over its grid, in the five result states (glyph and label, not colour alone) with the flagged mark. Numbers run on across parts, as on an exam paper. Parts only, never tags (a question can have several) |
| Materials | Quiz-level sheets (formula tables, identities, constants) named by `materials:` in the front matter (QUIZ_SYNTAX.md, section 2): Markdown only, no PDFs or links, rendered at build like the questions, so the browser's find works in them. In the sidebar, one chip per sheet over the open sheet; a sheet's first heading is its name. Available on the start screen, while answering, in review and in replay. Opening a sheet is not recorded. The authoring guide warns that a sheet can give away answers. Adopted from [proposals/reference-sheet.md](proposals/reference-sheet.md) on 2026-10-28 |
| Focus mode | Fullscreen with the sidebar closed, nothing more: no one-question view, nothing dimmed. It is not stored as its own state: it is "the page is fullscreen" plus the sidebar's state. **Focus mode** in the top bar, or the `F` key, enters it and closes the sidebar; the sidebar button still opens it. Leaving (the button, `F` or the browser's Esc, which the browser takes before the page) leaves the sidebar closed. While fullscreen, the status line ends with a muted "Clock 14:05 · Esc leaves full screen", since fullscreen hides the system's clock. Browsers allow fullscreen only after a user gesture, so the start screen has a **Focus mode** checkbox and pressing Start enters it; `serve --focus` and `library take --focus` only tick the box. The checkbox and the button are hidden where the browser has no fullscreen for pages (iPhone Safari). Submit leaves fullscreen, so results and review open in the normal layout. A template cannot force it, even under `look: locked`. Keys never act while a text field has the focus |

Fixed from 0.x: the panel showed the clock and the timer side by side without labels, and the legend took a lot of space. The status line labels every value, and the legend is one line.

### Themes

A theme decides how the page looks, never how it behaves.

| A theme may set | A theme may not set |
|---|---|
| colour tokens: surfaces, text, accent, status colours | layout, question flow, timers or feedback mode (front-matter options with their own rules) |
| code highlighting colours, derived from the tokens | the meaning of a colour: "correct" is always `ok`, and the ✓ and ✗ icons stay, so colour is never the only signal |
| the font family, from a fixed list | anything loaded from the network: fonts are embedded or come from the system stack |

Colours and fonts are chosen separately, so any theme goes with any font: contrast depends only on the theme and Vietnamese coverage only on the font, so all combinations pass once each part passes. There are no named combinations; templates fill that role.

#### Themes (v1)

One key, `theme:`, with six values.

| `theme` | Look | For |
|---|---|---|
| `auto` (default) | `light` or `dark`, following the device, with a toggle | everyday practice |
| `light` | today's muted light: soft surfaces, grey-ish accent | |
| `dark` | today's muted dark | |
| `oled` | pure black `#000` page; near-black cards (about `#0f0f11`) with thin borders, which also limits the smearing OLED screens show when pure black scrolls; text off-white (about `#e0e0e0`, since pure white on black glares); status and accent colours softened (lower saturation, a little lighter), since saturated colours glow on black | dark rooms, OLED screens |
| `white` | pure white background, near-black text, plain grey borders, no shadows, one restrained accent | computer-delivered exams, in the style of the IELTS computer test |
| `paper` | warm off-white background (about `#f6f1e7`), dark warm-grey ink, low-saturation accent | long reading, a printed-paper feel |

Every value other than `auto` is locked, with no toggle. An unknown theme is a fixed-rule error in `check` (`theme.unknown`).

- **Tints are derived, not listed.** The light washes behind a correct or wrong choice, an explanation and the info boxes come from the main colour with `color-mix` against the card colour, so a theme lists only its main colours and contrast is checked on fewer tokens. Each theme sets its own mix percentage per wash (decided 2026-10-30), so dark themes keep the depth of their boards. **What a wash mixes into** is also the theme's (owner, 2026-10-30): the card colour for the light themes, the page background (`--bg`) for Dark and OLED, whose boards' washes are darker than their card, which a mix into the card cannot reach.
- **Explanation text is semibold (600)**, not bold: bold across a whole paragraph tires the eye.
- **Colour always means a status.** Neutral things (the start screen's fact tiles, the parts list) stay neutral and are told apart by muted icons, never by hue.

#### Fonts (v1)

`font: system | sans | serif | readable`. Every embedded font covers Vietnamese, is under the SIL Open Font License, and comes pinned from npm (`@fontsource`), never from a CDN.

| `font` | Family | Why |
|---|---|---|
| `system` (default) | the OS stack: Segoe UI, SF Pro, Roboto/Noto | made for screens, zero bytes, and all three have full Vietnamese coverage |
| `sans` | Be Vietnam Pro | a friendly neo-grotesque designed with Vietnamese diacritics in mind; good for quizzes and surveys |
| `serif` | Source Serif 4 | a modern text serif with optical sizes, more readable on screen than Times New Roman; good with `paper` or for formal exams |
| `readable` | Lexend | wide letterforms tuned for reading ease, for learners who find dense text tiring |

- Code always uses the system monospace stack (Cascadia Code, Consolas, Menlo, which cover Vietnamese comments), so no font is embedded for code.
- An embedded font is the Latin, Latin-extended and Vietnamese subsets as WOFF2, regular, bold and italic (variable files where available): about 100 to 200 KB per font. Fonts are not subset to the quiz's own characters, because a learner's typed answer could need a glyph the quiz doesn't contain.
- KaTeX fonts are embedded only when the quiz has math, as WOFF2 only, and only the font files the page's rendered maths uses (most maths needs 5 to 8 of the 20; decided 2026-10-29, slice 2i).
- `theme.unknown-font` is a fixed-rule error in `check`.

#### The look: recommended or locked

The quiz's `theme` and `font` are its **recommended look**: the page always opens with them. One more key decides whether the learner may change them:

```yaml
theme: paper
font: serif
look: free      # free (default) | locked
```

- **`free`**: the page has an **Appearance** menu with every theme and every embedded font (see below). The learner's choice is kept in their browser's storage, per quiz, with **Default look** ("Giao diện mặc định"; decided 2026-10-30, a short noun). If storage is unavailable, the page simply opens with the recommended look each time.
- **`locked`**: no menu and no light/dark toggle; everyone sees exactly what the author chose. For mock exams and exam simulations. The `exam` and `ielts` templates set it, and `brief --mode timed-exam` writes it.

The font-size control stays in both, since it is an accessibility need, not a taste.

Templates set a fitting look, so most authors never touch these keys: `quiz new ielts` uses `white` with `system`, locked; `exam` uses `paper` with `serif`, locked; the others keep the defaults.

#### Which fonts a page carries

How many fonts to embed is a delivery choice, not part of the quiz, so it is an option on every command that writes a page (`--fonts`, COMMANDS.md), with a default in `config.toml`:

| `--fonts` | Embedded | The Appearance menu offers |
|---|---|---|
| `quiz` (default) | the quiz's own font only (nothing when it is `system`) | `system` and the quiz's font |
| `all` | all three embeddable fonts, about 0.5 MB | all four fonts |
| `none` | nothing | `system` only |

- With `none`, the CSS still names the quiz's font first, so a copy installed on the learner's machine is used; otherwise the system font takes its place.
- `none` on a `look: locked` quiz whose font isn't `system` gives a build warning (`build.font-not-embedded`), because the author's look is no longer guaranteed.
- The choice is an input to the build, so builds stay byte-identical for the same quiz and the same `--fonts`.

#### How it is built

1. **A theme is data.** It's a named entry in a registry with semantic tokens (`bg`, `surface`, `card`, `sunken`, `line`, `line-strong`, `text`, `muted`, `accent`, `on-accent`, `ok`, `bad`, `warn`, `info`, `flag`, `hint`, `orange`); `auto` is just the pair `light` and `dark`. It is the only place colour literals exist. A font is a registry entry too: its stack, files, line height and size adjustment, so a swap of fonts doesn't shift the layout.
2. **Contrast is checked in code.** Every text-on-surface pair of every theme must reach WCAG AA (4.5:1 for text, 3:1 for borders and icons), in a unit test. Generated code colours are nudged until they pass, as 0.x's `_legible()` did.
3. **Code highlighting comes from the tokens.** The Shiki theme is generated from the tokens (keywords from `accent`, strings from `ok`, and so on), so a theme never needs a hand-made code theme.
4. **High contrast** comes from the themes themselves: under `prefers-contrast: more`, `light` and `paper` switch to `white`, and `dark` to `oled`, so no extra token sets are needed. It is the one automatic switch, because it is an accessibility need the operating system asks for, not a taste.
5. **A print style sheet** is always on white with the chosen font, whatever the theme, with page breaks. It is used by the printable paper below.

### Printable paper

`quiz build --print` writes a static page made for paper: no runtime, no sidebar, nothing interactive. The same components render it, in a print layout. PDF comes from the browser's **Print → Save as PDF**; fullmark does not ship a browser to make PDFs itself.

- **Answers:** `none` (an exam paper), `key` (the paper, then an answer key on a new page), or `inline` (each answer and explanation under its question, a study sheet).
- **What an answer is, for every type:** `key` and `inline` print everything the quiz holds about a question's answer, and differ only in where it goes. For an essay or code that is the rubric, the sample answer if the quiz has one, and the explanation: whoever marks a paper needs the rubric, and a learner studying needs to know what is assessed. `none` prints neither, as on an exam paper. One exception: a preset rubric (IELTS) prints its name and criteria, not its descriptors, which are public and run to pages; a custom rubric prints in full.
- **Layout of answers on paper:** choices lettered A, B, C…; short answers and blanks get a line; numeric answers a box; matching two lettered columns; ordering numbered boxes. Essays and code get ruled space sized from the question's word limit or points.
- **Look:** black ink on white whatever the theme, in the quiz's font. No colour, fills, cards or rounded corners: structure comes from rules and tables. Questions are known by number only ("Question 1.", "Câu 1." by `ui_lang`), with the points right-aligned; no tags, ids or icons. Parts are plain uppercase headings and numbering runs on across them. Short choices go in two columns. Matching is a two-column table. A footer carries the page ("Page 1 / 4"), the title and the version.
- **Header:** a table with the title, time allowed, total points and version, and boxes for Name, Class, Student ID, Date and Signature; below it a marks table for the marker (one column per part, Maximum and an empty Score row, a total).
- **Answer sheet** (`--answer-sheet`): a grid of numbered boxes for the single-choice and true/false questions, filled in by hand with a letter. Bubble sheets for machine grading are not planned: they need precise printing and a scanner pipeline, outside what fullmark is.
- **Key:** the answer-sheet answers in the same grid, the other answers in a table (No., Answer, Points), and each essay's rubric as a table.
- **Versions (mã đề):** `--seed` shuffles questions and options reproducibly, so `--seed 101` and `--seed 102` give two versions of the same exam, each with its own key. The seed is the paper's code, printed exactly as given and labelled "Mã đề" (`ui_lang: vi`) or "Paper code": in the header, in the footer, and on the key ("Đáp án mã đề 101"); the answer sheet has a box where the student writes it. Without `--seed` no code is printed; `ordering` and `matching` are still scrambled by the quiz's short version (section 4, Seeds), which the paper shows only as its version. Several versions come from a build file with one entry per seed.
- **Materials:** the sheets follow the last question, on a new page headed "Materials" with the note "You may detach this page", in the same black ink, and before the key. The header says which page they start on ("Materials on page 4"). `--materials none` leaves them out, for a paper where the sheet is handed out once for several quizzes.
- **Page breaks** never split a question from its options; sections can start on a new page.
- **Language** of the labels ("Answer key", "Name") follows the quiz's `ui_lang`.

A plain Markdown export for pandoc (and so Word and Typst, maths included) is in [proposals/markdown-export.md](proposals/markdown-export.md).

**Adding a theme or font later** means adding one registry entry that passes the contrast or glyph-coverage test, and nothing else. User-defined themes and fonts in `fullmark.toml` come only after that, held to the same tests.

## 9. Languages

English and Vietnamese from v1, for what a learner sees. Every string a page, report or form shows goes through a message catalog from the first commit, because adding a catalog to finished code means finding every hard-coded string again.

### Two keys in the quiz: what it is written in, and its interface

| Key | Means | Decides | Default |
|---|---|---|---|
| `lang: en \| vi` | the language the quiz is written in. One quiz, one language; a template too | `lang` on the question text, how numbers in answers are read (decimal comma in `vi`), the language a grader writes feedback in, the shelf's EN/VI badge, `lang` in `library list` | `en`. Set by the author, or by `brief --language` through `brief.yaml` |
| `ui_lang: en \| vi` | the interface around the questions | the page chrome (Start, Submit, timer, Export, banners, feedback), `<html lang>`, the report's headings, the printed paper's labels, the `review` and `grade --web` forms | `lang` |

**Grading follows `lang`, never `ui_lang`**, so a score depends only on the quiz source and the answers, never on how the page was built. Most quizzes write only `lang`; an English-taught course for Vietnamese students writes `lang: en` and `ui_lang: vi`.

| Elsewhere | Language |
|---|---|
| The `brief` forms (`--web`, `--tui`) | `brief --language`, default `en`: the quiz does not exist yet |
| `quiz guide` | `--lang en \| vi`, default `en`. It is a document, like the README |
| `check` messages, errors, `--help`, every other terminal output | English only, like most CLIs. Agents and scripts read them, and translating every command's help costs much for little |

There is no tool language: no `lang` in `config.toml` and no environment variable, and the OS locale is never read, so a command's output doesn't change from one machine to the next.

**The interface language is locked at build.** A quiz's content is written in one language, so a toggle would switch the buttons and leave every question as it was. Only the chosen catalog is bundled. `build --ui-lang` overrides `ui_lang` for a one-off build, such as sharing an English quiz with a Vietnamese interface. A runtime toggle stays possible later, since both catalogs together are a few KB, but there is no need for it now.

### How

- **A typed catalog, no i18n library.** `en.ts` is the source; `vi.ts` is typed `satisfies Messages`, so a missing or extra key is a compile error. Messages with values are functions (`(n) => \`${n} câu sai\``). Vietnamese has no plural forms and English needs two, so ICU MessageFormat and i18next would add page weight for nothing.
- **Rule ids, JSON keys, exit codes, slugs and file formats never change with the language.** An `Issue`'s `message` and `fix` are English. Agents and scripts match on `rule`, and `AGENTS.md` says so.
- **Dates and numbers** are formatted by our own small functions, not `Intl`, because `Intl` output varies with Node's ICU version and would break byte-identical builds. JSON always uses ISO dates and a decimal point.

### Documents

| Document | Languages |
|---|---|
| README, `quiz guide` (authoring reference), templates' sample text, form help in the brief question file | English and Vietnamese (`README.vi.md`; `guide --lang vi`) |
| `TECHNICAL_DESIGN.md`, `COMMANDS.md`, `AGENTS.md` (`quiz agent-guide`), JSON Schemas, code comments | English only |

English is the source. Each Vietnamese document starts with the commit of the English text it translates, and a test fails when the English file has changed since, so drift is visible instead of silent.

### Vietnamese pitfalls, decided

1. **Slugs and derived ids.** Removing diacritics through NFD does not touch `đ` and `Đ` (they have no decomposition), so "Đạo hàm" would slug to `đao-ham`. The slug function maps `đ` to `d` explicitly. Slugs must be identical in both languages.
2. **Decimal comma in numeric answers.** Vietnamese students write `2,5`. In a `lang: vi` quiz the grader accepts `2,5` and `2.5` as the same number. Thousands separators are rejected in both languages, with the hint "write 1500, not 1.500". This lives in `normalise()`, so page and CLI agree. **Printing** (decided 2026-10-29): every number the interface prints (points, scores, tolerances) uses a decimal comma when `ui_lang` is `vi` ("2,5 / 5"), and a point otherwise.
3. **Composed and decomposed input.** Some Vietnamese keyboards produce decomposed text. All text answers are NFC-normalised before grading (already in section 2).
4. **Stacked diacritics** (ệ, ở) clip under a tight line height. Every token set keeps line height at 1.4 or more for text, and a screenshot test of a Vietnamese example covers it. Embedded fonts must carry the Vietnamese subset.
5. **Longer strings.** Vietnamese labels run about 30 % longer than English. Buttons, the status line and the sidebar wrap instead of truncating, checked by the same screenshot test.
6. **Sorting** of section titles, tags and quiz names in lists uses a fixed comparison, not the OS locale, so output is deterministic.

## 10. Features by area

| Area | v1 scope |
|---|---|
| Question types | single, multi, true/false, numeric (tolerance, fractions), short answer (strings and regexes), fill-in-the-blank (also in code), labeled fields, matching, ordering, essay, code; survey types `scale` and ungraded questions; choice follow-up inputs |
| Page | timer and suggested time per section, instant or end-of-quiz feedback, banks, Focus mode, materials (quiz-level sheets), resume, font-size control, theme lock, review wrong only, Retry missed, **section picker on the start screen**, **start in the submitted state from an embedded attempt** |
| Print | `build --print`: a printable paper with answers `none`, `key` or `inline`, answer space per question type, a header with name fields, seeded versions, a materials page |
| Brief | `brief` through flags, `--web` and `--tui`, all driven by one question file; detail rules (`min-words` with an example) enforced by both forms and warned about through flags; a summary screen before writing |
| Authoring | `brief`, `check` with `--review`, `--strict` and `--profile`, `review`, `inspect`, `new`, `build --watch` |
| Themes | `theme`, `font` and `look` (`free` with an Appearance menu, or `locked`) keys; `--fonts quiz\|all\|none` when writing a page; themes `auto`, `light`, `dark`, `oled`, `white`, `paper`; fonts `system`, `sans` (Be Vietnam Pro), `serif` (Source Serif 4), `readable` (Lexend), all covering Vietnamese; high contrast through `white` and `oled`; Shiki colours from the tokens; print style sheet |
| Languages | English and Vietnamese for the page, reports, forms, README and `quiz guide --lang`; quiz `lang` (written in, drives grading) and `ui_lang` (interface, locked at build); terminal output in English only; decimal comma in `vi` numeric answers |
| Check config | rule ids on every finding, `fullmark.toml`, built-in and custom profiles, declarative custom checks, inline ignores with a reason, `quiz rules` |
| Grading | `grade` with reports and `grades-v2`; rubric modes `holistic`, `additive`, `banded` and the IELTS presets; a required grader identity; `grade --web` for human grading; `stats` with per-question, per-tag and per-criterion history |
| Library | init, status, register, list, **info**, take (**`--section`, `--missed`**), share, grade, stats, rename, rm, path, **replay**, **publish**, **import** |

Not in v1: terminal forms other than `brief --tui` (`review` needs rendered questions; survey quizzes use `serve`), `library sync`, `library --web`, `source=` coverage, includes, hotspot questions, Anki, CSV or QTI import and export, spaced repetition beyond `--missed`.

### Decisions on the new features

1. **Missed** means wrong or partly right in any earlier attempt, and not answered fully right since. Questions that changed since they were missed are included and marked as changed. Questions removed in the current version are dropped.
2. **Essays and code in `--missed`**: included only when graded below full marks. Ungraded ones are skipped.
3. **Replay of agent-graded questions**: shows the grades from the newest report for that attempt if one exists, otherwise marks them pending.
4. **`--section` with `--missed`** gives the missed questions inside that section.
5. **A shelf** is the published folder: your public quizzes with source, built pages and an index, plus a `fullmark-shelf.json` manifest, and no history or private data. Its format is 1.0's own; 0.x's publish plan (`PUBLISH_PLAN.md`) is a source of ideas, not a format to match.

## 11. Testing

- **Starting data from 0.x:** `grading_cases.json` and 0.x's examples and fixtures, rewritten in 1.0 syntax, are the first test inputs. They carry behaviour that was already debugged; nothing is compared against 0.x's output.
- **Contract tests** run `quiz` as a subprocess and compare with golden files (exit codes, messages, JSON, built bytes). Golden files are produced by 1.0, reviewed once, and committed; a change to one is a reviewed diff. They hold some wording from dependencies (commander's usage errors and help); dependencies are pinned exactly, so an upgrade shows as a golden diff. `quiz ids` is made repeatable by `FULLMARK_TEST_SEED`, read only in `src/cli/main.ts` and for tests only.
- **Grader:** the 0.x grading cases plus new Unicode, BOM and decimal-comma cases. They run once, because there is one grader.
- **Determinism:** two builds of the same input are byte-identical, and so are two publishes. A `build` page is byte-identical with and without the server features, and contains no server code.
- **Round trip:** publish, then `import --into` an empty folder, then publish again to the same folder gives `unchanged`.
- **Foundations:** the same quiz with CRLF, a BOM or NFD text has the same hash as with LF and NFC; two quizzes opened from `file://` never read each other's storage; a page with storage blocked still works; an asset outside the quiz folder and raw HTML are refused; the server rejects a wrong token, `Host` or `Origin`.
- **Budgets:** CLI startup, page runtime size and the 300-question fixture are measured on every run against the limits in section 7. A startup measurement over its limit is taken once more before the test fails (decided 2026-10-29), since a loaded machine can push one run over. The startup test runs first in `npm test`, before the vitest suite, so it measures a cool machine; the limit is on fullmark's share over a bare Node timed in the same run (decided 2026-10-30; the number is in section 7). The parse benchmark is also measured once more before it fails (owner, 2026-10-30), as it too trips under load.
- **Safe writes:** a write killed halfway leaves the old file intact; two library commands started together both finish, one after the other; a stale lock from a killed process is cleared.
- **Privacy:** no results, reports, progress or brief appear in a published folder.
- **Rubrics and grades:** for every mode, a valid grades file and one fixture per validation error. The computed totals and bands come from golden cases, including the IELTS rounding edges (.25, .75). A 0.x `grades-v1` file is refused with a pointer to the conversion script.
- **Themes:** every text-on-surface pair of every theme meets WCAG AA. Every embedded font has a glyph for every Vietnamese letter with every tone (checked against the font file, not by eye). Screenshots of the examples in every theme with the default font, and in every font with one theme, catch layout or colour drift, including clipped diacritics.
- **Config:** every rule has a fixture that triggers it and one that does not, under each built-in profile. Every config error points to its `file:line`.
- **Languages:** golden files exist in `en` and `vi`. A `vi` build of every example has no English chrome left (a scan for catalog strings), the slug cases include `đ` and `Đ`, the grader cases include `2,5` in both languages, and the Vietnamese documents' source commits are current.
- **Browser:** Playwright for every question type and for the resume, retry, replay and section flows, axe-core on every example in both themes, and a CSP test that no request leaves the page.

## 12. Order of work

| Step | Content | Done when |
|---|---|---|
| 0 | Design the quiz syntax in `QUIZ_SYNTAX.md` ([TODO.md](TODO.md)), with each field marked as structure or content. Then bring over 0.x's test data: `grading_cases.json`, examples and fixtures, rewritten in that syntax | `QUIZ_SYNTAX.md` is settled; the grading cases load as vitest cases; every example is valid 1.0 Markdown |
| 1 | Core: the message catalogs (every string through them from here on), IR with ids and slugs, Plan, Attempt, rule registry with ids, config and profiles, custom checks, grade, rubric modes and `grades-v2`; `check`, `rules`, `grade`, `ids`. Planned in slices in [docs/plans/STEP1.md](../plans/STEP1.md) | All examples check; the 0.x grading cases pass; golden files reviewed and committed; three quizzes, one broken, give exit 1 and the right JSON lines |
| 2 | `build` (with several files and `--build-file`), moved here from step 1 because a page needs the runtime. Page runtime: Preact components on the Attempt reducer, the theme and font registries with the five token sets and four fonts, the contrast and glyph tests, plus `replay` and `build --print`; Vietnamese page chrome | All examples build; three quizzes, one broken, give two pages and exit 1, through files and through a build file; Playwright and axe pass; screenshot baselines reviewed and committed; a replayed page matches the original submitted page; a `vi` example passes the same tests |
| 3 | `serve` (with `--section`), `review`, `grade --web`, `brief` (flags, `--web`, `--tui`), `stats`, `inspect`, `new`, `build --watch` | Contract tests pass for each; the same answers through flags, `--web` and `--tui` write byte-identical `brief.yaml` files |
| 4 | Library: init, register, take (with `--section` and `--missed`), replay and the rest | History-based tests pass |
| 5 | `publish` and `import` | The round-trip and privacy tests pass |
| 6 | Move in: a throwaway script, written by an agent and kept outside the product, converts the owner's 0.x library (quizzes to 1.0 syntax, results and grades to the v2 formats) into a new 1.0 library. 0.10.2 is not archived: it stays as the survey tool for document-kit and presentation-kit ([fullmark-migration.md](fullmark-migration.md), version plan). It is renamed `fullmark-py` and gives up the `quiz` command, which 1.0 takes | `stats` and `--missed` in the new library agree with 0.x's stats on the same history |

Expect several weeks, mostly on the page runtime and the forms.
