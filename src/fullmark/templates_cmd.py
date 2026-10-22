"""`quiz new`, `quiz templates`, `quiz guide`, `quiz agent-guide`."""

import shutil
from dataclasses import dataclass
from pathlib import Path

from .mdutil import write_markdownlint_config

PKG = Path(__file__).parent
EXAMPLES = PKG / "examples"


@dataclass(frozen=True)
class Template:
    name: str
    file: str
    assets: tuple[str, ...]
    description: str


TEMPLATES = {
    t.name: t
    for t in (
        Template(
            "calculus",
            "calculus-1.md",
            ("cubic.png",),
            "Math: LaTeX, numeric, fields, blanks, a graph, instant feedback",
        ),
        Template(
            "rust",
            "rust-basics.md",
            (),
            "Code: highlighted snippets, blanks in code, code answer, shuffled choices",
        ),
        Template(
            "ielts",
            "ielts-writing.md",
            ("ielts-chart.png",),
            "Timed writing: two essays, auto-submit, band-score report",
        ),
        Template(
            "medical",
            "medical-physiology.md",
            (),
            "Medical science: ordering a pathway, matching, calculations with units, an essay",
        ),
        Template(
            "exam",
            "exam-mode.md",
            (),
            "Closed-book exam: time limit, no feedback until the end, shuffling, a question bank",
        ),
        Template(
            "survey",
            "survey.md",
            (),
            "Questionnaire: no score, choices, scales, a ranking and free text; read with quiz grade",
        ),
        Template(
            "blank",
            "blank.md",
            (),
            "Minimal skeleton with one example of every question type",
        ),
    )
}


def list_templates() -> str:
    width = max(len(n) for n in TEMPLATES)
    return "\n".join(f"{t.name:<{width}}  {t.description}" for t in TEMPLATES.values())


def new_from_template(name: str, dest: Path) -> list[Path]:
    """Copy a template and its assets. Refuses to overwrite. Returns the written paths."""
    if name not in TEMPLATES:
        raise KeyError(
            f"unknown template {name!r} (choose from: {', '.join(TEMPLATES)})"
        )
    t = TEMPLATES[name]
    pairs = [(EXAMPLES / t.file, dest / t.file)] + [
        (EXAMPLES / "assets" / a, dest / "assets" / a) for a in t.assets
    ]
    existing = [dst for _, dst in pairs if dst.exists()]
    if existing:
        raise FileExistsError(
            "refusing to overwrite: " + ", ".join(str(p) for p in existing)
        )
    written = []
    for src, dst in pairs:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        written.append(dst)
    lint = write_markdownlint_config(dest)
    if lint:
        written.append(lint)
    return written


def guide_text() -> str:
    return (PKG / "guide.md").read_text(encoding="utf-8")


def agent_guide_text() -> str:
    return (PKG / "agents.md").read_text(encoding="utf-8")
