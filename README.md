# fullmark

Markdown in, one offline HTML quiz out.

You write a quiz in Markdown. `quiz build` checks it and writes a single self-contained HTML page that runs offline, from a USB stick or an email attachment. The learner takes it and downloads their results, and `quiz grade` scores them. The same source also prints as an exam paper with its answer key. Quizzes can be in English or Vietnamese.

**This branch is fullmark 1.0, a rewrite in TypeScript. It's an alpha (`1.0.0-alpha.0`) and isn't published yet.** The working release is still the Python prototype, fullmark 0.x, on `main` (tag `v0.10.2`). 1.0 isn't compatible with it: [docs/design/fullmark-migration.md](docs/design/fullmark-migration.md) explains why.

## What works today

| Area | Commands |
|---|---|
| Check and fix a quiz | `check`, `rules`, `ids`, `inspect` |
| Make the page or the paper | `build` (with `--print`, `--answers`, `--seed`, `--answer-sheet`, a build file, `--watch` and `--serve`) |
| Take it with the answers sent back | `serve` (with `--section`, `--focus`, `--autosave`) |
| Grade and look back | `grade`, `replay`, `stats` |
| Start a quiz | `new`, `template`, `brief` (through flags or `--tui`) |

Still to come in step 3: `review`, `grade --web` and `brief --web`, which wait for their form designs. Then step 4, the library. The plan is in [docs/plans/STEP3.md](docs/plans/STEP3.md).

## Try it from source

You need Node 22 or later.

```bash
npm ci
```

```bash
npm run build
```

```bash
node dist/cli.js check examples/rust/quiz.md
```

```bash
node dist/cli.js build examples/rust/quiz.md --open
```

`npm link` puts `quiz` (and its alias `fullmark`) on your PATH. `quiz --help` lists every command, and `quiz help COMMAND` gives one command's options. [examples/](examples/) holds a quiz for each kind fullmark is built for: calculus, Rust, IELTS writing, medicine, a printed exam and a survey. `npm run samples` builds them all, with a page that lists them.

## Working on it

```bash
npm run check
```

This runs the typecheck, Biome, Vitest and Playwright. Playwright uses Chromium and Firefox; run one with `npx playwright test --project=chromium`. Expected outputs live in `test/golden/`, and `npm run golden:update` rewrites them. Look at every changed golden before you commit.

## Docs

[docs/README.md](docs/README.md) is the map. In short:

- [USER_DESIGN.md](docs/design/USER_DESIGN.md): what fullmark is for, and how people and agents work with it.
- [QUIZ_SYNTAX.md](docs/design/QUIZ_SYNTAX.md): how a quiz is written.
- [COMMANDS.md](docs/design/COMMANDS.md): every command, flag, output and exit code.
- [TECHNICAL_DESIGN.md](docs/design/TECHNICAL_DESIGN.md): how it's built, and the order of work.
- [docs/plans/](docs/plans/): how it's being built, step by step. Start at the Handoff in the current step's plan; [CLAUDE.md](CLAUDE.md) gives the working rules for agents.

## Licence

MIT ([LICENSE](LICENSE)). Third-party components are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and by `quiz --acknowledgements`.
