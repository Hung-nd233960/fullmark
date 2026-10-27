# Open: how the features combine

**Status: questions only, no answers yet.** Work through these on paper before the full feature set is committed. Each answer either fits the current design, needs a seam in v1 (then it goes into TECHNICAL_DESIGN.md), or stays with its proposal.

## The pieces

| Piece | Where | In v1 |
|---|---|---|
| Quiz, sections, banks, Plan and Attempt | TECHNICAL_DESIGN.md 4 | yes |
| Theme, font, `look`, `--fonts` | TECHNICAL_DESIGN.md 8 | yes |
| Printable paper (`build --print`) | TECHNICAL_DESIGN.md 8 | yes |
| Languages (quiz `lang` and `ui_lang`; `guide --lang`) | TECHNICAL_DESIGN.md 9 | yes |
| Library, `take`, `--section`, `--missed`, `replay` | COMMANDS.md | yes |
| Shelf, `publish`, `import` | COMMANDS.md | yes, one shelf |
| Several shelves | [shelves.md](shelves.md) | no |
| Bundle and its modes | [multi-quiz-bundle.md](multi-quiz-bundle.md) | no, seams only |
| Visual guide | [guide-web.md](guide-web.md) | no, seam only |
| Markdown export | [markdown-export.md](markdown-export.md) | no |

## Pairs

Marked **easy** where the current design already implies an answer, so the paper time goes to the rest.

### Bundles ×

- **Printing:** one paper per quiz, or one paper for the bundle? In `exam` mode, one booklet with a cover page and per-paper sections? Where do `--seed` versions go: per quiz, or one seed for the bundle?
- **Shelves:** can a bundle sit on a shelf when some of its quizzes are not on it? Does a shelf's index list the bundle, its quizzes, or both? (A bundle snapshots its papers, so it is never stale.)
- **Look:** decided: a bundle's quizzes must share kind, `look`, theme, font and `ui_lang` (`bundle.mixed-*` rules). Does `--fonts quiz` then mean the quizzes' shared font? (easy: yes)
- **Languages:** decided: `ui_lang` must match (the chrome is one catalog); `lang` may differ.
- **`--missed` and replay:** replay is decided: `bundle replay` opens the whole bundle with one sitting's attempts (multi-quiz-bundle.md). `--missed` is decided: a session uses each quiz's history, a bundle uses its own sittings across all its papers. Open: `--missed` on an `exam` bundle.
- **Results:** `exam` mode gives one overall result, computed by `bundle grade` and returned in its `overall` JSON. Open: does it also get a file next to the per-quiz results, and does plain `stats` count it? (`bundle stats` does.)
- **Library:** decided (multi-quiz-bundle.md): a bundle is a registered library object that snapshots its papers, with its own results and `stats`; a session (`library take A B C`) is not an object and files results to each quiz.

### Shelves ×

- **Printing:** does `publish` also put printable papers on the shelf? Answer keys on a public shelf would give the answers away, so per shelf, opt-in?
- **Languages:** decided (fits): the index lists every quiz, each marked with its `lang`; `publish --ui-lang` sets only the index page's chrome (COMMANDS.md, `library publish`).
- **Look and fonts:** `--fonts` is per shelf (proposed). Can a shelf force a look on its quizzes, or only the fonts?
- **Pinned versions:** if a class shelf pins a version, does `library take` still use the latest? (easy: yes, the shelf is a copy)
- **Import:** importing from someone's shelf that holds a bundle: import the bundle, its quizzes, or both?

### Printing ×

- **Sections:** `--section` for a printed paper of one part only? (easy: same Plan)
- **Banks:** a printed paper draws from banks with `--seed`, so the key must match the draw. (easy: the key comes from the same Plan)
- **Attempts:** print a filled-in attempt with its marks, as a graded script? Useful for a teacher; needs the attempt and grades like `replay`.
- **Essays with rubrics:** decided (fits): `key` and `inline` print the rubric, the sample answer if any, and the explanation; a preset rubric prints its name and criteria only (TECHNICAL_DESIGN.md, section 8, printable paper). Whether an essay's key *is* its sample answer is for the quiz syntax.
- **Look:** prints on white always (decided). Does the chosen font carry over? (easy: yes, decided)

### Languages ×

There is no tool language (decided 2026-10-27): terminal output is English, `quiz guide` takes `--lang`, and only the quiz's `lang` affects what a learner sees.

- **Guide examples:** decided: `guide --lang vi` has its own examples, quizzes written in Vietnamese (`lang: vi`), which also show the decimal comma.
- **Templates:** decided: a template is written in one language and declares its `lang`, so a Vietnamese template is its own template. `quiz new --from T` copies its `lang`; the interface is set with `ui_lang`.

## When this is done

Every question above has one of three outcomes written next to it: **fits** (nothing to do), **seam** (a change to TECHNICAL_DESIGN.md before building), or **later** (recorded in the relevant proposal). Only the seams affect v1.
