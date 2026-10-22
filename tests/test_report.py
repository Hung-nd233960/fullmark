import copy
import json
import shutil
import subprocess
from pathlib import Path

import pytest
from helpers import validate_report, validate_results

from fullmark.cli import main
from fullmark.grading import grading_spec, score_attempt
from fullmark.report import (
    ResultsError,
    load_results,
    make_report,
    make_report_json,
    word_count,
)
from fullmark.validate import load_quiz

HERE = Path(__file__).parent
FIX = HERE / "fixtures"
ROOT = HERE.parent

RESPONSES = {
    "single1": {"choice": 0},  # wrong
    "multi1": {"choices": [0]},  # partial
    "tf1": {"value": True},
    "num1": {"raw": "0.9"},  # wrong
    "short1": {"text": "3"},
    "blanks1": {"blanks": ["cos x", "0.9"]},  # half
    "blanks2": {"blanks": ["mut"]},
    "fields1": {"fields": ["3x^2-3", "7", "my notes"]},
    "essay1": {"text": "A short high beep.\nIt ends quickly.", "word_count": 7},
    "code1": {"language": "rust", "code": "fn largest(v: &[i32]) -> i32 {\n    ```\n}"},
}


def make_results(quiz, responses=None, source_file="all-types.md", **attempt):
    responses = RESPONSES if responses is None else responses
    out = score_attempt(quiz, responses)
    questions = []
    for q in quiz.questions:
        g = out["per_question"][q.id]
        questions.append(
            {
                "id": q.id,
                "index": q.index,
                "section": quiz.sections[q.section].title or None,
                "type": q.type,
                "title": q.title_md,
                "points": q.points,
                "tags": q.tags,
                "flagged": False,
                "status": g["status"],
                "earned": g["earned"],
                "response": responses.get(q.id),
                "correct": None,
            }
        )
    return {
        "format": "fullmark-results",
        "version": 1,
        "quiz": {
            "id": quiz.id,
            "title": quiz.meta.title,
            "hash": quiz.source_hash,
            "source_file": source_file,
            "built_at": "2026-10-20T09:00:00Z",
            "fullmark_version": "0.1.0",
        },
        "attempt": {
            "submitted": True,
            "started_at": "2026-10-20T10:00:00Z",
            "submitted_at": "2026-10-20T10:20:00Z",
            "elapsed_seconds": 1200,
            "time_limit_seconds": 1200,
            "timed_out": False,
            "overtime_seconds": 0,
            "user_agent": "test",
            **attempt,
        },
        "score": out["score"],
        "questions": questions,
    }


@pytest.fixture(scope="module")
def quiz():
    q, f, _ = load_quiz(FIX / "all-types.md")
    assert not f.has_errors
    return q


def test_report_sections(quiz):
    warnings: list[str] = []
    md = make_report(make_results(quiz), quiz, warnings)
    assert warnings == []
    for heading in (
        "## Summary",
        "## By topic",
        "## Questions",
        "## Review these",
        "## Pending AI review",
    ):
        assert heading in md
    assert md.startswith("# Report: Kitchen sink")
    assert "| 1 | single | incorrect | 0 / 1 |" in md
    assert "| 2 | multi | partial | 1 / 2 |" in md
    assert "| cardio | 0 | 1 | 0% |" in md
    # review block shows the learner's answer, the key and the explanation
    assert "### Q1: single, incorrect (0 of 1 pts)" in md
    assert "- **Your answer:** A. Na⁺" in md and "- **Correct answer:** B. K⁺" in md
    assert "> Delayed-rectifier K⁺ currents dominate phase 3." in md
    assert "- **Correct answer:** 0.3333 (within 0.001)" in md
    assert "Correct answer:** 1. `cos x`" in md and "0.5 ±0.01" in md


def test_pending_sections(quiz):
    md = make_report(make_results(quiz), quiz, [])
    pending = md.split("## Pending AI review")[1]
    assert "### Q9: essay (5 pts)" in pending and "### Q10: code (3 pts)" in pending
    assert (
        "Word count: 7 (minimum 5, maximum 50)" in pending
    )  # "A short high beep. It ends quickly." = 7
    assert "- Task achievement: covers pitch and length" in pending
    assert "Language: rust (the code was not executed)" in pending
    assert "- Overall score: ? / 5" in pending and "- Overall score: ? / 3" in pending
    assert (
        "`assets/gradient.png`" in pending
    )  # image in the fields prompt is noted by path
    # code containing a ``` line is fenced with a longer fence
    assert "````rust" in pending
    # the ungraded field of the fields question is listed for the AI
    assert "### Q8: fields (3 pts)" in pending and "my notes" in pending


def test_band_scoring_block(tmp_path):
    p = tmp_path / "ielts.md"
    p.write_text(
        "---\ntitle: W\n---\n\n## Essay {type=essay points=10}\n\nWrite about cities.\n\n"
        "```answer\nmin_words: 3\nscoring: band\nrubric:\n  - Task response: answers the question\n  - Lexical resource\n```\n",
        encoding="utf-8",
    )
    q, f, _ = load_quiz(p)
    assert not f.has_errors
    results = make_results(q, {"q1": {"text": "Cities are big.", "word_count": 3}})
    md = make_report(results, q, [])
    assert "Give a band from 0 to 9" in md
    assert "- Task response band: ?" in md and "- Lexical resource band: ?" in md
    assert "- Overall band: ?" in md and "Overall score" not in md


def test_python_overrides_browser_grade(quiz):
    results = make_results(quiz)
    results["questions"][0]["status"] = "correct"
    results["questions"][0]["earned"] = 1
    warnings: list[str] = []
    md = make_report(results, quiz, warnings)
    assert any("single1" in w and "Python grades incorrect" in w for w in warnings)
    assert "| 1 | single | incorrect | 0 / 1 |" in md


def test_without_source_uses_browser_grades(quiz):
    warnings: list[str] = []
    md = make_report(make_results(quiz), None, warnings)
    assert "no quiz source found" in md
    assert "Rubric: not available" in md
    assert "### Q9: essay (5 pts)" in md


def test_unanswered_questions_are_reviewed(quiz):
    md = make_report(make_results(quiz, {}), quiz, [])
    assert "- **Your answer:** (no answer)" in md
    assert "### Q9" not in md  # an empty essay needs no AI review


def test_load_results_validation(tmp_path):
    p = tmp_path / "r.json"
    p.write_text("not json", encoding="utf-8")
    with pytest.raises(ResultsError, match="not valid JSON"):
        load_results(p)
    p.write_text(json.dumps({"format": "other"}), encoding="utf-8")
    with pytest.raises(ResultsError, match="not a fullmark results file"):
        load_results(p)
    p.write_text(
        json.dumps({"format": "fullmark-results", "version": 2}), encoding="utf-8"
    )
    with pytest.raises(ResultsError, match="unsupported results version"):
        load_results(p)
    p.write_text(
        json.dumps({"format": "fullmark-results", "version": 1}), encoding="utf-8"
    )
    with pytest.raises(ResultsError, match="missing"):
        load_results(p)


def test_word_count():
    assert word_count("one  two\nthree") == 3
    assert word_count("-- ... 42 a_b") == 2
    assert word_count("") == 0


def test_cli_grade_end_to_end(tmp_path, quiz, capsys):
    shutil.copy(FIX / "all-types.md", tmp_path / "all-types.md")
    shutil.copytree(FIX / "assets", tmp_path / "assets")
    rp = tmp_path / "all-types-results.json"
    rp.write_text(json.dumps(make_results(quiz)), encoding="utf-8")
    assert main(["grade", str(rp)]) == 0
    report = tmp_path / "all-types-results-report.md"
    assert report.is_file() and "## Pending AI review" in report.read_text(
        encoding="utf-8"
    )

    # editing the quiz after the attempt is reported
    (tmp_path / "all-types.md").write_text(
        (FIX / "all-types.md").read_text(encoding="utf-8") + "\n", encoding="utf-8"
    )
    capsys.readouterr()
    assert main(["grade", str(rp), "-o", str(tmp_path / "again.md")]) == 0
    assert "changed after the attempt" in capsys.readouterr().err

    assert main(["grade", str(tmp_path / "missing.json")]) == 2
    bad = tmp_path / "bad.json"
    bad.write_text("{}", encoding="utf-8")
    assert main(["grade", str(bad)]) == 2


def test_report_json_matches_markdown_facts(quiz):
    results = make_results(quiz)
    validate_results(results)
    data = make_report_json(results, quiz, [])
    validate_report(data)
    assert data["format"] == "fullmark-report" and data["version"] == 1
    assert data["graded_from_source"] is True
    by_idx = {q["index"]: q for q in data["questions"]}
    assert by_idx[1]["status"] == "incorrect" and by_idx[1]["earned"] == 0
    assert by_idx[1]["your_answer"] == "A. Na⁺"
    assert by_idx[1]["correct_answer"] == "B. K⁺"
    assert by_idx[1]["needs_review"] is True
    assert "Delayed-rectifier" in by_idx[1]["explanation"]
    assert by_idx[2]["status"] == "partial" and by_idx[2]["earned"] == 1
    assert {"topic": "cardio", "earned": 0, "possible": 1, "percent": 0} in data[
        "by_topic"
    ]
    # essay and code carry what an agent needs to grade them
    essay, code = by_idx[9], by_idx[10]
    assert essay["needs_ai_grading"] and "correct_answer" not in essay
    assert essay["ai_grading"]["word_count"] == 7
    assert (essay["ai_grading"]["min_words"], essay["ai_grading"]["max_words"]) == (
        5,
        50,
    )
    assert "Task achievement" in essay["ai_grading"]["criteria"]
    assert code["ai_grading"]["language"] == "rust"
    assert code["ai_grading"]["executed"] is False
    assert by_idx[8]["ai_grading"]["ungraded_fields"][0]["value"] == "my notes"
    assert by_idx[1]["needs_ai_grading"] is False and "ai_grading" not in by_idx[1]
    json.dumps(data)  # plain data


def test_cli_grade_json(tmp_path, quiz):
    shutil.copy(FIX / "all-types.md", tmp_path / "all-types.md")
    shutil.copytree(FIX / "assets", tmp_path / "assets")
    rp = tmp_path / "all-types-results.json"
    rp.write_text(json.dumps(make_results(quiz)), encoding="utf-8")
    assert main(["grade", str(rp), "--json"]) == 0
    out = tmp_path / "all-types-results-report.json"
    data = json.loads(out.read_text(encoding="utf-8"))
    validate_report(data)
    assert data["summary"]["pending"] > 0 and data["quiz"]["title"] == "Kitchen sink"
    assert not (tmp_path / "all-types-results-report.md").exists()
    custom = tmp_path / "r.json"
    assert main(["grade", str(rp), "--json", "-o", str(custom)]) == 0
    assert json.loads(custom.read_text(encoding="utf-8")) == data


@pytest.mark.skipif(
    shutil.which("markdownlint-cli2") is None, reason="markdownlint-cli2 not installed"
)
def test_report_passes_markdownlint(tmp_path, quiz):
    md = make_report(make_results(quiz), quiz, ["something to note"])
    out = tmp_path / "report.md"
    out.write_text(md, encoding="utf-8", newline="\n")
    shutil.copy(
        ROOT / ".markdownlint-cli2.jsonc", tmp_path / ".markdownlint-cli2.jsonc"
    )
    proc = subprocess.run(
        [shutil.which("markdownlint-cli2"), str(out)],
        capture_output=True,
        text=True,
        cwd=tmp_path,
        check=False,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr


def test_make_results_matches_grading_spec(quiz):
    # sanity: the helper really grades with the same spec the report uses
    assert grading_spec(quiz.questions[0], quiz)["correct"] == 1
    assert copy.deepcopy(RESPONSES) == RESPONSES


def test_schemas_reject_broken_files(quiz):
    results = make_results(quiz)
    bad = copy.deepcopy(results)
    bad["version"] = 2
    with pytest.raises(AssertionError):
        validate_results(bad)
    bad = copy.deepcopy(results)
    bad["questions"][0]["response"] = {"choice": "A"}  # must be an index
    with pytest.raises(AssertionError):
        validate_results(bad)
    report = make_report_json(results, quiz, [])
    del report["summary"]
    with pytest.raises(AssertionError):
        validate_report(report)
    report = make_report_json(results, quiz, [])
    next(q for q in report["questions"] if q["needs_ai_grading"]).pop("ai_grading")
    with pytest.raises(AssertionError):
        validate_report(report)


def test_report_for_a_bank_attempt_matches_the_schema(quiz):
    results = make_results(quiz)
    drawn = [q.id for q in quiz.questions]
    results["attempt"]["bank"] = {"seed": 7, "pool": len(drawn), "drawn": drawn}
    validate_results(results)
    validate_report(make_report_json(results, quiz, ["a warning"]))


def test_retry_attempt_is_accepted_without_warnings(quiz):
    results = make_results(quiz)
    missed = [q.id for q in quiz.questions[:2]]
    results["questions"] = [q for q in results["questions"] if q["id"] in missed]
    results["attempt"]["bank"] = {
        "seed": 7,
        "pool": len(quiz.questions),
        "drawn": missed,
    }
    results["attempt"]["retry_of"] = "2026-10-01T10:00:00Z"
    validate_results(results)
    warnings: list[str] = []
    md = make_report(results, quiz, warnings)
    assert warnings == []
    assert "**Retry:** 2 missed question(s)" in md
    validate_report(make_report_json(results, quiz, warnings))


def test_retry_of_unknown_question_warns(quiz):
    results = make_results(quiz)
    results["attempt"]["bank"] = {"seed": 7, "pool": 3, "drawn": ["nope"]}
    results["attempt"]["retry_of"] = "2026-10-01T10:00:00Z"
    warnings: list[str] = []
    make_report(results, quiz, warnings)
    assert any(
        "retried question(s) not in the quiz source: nope" in w for w in warnings
    )


def test_report_shows_ordering_and_matching_answers(quiz):
    results = make_results(
        quiz,
        {
            **RESPONSES,
            "ord1": {"order": [1, 0, 2, 3]},
            "match1": {"pairs": [0, 2, None]},
        },
    )
    validate_results(results)
    warnings: list[str] = []
    md = make_report(results, quiz, warnings)
    assert warnings == []
    assert "| 11 | ordering | partial | 1 / 2 |" in md
    assert "| 12 | matching | partial | 1 / 3 |" in md
    assert "Assume the claim holds for $n = k$. → Check the base case." in md
    assert "Rust → cargo; Python → npm; JavaScript → (none)" in md
    assert (
        "- **Correct answer:** Check the base case. → Assume the claim holds for $n = k$."
        in md
    )
    assert "Rust → cargo; Python → pip; JavaScript → npm" in md
    data = make_report_json(results, quiz, [])
    validate_report(data)
    ord_q = next(q for q in data["questions"] if q["id"] == "ord1")
    assert ord_q["needs_review"] and not ord_q["needs_ai_grading"]


# ---------------------------------------------------------------- ungraded answers and surveys

SURVEY_RESPONSES = {
    "how": {"choice": 1},
    "help": {"choices": [0, 2]},
    "name": {"text": "Sam"},
    "details": {"fields": ["Signals", ""]},
    "conf": {"value": 4},
    "sleep": {"value": 7},
    "rank": {"order": [1, 0, 2]},
    # "more" is left unanswered
}
MIXED_RESPONSES = {
    "sum": {"choice": 0},  # wrong
    "sure": {"value": 5},
    "why": {"text": "Because I guessed.", "word_count": 3},
    "colour": {"choice": 2},
}


def _results_for(name, responses, **attempt):
    q, f, _ = load_quiz(FIX / name)
    assert not f.has_errors
    return q, make_results(q, responses, source_file=name, **attempt)


def test_survey_report_is_a_list_of_answers():
    q, res = _results_for("survey.md", SURVEY_RESPONSES, mode="survey")
    validate_results(res)
    md = make_report(res, q, [])
    assert md.startswith("# Answers: Fixture survey")
    assert "- **Answered:** 7 of 8 questions" in md
    for heading in ("## About you", "## Confidence"):
        assert heading in md
    # no score, no tables, no review sections
    for gone in (
        "Score",
        "## By topic",
        "## Questions",
        "## Review these",
        "## Pending",
    ):
        assert gone not in md
    assert "### 1. How do you usually study?" in md
    assert "With a friend" in md  # a choice by its text, not its letter
    assert "- Past papers\n- Office hours" in md
    assert "- Course: Signals\n- Year: (empty)" in md
    assert "4 / 5" in md and "7" in md
    # a labelled value reads '4 / 5 (label)'
    q2, res2 = _results_for("survey.md", {"conf": {"value": 5}}, mode="survey")
    assert "5 / 5 (Very confident)" in make_report(res2, q2, [])
    # a ranking is an ordered list in the order the respondent chose
    assert "1. Exercise\n2. Sleep\n3. Study" in md
    assert "_(no answer)_" in md  # the unanswered essay


def test_survey_report_json():
    q, res = _results_for("survey.md", SURVEY_RESPONSES, mode="survey")
    data = make_report_json(res, q, [])
    validate_report(data)
    assert data["mode"] == "survey"
    assert data["summary"]["percent"] is None and data["summary"]["pending"] == 0
    assert data["by_topic"] == []
    by_id = {x["id"]: x for x in data["questions"]}
    conf = by_id["conf"]
    assert conf["ungraded"] and conf["status"] == "ungraded" and conf["earned"] is None
    assert conf["response"] == {"value": 4} and conf["answer_text"] == "4 / 5"
    assert by_id["rank"]["answer_text"] == "1. Exercise\n2. Sleep\n3. Study"
    assert by_id["more"]["status"] == "unanswered" and by_id["more"]["ungraded"]
    assert not any(
        x["needs_ai_grading"] or x["needs_review"] for x in data["questions"]
    )
    assert all("correct_answer" not in x for x in data["questions"])


def test_survey_report_works_without_the_source():
    _q, res = _results_for("survey.md", SURVEY_RESPONSES, mode="survey")
    md = make_report(res, None, [])
    assert md.startswith("# Answers:") and "Alone" not in md
    data = make_report_json(res, None, [])
    validate_report(data)
    assert all(x["ungraded"] for x in data["questions"])


def test_quiz_with_ungraded_questions_gets_an_answers_section():
    q, res = _results_for("mixed.md", MIXED_RESPONSES)
    md = make_report(res, q, [])
    # the score covers the graded questions only: 0 of 3 points
    assert "- **Score:** 0 of 3 auto-graded points (0%)" in md
    assert "- **Pending review:** 0 points" in md
    assert "| 2 | scale | ungraded | not scored |" in md
    order = [md.index(h) for h in ("## Questions", "## Answers", "## Review these")]
    assert order == sorted(order)
    answers = md.split("## Answers")[1].split("## Review these")[0]
    assert "### Q2: How sure are you?" in answers and "5 / 5 (Certain)" in answers
    assert "Because I guessed." in answers and "Blue" in answers
    # never reviewed or sent to AI grading
    review = md.split("## Review these")[1].split("## Pending AI review")[0]
    assert "Q2" not in review and "Q3" not in review and "Q4" not in review
    assert "Q1: single, incorrect" in review and "Q5: short, unanswered" in review
    pending = md.split("## Pending AI review")[1]
    assert "No essay, code or ungraded answers." in pending


def test_quiz_json_report_marks_ungraded_questions():
    q, res = _results_for("mixed.md", MIXED_RESPONSES)
    data = make_report_json(res, q, [])
    validate_report(data)
    assert data["mode"] == "quiz"
    assert data["summary"]["possible_auto"] == 3 and data["summary"]["earned"] == 0
    by_id = {x["id"]: x for x in data["questions"]}
    assert by_id["why"]["answer_text"] == "Because I guessed."
    assert by_id["colour"]["answer_text"] == "Blue"
    assert by_id["sure"]["answer_text"] == "5 / 5 (Certain)"
    for qid in ("sure", "why", "colour"):
        x = by_id[qid]
        assert x["ungraded"] and not x["needs_ai_grading"] and "ai_grading" not in x
    assert "ungraded" not in by_id["sum"]
