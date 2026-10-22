import json
import shutil
import subprocess
from pathlib import Path

import pytest
from helpers import correct_response

from fullmark.cli import main
from fullmark.grading import score_attempt
from fullmark.templates_cmd import TEMPLATES
from fullmark.validate import load_quiz

ROOT = Path(__file__).parent.parent
EXAMPLES = ROOT / "src" / "fullmark" / "examples"
FILES = sorted(EXAMPLES.glob("*.md"))


@pytest.mark.parametrize("path", FILES, ids=[p.name for p in FILES])
def test_example_checks_clean(path):
    _, findings, _ = load_quiz(path)
    assert not findings.has_errors, [f.format() for f in findings]
    assert not list(findings), [
        f.format() for f in findings
    ]  # examples also carry no warnings


@pytest.mark.parametrize("path", FILES, ids=[p.name for p in FILES])
def test_example_answer_key_scores_full_marks(path):
    quiz, _, _ = load_quiz(path)
    out = score_attempt(quiz, {q.id: correct_response(q, quiz) for q in quiz.questions})
    bad = {
        k: v
        for k, v in out["per_question"].items()
        if v["status"] not in ("correct", "pending", "ungraded")
    }
    assert not bad, bad
    assert out["score"]["percent_auto"] in (100, None)


def test_every_auto_question_has_explanation():
    for path in FILES:
        quiz, _, _ = load_quiz(path)
        for q in quiz.questions:
            if q.auto:
                assert q.explanation_md.strip(), f"{path.name}:{q.line} {q.id}"


def test_calculus_requirements():
    quiz, _, _ = load_quiz(EXAMPLES / "calculus-1.md")
    types = [q.type for q in quiz.questions]
    assert 11 <= len(types) <= 14
    assert (
        quiz.meta.time_limit_seconds == 1800
        and quiz.meta.feedback == "instant"
        and quiz.meta.pass_mark == 70
    )
    latex_singles = [
        q
        for q in quiz.questions
        if q.type == "single" and all("$" in c.md for c in q.choices)
    ]
    assert len(latex_singles) >= 2
    assert (
        types.count("multi") >= 1
        and types.count("truefalse") >= 1
        and types.count("numeric") >= 2
    )
    assert (
        types.count("blanks") == 1
        and types.count("fields") == 1
        and types.count("essay") == 1
    )
    fields = next(q for q in quiz.questions if q.type == "fields")
    assert "assets/cubic.png" in fields.prompt_md and len(fields.spec.fields) == 4
    assert next(q for q in quiz.questions if q.type == "essay").spec.min_words == 60
    # variants accepted for expression answers
    blanks = next(q for q in quiz.questions if q.type == "blanks")
    assert any(len(b["accept"]) > 1 for b in blanks.blanks)


def test_rust_requirements():
    quiz, _, _ = load_quiz(EXAMPLES / "rust-basics.md")
    qs = quiz.questions
    assert quiz.meta.shuffle_choices and quiz.meta.time_limit_seconds == 1500
    shorts = [q for q in qs if q.type == "short"]
    assert len(shorts) >= 2 and all(
        q.case == "sensitive" and "```rust" in q.prompt_md for q in shorts
    )
    multi = next(q for q in qs if q.type == "multi")
    assert all("```rust" in c.md for c in multi.choices)
    assert any(q.type == "truefalse" for q in qs)
    assert any(
        q.type == "blanks" and "```rust" in q.prompt_md and len(q.blanks) == 2
        for q in qs
    )
    code = next(q for q in qs if q.type == "code")
    assert (
        code.spec.starter
        and code.spec.rubric
        and code.spec.reference
        and code.spec.show_reference
    )


def test_medical_and_exam_requirements():
    quiz, _, _ = load_quiz(EXAMPLES / "medical-physiology.md")
    assert {"ordering", "matching", "numeric", "fields", "essay", "multi"} <= {
        q.type for q in quiz.questions
    }
    assert quiz.meta.feedback == "instant"
    quiz, _, _ = load_quiz(EXAMPLES / "exam-mode.md")
    assert quiz.meta.time_limit_seconds == 1200 and quiz.meta.feedback == "end"
    assert quiz.meta.shuffle_questions and quiz.meta.pass_mark == 60
    assert any(s.pick for s in quiz.sections)


def test_ielts_requirements():
    quiz, _, _ = load_quiz(EXAMPLES / "ielts-writing.md")
    assert quiz.meta.time_limit_seconds == 3600 and quiz.meta.on_timeout == "submit"
    assert [s.title for s in quiz.sections] == ["Task 1", "Task 2"]
    assert [s.time for s in quiz.sections] == ["20m", "40m"]
    t1, t2 = quiz.questions
    assert (t1.points, t1.spec.min_words) == (10, 150) and (
        t2.points,
        t2.spec.min_words,
    ) == (20, 250)
    assert "assets/ielts-chart.png" in t1.prompt_md
    for q in quiz.questions:
        assert q.spec.scoring == "band" and len(q.spec.rubric) == 4


def test_rust_snippets_compile_when_rustc_available(tmp_path):
    """The Rust code the quiz claims compiles (or fails) must really do so."""
    rustc = shutil.which("rustc")
    if rustc is None:
        pytest.skip("rustc not installed")
    quiz, _, _ = load_quiz(EXAMPLES / "rust-basics.md")
    multi = next(q for q in quiz.questions if q.type == "multi")
    for i, c in enumerate(multi.choices):
        body = c.md.split("```rust\n", 1)[1].rsplit("```", 1)[0]
        src = tmp_path / f"m{i}.rs"
        src.write_text(
            "#![allow(warnings)]\nfn main() {\n" + body + "}\n", encoding="utf-8"
        )
        ok = (
            subprocess.run(
                [
                    rustc,
                    "--edition",
                    "2021",
                    "-o",
                    str(tmp_path / f"m{i}.exe"),
                    str(src),
                ],
                capture_output=True,
                check=False,
            ).returncode
            == 0
        )
        assert ok == c.correct, (
            f"choice {i + 1}: compiles={ok} but marked correct={c.correct}"
        )


def test_new_templates_and_guide(tmp_path, capsys):
    assert main(["templates"]) == 0
    listing = capsys.readouterr().out
    assert all(name in listing for name in TEMPLATES)
    for name, t in TEMPLATES.items():
        dest = tmp_path / name
        assert main(["new", name, str(dest)]) == 0
        assert (dest / t.file).is_file()
        for a in t.assets:
            assert (dest / "assets" / a).is_file()
        assert main(["check", str(dest / t.file)]) == 0
        assert main(["new", name, str(dest)]) == 1  # refuses to overwrite
    assert main(["new", "nonsense", str(tmp_path)]) == 2
    capsys.readouterr()
    assert main(["guide"]) == 0
    guide = capsys.readouterr().out
    for t in (
        "single",
        "multi",
        "truefalse",
        "numeric",
        "short",
        "blanks",
        "fields",
        "essay",
        "code",
    ):
        assert f"### {t}" in guide or t in guide
    assert "Common mistakes" in guide


@pytest.mark.skipif(
    shutil.which("markdownlint-cli2") is None, reason="markdownlint-cli2 not installed"
)
def test_examples_and_guide_pass_markdownlint(tmp_path):
    for p in (
        *FILES,
        ROOT / "src" / "fullmark" / "guide.md",
        ROOT / "tests" / "fixtures" / "all-types.md",
    ):
        shutil.copy(p, tmp_path / p.name)
    shutil.copy(
        ROOT / ".markdownlint-cli2.jsonc", tmp_path / ".markdownlint-cli2.jsonc"
    )
    proc = subprocess.run(
        [shutil.which("markdownlint-cli2"), "*.md"],
        capture_output=True,
        text=True,
        cwd=tmp_path,
        check=False,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr


@pytest.mark.parametrize(
    "name", ["calculus", "rust", "ielts", "medical", "exam", "survey"]
)
def test_top_level_examples_match_packaged(name):
    t = TEMPLATES[name]
    top = ROOT / "examples" / name
    hint = "run: uv run python scripts/sync_examples.py"
    packaged = (EXAMPLES / t.file).read_bytes()
    assert (top / "quiz.md").read_bytes() == packaged, f"quiz.md differs; {hint}"
    for a in t.assets:
        same = (top / "assets" / a).read_bytes() == (
            EXAMPLES / "assets" / a
        ).read_bytes()
        assert same, f"{a} differs; {hint}"
    html = (top / "quiz.html").read_text(encoding="utf-8")
    quiz, _, _ = load_quiz(top / "quiz.md")
    assert f'"hash":"{quiz.source_hash}"' in html.replace(" ", ""), (
        f"quiz.html is stale; {hint}"
    )
    pkg = ROOT / "src" / "fullmark" / "static"
    for static in ("quiz.css", "quiz.js"):
        assert (pkg / static).read_text(encoding="utf-8") in html, (
            f"{static} is stale in quiz.html; {hint}"
        )


def test_root_agents_md_is_the_packaged_copy():
    packaged = (ROOT / "src" / "fullmark" / "agents.md").read_bytes()
    assert (ROOT / "AGENTS.md").read_bytes() == packaged, (
        "edit src/fullmark/agents.md, then run: uv run python scripts/sync_examples.py"
    )


def test_agent_guide_command(capsys):
    assert main(["agent-guide"]) == 0
    out = capsys.readouterr().out
    assert out.startswith("# AGENTS.md")
    assert "quiz grade" in out and "quiz agent-guide" in out


def test_survey_example_requirements():
    quiz, _, _ = load_quiz(EXAMPLES / "survey.md")
    assert quiz.meta.mode == "survey"
    types = [q.type for q in quiz.questions]
    assert types.count("single") >= 2 and types.count("multi") == 1
    assert types.count("scale") == 2 and types.count("ordering") == 1
    assert types.count("fields") == 1 and types.count("essay") == 1
    assert all(q.ungraded for q in quiz.questions) and quiz.total_points == 0


def test_new_writes_markdownlint_config_without_overwriting(tmp_path):
    dest = tmp_path / "q"
    assert main(["new", "blank", str(dest)]) == 0
    cfg = json.loads((dest / ".markdownlint.json").read_text(encoding="utf-8"))
    assert cfg == {"MD013": False, "MD025": False, "MD028": False}
    own = tmp_path / "own"
    own.mkdir()
    (own / ".markdownlint.json").write_text('{"MD001": false}', encoding="utf-8")
    assert main(["new", "blank", str(own)]) == 0
    assert (own / ".markdownlint.json").read_text(encoding="utf-8") == (
        '{"MD001": false}'
    )
