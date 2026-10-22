# Plans

Work orders for larger changes, each written for an agent to carry out. They are records of what was decided and why; the code and `docs/SPEC.md` are the current truth. The roadmap is [../PLANNED.md](../PLANNED.md). Working rules for every change are in `AGENTS.md` (Job 3).

| Plan | What | Shipped in | Status |
|---|---|---|---|
| [BUILD_PLAN.md](BUILD_PLAN.md) | The first ordered work list drawn from the roadmap: fixes, learner experience, schemas | 0.2 to 0.3 | done |
| [SERVE_PLAN.md](SERVE_PLAN.md) | `quiz serve`: the page sends its answers back to a waiting tool | 0.4.0 | done |
| [SURVEY_PLAN.md](SURVEY_PLAN.md) | Questionnaires: ungraded questions, `scale`, `mode: survey` | 0.4 | done |
| [FOLLOWUP_PLAN.md](FOLLOWUP_PLAN.md) | Follow-up text inputs on choices (`{input}`) | 0.5 | done |
| [REVIEW_PLAN.md](REVIEW_PLAN.md) | `quiz review` (part A), `quiz brief` (part C); the terminal form `--tui` (part B) | 0.6 to 0.7 | A and C done; **B open** |
| [AUTOSAVE_PLAN.md](AUTOSAVE_PLAN.md) | `quiz serve --autosave`: resume that survives the server and the browser | 0.8.1 | done |
| [LIBRARY_PLAN.md](LIBRARY_PLAN.md) | `quiz library`: the design and its seven tasks | 0.9.0 | done |
| [LIBRARY_INIT_PLAN.md](LIBRARY_INIT_PLAN.md) | Library task 2: config, `init`, git, `status` | 0.9.0 | done |
| [LIBRARY_REGISTER_PLAN.md](LIBRARY_REGISTER_PLAN.md) | Library task 3: `register`, `list`, snapshots, the asset store | 0.9.0 | done |
| [LIBRARY_TAKE_PLAN.md](LIBRARY_TAKE_PLAN.md) | Library task 4: `take`, `share`, `path` | 0.9.0 | done |
| [LIBRARY_PRETTY_PLAN.md](LIBRARY_PRETTY_PLAN.md) | Colored tables for `status` and `list` (Rich) | 0.9.0 | done |
| [LIBRARY_RELEASE_PLAN.md](LIBRARY_RELEASE_PLAN.md) | Library tasks 5 to 7: `init` refusal, help groups, layering test, docs, release | 0.9.0 | done |
| [LIBRARY_HOUSEKEEPING_PLAN.md](LIBRARY_HOUSEKEEPING_PLAN.md) | `quiz library grade`, `stats`, `rename`, `rm` | 0.9.1 | done |
| [FULLMARK_PLAN.md](FULLMARK_PLAN.md) | Rename to Fullmark Alchemist (`fullmark`), public repository, PyPI packaging | 0.10.0 | done |

Older plans say "follow the rules at the top of `BUILD_PLAN.md`" and name files by their old root paths (`PLANNED.md` is now `docs/PLANNED.md`; the plans moved here from the root on 2026-10-22). The rules themselves now live in `AGENTS.md`.
