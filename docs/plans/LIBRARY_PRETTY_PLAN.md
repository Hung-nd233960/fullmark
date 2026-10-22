# Plan: colored tables for `quiz library status` and `list` (Rich)

A work order for an agent: **one commit**. Written on 2026-10-22 at commit `5697be7`, quizmd 0.8.1. Do not bump the version. It comes before tasks 5 to 7 of `LIBRARY_PLAN.md`.

Before anything else, read:

- the shell notes in your own setup;
- the rules at the top of `BUILD_PLAN.md`;
- `AGENTS.md` ("Job 3", including the UI rule that color is never the only signal);
- `src/quizmd/library/commands.py`: `status` (about line 214) and `list_quizzes` / `_rows` / `_score_text` (about line 630 onward);
- the `status` and `list` tests in `tests/test_library.py`.

Never stage `FEEDBACK..md`. Never push. Python only through `uv run`. Never touch the real config or the global git config (the `lib` fixture in `tests/conftest.py` isolates both).

## Why

`status` and `list` are read by a person in a terminal. Today they print plain `key: value` lines and a space-aligned table. The user wants colored tables by default. Agents and pipes must keep getting exactly today's plain text, which the tests already pin down.

## Behaviour (decided)

- **Dependency:** `uv add "rich>=13"`. The user's other tools (presentation-kit, setups-manager) use Textual, which is built on Rich. No other dependency.
- **Choosing the output.** One function, `library/pretty.py: use_rich(args) -> bool`. It is true only when **all** of these hold:
  - not `--json`;
  - not `--plain`;
  - `sys.stdout.isatty()`;
  - the environment variable `NO_COLOR` is unset or empty.

  Otherwise the existing code path runs **unchanged**, so the plain output stays byte-for-byte the same (existing tests use `capsys`, which is not a TTY). `TERM=dumb` is left to Rich's own detection.
- **New flag `--plain`** on `status` and `list`: force today's plain text in a terminal.
- **Import Rich lazily** inside `pretty.py` functions, so `quiz library list --json` and the plain path never import it, and `quiz check` and the rest of core are never slowed down. The layering rule still holds: only `library/` uses Rich.
- **Never color alone.** Every colored state also carries a symbol or a word: `✓` ok, `⚠` warning, `✗` problem, `ℹ` info. A score shows its number (`83%`).
- **Palette: muted.** quizmd's page uses soft pastel tones (see `theme.py`). In the terminal, use Rich's standard named colors, which follow the user's terminal theme, at normal intensity, not bold everywhere. Put them in one table at the top of `pretty.py`:

  | Meaning | Style |
  |---|---|
  | ok | `green` |
  | warning | `yellow` |
  | problem | `red` |
  | info, secondary text (ids, paths, "never") | `dim` |
  | headings and names | `bold` |
  | score ≥ 80 | `green` |
  | score 50 to 79 | `yellow` |
  | score < 50 | `red` |
  | survey | `cyan` |

- **Width:** let Rich wrap to the terminal width. The `title` and `note` columns may wrap or ellipsise (`overflow="fold"` on title, `"ellipsis"` on note); `name`, `id`, `versions`, `attempts`, `last taken` and `last score` never wrap (`no_wrap=True`).

## Rendering

The renderers take the **same data** the plain and JSON paths already compute: the `report` dict for `status`, the `rows` list for `list`. They must not recompute anything. Refactor `status` minimally so the report, problems, warnings and info are complete before printing (they nearly are). Then the three outputs branch at the end:

```python
if args.json: ...
elif pretty.use_rich(args): pretty.print_status(report, problems, warnings, info)
else: <today's lines, unchanged>
```

### `status`

```text
╭─ quizmd library ─────────────────────────────────────────╮
│ ✓ <your library>                 from config             │
╰──────────────────────────────────────────────────────────╯
  quizmd     0.8.1
  config     %APPDATA%\quizmd\config.toml  ✓ exists
  library    ✓ exists   ✓ writable   quizmd-library v1
  git        ✓ own repository   ✓ no uncommitted changes   ⚠ no remote
  contents   3 quizzes · 4 versions · 7 attempts · 0 in progress · 5 assets (1 unused)

⚠ no remote: the git history is not an off-machine backup
ℹ 1 unused asset
```

- A `Panel` with a title, then a two-column `Table.grid` (the label dim, the value with symbols), then one line per problem, warning and info, in that order, with their symbol and style.
- The panel's border uses the worst state: red with problems, yellow with only warnings, green otherwise. The first line also says it in words, for example `✗ 2 problems`, `⚠ 1 warning`, `✓ healthy`.
- With **no library** (exit 2): print a short panel saying "No library on this machine", the config path, and the hint `quiz library init PATH`. Today this message goes to stderr; in the Rich path, keep printing the plain `NO_LIBRARY` line to stderr as well, so scripts that read stderr still see it.
- The exit codes are unchanged.

### `list`

A `Table` with a rounded box (`box.ROUNDED`), a header row, and these columns:

| Column | Style |
|---|---|
| name | bold |
| id | dim |
| title | fold |
| versions | right-aligned |
| attempts | right-aligned |
| last taken | `2026-10-22 14:46`, or "never" (dim) |
| last score | colored by band (`83%`), `survey` in cyan, `–` dim |
| note | yellow with `⚠`, for example `⚠ source changed` |

- A caption under the table: `N quizzes · take one with: quiz library take NAME`.
- Empty library: one dim line, `No quizzes yet. Register one with: quiz library register FILE.md`.
- No library: as today (stderr message, exit 2).

## Tests: `tests/test_library.py`

Render through a recording console instead of a real terminal. `pretty.py` exposes `make_console(file=None, force=False)`, and the tests build `Console(record=True, force_terminal=True, width=100, color_system="truecolor")` or patch `use_rich` to True and capture with `console.export_text(styles=False)`.

1. **Plain stays plain:** all existing `status` and `list` tests pass unchanged. Add one assertion that under `capsys` (not a TTY) the output of `list` contains no `\x1b[` and no box-drawing characters (`╭`, `│`).
2. `use_rich` is false with `--json`, with `--plain`, when not a TTY (patch `sys.stdout.isatty`) and when `NO_COLOR=1`. It is true when a TTY is patched in and none of those apply.
3. **`list`, rich:** with two quizzes (one at 83%, one survey, one never taken, one with `source changed`), the exported text contains the names, `83%`, `survey`, `never`, `⚠ source changed`, the caption and a box character. With colors exported (`export_text(styles=True)` or `export_html`), the 83% cell is green and the note is yellow.
4. **`status`, rich:**
   - healthy: `✓ healthy` and the `⚠ no remote` warning line;
   - with a problem (an edited snapshot, as the existing test makes): `✗` and the problem text;
   - no library: the "No library on this machine" panel and the `quiz library init PATH` hint, with exit 2 and the `NO_LIBRARY` line on stderr.
5. **`--plain`** in a patched TTY gives exactly the plain output (compare it with the non-TTY output).
6. **Rich is not imported on the plain path:** in a subprocess, run `quiz library list --json` (with an isolated config and an empty library) and check that `"rich" not in sys.modules` at exit. A small `-c` script that calls `main([...])` and then prints `"rich" in sys.modules` is enough.

## Docs for this commit

- `docs/GUIDE.md`: one sentence in the `quiz library` row: colored tables in a terminal; `--plain` or `NO_COLOR` for plain text; `--json` for scripts. Then `uv run python docs/build_docs.py`.
- `LIBRARY_PLAN.md`:
  - in "Commands", add `--plain` to `status` and `list`;
  - under "File formats", or a new short "Terminal output" paragraph, add the rule: Rich in a TTY, plain otherwise, never color alone;
  - in task 6, note that the README must mention Rich among the dependencies, next to `tomli-w`, with the same reinstall note.
- `docs/PLANNED.md`, "Library": one struck line.
- Include this file in the commit.

## Verify, then commit

1. `uv run pytest -q`: all pass (known flakes: the narrow-screen panel test and Windows socket aborts; rerun them alone).
2. `uv run ruff check`, `uv run ruff format --check`, `biome lint src/quizmd/static/quiz.js`: clean. Run `ty check src/quizmd/library` with no diagnostics; it is clean today.
3. **Manual check:**
   - **Isolated library:** with a scratch `QUIZMD_CONFIG` and git config, `init` a scratch library, `register` a copy of the calculus example, then run `uv run quiz library status` and `uv run quiz library list` with `--plain` and with `NO_COLOR=1`. Paste the plain outputs into the report.
   - **Rich output:** the Bash tool is not a TTY, so render through the recording console in a short `uv run python -c` script and paste the exported text.
   - **The user's real library at `<your library>`:** you may **read** it with `status` and `list`, but never register, take or change anything there.
4. Commit:

   ```text
   quiz library status and list: colored tables in a terminal (Rich), plain text for pipes and agents, --plain
   ```

   with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push.

## Stop and report instead of guessing

- If keeping the plain output byte-for-byte identical requires changing an existing test's expectation.
- If `uv add rich` wants to change anything else in the lock beyond Rich and its own dependencies (`markdown-it-py`, which quizmd already has, `pygments`, also already there, `mdurl`).

Report: the commit hash, files changed, the test counts before and after, the lint and ty results, the pasted outputs from the manual check (the plain one and the recorded Rich one), and any deviations.
