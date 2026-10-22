import json

import pytest
from helpers import SCHEMAS
from jsonschema import Draft202012Validator
from test_brief import FLAGS, run
from test_report import make_results

from fullmark.build import build_html
from fullmark.cli import main
from fullmark.review import new_review
from fullmark.validate import load_quiz

QUIZ = (
    "---\ntitle: T\ngenerated_by: claude-opus-5-5\n---\n\n"
    "## Is 1 a number? {type=truefalse}\n\n```answer\nvalue: true\n```\n\n"
    "> [!explanation]\n> Yes, every integer is a number, so the key is true.\n"
)


def load(tmp_path, text=QUIZ):
    p = tmp_path / "quiz.md"
    p.write_text(text, encoding="utf-8")
    return p, load_quiz(p)


def test_parses_and_strips(tmp_path):
    _, (quiz, found, _) = load(tmp_path)
    assert not found.has_errors and quiz.meta.generated_by == "claude-opus-5-5"


@pytest.mark.parametrize("value", ['""', "12", "[x]"])
def test_bad_values_are_errors(tmp_path, value):
    _p, (_, found, _) = load(tmp_path, QUIZ.replace("claude-opus-5-5", value, 1))
    assert found.has_errors


def test_results_report_review_and_inspect(tmp_path, capsys):
    p, (quiz, _, _) = load(tmp_path)
    results = make_results(quiz)
    results["quiz"]["generated_by"] = quiz.meta.generated_by
    schema = json.loads(
        (SCHEMAS / "results-v1.schema.json").read_text(encoding="utf-8")
    )
    Draft202012Validator(schema).validate(results)
    assert new_review(quiz)["quiz"]["generated_by"] == "claude-opus-5-5"
    r = tmp_path / "r.json"
    r.write_text(json.dumps(results), encoding="utf-8")
    assert main(["grade", str(r), "--quiz", str(p), "--json"]) == 0
    rep = json.loads((tmp_path / "r-report.json").read_text(encoding="utf-8"))
    assert rep["quiz"]["generated_by"] == "claude-opus-5-5"
    capsys.readouterr()
    assert main(["inspect", str(p), "--json"]) == 0
    assert json.loads(capsys.readouterr().out)["generated_by"] == "claude-opus-5-5"
    assert main(["inspect", str(p)]) == 0
    assert "Written by: claude-opus-5-5" in capsys.readouterr().out


def test_page_data_carries_it(tmp_path):
    _, (quiz, _, _) = load(tmp_path)
    assert "claude-opus-5-5" in build_html(quiz, tmp_path).html


def test_check_info_when_brief_lacks_it(tmp_path, capsys):
    d = tmp_path / "q"
    assert (
        run(
            capsys,
            d,
            *FLAGS,
            "--count",
            1,
            "--mix",
            "recall",
            "--elsewhere",
            "the wiki",
        )[0]
        == 0
    )
    (d / "quiz.md").write_text(
        QUIZ.replace("generated_by: claude-opus-5-5\n", ""), encoding="utf-8"
    )
    code = main(["check", str(d / "quiz.md"), "--json", "--strict"])
    found = json.loads(capsys.readouterr().out)
    assert code == 0
    assert ("brief.generated-by", "info") in [(f["rule"], f["severity"]) for f in found]
    (d / "quiz.md").write_text(QUIZ, encoding="utf-8")
    main(["check", str(d / "quiz.md"), "--json"])
    assert "brief.generated-by" not in capsys.readouterr().out
