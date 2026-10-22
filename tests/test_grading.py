import json
from pathlib import Path

import pytest

from fullmark.grading import (
    grade_question,
    grading_spec,
    match_text,
    normalize_text,
    round2,
    score_attempt,
)
from fullmark.numparse import has_comma_decimal, parse_number
from fullmark.validate import load_quiz

HERE = Path(__file__).parent
CASES = json.loads((HERE / "grading_cases.json").read_text(encoding="utf-8"))


def test_enough_cases():
    assert len(CASES) >= 60
    assert {c["type"] for c in CASES} == {
        "single", "multi", "truefalse", "numeric", "short", "blanks", "fields", "essay", "code",
        "ordering", "matching", "scale",
    }  # fmt: skip


@pytest.mark.parametrize("c", CASES, ids=[c["name"] for c in CASES])
def test_golden_case(c):
    got = grade_question(c["type"], c["spec"], c["response"])
    assert got["status"] == c["expected_status"]
    if c["expected_earned"] is None:
        assert got["earned"] is None
    else:
        assert got["earned"] == pytest.approx(c["expected_earned"], abs=1e-9)
    if "expected_results" in c:
        assert got["results"] == c["expected_results"]


def test_round2_half_up():
    assert round2(0.125) == 0.13
    assert round2(1 / 3) == 0.33
    assert round2(2 / 3) == 0.67


def test_normalize_and_match():
    assert normalize_text("  A \n b ", "insensitive") == "a b"
    assert normalize_text("  A \n b ", "sensitive") == "A b"
    assert not match_text("", ["x"], [], "insensitive")


def test_parse_number():
    assert parse_number("1/4") == 0.25
    assert parse_number("1e-3") == 0.001
    assert parse_number("1,5") is None and has_comma_decimal("1,5")
    assert parse_number("1/0") is None
    assert parse_number("0x10") is None
    assert parse_number("") is None


def test_grading_spec_and_attempt_from_fixture():
    quiz, _, _ = load_quiz(HERE / "fixtures" / "all-types.md")
    by_id = {q.id: q for q in quiz.questions}
    assert grading_spec(by_id["single1"], quiz)["correct"] == 1
    assert grading_spec(by_id["multi1"], quiz)["correct"] == [0, 2]
    assert grading_spec(by_id["multi1"], quiz)["scoring"] == "partial"
    fields = grading_spec(by_id["fields1"], quiz)["fields"]
    assert [f["kind"] for f in fields] == ["text", "numeric", "none"]
    assert grading_spec(by_id["essay1"], quiz)["min_words"] == 5

    responses = {
        "single1": {"choice": 1},
        "multi1": {"choices": [0]},
        "tf1": {"value": True},
        "num1": {"raw": "1/3"},
        "short1": {"text": "3"},
        "blanks1": {"blanks": ["cos x", "0.5"]},
        "blanks2": {"blanks": ["mut"]},
        "fields1": {"fields": ["3x^2-3", "2", "notes"]},
        "essay1": {"text": "A high beep.", "word_count": 3},
        "ord1": {"order": [1, 0, 2, 3]},
        "match1": {"pairs": [0, 1, 2]},
    }
    out = score_attempt(quiz, responses)
    pq = out["per_question"]
    assert pq["multi1"]["status"] == "partial" and pq["multi1"]["earned"] == 1
    assert pq["essay1"]["status"] == "pending"
    assert pq["code1"]["status"] == "unanswered"
    s = out["score"]
    assert pq["ord1"]["status"] == "partial" and pq["ord1"]["earned"] == 1
    assert pq["ord1"]["results"] == [False, False, True, True]
    assert pq["match1"]["status"] == "correct" and pq["match1"]["earned"] == 3
    # auto points: 1+2+1+1+1+2+1+3 = 12, plus ordering 2 and matching 3 = 17
    # earned: 1+1+1+1+1+2+1+3 = 11, plus 1 and 3 = 15
    assert s["possible_auto"] == 17 and s["earned"] == 15
    assert s["pending_points"] == 8 and s["possible_total"] == 25
    assert s["percent_auto"] == 88.24 and s["passed"] is True


def test_ungraded_questions_stay_out_of_every_total(tmp_path):
    p = tmp_path / "q.md"
    p.write_text(
        "---\ntitle: T\n---\n\n"
        "## Sure? {graded=false}\n\n- [ ] Yes\n- [ ] No\n- [ ] Unsure\n\n"
        "## Confidence {type=scale}\n\n"
        "## Real\n\n- [x] a\n- [ ] b\n\n> [!explanation]\n> Because a is the only option.\n"
        "\n## Notes {type=essay graded=false}\n",
        encoding="utf-8",
    )
    quiz, findings, _ = load_quiz(p)
    assert not findings.has_errors, [f.format() for f in findings]
    spec = grading_spec(quiz.questions[0], quiz)
    assert spec["ungraded"] is True and "correct" not in spec
    assert grading_spec(quiz.questions[1], quiz)["max"] == 5
    out = score_attempt(
        quiz,
        {
            "q1": {"choice": 2},
            "q2": {"value": 4},
            "q3": {"choice": 0},
            "q4": {"text": "free text", "word_count": 2},
        },
    )
    pq = out["per_question"]
    assert [pq[i]["status"] for i in ("q1", "q2", "q4")] == ["ungraded"] * 3
    assert pq["q1"]["earned"] is None and pq["q3"]["status"] == "correct"
    s = out["score"]
    assert (s["earned"], s["possible_auto"], s["pending_points"]) == (1, 1, 0)
    assert s["possible_total"] == 1 and s["percent_auto"] == 100
