"""Follow-up text on choices ({input}) in grading and reports."""

import json
import shutil
from pathlib import Path

from helpers import validate_report, validate_results
from test_report import make_results

from fullmark.cli import main
from fullmark.grading import score_attempt
from fullmark.report import make_report, make_report_json
from fullmark.validate import load_quiz

FIX = Path(__file__).parent / "fixtures"

BASE: dict[str, dict | None] = {
    "capital": {"choice": 1},
    "primes": {"choices": [0, 1]},
    "where": {"choice": 2},
    "plain": {"choice": 0},
}
WITH_TEXT: dict[str, dict | None] = {
    "capital": {"choice": 1, "inputs": {"1": "it is the capital"}},
    "primes": {"choices": [0, 1], "inputs": {"1": "5"}},
    "where": {"choice": 2, "inputs": {"2": "a hackathon"}},
    "plain": {"choice": 0},
}


def _results(responses):
    quiz, findings, _ = load_quiz(FIX / "followup.md")
    assert not findings.has_errors
    res = make_results(quiz, responses, source_file="followup.md")
    validate_results(res)
    return quiz, res


def test_text_never_changes_the_score():
    quiz, _ = _results(BASE)
    a = score_attempt(quiz, BASE)
    b = score_attempt(quiz, WITH_TEXT)
    assert a["score"] == b["score"]
    assert {k: v["status"] for k, v in a["per_question"].items()} == {
        k: v["status"] for k, v in b["per_question"].items()
    }


def test_markdown_report_shows_the_choice_with_its_text():
    wrong = {**WITH_TEXT, "capital": {"choice": 2, "inputs": {"2": "Berlin"}}}
    quiz, res = _results(wrong)
    md = make_report(res, quiz, [])
    assert "C. Something else: Berlin" in md  # Review these
    assert "Other: a hackathon" in md  # the Answers section
    # without text the old output is unchanged
    quiz, res = _results({**BASE, "capital": {"choice": 2}})
    md = make_report(res, quiz, [])
    assert "C. Something else" in md and "Something else:" not in md


def test_json_report_has_answer_text_and_raw_inputs():
    quiz, res = _results(WITH_TEXT)
    data = make_report_json(res, quiz, [])
    validate_report(data)
    by_id = {x["id"]: x for x in data["questions"]}
    assert by_id["where"]["answer_text"] == "Other: a hackathon"
    assert by_id["where"]["inputs"] == {"2": "a hackathon"}
    assert by_id["where"]["response"] == {"choice": 2, "inputs": {"2": "a hackathon"}}
    assert by_id["capital"]["your_answer"] == "B. Paris: it is the capital"
    assert by_id["capital"]["answer_text"] == "Paris: it is the capital"
    assert by_id["primes"]["answer_text"] == "2; 3: 5"
    assert "inputs" not in by_id["plain"]
    # questions without text keep their old shape
    quiz, res = _results(BASE)
    data = make_report_json(res, quiz, [])
    assert all("inputs" not in x for x in data["questions"])
    assert "answer_text" not in {x["id"]: x for x in data["questions"]}["capital"]


def test_text_for_an_unselected_choice_is_ignored_by_the_report():
    stray = {**BASE, "where": {"choice": 0, "inputs": {"2": "left over"}}}
    quiz, res = _results(stray)
    md = make_report(res, quiz, [])
    assert "left over" not in md
    data = make_report_json(res, quiz, [])
    where = {x["id"]: x for x in data["questions"]}["where"]
    assert where["answer_text"] == "Home"


def test_quiz_grade_cli_reads_the_text(tmp_path, capsys):
    shutil.copy(FIX / "followup.md", tmp_path / "followup.md")
    _quiz, res = _results(WITH_TEXT)
    f = tmp_path / "results.json"
    f.write_text(json.dumps(res), encoding="utf-8")
    capsys.readouterr()
    assert (
        main(["grade", str(f), "--quiz", str(tmp_path / "followup.md"), "--json"]) == 0
    )
    capsys.readouterr()
    report = json.loads((tmp_path / "results-report.json").read_text(encoding="utf-8"))
    where = {x["id"]: x for x in report["questions"]}["where"]
    assert where["answer_text"] == "Other: a hackathon"
    assert main(["grade", str(f), "--quiz", str(tmp_path / "followup.md")]) == 0
    assert "Other: a hackathon" in (tmp_path / "results-report.md").read_text(
        encoding="utf-8"
    )


def test_stats_answers_over_time_show_the_choice_text_only(tmp_path, capsys):
    shutil.copy(FIX / "followup.md", tmp_path / "followup.md")
    quiz, _ = _results(BASE)
    paths = []
    for i, resp in enumerate(({"where": {"choice": 2}}, WITH_TEXT)):
        res = make_results(
            quiz,
            resp,
            source_file="followup.md",
            started_at=f"2026-10-0{i + 1}T10:00:00Z",
        )
        p = tmp_path / f"s{i}.json"
        p.write_text(json.dumps(res), encoding="utf-8")
        paths.append(str(p))
    capsys.readouterr()
    assert main(["stats", *paths, "--quiz", str(tmp_path / "followup.md")]) == 0
    out = capsys.readouterr().out
    assert "| Where do you study? | Other | Other |" in out
    assert "hackathon" not in out
    assert main(["stats", *paths, "--json"]) == 0
    assert "hackathon" not in capsys.readouterr().out
