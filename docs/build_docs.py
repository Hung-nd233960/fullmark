"""Rebuild docs/GUIDE.html, docs/fullmark-project.html and docs/index.html (the Pages front page).

Run from the project folder: uv run python docs/build_docs.py
Needs pandoc on PATH. Colors come from fullmark.theme (muted light and dark palettes).
"""

import html
import subprocess
import sys
import tempfile
from pathlib import Path

from fullmark.build import build_html
from fullmark.theme import DARK, LIGHT
from fullmark.validate import load_quiz

DOCS = Path(__file__).parent


def vars_block(pal: dict[str, str]) -> str:
    return "".join(f"--{k}:{v};" for k, v in pal.items())


CSS = (
    ":root{" + vars_block(LIGHT) + "}\n"
    "@media (prefers-color-scheme: dark){:root{" + vars_block(DARK) + "}}\n"
    """
html{background:var(--bg)}
body{max-width:50rem;margin:0 auto;padding:1.5rem 16px 4rem;background:var(--bg);color:var(--text);
  font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header#title-block-header h1.title{color:var(--accent);margin-bottom:.2rem}
header#title-block-header p.subtitle{color:var(--muted);margin-top:0;font-size:1.1rem}
h1,h2,h3{line-height:1.25}
h2{margin-top:2.4rem;padding-bottom:.25rem;border-bottom:2px solid var(--line);color:var(--info)}
h3{margin-top:1.8rem;color:var(--accent)}
a{color:var(--info)}
nav#TOC{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:.6rem 1.2rem;margin:1.5rem 0}
nav#TOC ul{list-style:none;padding-left:1rem;margin:.2rem 0}
nav#TOC>ul{padding-left:0}
code{font-family:ui-monospace,"Cascadia Code",Consolas,Menlo,monospace;font-size:.9em;background:var(--sunken);
  border-radius:4px;padding:.05em .3em}
pre{background:var(--sunken);border:1px solid var(--line);border-radius:10px;padding:.8rem 1rem;overflow-x:auto}
pre code{background:none;padding:0}
table{border-collapse:collapse;display:block;overflow-x:auto;max-width:100%;margin:1rem 0}
th,td{border:1px solid var(--line);padding:.35rem .7rem;text-align:left;vertical-align:top}
th{background:var(--surface)}
blockquote{margin:1rem 0;padding:.1rem 1rem;border-left:4px solid var(--accent);color:var(--muted)}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
@media print{body{background:none}}
"""
)


def build_guide() -> Path:
    out = DOCS / "GUIDE.html"
    with tempfile.TemporaryDirectory() as tmp:
        css = Path(tmp) / "guide.css"
        css.write_text(CSS, encoding="utf-8")
        subprocess.run(
            [
                "pandoc", str(DOCS / "GUIDE.md"), "-s", "--embed-resources", "--css", str(css),
                "--toc", "--toc-depth=2", "--metadata", "lang=en", "--eol=lf", "-o", str(out),
            ],
            check=True,
        )  # fmt: skip
    return out


def build_project_quiz() -> Path:
    src = DOCS / "fullmark-project.md"
    quiz, findings, _ = load_quiz(src)
    for f in findings.sorted():
        print(f.format())
    if findings.has_errors or quiz is None:
        sys.exit("fullmark-project.md has errors")
    out = DOCS / "fullmark-project.html"
    out.write_text(build_html(quiz, DOCS).html, encoding="utf-8", newline="\n")
    return out


# What each example shows a visitor (the quizzes' own descriptions are written for authors).
EXAMPLES = {
    "calculus": "Math typeset with KaTeX, numeric answers with tolerances, instant feedback.",
    "rust": "Highlighted code, blanks inside code and a code answer, timed, feedback at the end.",
    "medical": "Ordering, matching, numeric answers with units and an essay with a rubric.",
    "exam": "A timed exam: shuffled questions, a random draw from a question bank, a pass mark.",
    "ielts": "Two timed writing tasks, exported for AI feedback and a band score.",
    "survey": "A questionnaire: rating scales, a ranking and open answers, nothing scored.",
}
REPO = "https://github.com/Hung-nd233960/fullmark"


def build_index() -> Path:
    """The GitHub Pages front page. Paths match the site the pages workflow assembles."""
    items = []
    for name, blurb in EXAMPLES.items():
        quiz, _, _ = load_quiz(DOCS.parent / "examples" / name / "quiz.md")
        assert quiz is not None, name
        items.append(
            f'<li><a href="examples/{name}.html">{html.escape(quiz.meta.title)}</a>'
            f"<br><span>{blurb}</span></li>"
        )
    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fullmark Alchemist</title>
<style>
{CSS}
h1{{color:var(--accent);margin-bottom:.2rem}}
.lede{{color:var(--muted);margin-top:0;font-size:1.1rem}}
ul.quizzes{{list-style:none;padding:0}}
ul.quizzes li{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:.7rem 1rem;margin:.6rem 0}}
ul.quizzes a{{font-weight:650}}
ul.quizzes span{{color:var(--muted)}}
</style>
</head>
<body>
<h1>Fullmark Alchemist</h1>
<p class="lede">Markdown in, one offline, self-grading HTML quiz out.</p>
<p>Each page below is a single file built by <code>quiz build</code>: no server, no account,
nothing loaded from the network. Answers are kept in your browser; Submit grades them and
Export answers saves a results file.</p>
<h2>Try a quiz</h2>
<ul class="quizzes">
{chr(10).join(items)}
<li><a href="fullmark-project.html">A quiz about fullmark itself</a><br><span>Nine question types, about this project.</span></li>
</ul>
<h2>Read more</h2>
<ul>
<li><a href="guide.html">User guide</a></li>
<li><a href="{REPO}">Source, README and install</a> (<code>uv tool install fullmark</code>)</li>
</ul>
</body>
</html>
"""
    out = DOCS / "index.html"
    out.write_text(page, encoding="utf-8", newline="\n")
    return out


if __name__ == "__main__":
    for p in (build_guide(), build_project_quiz(), build_index()):
        print(f"wrote {p.relative_to(DOCS.parent)} ({p.stat().st_size / 1024:.0f} KB)")
