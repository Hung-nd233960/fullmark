# Proposal: plain Markdown export for Word and Typst

**Status: proposal, not in v1 scope.** v1 prints through `quiz build --print` and the browser ([DESIGN.md](../DESIGN.md), section 8, "Printable paper").

## The idea

```text
quiz build FILE --print --format md [--answers none|key|inline] [--seed S] [-o OUT]
```

Writes the printable paper as standard Markdown with no fullmark syntax: lettered choices as lists, blanks as underscores, essay space as a note, math kept as LaTeX (`$...$`), images next to the file. It is a bridge, not a final format:

- **Word:** `pandoc paper.md -o paper.docx` turns the math into real Word equations, so a teacher can edit the paper.
- **Typst:** `pandoc paper.md -o paper.typ`, then `typst compile`. pandoc converts the LaTeX math, which is the hard part to do by hand.
- **document-kit:** the file can go in as a chapter or an appendix, with no integration code on either side.

## Why not more

- **docx or Typst written by fullmark itself:** two more renderers to keep in step with the HTML one, and LaTeX-to-Typst math conversion, all of which pandoc already does.
- **PDF from the CLI:** needs a headless browser (about 150 MB) or a Typst toolchain; the browser's Save as PDF already gives the same result from `--print`.

## Cost

A Markdown renderer over the same print layout data as `--print`, plus fixtures checked through pandoc. About a day.
