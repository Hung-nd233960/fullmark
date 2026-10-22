# Plan: `quiz serve` (send answers straight back)

A work list for an agent, one task per commit. Written on 2026-10-21 at quizmd 0.3.0. Follow the rules at the top of `BUILD_PLAN.md` (read `AGENTS.md` and the CLI guide first, grading lives twice, page changes rebuild the examples, UI rules the tests enforce, all localStorage through `store()`, strike items through in `docs/PLANNED.md`, never publish).

## Why

Today a learner (or a person filling in a survey) must press **Export answers**, download a JSON file and hand it to whoever asked. For questionnaires that a tool or an agent is waiting on, the first user of this is `deck new --web` in presentation-kit, and the second is the personal-context intake. In both, the person is at the same machine as the tool. `quiz serve` opens the page from a one-shot local server: pressing **Finish** sends the results to the server, which writes the JSON and exits. The terminal (or the agent) continues on its own.

## Behaviour (decided)

```text
quiz serve FILE.md|FILE.html [--out results.json] [--once] [--timeout 1800] [--open] [--port 0]
```

- Accepts the Markdown source (built in memory, same as `quiz build`, errors as in `quiz build`) or a built HTML file.
- Serves on `127.0.0.1` only, on a free port by default. Prints the URL and opens it with `--open`.
- The served page is the normal page plus an injected snippet and a CSP that allows `connect-src 'self'`, the same approach `serve.py` already uses for `watch --serve`. Reuse it: move the shared parts into one helper. The file on disk and normal builds stay offline-only.
- A per-run random token in the URL (`/?t=...`) and required on `POST /submit`. The server rejects any other origin or a missing or wrong token, with a 403.
- **Finish** (survey) or **Submit** (quiz), after the existing confirm step, also posts the export JSON (the same object **Export answers** produces) to `/submit`.
  - On a 2xx the results screen says "Answers sent. You can close this tab." and **Export answers** stays available as a backup.
  - On failure (server gone, timeout) it says "Could not send; use Export answers" and nothing is lost.
- The server validates the posted JSON against `results-v1.schema.json` and checks that `quiz.id` matches the served quiz. On success it writes `--out`, which defaults to `<quiz-id>-results-<timestamp>.json` next to the source. It never overwrites an existing file; it adds `-2` and so on instead. It then prints the path.
- `--once`: exit 0 after the first accepted submit. This is the default when stdout is not a TTY, so agents and tools don't hang. Without `--once`, it keeps accepting attempts and writes one file per submit until Ctrl+C.
- `--timeout SECONDS` (default 1800): exit 2 with a clear message if nothing arrives. `0` means no timeout.
- `--json`: on exit print `{"status": "submitted"|"timeout", "path": ...}` for tools.
- A page opened from disk, with no injected snippet, behaves exactly as today. The snippet only sets `window.QUIZMD_SUBMIT = {url, token}`; `quiz.js` checks for it.
- No new dependency (`http.server`, as in `serve.py`).

## Not in scope

Several respondents, remote access, authentication beyond the token, HTTPS, auto-closing the tab (browsers only let a script close a tab the script opened).

## Tasks

1. **Server.** `serve.py` refactor (shared inject and CSP helper, one-shot submit server), `cli.py` `serve` subcommand, and tests with `urllib`:
   - a valid submit writes the file and exits;
   - wrong token gives 403;
   - wrong quiz id gives 400;
   - an invalid schema gives 400;
   - the timeout gives exit 2;
   - no overwrite;
   - `--json` output.
2. **Page.** `quiz.js`:
   - posts on Finish/Submit when `QUIZMD_SUBMIT` is set;
   - shows the sent and failed states, with strings in the strings table if there is one;
   - all of this in survey and quiz mode.

   Write e2e tests in `tests/e2e/test_browser.py`:
   - start `quiz serve` in a thread, fill the survey example, Finish, assert the file exists and validates;
   - the failure state when the server is stopped first;
   - a page from disk shows no change.

   Rebuild the examples.
3. **Docs:**
   - `guide.md` and `docs/GUIDE.md` (a short "Collect answers directly" section);
   - `agents.md` (then sync): for questionnaires the agent waits on, run `quiz serve FILE --once --open --json` in the background and read the file when it exits;
   - `skill/SKILL.md` (same advice, one paragraph; `tests/test_skill.py` must pass);
   - `README.md`;
   - `docs/PLANNED.md`;
   - version 0.4.0.
4. **Verify:**
   - full `uv run pytest -q` passes;
   - ruff is clean;
   - ty adds no new diagnostics over its current baseline;
   - a manual run of `quiz serve src/quizmd/examples/survey/quiz.md --open`, Finish, and the file appears.

## Ask the user instead of guessing

- If the CSP or the browser blocks the POST from the served page in a way that needs weakening anything beyond `connect-src 'self'`.
