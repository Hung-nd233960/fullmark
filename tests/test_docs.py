import json
import re
from pathlib import Path

from helpers import correct_response

from fullmark.cli import build_parser
from fullmark.grading import score_attempt
from fullmark.validate import load_quiz

DOCS = Path(__file__).parent.parent / "docs"


def test_project_quiz_is_clean_and_answerable():
    quiz, findings, _ = load_quiz(DOCS / "fullmark-project.md")
    assert not list(findings), [f.format() for f in findings]
    assert quiz is not None
    types = {q.type for q in quiz.questions}
    assert types == {
        "single",
        "multi",
        "truefalse",
        "numeric",
        "short",
        "blanks",
        "fields",
        "essay",
        "code",
    }
    out = score_attempt(quiz, {q.id: correct_response(q, quiz) for q in quiz.questions})
    assert out["score"]["percent_auto"] == 100
    assert all(
        r["status"] in ("correct", "pending") for r in out["per_question"].values()
    )


def test_built_html_is_not_stale():
    quiz, _, _ = load_quiz(DOCS / "fullmark-project.md")
    assert quiz is not None
    html = (DOCS / "fullmark-project.html").read_text(encoding="utf-8")
    m = re.search(r'id="quiz-data">(.*?)</script>', html, re.DOTALL)
    assert m is not None
    data = json.loads(m.group(1))
    assert data["hash"] == quiz.source_hash, "run: uv run python docs/build_docs.py"
    assert (DOCS / "GUIDE.html").stat().st_mtime >= (
        DOCS / "GUIDE.md"
    ).stat().st_mtime - 1


def test_guide_documents_every_command():
    guide = (DOCS / "GUIDE.md").read_text(encoding="utf-8")
    sub = build_parser()._subparsers
    assert sub is not None
    commands = sub._group_actions[0].choices
    assert commands is not None
    for name in commands:
        assert f"quiz {name}" in guide, name
    assert (DOCS / "SPEC.md").is_file() and "(SPEC.md)" in guide


ROOT = Path(__file__).parent.parent
LINK = re.compile(r"(?<!!)\[[^\]]*\]\(([^)\s#]+)(?:#[^)]*)?\)")


def test_markdown_links_resolve():
    """Every relative link in the repo's Markdown points at a file that exists.

    Images are left out: in quiz sources and docs they are syntax examples.
    """
    files = [
        p
        for p in ROOT.rglob("*.md")
        if not any(
            part.startswith(".")
            or part in ("node_modules", "build", "dist", "fixtures")
            for part in p.relative_to(ROOT).parts
        )
    ]
    broken = []
    for md in files:
        text = md.read_text(encoding="utf-8")
        # Code blocks and inline code hold examples, not links.
        text = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
        text = re.sub(r"`[^`\n]*`", "", text)
        for target in LINK.findall(text):
            if re.match(r"[a-z]+:", target) or target.startswith("/"):
                continue  # URLs, mailto:, absolute paths
            if not (md.parent / target).exists():
                broken.append(f"{md.relative_to(ROOT)}: {target}")
    assert not broken, "\n".join(broken)


def _outline(path):
    """The ## headings count and the `quiz ...` commands, ignoring code fences."""
    text = re.sub(
        r"^```.*?^```",
        "",
        path.read_text(encoding="utf-8"),
        flags=re.MULTILINE | re.DOTALL,
    )
    headings = re.findall(r"^## ", text, flags=re.MULTILINE)
    commands = set(re.findall(r"`(quiz [a-z-]+(?: [a-z-]+)?)", text))
    return len(headings), commands


def test_vietnamese_docs_follow_the_english():
    root = DOCS.parent
    for name in ("README.md", "AGENTS.md"):
        en, vi = _outline(root / name), _outline(DOCS / "vi" / name)
        assert en[0] == vi[0], (
            f"{name}: {en[0]} sections in English, {vi[0]} in docs/vi"
        )
        assert en[1] == vi[1], f"{name}: commands differ {en[1] ^ vi[1]}"
