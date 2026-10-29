# Page mockup

The owner's design of the quiz page, from the Design canvas <https://claude.ai/artifact/HPX2k7wM7ENHVQLc3zzjL5> (copied 2026-10-29). The page is built to match it: a slice brief names the boards it builds, and the implementation takes colours, sizes, spacing, borders, radii and shadows from them.

- `boards/<Name>.dc.html`: each board's source. Its values are in the inline `style` attributes and in the `renderVals()` script (the five token sets are `T.light` … `T.paper`). Boards like `Light.dc.html` only import `Quiz.dc.html` with other options. `boards/canvas.json` gives each board's title and size.
- `images/<Name>.png`: each board rendered at its own size (1280 × 940 for a page, 1280 × 1560 for results, 390 × 844 for the phone, 794 × 1123 for print), to compare screenshots with.

Where the boards and the design docs disagree, the design docs win (they hold later decisions, such as **Continue** where the start board says Resume), and the difference is reported. The zip exports and the PDF the images were made from are kept outside git.
