"""A wheel built from the repo works on its own: every packaged file is in it."""

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent
UV = shutil.which("uv")

pytestmark = [
    pytest.mark.slow,
    pytest.mark.skipif(UV is None, reason="uv is not on PATH"),
]


def run(cmd, cwd):
    proc = subprocess.run(
        cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", check=False
    )
    assert proc.returncode == 0, f"{cmd}\n{proc.stdout}\n{proc.stderr}"
    return proc.stdout


def test_installed_wheel_creates_builds_and_prints_guides(tmp_path):
    dist = tmp_path / "dist"
    run([UV, "build", "--wheel", "--out-dir", str(dist), str(ROOT)], tmp_path)
    (wheel,) = dist.glob("fullmark-*.whl")

    venv = tmp_path / "venv"
    run(
        [
            UV,
            "venv",
            "--python",
            f"{sys.version_info.major}.{sys.version_info.minor}",
            str(venv),
        ],
        tmp_path,
    )
    py = venv / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    run([UV, "pip", "install", "--python", str(py), str(wheel)], tmp_path)
    quiz = [str(py), "-I", "-m", "fullmark.cli"]

    work = tmp_path / "work"
    work.mkdir()
    for template in ("calculus", "rust", "ielts", "medical", "exam", "survey", "blank"):
        target = work / template
        run([*quiz, "new", template, str(target)], work)
        (source,) = target.glob("*.md")
        run([*quiz, "check", str(source)], work)
        out = work / f"{template}.html"
        run([*quiz, "build", str(source), "-o", str(out)], work)
        assert out.stat().st_size > 50_000
    html = (work / "calculus.html").read_text(encoding="utf-8")
    assert "katex" in html.lower()  # vendored KaTeX made it into the wheel

    assert "## Quick facts" in run([*quiz, "agent-guide"], work)
    assert "ordering" in run([*quiz, "guide"], work)
    run([*quiz, "templates"], work)

    pkg = Path(
        run(
            [
                str(py),
                "-I",
                "-c",
                "import fullmark, pathlib; print(pathlib.Path(fullmark.__file__).parent)",
            ],
            work,
        ).strip()
    )
    for rel in (
        "schemas/results-v1.schema.json",
        "schemas/report-v1.schema.json",
        "schemas/grades-v1.schema.json",
        "agents.md",
        "guide.md",
        "static/quiz.js",
        "static/quiz.css",
        "templates/quiz.html.j2",
        "vendor/katex/katex.min.js",
    ):
        assert (pkg / rel).is_file(), rel
