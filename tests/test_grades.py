"""Merging an agent's grades (grades-v1) back into the report."""

import json
import shutil
from pathlib import Path

import pytest
from helpers import validate_report
from test_report import make_results

from fullmark.cli import main
from fullmark.validate import load_quiz

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture
def setup(tmp_path):
    shutil.copy(FIX / "all-types.md", tmp_path / "all-types.md")
    shutil.copytree(FIX / "assets", tmp_path / "assets")
    quiz, _, _ = load_quiz(tmp_path / "all-types.md")
    rp = tmp_path / "r.json"
    rp.write_text(json.dumps(make_results(quiz)), encoding="utf-8")
    return tmp_path, rp


def run(rp, *extra):
    return main(["grade", str(rp), "--json", *extra])


def filled(tmp_path, **grades):
    g = json.loads((tmp_path / "r-grades.json").read_text(encoding="utf-8"))
    g["grades"].update(grades)
    p = tmp_path / "filled.json"
    p.write_text(json.dumps(g), encoding="utf-8")
    return p


def test_json_run_writes_an_empty_template(setup):
    tmp_path, rp = setup
    assert run(rp) == 0
    tpl = json.loads((tmp_path / "r-grades.json").read_text(encoding="utf-8"))
    assert tpl["format"] == "fullmark-grades" and tpl["version"] == 1
    assert {"essay1", "code1"} <= set(tpl["grades"])
    assert tpl["grades"]["essay1"]["score"] is None
    report = json.loads((tmp_path / "r-report.json").read_text(encoding="utf-8"))
    assert tpl["results_hash"] == report["results_hash"]
    # an existing (possibly filled-in) template is never overwritten
    (tmp_path / "r-grades.json").write_text('{"keep": 1}', encoding="utf-8")
    assert run(rp) == 0
    assert (tmp_path / "r-grades.json").read_text(encoding="utf-8") == '{"keep": 1}'


def test_merge_into_json_and_markdown(setup):
    tmp_path, rp = setup
    run(rp)
    base = json.loads((tmp_path / "r-report.json").read_text(encoding="utf-8"))[
        "summary"
    ]
    g = filled(
        tmp_path,
        essay1={
            "score": 4,
            "justification": "Clear tone.",
            "improvement": "Vary verbs.",
        },
        code1={"score": 1.5, "criteria": {"Overall quality": 1.5}},
    )
    assert run(rp, "--grades", str(g)) == 0
    data = json.loads((tmp_path / "r-report.json").read_text(encoding="utf-8"))
    validate_report(data)
    by_id = {q["id"]: q for q in data["questions"]}
    assert by_id["essay1"]["ai_grading"]["result"]["score"] == 4
    s = data["summary"]
    assert s["final_earned"] == base["earned"] + 5.5
    assert s["final_possible"] == base["possible_auto"] + 5 + 3
    assert main(["grade", str(rp), "--grades", str(g)]) == 0
    md = (tmp_path / "r-report.md").read_text(encoding="utf-8")
    assert "- Overall score: 4 / 5" in md and "- Justification: Clear tone." in md
    assert "**Final score (with AI grades):**" in md


@pytest.mark.parametrize(
    ("grade", "message"),
    [
        ({"score": 6}, "essay1: score 6 must be a number from 0 to 5"),
        ({"score": -1}, "essay1: score -1"),
        ({"band": 6.3}, "essay1: band 6.3 must be 0 to 9 in steps of 0.5"),
        ({"band": 10}, "essay1: band 10"),
        ({"criteria": {"x": "high"}}, "essay1: criteria must map names to numbers"),
    ],
)
def test_bad_grades_exit_1(setup, capsys, grade, message):
    tmp_path, rp = setup
    run(rp)
    g = filled(tmp_path, essay1=grade)
    capsys.readouterr()
    assert run(rp, "--grades", str(g)) == 1
    assert message in capsys.readouterr().err


def test_unknown_or_auto_graded_ids_exit_1(setup, capsys):
    tmp_path, rp = setup
    run(rp)
    g = filled(tmp_path, nope={"score": 1}, single1={"score": 1})
    capsys.readouterr()
    assert run(rp, "--grades", str(g)) == 1
    err = capsys.readouterr().err
    assert "nope: no such question needing AI grading" in err
    assert "single1: no such question needing AI grading" in err


def test_wrong_file_exits_2_and_changed_results_warn(setup, capsys):
    tmp_path, rp = setup
    run(rp)
    bad = tmp_path / "bad.json"
    bad.write_text('{"format": "other"}', encoding="utf-8")
    assert run(rp, "--grades", str(bad)) == 2
    g = filled(tmp_path, essay1={"score": 2})
    data = json.loads(g.read_text(encoding="utf-8"))
    data["results_hash"] = "0" * 16
    g.write_text(json.dumps(data), encoding="utf-8")
    capsys.readouterr()
    assert run(rp, "--grades", str(g)) == 0
    assert "different results file" in capsys.readouterr().err


def test_band_questions_never_count_toward_points(tmp_path, capsys):
    p = tmp_path / "ielts.md"
    p.write_text(
        "---\ntitle: W\n---\n\n## Essay {id=e type=essay points=10}\n\nWrite.\n\n"
        "```answer\nscoring: band\nrubric:\n  - Task response: answers it\n```\n",
        encoding="utf-8",
    )
    quiz, _, _ = load_quiz(p)
    rp = tmp_path / "r.json"
    rp.write_text(
        json.dumps(
            make_results(quiz, {"e": {"text": "Cities are big.", "word_count": 3}})
        ),
        encoding="utf-8",
    )
    assert run(rp) == 0
    g = filled(tmp_path, e={"band": 6.5, "criteria": {"Task response": 6.5}})
    assert run(rp, "--grades", str(g)) == 0
    data = json.loads((tmp_path / "r-report.json").read_text(encoding="utf-8"))
    assert (
        data["summary"]["final_earned"] == 0 and data["summary"]["final_possible"] == 0
    )
    assert data["questions"][0]["ai_grading"]["result"]["band"] == 6.5
    assert main(["grade", str(rp), "--grades", str(g)]) == 0
    assert "Overall band: 6.5" in (tmp_path / "r-report.md").read_text(encoding="utf-8")


def test_ungraded_questions_never_get_a_grade(tmp_path, capsys):
    from test_report import MIXED_RESPONSES

    shutil.copy(FIX / "mixed.md", tmp_path / "mixed.md")
    quiz, _, _ = load_quiz(tmp_path / "mixed.md")
    rp = tmp_path / "m.json"
    rp.write_text(
        json.dumps(make_results(quiz, MIXED_RESPONSES, source_file="mixed.md")),
        encoding="utf-8",
    )
    assert run(rp) == 0
    # an ungraded essay is in the report but not in the grades template
    assert not (tmp_path / "m-grades.json").exists()
    report = json.loads((tmp_path / "m-report.json").read_text(encoding="utf-8"))
    validate_report(report)
    assert [x["id"] for x in report["questions"] if x["needs_ai_grading"]] == []
    # naming one in a grades file is an error
    bad = tmp_path / "bad.json"
    bad.write_text(
        json.dumps(
            {
                "format": "fullmark-grades",
                "version": 1,
                "grades": {"why": {"score": 0, "justification": "x"}},
            }
        ),
        encoding="utf-8",
    )
    capsys.readouterr()
    assert run(rp, "--grades", str(bad)) == 1
    assert "why: an ungraded question takes no grade" in capsys.readouterr().err
