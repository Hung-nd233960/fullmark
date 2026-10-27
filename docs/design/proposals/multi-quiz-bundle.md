# Proposal: several quizzes in one HTML file

**Status: proposal, not in v1 scope.** The seams it needs are in v1 ([TECHNICAL_DESIGN.md](../TECHNICAL_DESIGN.md), section 7, "Seams for later features"), so adding it later does not touch the core. Decide on it after v1 is in use.

## The case

"Just share me an HTML quiz of the whole Diagnostic Technology course." Messaging apps send one file, not a folder, and a zip is friction for the receiver. A folder with an `index.html` works offline but fails this case.

## The idea

A bundle is its own feature set, with its own command group, `quiz bundle`. `quiz build` always makes one page per quiz, however many files it gets ([COMMANDS.md](../COMMANDS.md), `quiz build`).

```text
quiz bundle build BUNDLE.yaml [-o OUT] [--json]
quiz bundle check BUNDLE.yaml [--json]
```

`bundle check` applies the restrictions below and the checks of each quiz without writing a page. Taking, grading and looking back at a bundle have their own commands ("Commands on a bundle" below).

**A bundle in core always has a `BUNDLE.yaml`.** The file names the papers, the mode and, for `exam`, the per-paper times and the overall result ("The bundle file" below). There are no `A.md B.md ... --mode` flags that make a bundle without one: results routing and grading across several quizzes need to know which papers there are, in what order, and how their grades combine. Several quizzes and one grades file with no definition would be a bundle anyway, only an unclear one. The file is positional rather than a `--build-file` flag, because it is the definition of the bundle and not only a list of options. The one place a group of quizzes exists without a file is a session in the library ("In the library" below), where the library knows exactly what each result belongs to.

One offline page holding several quizzes, with a left bar listing them (title, question count, progress, score once submitted). Each quiz keeps its own attempt, timer, autosave and Export, so the right panel and the question map work exactly as for a single quiz.

## Modes

`mode:` in `BUNDLE.yaml`, stored in the page.

| Mode | Flow | Result |
|---|---|---|
| `quiz` (default) | Any quiz, any order | per quiz |
| `level` | Quizzes in order; finishing one unlocks the next. `unlock: done` (default) or a score threshold (`unlock: 80%`, mastery: retry until passed). You can stop at any point | per quiz, plus how far you got |
| `exam` | Papers in order. Submitting a paper, or running out of its time, moves to the next. No going back to an earlier paper | one overall result across papers, plus per paper |

Ideas beyond these, not planned:

- **Mock from the course**: draw N questions from every quiz into one timed exam, fresh each attempt. Really a plan feature (banks across quizzes), not a navigation mode.
- **Pre/post test**: the same quiz first and last, with the gain shown.
- **Placement**: the score on one quiz picks the next (review or harder).
- **Scheduled**: one quiz unlocks per day or week. Relies on the device clock, so easy to cheat.

## Restrictions

A bundle is one page with one look and one flow, so its quizzes must agree. `bundle check` and `bundle build` refuse a bundle that does not, with a `bundle.*` rule that names the files and the values that differ. The fix is to edit the quizzes, not to loosen the bundle.

| Rule | The quizzes must share | Why |
|---|---|---|
| `bundle.mixed-kind` | their **kind**: the built-in profile their own profile comes from (`default`, `exam` or `survey`, following `extends`) | a test and a quiz differ in feedback, timing and rules; one flow cannot serve both. A survey has no score to show in a left bar of scores |
| `bundle.mixed-look` | `look` (`free` or `locked`) | a locked paper inside a free bundle would still show the Appearance menu |
| `bundle.mixed-theme` | the effective `theme` and `font` | the page has one set of tokens ([TECHNICAL_DESIGN.md](../TECHNICAL_DESIGN.md), section 8); the effective values are compared, so a quiz that sets nothing counts as the default |
| `bundle.mixed-lang` | `ui_lang` | the page chrome is one catalog, locked at build (section 9). The quizzes' `lang` may differ, as in a Japanese bundle ([japanese-support.md](japanese-support.md)); only `ui_lang` must match |

`mode: exam` also requires kind `exam` for every paper. Further rules (a duplicate quiz id, a size over the limit) are listed under "Open questions". Whether a per-quiz override is ever allowed is not decided; the default is no.

## Commands on a bundle

Everything about bundles lives under `quiz bundle`. The plain `serve`, `grade`, `inspect`, `replay` and `stats` stay single-quiz and know nothing about bundles, so the v1 core stays as it is.

A bundle command is the plain command run on each quiz, plus a collective layer: it matches each results file to its paper by `quizHash` (so `--quiz` is not needed once per quiz), runs the plain command, then adds a bundle-level section. "Individually" is the plain command; "collectively" is the bundle one. `--json` returns both, as `quizzes: [...]` and `overall: {...}`. The papers come from `BUNDLE.yaml`.

```text
quiz bundle serve BUNDLE.yaml [--out DIR] [--timeout SECONDS] [--open] [--autosave DIR] [--focus] [--json]
quiz bundle grade BUNDLE.yaml RESULTS... [-o DIR] [--json]
quiz bundle inspect BUNDLE.yaml [--json]
quiz bundle replay BUNDLE.yaml RESULTS... [-o OUT] [--open | --no-open]
quiz bundle stats BUNDLE.yaml RESULTS... [--json]
```

| Command | Individually (the plain command, per quiz) | Collectively |
|---|---|---|
| `serve` | The one-shot server, once per quiz taken | One server for the whole bundle (below) |
| `grade` | A report and a grades template per quiz | In `exam` mode the overall result from the papers, through the rubric modes (`additive`, `banded`, `round: ielts`); in `level` mode how far the learner got; in every mode a table of each quiz's title, score and time. This table is the "summary" of a sitting |
| `inspect` | The summary of each quiz | Totals: questions, points, time, the tags across the bundle, and whether the restrictions hold |
| `replay` | One page per attempt | One bundle page with every quiz already submitted: one learner's sitting, not many learners |
| `stats` | Progress per quiz | The weakest tags across the bundle, and the overall band over several sittings of an `exam` bundle |

Filling in the grades stays per quiz and per answer sheet, as for `grade`: `bundle grade` writes the templates, and a second run with the filled-in files folds them in and computes the overall result.

### `bundle serve`

`serve` waits for one submit and exits. A bundle gets one submit per quiz, so it has its own server run:

- It is the same server module as `serve` ([TECHNICAL_DESIGN.md](../TECHNICAL_DESIGN.md), section 7, seam 6), accepting submits keyed by quiz id.
- Each submit writes that quiz's `results-v2` file into `--out` (default: next to the `BUNDLE.yaml`). `--autosave DIR` keeps one progress file per quiz, so a closed tab or server resumes the sitting.
- It ends when the learner presses **Finish** in the left bar, after the last paper in `exam` mode, or on `--timeout` (default 1800 s as for `serve`).
- It prints the same first `listening` line as the other servers, and the last line is `{"status": "submitted" | "timeout", "results": [...], "overall"}`. Quizzes not reached are missing from `results`. Exit `0` finished, `2` timeout or usage error, `1` restriction or check errors before serving.
- `--once` and `--section` do not apply. In the library, `library take` runs this server for a session or a registered bundle ("In the library" below).

### The `bundle` field in results

A bundle exports one `results-v2` file per quiz, and nothing links them. A results file written by a bundle page carries an optional object, `"bundle": {"hash", "sitting"}`: the hash of the bundle (its quizzes' hashes, order and mode) and a random id minted when the sitting starts. The collective layer groups files by `sitting`. Files without it (taken on a plain page, or older) are still graded, replayed and counted per quiz; they just have no overall result. The field is optional and `results-v2` consumers ignore keys they do not know, so it needs no version bump; v1 reserves the key ([TECHNICAL_DESIGN.md](../TECHNICAL_DESIGN.md), section 7).

## The bundle file

`BUNDLE.yaml` is YAML because it holds content people write (titles, per-paper times), as quiz front matter and `brief.yaml` do. Paper paths are relative to the file. The smallest bundle is four lines and needs no grading logic, since results are per quiz:

```yaml
title: Diagnostic Technology, course 1
mode: level
unlock: done        # or a score threshold, 80%
papers: [a.md, b.md, c.md]
```

`mode: quiz` is the same without `unlock`. An `exam` bundle adds per-paper times and the one overall result. The overall result reuses the rubric modes of TECHNICAL_DESIGN.md section 6, with papers in place of criteria (`additive` adds points, `banded` averages bands and rounds, `round: ielts` gives the IELTS overall band). The file names the papers and picks a mode; it has no arithmetic of its own.

```yaml
title: IELTS mock 3
mode: exam
papers:
  - file: listening-3.md
    time: 30
  - file: reading-3.md
    time: 60
  - file: writing-3.md
    time: 60
overall:
  mode: banded
  round: ielts
```

Ship the small form first; the `exam` form when a real exam bundle is wanted.

## Where it lives

Not a plugin (that would need an extension API larger than the feature) and not one separate subsystem: each part goes in the layer it belongs to. The core builder takes a bundle definition as a value, not only as a file, so the library can pass one it made in memory (a session).

| Part | Where |
|---|---|
| `bundle.yaml` schema, `bundle.*` check rules, overall result (through `core/rubric`) | `core/bundle/`, pure, because the page computes the overall result too |
| Left bar, unlocking, exam flow | `page/bundle/` |
| Several quizzes into one page | `build/`, which already takes a list |
| `quiz bundle` commands, the collective layer | `cli/`; the restriction rules and the overall result are in `core/bundle/` |
| Several submits, one run | the shared `serve/` module, through a finish predicate (seam 6), not bundle code |
| Sessions, registered bundles, `take`/`share` on them | `library/`, which calls the core bundle code ("In the library" below) |

`build/` and `serve/` stay bundle-agnostic: they take a list of quizzes and, for the server, a finish predicate. Only `cli/` and `page/bundle/` import `core/bundle/`.

A bundle gets the same exit codes, `--json`, `--fonts` and several-files rules as the other commands: `exit 1` for a restriction or a check error in any quiz, `2` for I/O. Unlike `build`, it is never a batch: the papers it names make one page.

## Open questions

- **Size.** A course with images can pass the 20 MB warning. Assets are shared by hash, but images dominate. Maybe a `--max-mb` per bundle, or a warning naming the heaviest quizzes.
- **Timers.** Leaving a timed quiz mid-attempt: pause its timer, or keep it running? Probably running, as in an exam, with the left bar showing it.
- **Export from a shared file.** One results file per quiz taken (as now), or one "Export all" that writes several files at once with the same `sitting`.
- **Where a bundle's results go.** From a shared file, the learner exports one file per quiz. From `bundle serve` they go to `--out`. In the library, a session files to each quiz and a bundle files under itself ("In the library" below).

## In the library: sessions and bundles

Taking several library quizzes together is two different things, with the same page and server but different ownership of the results.

| | Session | Bundle |
|---|---|---|
| Defined by | Names on the command line: `library take A B C` | A `BUNDLE.yaml`, registered |
| Exists afterwards | No | Yes: an id, a name, versions |
| Overall score | None | Yes (`exam` overall, or progress in `level`) |
| Modes | `quiz`, `level` | `quiz`, `level`, `exam` |
| Results | Filed to each quiz, as for `library take`; they count for that quiz's `stats` and `--missed` | Filed under the bundle only. The member quizzes' histories do not change, and there is no opt-in to file them there |

A session exists only in the library. Core has no bundle without a `BUNDLE.yaml`, because results and grades need a definition to belong to; the library does not need one, because it knows exactly where each result goes: to its quiz. `library take A B C` makes a bundle definition in memory (mode `quiz` or `level`), calls the core bundle code, and files each submit as an ordinary single-quiz result. Nothing about a session is written down, and the plain `grade`, `replay` and `stats` handle its results quiz by quiz.

### Session

```text
quiz library take NAME... [--mode quiz|level] [--title TEXT] [--missed] [--focus]
```

- Results go to each quiz exactly as a single `take` files them.
- `--missed` is each quiz's own missed set, from that quiz's history. Quizzes with nothing missed are skipped and named; with nothing missed anywhere it says so and exits 0.
- `--section` is ambiguous across quizzes and exits 2.
- The quizzes must be of the same kind (`bundle.mixed-kind`) and `ui_lang`. The look (theme, font, `look`) is not required to match: the page takes the first quiz's, since the quizzes are an arbitrary pick.

### Bundle

A bundle is generated anew from library quizzes and is independent afterwards.

- **Register.** `quiz library register MIDTERM.yaml [-n NAME | --update NAME]`. The papers in the YAML are library quiz names, registered first. Register checks the restrictions and each paper under the rules it was registered with, then **snapshots** the current version of every paper into the bundle with the YAML and the resolved rules, and commits. Editing or removing a quiz later never changes a bundle, so a bundle is never stale and its results always match the text taken. `--update` takes new snapshots and makes a new bundle version.
- **By name.** A bundle is a name like any quiz, and the library commands that take `NAME` act on its kind: `take`, `grade`, `replay`, `stats`, `share`, `rename`, `rm`, and `list` with a `kind` column. There is no `library bundle` group. Options that do not fit a bundle exit 2, such as `--section`.
- **Results.** Files are filed under the bundle, grouped by `sitting`, with the overall result in the report. `library stats MIDTERM` shows the bundle's sittings and nothing else; `library stats QUIZ` shows the quiz's attempts and never a bundle's. `rm` deletes the bundle and its results, not its members.
- **`--missed`.** `library take MIDTERM --missed` covers all the papers: the questions missed in earlier sittings **of this bundle**, from the bundle's own history, across every paper. It runs as practice (`quiz` mode: no per-paper timer, no overall result), and the sitting is filed under the bundle marked `missed`. Whether it should keep the bundle's mode is open.
- **Share.** `quiz library share NAME` on a bundle writes the bundle page, `--source` the editable folder (`BUNDLE.yaml` with its papers as files), and `--version HASH` an older snapshot. `library share NAME1 NAME2 ...` with several names writes a session page for sending, a bundle page with no definition and no overall score (`--mode quiz|level`, `--title`).

### Still open

- **Shelves and `import`.** A bundle snapshot is self-contained, so it can sit on a shelf without its members being public; whether it should, how a shelf index lists it, and what `import` does with one ([interactions.md](interactions.md)).
- **`--missed` on an `exam` bundle** in the bundle's own mode, rather than as practice.
- **Papers by file path** in `BUNDLE.yaml` at register time, besides library names.
- **Grading a bundle** from the library: `library grade MIDTERM` writes the templates for every paper of a sitting; filling them in is per paper.

## Cost once the seams exist

The left bar, `quiz bundle build` and `check` with the restriction rules, and per-bundle size checks. Days, not weeks. The library side is extra and not estimated.
