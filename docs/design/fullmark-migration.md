# Why fullmark 1.0 is a rewrite

## Decision (2026-10-24)

**fullmark 1.0 is a from-scratch rewrite in TypeScript, with no compatibility with 0.x** (the Python prototype, last 0.10.2). The design is [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md).

What changed since the analysis below, which said "don't migrate now":

- **fullmark has one user.** Compatibility would protect only the owner, who can move their own data once. So the migration's main cost, matching 0.x's every message, exit code, HTML byte and pixel (option E's "fidelity" risk, steps 1 to 3 of the strangler fig), no longer applies.
- **The new requirements are large** (Vietnamese from day one, themes and fonts, printable papers, rubric modes, profiles). Building them in 0.x and again in 1.0 would do the work twice.
- **What carries over is knowledge, not formats:** 0.x's grading test cases and fixtures become 1.0's first tests, and the owner's history is converted once by a throwaway script (TECHNICAL_DESIGN.md, section 12, step 6).

**Version plan (2026-10-25).** fullmark 0.10.2 stays as the MVP; from now on its main use is surveys, as a dependency of document-kit and presentation-kit. fullmark 1.0 is the main implementation of quizzes and may diverge from 0.x behaviour. One such break: `quiz serve` takes only the quiz source, not a built page ([COMMANDS.md](COMMANDS.md), `quiz serve`). Another: the 1.0 library refuses surveys (`library.survey`), since 0.x now covers surveys for those kits; `serve` and `stats` still handle them.

**0.10.2 becomes `fullmark-py` (2026-10-25).** Both kits are Python and today find 0.x as `quiz` on PATH (`quiz serve --once` as a subprocess), with no declared dependency; the quizmd → fullmark rename already broke one of them (presentation-kit issue 001). So 0.10.2 is renamed `fullmark-py`, gives up the `quiz` command (1.0 keeps it), and gains one Python function the kits call, such as `serve_survey(md_path, timeout) -> answers`. Each kit pins `fullmark-py==0.10.2` in its `pyproject.toml`, so 1.0's changes cannot reach it, and neither kit needs Node. The rest of 0.10.2 stays as it is, frozen apart from survey fixes. This work happens in the 0.x repo and the two kits, not in 1.0:

1. In 0.x: rename the package, drop or rename the `quiz` bin, add `serve_survey`.
2. In document-kit and presentation-kit: depend on `fullmark-py` pinned, call `serve_survey` instead of `quiz serve`, and close presentation-kit issue 001.

TypeScript stays the choice for the reasons in the table below: one grader for the page and the CLI, markdown-it as the original of the parser already in use, and Node already installed.

The rest of this file is the analysis of 2026-10-23, kept as the record.

## The situation (2026-10-23)

- **Python CLI:** about 9,400 lines. It parses and validates Markdown with line numbers, renders HTML (markdown-it-py, Pygments, Jinja2, pydantic), grades, reports, runs the git-backed library and the one-shot local servers.
- **Page runtime:** 2,870 lines of plain JavaScript (`quiz.js`) plus CSS, inside every built HTML. It stays JavaScript whatever the CLI is written in.
- **The structural flaw:** the grading rules exist twice, in `grading.py` (the authority) and `quiz.js` (the page), kept in step by `tests/grading_cases.json`. They already disagree on non-ASCII text: a case-insensitive pattern with a capital `Đ` matches in the page but not in `quiz grade`, and a leading BOM is trimmed only in JavaScript (`docs/PLANNED.md`, Fixes 7).
- **Measured startup** on the Windows laptop: `quiz --version`, `check` and `build` each take about 0.5 s, nearly all of it imports. Bare `node -e 0` takes about 44 ms.
- **Tests:** about 600, mostly in-process (`main([...])` and internal imports, about 94 calls) and only 11 subprocess runs, so most of the suite is tied to the Python implementation.

## Languages from scratch

What the language would be worth if fullmark were started today, knowing the design. Figures other than Python's startup are typical values, not measured here.

| | Python | TypeScript | Rust | Go | C# |
|---|---|---|---|---|---|
| One grader for page and CLI | ✗ two copies | ✓ same code | ✓ via WASM (toolchain, a few hundred KB per page) | ~ via WASM (TinyGo small, standard Go ~2 MB) | ✗ Blazor too heavy for one offline file |
| Custom Markdown syntax | ✓ markdown-it plugins | ✓ markdown-it, the original | ~ comrak or pulldown-cmark, more work | ✓ goldmark, built for extensions | ✓ Markdig, the best of the lot |
| YAML with line numbers | ✓ | ✓ `yaml` package | ✗ weak, `serde_yaml` deprecated | ✓ `yaml.v3` nodes | ✓ YamlDotNet marks |
| Code highlighting | ✓ Pygments | ✓ Shiki | ~ syntect | ✓ Chroma (Pygments port) | ✗ weak |
| Install for others | ~ needs uv or pip | ~ npm, or 60–100 MB compiled binary | ✓ 5–10 MB binary | ✓ ~10 MB binary, easy cross-compile | ✓ 10–30 MB AOT binary |
| Startup | ✗ ~0.5 s (measured) | ~ ~0.1 s | ✓ ~5 ms | ✓ ~5 ms | ✓ tens of ms |
| Exploring a design fast | ✓ best | ✓ | ✗ slowest | ✓ | ✓ |
| Fits the owner's setup | ✓ uv, envs, other tools | ~ Node is installed | ✗ new toolchain | ✗ new toolchain | ✗ new toolchain |
| **Rank from scratch** | 4 | **1** | 2 (tie) | 2 (tie) | 3 |

Python ranks last from scratch but was still a sound start: it explored fastest, which is how fullmark reached 0.10 with this much in it, and the gap to first place is one fixable class of bug plus half a second of startup.

## Migration options for the existing tool

| Option | What it is | Effort | Gain | Risk | Verdict |
|---|---|---|---|---|---|
| **A. Stay on Python, fix normalisation** | Golden cases for Unicode and BOM, then identical lowercasing and trimming in both graders | One commit | Removes the only drift found so far | None | **Do this.** The real fix for today's problem |
| **B. Lazy imports** | Load Rich, Pygments and so on only where needed | A day | Faster `--version`, `library status`, `list`; little for `check` | Low | Optional, only if 0.5 s starts to bother |
| **C. Grader to TypeScript, CLI stays Python** | One typed `grader.ts` bundled into the page; Python keeps its grader, parity via golden cases | Days | A typed page grader; easier to keep in step | Low; the duplication remains on the Python side | Reasonable first step if drift recurs |
| **D. Grader as a Rust crate** | Compile to WASM for the page and PyO3 for `quiz grade` | A week or two | Truly one grader and one regex engine; `check_regex` portability rules go away | WASM toolchain, CSP needs `'wasm-unsafe-eval'`, heavier pages, a Rust build in a Python package | Only if C is not enough |
| **E. Full migration to TypeScript** | Strangler-fig port of every command | Weeks | One language end to end, one grader for free, ~0.1 s startup | Fidelity of every message, exit code and byte of HTML; Pygments → Shiki redoes the colours and contrast tests; most of the suite needs rewriting first | Not now. The best target if a full rewrite ever happens |
| **F. Full migration to Go** | Same, in Go | Weeks | Small fast binary, solid Markdown and YAML stack | Grader still duplicated unless WASM; new toolchain | Not now |
| **G. Full migration to Rust** | Same, in Rust | Weeks to months | Smallest, fastest binary; one grader via WASM | Hardest Markdown and YAML; slowest iteration | **Really bad idea** at this stage |
| **H. Full migration to C#** | Same, in C# | Weeks | Markdig is excellent; good AOT binary | Grader stays duplicated, weak highlighting, foreign to the owner's setup | **Really bad idea**: pays the full cost without fixing the flaw |

## How a migration would run (if ever)

Superseded by the decision above: with no compatibility, there is no strangler fig and no byte-level diff against 0.x. Kept for the record.

The standard pattern is the strangler fig: replace the old system piece by piece behind a front door that never changes.

1. **Pin the contract.** Rewrite the tests to run the CLI as a program and check what it produces: exit codes, `file:line` messages, JSON against the schemas, built files. Run the same suite against `python -m fullmark` and the new CLI, picked by a fixture.
2. **Move one command at a time.** `quiz` dispatches each command to the new implementation if it exists and to Python otherwise. Order, easiest first: grader, `grade` / report / `stats`, `build`, `check` (messages are the contract), library, servers.
3. **Run both and diff.** Build every example and fixture with both and compare the bytes. This needs reproducible builds, which is Commit A of `docs/plans/PUBLISH_PLAN.md` (pinned `built_at`). Every difference is a bug in one of them or a missing test.
4. **Cut over, delete the old code.** Only when nothing differs.

The grader is already at step 1: `tests/grading_cases.json` runs through Python (`tests/test_grading.py`) and the page (`tests/e2e/test_grader_parity.py`).

## Revisit when (superseded)

- The golden cases catch Python/JavaScript drift more than once after option A.
- A single-file binary becomes a hard requirement, for example for users without uv.
- New question types bring grading rules complex enough that two copies are a liability.

Until then, the time is better spent on 0.11.0 (`publish`, `import`, `replay`) and on using fullmark for actual study.
