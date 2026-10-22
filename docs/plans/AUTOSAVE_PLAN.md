# Plan: `quiz serve --autosave` (resume that survives the server)

Task 1 of `LIBRARY_PLAN.md`, in full detail, for an agent to carry out as **one commit**. Written on 2026-10-22 at commit `672bce1`, quizmd 0.8.1 (unreleased; this joins 0.8.1, do not bump the version). Follow the rules at the top of `BUILD_PLAN.md`: read `AGENTS.md` and the shell notes in your own setup first, all localStorage goes through `store()`, page changes rebuild the examples, and never publish or push.

## Why

Resume lives in localStorage, which belongs to one origin. `quiz serve` picks a free port each run, so each run is a new origin and an attempt in progress is lost when the server stops. `quiz library take` (0.9.0) is built on `serve` and needs resume to survive closing the tab, the terminal or the browser. The fix is a progress file that the server keeps and hands back to the page.

## Behaviour (decided)

```text
quiz serve FILE [--autosave PROGRESS.json] [existing options]
```

- Without `--autosave`, nothing changes: no `/progress` route (404), and the snippet is exactly as today.
- With `--autosave PATH`:
  - The page posts its state to `POST /progress` (debounced like the localStorage write) while an attempt is in progress.
  - The server writes `PATH` atomically: `{"hash": "<quiz hash>", "saved": <ms>, "state": {...}}`.
  - On `GET /`, if `PATH` holds progress for this quiz's hash that is not submitted, the snippet carries it, and the start screen offers **Resume** even in a new browser or on a new port.
  - An accepted `/submit` deletes `PATH`. **Start over** on the page deletes it too.
  - Progress for another hash (the quiz was edited) is never injected and never deleted. A malformed file is ignored, not deleted, and never crashes the server.
- localStorage keeps working as today. When both exist, the newer one (by `savedAt`) wins.

## Server: `src/quizmd/serve.py`

1. **Quiz hash from a page.** Add `quiz_meta_of_html(html) -> dict | None` that returns the parsed `quiz-data` block. Keep `quiz_id_of_html` as a thin wrapper over it, so existing callers and tests still work.
2. **Snippet.** `submit_snippet(token, autosave=False, progress=None)`. The config becomes `{"url": "/submit", "token": ..., "autosave": "/progress" | null, "progress": <state> | null}`, and the old keys are unchanged.
   - **Escape for a script tag:** `json.dumps(cfg).replace("<", "\\u003c")`. The state contains the learner's own text (essays, code), and an answer containing `</script>` must not end the script. `\u003c` is valid JSON and JS.
3. **`SubmitServer`** gains `autosave: Path | None = None` and `quiz_hash: str | None = None` (keyword arguments; keep the current positional ones).
   - `GET /` (token required, as now) reads the progress file **on every request**, so a reload sees the latest save. Inject `progress` only when all of these hold:
     - the file parses;
     - its `hash` equals `quiz_hash`;
     - `state` is a dict;
     - `state.get("submitted")` is falsy.
   - `POST /progress`:
     - 404 when `autosave` is None.
     - Same checks, in the same order, as `/submit`: read the body first, then origin, then token, then Content-Length and `MAX_BODY`, then JSON. Move the shared part into one helper inside the handler (for example `_read_checked() -> dict | None`, which replies itself on failure), so the two routes cannot drift.
     - Body: `{"hash": str, "saved": number, "state": dict | null}`. A `hash` other than `quiz_hash` gives 400 `"progress is for another version of this quiz"`.
     - `state` null, or `state.submitted` truthy: delete the file (`missing_ok=True`) and reply 200 `{"ok": true, "deleted": true}`.
     - `state` a dict: write atomically under `self.lock` and reply 200 `{"ok": true}`. Write a temp file in the same folder (`PATH.with_name(PATH.name + ".tmp")`), then `os.replace`. Create the parent folder if missing.
     - Any other `state` gives 400. The state is not validated further: it is the page's own internal object.
   - `save()` (an accepted submit) also deletes the progress file under the same lock, `missing_ok=True`.
4. **Module docstring:** one sentence on autosave.

## CLI: `src/quizmd/cli.py`

- The `serve` parser (about line 878) gains `--autosave PATH`: "keep the attempt in progress in PATH so it can be resumed after the server or the browser closes; deleted on submit".
- `serve()` passes `autosave=Path(args.autosave) if args.autosave else None` and `quiz_hash`. For `.md` that is `quiz.source_hash`; for `.html` it is `quiz_meta_of_html(html)["hash"]`.
- `serve_loop()` is also used by `review` and `brief` (lines about 430 and 648) with their own `Namespace`s. Read the option there with `getattr(args, "autosave", None)` and pass `quiz_hash` as a new keyword parameter defaulting to `None`, so those callers are untouched. Review and brief forms get no autosave.

## Page: `src/quizmd/static/quiz.js`

All around `fresh()`, `save()` and `loadSaved()` (about lines 403 to 445), the start screen (about 680 to 770), and `submit()` (about 2142).

1. `fresh()` gains `savedAt: 0`.
2. `save(now)`: the inner `write` sets `state.savedAt = Date.now()`, then calls `store("set", ...)` as now, then `pushProgress(false)`. The `pagehide` listener calls `save(true)`, which must call `pushProgress(true)`. Pass the flag through, for example `save(now, leaving)`.
3. `pushProgress(leaving)`:
   - It returns at once unless `window.QUIZMD_SUBMIT && window.QUIZMD_SUBMIT.autosave`.
   - Body: `{hash: DATA.hash, saved: state.savedAt, state: state.submitted ? null : state}`.
   - **Requests go one at a time**, in order: chain them on one promise (`progressChain = progressChain.then(() => fetch(...)).catch(() => {})`). A late write must never land after the delete that follows a submit.
   - Headers as `sendResults()` sends them (`Content-Type`, `X-Quizmd-Token`).
   - `keepalive: true` only when `leaving` and the body is under 60,000 characters. Browsers cap keepalive bodies at 64 KiB, and the debounced saves have already sent recent state anyway.
   - Failures are silent apart from one `console.warn` per page load. localStorage remains the local copy.
4. `loadSaved()`:
   - Parse the localStorage copy as now.
   - Also read `window.QUIZMD_SUBMIT && window.QUIZMD_SUBMIT.progress`.
   - Keep the candidates that have `started`, and take the one with the larger `savedAt`. On a tie, or with no `savedAt`, take localStorage.
   - Return `Object.assign(fresh(), chosen)`, or `null`.
5. **Start over** (the `restart-btn` handler, about line 747): after `store("del", SKEY)`, set `window.QUIZMD_SUBMIT.progress = null` (when present), so `showStart()` does not offer it again, and post the delete. That is `pushProgress` with a state of `null`; give it a small helper such as `clearProgress()` rather than mutating `state` to fake it.
6. `submit()` already calls `save(true)` after `state.submitted = true`. That post sends `state: null`, which deletes the file; `/submit` deletes it as well. Add nothing else.
7. Keep the start-screen text as it is ("…saved on this device.").
8. No new network access from a page opened from disk: every new request is guarded by `QUIZMD_SUBMIT.autosave`.

Biome must pass. Then run `uv run python scripts/sync_examples.py` to rebuild `examples/*/quiz.html` and copy `agents.md`.

## Tests

### `tests/test_serve.py` (no browser)

Add `"autosave": None` to `make_args`'s base. Extend `Running` with `post_progress(body, token=None, origin=None, raw=None)` (posts to `/progress`) and `page()` (GET with the token, returns the HTML text). The quiz hash comes from `load(src).source_hash`.

1. Without `--autosave`, `POST /progress` gives 404.
2. A valid post writes the file with `hash`, `saved` and `state`; a second post replaces it; no `.tmp` file is left.
3. A wrong token gives 403 and a wrong origin gives 403 (as `test_wrong_token_or_origin_gives_403`); no file is written.
4. A body over `MAX_BODY` is refused (patch `quizmd.serve.MAX_BODY` small) and not JSON gives 400. The file is unchanged.
5. A wrong `hash` gives 400, and `state` as a string gives 400.
6. `state: null` deletes the file; so does a state with `"submitted": true`.
7. An accepted `/submit` deletes the progress file and the results file is written as before.
8. `GET /` injects `progress` when the file matches the hash. It does not inject it when the file has another hash, a submitted state, or invalid JSON, and in all three cases the file is left on disk.
9. **Escaping:** a state containing `"</script><script>alert(1)</script>"` is injected with no `</script><script>alert` in the page text, and the snippet's JSON parses back (extract it and `json.loads` it after undoing nothing: `\u003c` is valid JSON).
10. `.html` input: `--autosave` works with a built page (the hash comes from the data block).
11. CLI parse: `main(["serve", "--help"])` lists `--autosave` (or parse the args directly).

### `tests/e2e/test_browser.py` (next to the `quiz serve` tests, about line 1517)

Use the survey fixture helpers already there (`_served_survey`, `_answer_survey`) or the kitchen quiz, whichever makes "answer two questions" simplest.

1. **Resume across servers and browsers:**
   - Serve with `autosave=tmp_path / "progress.json"`, `once=True`, `timeout=60`.
   - Start, answer two questions, then poll (up to about 5 s) until `progress.json` exists and holds both answers.
   - Stop that server.
   - Serve again (a new port) in a **new browser context**, so localStorage is empty and only the server copy can restore anything.
   - Assert that `#resume-btn` shows, click it, and assert that both answers are restored.
   - Submit: the results file exists and validates, and `progress.json` is gone.
2. **Start over deletes the progress:** with a saved progress file, open, click `#restart-btn`, confirm, then poll until `progress.json` is gone.
3. A page from disk makes no requests. The existing network-blocking tests cover this; check that they still pass, and add an assertion only if none covers the start screen.

## Docs

- `README.md`: the `quiz serve` row gains `[--autosave PROGRESS]` and half a sentence: "keeps an attempt in progress so it resumes after the server or browser closes".
- `src/quizmd/guide.md` (line about 298) and `docs/GUIDE.md` (the "When a tool or an agent is waiting" section about line 184, its bullets, and the commands table row about line 289): the same option. Add one bullet in `docs/GUIDE.md`: what is saved, when it is deleted, and that progress for an edited quiz is ignored. Then run `uv run python docs/build_docs.py`.
- `docs/SPEC.md`: in the `quiz serve` section, the `/progress` route, the file format, the escaping rule and the delete rules, as a short subsection.
- `docs/PLANNED.md`: under "Optional spaced repetition…" leave it; under the "Library" section add "~~Autosave in `quiz serve` (task 1 of `LIBRARY_PLAN.md`)~~: done in 0.8.1."
- `LIBRARY_PLAN.md`: mark task 1 done (strike it through, the way `docs/PLANNED.md` does).
- `agents.md` and `skill/SKILL.md` need no change. `--autosave` is for the library and for long attempts, not for the agent's questionnaire flow.

## Verify, then commit

1. `uv run pytest -q`: all pass. `tests/e2e/test_panel.py::test_narrow_screen_keeps_progress_and_pills_in_the_header` is known to flake under load (it passes alone). Rerun it alone before treating it as a failure. Fix anything else.
2. `uv run ruff check` and `uv run ruff format --check` are clean. Biome is clean on `quiz.js`.
3. Manual check: run `uv run quiz serve src/quizmd/examples/survey/<file>.md --autosave <scratch>/p.json --timeout 0` in the background, fetch the page with its token, post a progress body with `curl` or Python, and confirm the next `GET /` contains it. You cannot click a browser here; the e2e tests cover that.
4. One commit, including this file:

   ```text
   serve --autosave: the server keeps an attempt in progress so it resumes in a new browser or on a new port
   ```

   with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push.

## Stop and report instead of guessing

- If autosave needs any CSP change beyond the existing `connect-src 'self'`.
- If the e2e resume test cannot pass without changing how the start screen or the Resume flow works.
- If any existing test has to change its expectations, rather than just gaining the new `autosave` argument.

Report: what changed (files), the test count before and after, anything skipped or left open, and the commit hash.
