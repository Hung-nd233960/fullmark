# Proposal: reference sheets (formulas, constants, unit conversions)

**Status: proposal, not in v1 scope.** Its one seam is in the quiz syntax, which is still open ([TODO.md](../TODO.md)): if `QUIZ_SYNTAX.md` reserves the `reference` key and the quiz hash covers the files it names, this can come later without changing the format.

## The idea

Real exams often hand out a sheet: a table of Laplace and Fourier transform pairs, physical constants, unit conversions, a periodic table, a statistics table. Today an author has three bad options: paste the table into every question that needs it, put it in a section intro (gone once the learner scrolls past), or leave it out and test memory instead of understanding.

A **reference sheet** is Markdown the learner can open at any time during the quiz. It holds no questions and is not scored. It is static content: a unit conversion is a table, not a converter.

## Writing one

In the front matter, a list of Markdown files next to the quiz or in a shared folder:

```yaml
reference:
  - refs/laplace-pairs.md
  - refs/si-constants.md
```

- A file is ordinary Markdown with maths, tables and images, rendered with KaTeX at build like the rest of the quiz. Its first heading is its title in the page.
- **Shared files are the point.** One `refs/laplace-pairs.md` serves every signals quiz, and fixing a typo there fixes them all at the next build.
- `register` copies the files into the version like assets, and the **quiz hash covers them**, since they change what the learner sees. Editing a shared sheet therefore makes `list` flag every quiz that uses it as changed.
- `share --source` and `publish` copy them with the quiz.

## In the page

- A **Reference** button in the top bar and a key (`R`) open a drawer over the questions. The timer and the question map stay visible; the drawer remembers its scroll position and which sheet is open.
- Available in every phase: before starting, while answering, and in review and replay.
- The sheets are rendered into the page at build, so the browser's find (Ctrl+F) works in them.
- A quiz without `reference` shows no button.

## In print

`build --print` appends the sheets after the last question, starting on a new page, so they can be torn off as on a paper exam. `--print-reference none` leaves them out, for a paper where the sheet is handed out once for several quizzes.

## Check and inspect

| Rule | Severity | What it catches |
|---|---|---|
| `reference.missing` | error | A listed file does not exist |
| `reference.question` | error | A sheet contains question syntax (it would never be scored) |
| `reference.empty` | warning | A sheet with no content |

`inspect` lists the sheets with their titles. A brief can ask for one (`reference: yes` with a note on what to include), and the agent writes it from the material, citing the page it came from.

## Left out

- **Calculators and unit converters.** These are applications, and a numeric answer's tolerance already absorbs rounding. If a quiz needs a calculator, the learner uses their own, as in most exams.
- **Units in numeric answers** (accepting `981 cm/s²` for `9.81 m/s²`). Useful, but a separate feature of the `numeric` type, not of reference sheets.
- **Recording whether the sheet was opened.** Nothing in grading or `stats` would use it.
- **Built-in sheets shipped with fullmark.** A wrong constant in a sheet fullmark ships is fullmark's bug in everyone's quiz; sheets stay the author's.

## Open questions

- **Per-section sheets.** An exam where only Part B gets the transform table. A `reference` key on a section, shown only while that section is open, is a small addition, but it means the drawer's content depends on the plan (`--section`, `--missed`). Quiz-level only at first?
- **Sheets in a bundle** ([multi-quiz-bundle.md](multi-quiz-bundle.md)): stored once per page by content hash, like other assets, so a course bundle sharing one sheet carries it once.

## Cost

Three to five days once the quiz syntax exists: front matter key and asset handling, the drawer and its key, the print appendix, three check rules, and tests (hash changes when a sheet changes; print layout; drawer in replay).
