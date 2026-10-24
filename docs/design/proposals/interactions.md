# Open: how the features combine

**Status: questions only, no answers yet.** Work through these on paper before the full feature set is committed. Each answer either fits the current design, needs a seam in v1 (then it goes into TECHNICAL_DESIGN.md), or stays with its proposal.

## The pieces

| Piece | Where | In v1 |
|---|---|---|
| Quiz, sections, banks, Plan and Attempt | TECHNICAL_DESIGN.md 4 | yes |
| Theme, font, `look`, `--fonts` | TECHNICAL_DESIGN.md 8 | yes |
| Printable paper (`build --print`) | TECHNICAL_DESIGN.md 8 | yes |
| Languages (quiz `lang`, tool `lang`) | TECHNICAL_DESIGN.md 9 | yes |
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
- **Look:** decided: a bundle's quizzes must share kind, `look`, theme, font and `lang` (`bundle.mixed-*` rules). Does `--fonts quiz` then mean the quizzes' shared font? (easy: yes)
- **Languages:** decided: `lang` must match (the chrome is one catalog); question text may differ.
- **`--missed` and replay:** replay is decided: `bundle replay` opens the whole bundle with one sitting's attempts (multi-quiz-bundle.md). `--missed` is decided: a session uses each quiz's history, a bundle uses its own sittings across all its papers. Open: `--missed` on an `exam` bundle.
- **Results:** `exam` mode gives one overall result, computed by `bundle grade` and returned in its `overall` JSON. Open: does it also get a file next to the per-quiz results, and does plain `stats` count it? (`bundle stats` does.)
- **Library:** decided (multi-quiz-bundle.md): a bundle is a registered library object that snapshots its papers, with its own results and `stats`; a session (`library take A B C`) is not an object and files results to each quiz.

### Shelves ×

- **Printing:** does `publish` also put printable papers on the shelf? Answer keys on a public shelf would give the answers away, so per shelf, opt-in?
- **Languages:** a shelf's index page has a `lang`. Does it list only quizzes in that language, or all of them?
- **Look and fonts:** `--fonts` is per shelf (proposed). Can a shelf force a look on its quizzes, or only the fonts?
- **Pinned versions:** if a class shelf pins a version, does `library take` still use the latest? (easy: yes, the shelf is a copy)
- **Import:** importing from someone's shelf that holds a bundle: import the bundle, its quizzes, or both?

### Printing ×

- **Sections:** `--section` for a printed paper of one part only? (easy: same Plan)
- **Banks:** a printed paper draws from banks with `--seed`, so the key must match the draw. (easy: the key comes from the same Plan)
- **Attempts:** print a filled-in attempt with its marks, as a graded script? Useful for a teacher; needs the attempt and grades like `replay`.
- **Essays with rubrics:** does `--answers key` print the rubric, the sample answer, or both?
- **Look:** prints on white always (decided). Does the chosen font carry over? (easy: yes, decided)

### Languages ×

- **Guide examples:** one set of examples per language, or the same quiz fragments with translated text?
- **Templates:** a `vi` version of each template, or one template whose sample text follows the tool language?

## When this is done

Every question above has one of three outcomes written next to it: **fits** (nothing to do), **seam** (a change to TECHNICAL_DESIGN.md before building), or **later** (recorded in the relevant proposal). Only the seams affect v1.
