# fullmark: notes for Claude

fullmark 1.0 is a TypeScript rewrite: Markdown quizzes in, one offline HTML page out. Development happens on branch `1.0`; `main` holds the Python prototype (0.x) and is not touched from here.

## Start here

1. Read the **Handoff** at the top of the current step's plan: [docs/plans/STEP3.md](docs/plans/STEP3.md). It says what is done, what waits for the owner and what comes next, and a session needs nothing else to pick up.
2. The design docs in `docs/design/` say what 1.0 is; the plans say how it is built. Where they disagree, the design docs win. [docs/README.md](docs/README.md) maps them.

## How the work runs

- **Slices, briefs, reviews.** Each step is cut into slices. The planner writes a slice's full brief in the plan, the owner approves it, and one implementing agent builds it from the brief alone. The planner then reviews it, running the tests and trying it by hand, and brings every gap to the owner with a recommendation. The owner decides, the decision goes into `docs/design/`, and it becomes the next brief's first tasks.
- **Never decide a gap yourself.** If the design leaves something open, write it as a numbered gap (`G38`, …) in the plan's "Gaps" list, with a recommendation, and ask. A choice made while implementing is reported under "done differently" in the review, never left silent.
- **Record as you go.** Update the Handoff's status table after every round, write each slice's review at the end of its section, and commit after each round.

## Rules

The full list is under "Rules for every slice" in the plan (and STEP2.md's, which it extends). The ones most often broken:

- **Goldens are the contract.** Expected outputs are in `test/golden/`; `npm run golden:update` rewrites them. Never regenerate or revert a golden to hide a difference. Explain and count every one that changes.
- **A failure is environmental only when its cause is shown.**
- **No real network or real timers in unit tests:** the server binds 127.0.0.1 on port 0, and the clock, the timeout and the file watcher are injected.
- **A command loads only what it uses.** `check` must never load `src/serve/`, and `@clack/prompts` loads only for `brief --tui`. `test/cli-graph.test.ts` and the startup tests guard this.
- **Shared pages carry no server code.** A `build` page is byte-identical with and without the server features (TECHNICAL_DESIGN.md, foundation 9).
- **Commit on `1.0`.** An implementing agent never pushes; the reviewer pushes after the review.

## Commands

```bash
npm ci
```

```bash
npm run build
```

```bash
npm run check
```

`npm run check` runs the typecheck, Biome, Vitest (the startup tests run alone first) and Playwright. In this cloud environment only Chromium is installed: run `npx playwright test --project=chromium`, and say that Firefox was not run. `npm run samples` builds the examples for the owner to try by hand. The CLI is `node dist/cli.js` after a build.
