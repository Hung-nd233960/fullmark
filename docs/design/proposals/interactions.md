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
- **Shelves:** can a bundle sit on a shelf when some of its quizzes are not on it? Does a shelf's index list the bundle, its quizzes, or both? When a quiz changes, is the published bundle stale?
- **Look:** the bundle has one theme and font (decided). Does `look: locked` on one quiz lock the whole bundle? Does `--fonts quiz` mean every quiz's font, or the bundle's?
- **Languages:** can a bundle mix `en` and `vi` quizzes? If yes, which language is the left bar in?
- **`--missed` and replay:** does a bundle have a "missed" view across its quizzes? Does replay open one quiz or the whole bundle with every attempt?
- **Results:** `exam` mode gives one overall result. Where does it live: a new file next to the per-quiz results, or inside one of them? Does `stats` count it?
- **Library:** is a bundle a thing in the library (with versions and history), or only a build input (`bundle.yaml`) outside it?

### Shelves ×

- **Printing:** does `publish` also put printable papers on the shelf? Answer keys on a public shelf would give the answers away, so per shelf, opt-in?
- **Languages:** a shelf's index page has a `lang`. Does it list only quizzes in that language, or all of them?
- **Look and fonts:** `--fonts` is per shelf (proposed). Can a shelf force a look on its quizzes, or only the fonts?
- **Pinned versions:** if a class shelf pins a version, does `library take` still use the latest? (easy: yes, the shelf is a copy)
- **Import:** importing from someone's shelf that holds a bundle: import the bundle, its quizzes, or both?

### Printing ×

- **Sections:** `--section` for a printed paper of one part only? (easy: same Plan)
- **Banks:** a printed paper draws from banks with `--seed`, so the key must match the draw. (easy: the key comes from the same Plan)
- **Attempts:** print a filled-in attempt with its marks, as a graded script? Useful for a teacher; needs the attempt and grades like `build --attempt`.
- **Essays with rubrics:** does `--answers key` print the rubric, the sample answer, or both?
- **Look:** prints on white always (decided). Does the chosen font carry over? (easy: yes, decided)

### Languages ×

- **Guide examples:** one set of examples per language, or the same quiz fragments with translated text?
- **Templates:** a `vi` version of each template, or one template whose sample text follows the tool language?

## When this is done

Every question above has one of three outcomes written next to it: **fits** (nothing to do), **seam** (a change to TECHNICAL_DESIGN.md before building), or **later** (recorded in the relevant proposal). Only the seams affect v1.
