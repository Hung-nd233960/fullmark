# Proposal: `quiz guide --web`

**Status: proposal, not in v1 scope.** The seam it needs is in v1 ([TECHNICAL_DESIGN.md](../TECHNICAL_DESIGN.md), section 7, "Seams for later features"): every syntax example in the guide is a `quiz-example` block that passes `check`.

## The idea

`quiz guide --web` opens the authoring guide as one offline page. Each `quiz-example` block is shown twice, side by side: the Markdown source on the left and the question it builds on the right, rendered by the real page components and answerable, so the author sees and tries exactly what a learner will get.

```text
quiz guide --web [--no-open] [-o FILE]
```

- Opens a temporary file, or writes to `FILE`. No server: the page is static.
- Takes `--lang en|vi`, like `quiz guide`.
- Uses the default look; the Appearance menu shows the themes and fonts on real questions, which doubles as a preview of `theme` and `font`.
- A **Copy** button on each source block.

## Cost once the seam exists

The guide becomes a bundle-like page: each example is built through `build(quizzes[])` and shown next to its source. A layout for the two columns and the copy button. About a day.
