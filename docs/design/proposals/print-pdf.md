# Proposal: the PDF through the teacher's own browser

**Status: proposal, not in v1 scope** (raised in 2k's review; written in 3j's review, 2026-11-03). v1's `quiz build --print` writes a static HTML paper, and the teacher saves it as PDF from the browser's Print dialog ([COMMANDS.md](../COMMANDS.md), `quiz build`; TECHNICAL_DESIGN.md, "Printable paper"). The page breaks, the footer's margin boxes and the fonts are tested on Chromium's own PDF, so the paper is already made for that step.

## Why v1 has no `--pdf`

- **No bundled browser.** A PDF writer of our own, or a headless Chromium in the package, would be a second renderer or tens of MB; the reasons are those of [markdown-export.md](markdown-export.md) for Typst.
- **The Print dialog is one step**, and it lets the teacher choose the paper size, margins and printer, which a fixed PDF would decide for them.

## The idea, for after v1

```text
quiz build exam.md --print --pdf [--paper a4|letter]
quiz build exam.md --print --watch --serve      # already in v1: the paper, reloaded on each save
```

`--pdf` finds a Chromium-based browser already on the machine (Chrome, Edge, Brave, Chromium; the same search Playwright's `channel` does), starts it headless with a temporary profile, opens the paper from the one-shot server's token URL, and writes `exam-print.pdf` through the DevTools protocol's `Page.printToPDF`, with the margin boxes and A4 or Letter. Nothing is installed: no browser found exits 2 with "no Chromium-based browser found: open the paper and print it to PDF", and the HTML paper is written as now.

With `--watch --serve`, the long-running server built in 3j already holds the last good paper in memory, so `--pdf` there would write the PDF again after each good rebuild: a teacher editing an exam keeps an up-to-date PDF beside it.

## Open questions

- Firefox has no `printToPDF` over a stable protocol; is Chromium-only acceptable, given that the paper is tested on Chromium's PDF already?
- Byte identity: Chromium stamps a creation date and its version into the PDF. Strip them, or promise identity only for the HTML paper?
- A school machine may forbid starting a browser from another program; the fallback is the Print dialog, as now.

## Cost

About two days: the browser search on three systems, the DevTools client (a few messages over a WebSocket, `node:` only, no new dependency), `--paper`, the watch hook, and tests that skip by name where no browser is found.
