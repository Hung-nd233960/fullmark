# Proposal: several quizzes in one HTML file

**Status: proposal, not in v1 scope.** The seams it needs are in v1 ([DESIGN.md](../DESIGN.md), section 7, "Seams for later features"), so adding it later does not touch the core. Decide on it after v1 is in use.

## The case

"Just share me an HTML quiz of the whole Diagnostic Technology course." Messaging apps send one file, not a folder, and a zip is friction for the receiver. A folder with an `index.html` works offline but fails this case.

## The idea

```text
quiz library share NAME1 NAME2 ... --bundle -o course.html [--title TEXT]
quiz build A.md B.md ... --bundle -o course.html
```

One offline page holding several quizzes, with a left bar listing them (title, question count, progress, score once submitted). Each quiz keeps its own attempt, timer, autosave and Export, so the right panel and the question map work exactly as for a single quiz.

## Modes

`--mode` on `--bundle`, stored in the page.

| Mode | Flow | Result |
|---|---|---|
| `quiz` (default) | Any quiz, any order | per quiz |
| `level` | Quizzes in order; finishing one unlocks the next. `unlock: done` (default) or a score threshold (`unlock: 80%`, mastery: retry until passed). You can stop at any point | per quiz, plus how far you got |
| `exam` | Papers in order. Submitting a paper, or running out of its time, moves to the next. No going back to an earlier paper | one overall result across papers, plus per paper |

Ideas beyond these, not planned:

- **Mock from the course**: draw N questions from every quiz into one timed exam, fresh each attempt. Really a plan feature (banks across quizzes), not a navigation mode.
- **Pre/post test**: the same quiz first and last, with the gain shown.
- **Placement**: the score on one quiz picks the next (review or harder).
- **Scheduled**: one quiz unlocks per day or week. Relies on the device clock, so easy to cheat.

## Configuration, in two stages

1. **Flags only:** `quiz` and `level` with `unlock: done`. The quizzes come in the order named on the command line; `--title` names the bundle. Results are per quiz, so the bundle has no grading logic.
2. **`bundle.yaml`:** needed only for `exam` (per-paper times, one overall result) and per-step mastery thresholds. The overall result reuses the rubric modes of DESIGN.md section 6, with papers in place of criteria (`additive` adds points, `banded` averages bands and rounds, `round: ielts` gives the IELTS overall band). The file names papers and picks a mode; it has no arithmetic of its own.

```yaml
title: IELTS mock 3
mode: exam
papers: [listening-3, reading-3, writing-3]
overall:
  mode: banded
  round: ielts
```

Ship stage 1 first; stage 2 only when a real exam bundle is wanted.

## Where it lives

Not a plugin (that would need an extension API larger than the feature) and not one separate subsystem: each part goes in the layer it belongs to.

| Part | Where |
|---|---|
| `bundle.yaml` schema, `bundle.*` check rules, overall result (through `core/rubric`) | `core/bundle/`, pure, because the page computes the overall result too |
| Left bar, unlocking, exam flow | `page/bundle/` |
| Several quizzes into one page | `build/`, which already takes a list |
| `share ... --bundle` | `library/` |

No `quiz bundle` command group. The existing commands accept a bundle: `quiz check bundle.yaml`, `quiz build bundle.yaml`, and in stage 1 `quiz build a.md b.md --bundle -o course.html`, or `bundle = "course.html"` on an entry of a build file (COMMANDS.md, `quiz build`). Without `--bundle`, several files build several pages. A bundle gets the same exit codes, `--json` and `--fonts` as a quiz.

## Open questions

- **Size.** A course with images can pass the 20 MB warning. Assets are shared by hash, but images dominate. Maybe a `--max-mb` per bundle, or a warning naming the heaviest quizzes.
- **Timers.** Leaving a timed quiz mid-attempt: pause its timer, or keep it running? Probably running, as in an exam, with the left bar showing it.
- **The look.** The bundle has one `theme` and `font`; the quizzes' own looks are ignored, or the bundle takes the first quiz's.
- **Export.** One results file per quiz taken, or one "Export all" that writes several files.
- **`serve` and `library take`** stay one quiz each; a bundle is for sharing, not for filing results back into the library.

## Cost once the seams exist

The left bar, the `--bundle` option on `build` and `share`, and per-bundle size checks. Days, not weeks.
