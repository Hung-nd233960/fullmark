"""quiz stats: progress across attempts."""

import json
import shutil
from pathlib import Path

import pytest
from helpers import correct_response
from test_report import make_results

from fullmark.cli import main
from fullmark.validate import load_quiz

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture
def attempts(tmp_path):
    shutil.copy(FIX / "all-types.md", tmp_path / "all-types.md")
    shutil.copytree(FIX / "assets", tmp_path / "assets")
    quiz, _, _ = load_quiz(tmp_path / "all-types.md")
    right = {q.id: correct_response(q, quiz) for q in quiz.questions}
    half = dict(list(right.items())[:5])
    paths = []
    # written newest first, to prove the order comes from started_at
    for name, resp, when in (
        ("c.json", right, "2026-10-03T10:00:00Z"),
        ("a.json", {}, "2026-10-01T10:00:00Z"),
        ("b.json", half, "2026-10-02T10:00:00Z"),
    ):
        p = tmp_path / name
        p.write_text(
            json.dumps(make_results(quiz, resp, started_at=when)), encoding="utf-8"
        )
        paths.append(p)
    return tmp_path, paths


def test_markdown_progress(attempts, capsys):
    tmp_path, paths = attempts
    capsys.readouterr()
    assert (
        main(["stats", *map(str, paths), "--quiz", str(tmp_path / "all-types.md")]) == 0
    )
    out = capsys.readouterr().out
    lines = [ln for ln in out.splitlines() if ln.startswith("| ") and "2026-10" in ln]
    assert [ln.split("|")[2].strip() for ln in lines] == [
        "2026-10-01T10:00:00Z",
        "2026-10-02T10:00:00Z",
        "2026-10-03T10:00:00Z",
    ]
    assert (
        "| 1 | 2026-10-01T10:00:00Z | 0 /" in out
        and "| 3 | 2026-10-03T10:00:00Z |" in out
    )
    assert "## Weakest topics (latest attempt)" in out
    assert "| cardio | 0% |" in out and "+100" in out


def test_json_output_and_weakest_three(attempts, capsys):
    _tmp_path, paths = attempts
    capsys.readouterr()
    assert main(["stats", *map(str, paths), "--json"]) == 0
    data = json.loads(capsys.readouterr().out)
    assert [a["file"] for a in data["attempts"]] == ["a.json", "b.json", "c.json"]
    assert data["attempts"][0]["percent"] == 0 and data["attempts"][2]["percent"] == 100
    cardio = next(t for t in data["topics"] if t["topic"] == "cardio")
    assert cardio["percent"] == [0, 100, 100] and cardio["change"] == 100
    assert len(data["weakest"]) <= 3


def test_different_quizzes_exit_2(attempts, capsys):
    tmp_path, paths = attempts
    other = json.loads(paths[0].read_text(encoding="utf-8"))
    other["quiz"]["id"] = "something-else"
    o = tmp_path / "other.json"
    o.write_text(json.dumps(other), encoding="utf-8")
    capsys.readouterr()
    assert main(["stats", str(paths[0]), str(o)]) == 2
    assert "different quizzes" in capsys.readouterr().err


def test_changed_hash_warns(attempts, capsys):
    tmp_path, paths = attempts
    other = json.loads(paths[0].read_text(encoding="utf-8"))
    other["quiz"]["hash"] = "deadbeef"
    other["attempt"]["started_at"] = "2026-10-04T10:00:00Z"
    o = tmp_path / "other.json"
    o.write_text(json.dumps(other), encoding="utf-8")
    capsys.readouterr()
    assert main(["stats", str(paths[0]), str(o)]) == 0
    assert "quiz changed between attempts" in capsys.readouterr().err
    assert main(["stats", str(tmp_path / "missing.json")]) == 2


def _survey_attempts(tmp_path, name, answers_by_time):
    shutil.copy(FIX / name, tmp_path / name)
    quiz, _, _ = load_quiz(tmp_path / name)
    paths = []
    for i, (when, resp) in enumerate(answers_by_time):
        p = tmp_path / f"s{i}.json"
        res = make_results(quiz, resp, source_file=name, started_at=when)
        p.write_text(json.dumps(res), encoding="utf-8")
        paths.append(p)
    return quiz, paths


def test_answers_over_time_for_scales_and_singles(tmp_path, capsys):
    _quiz, paths = _survey_attempts(
        tmp_path,
        "survey.md",
        [
            ("2026-10-02T10:00:00Z", {"conf": {"value": 4}, "how": {"choice": 0}}),
            ("2026-10-01T10:00:00Z", {"conf": {"value": 2}, "name": {"text": "Sam"}}),
        ],
    )
    capsys.readouterr()
    assert main(["stats", *map(str, paths), "--quiz", str(tmp_path / "survey.md")]) == 0
    out = capsys.readouterr().out
    # a survey has no score rows, and no topic table
    assert "not scored" in out and "No tagged auto-graded questions." in out
    assert "## Answers over time" in out
    table = out.split("## Answers over time")[1].split("## Weakest")[0]
    assert "| Question | #1 | #2 |" in table
    assert "| How do you usually study? | - | Alone |" in table
    assert "| How confident are you with Fourier transforms? | 2 / 5 | 4 / 5 |" in table
    # text, fields and ranking answers are not tracked
    assert "Your name" not in table and "Rank these" not in table
    assert main(["stats", *map(str, paths), "--json"]) == 0
    data = json.loads(capsys.readouterr().out)
    conf = next(r for r in data["answers_over_time"] if r["id"] == "conf")
    assert conf["values"] == ["2 / 5", "4 / 5"] or conf["values"] == ["2", "4"]


def test_ungraded_questions_stay_out_of_the_score_trend(tmp_path, capsys):
    _quiz, paths = _survey_attempts(
        tmp_path,
        "mixed.md",
        [
            ("2026-10-01T10:00:00Z", {"sum": {"choice": 1}, "sure": {"value": 1}}),
            ("2026-10-02T10:00:00Z", {"sum": {"choice": 1}, "sure": {"value": 5}}),
        ],
    )
    capsys.readouterr()
    assert main(["stats", *map(str, paths), "--quiz", str(tmp_path / "mixed.md")]) == 0
    out = capsys.readouterr().out
    # 1 of 3 graded points both times, however sure the respondent was
    assert out.count("| 1 / 3 | 33.33% |") == 2
    table = out.split("## Answers over time")[1].split("## Weakest")[0]
    assert "| How sure are you? | 1 / 5 (Guessing) | 5 / 5 (Certain) |" in table
