import json
from pathlib import Path

from fullmark.cli import main
from fullmark.validate import load_quiz

FIX = Path(__file__).parent / "fixtures"


def warnings_for(tmp_path, body, front="title: T\n"):
    p = tmp_path / "q.md"
    p.write_text(f"---\n{front}---\n\n{body}", encoding="utf-8")
    _, findings, _ = load_quiz(p)
    return [f.message for f in findings if f.severity == "warning"]


EXPL = "\n> [!explanation]\n> This is the reason the answer holds.\n"


def test_all_of_the_above_and_duplicates(tmp_path):
    body = f"## Q\n\n- [x] a thing\n- [ ] A thing\n- [ ] All of the above\n{EXPL}"
    msgs = warnings_for(tmp_path, body)
    assert any("all/none of the above" in m for m in msgs)
    assert any("repeats" in m for m in msgs)


def test_long_correct_choice_and_stem_giveaway(tmp_path):
    long = "a very long and detailed correct statement that dwarfs the rest"
    body = f"## Q\n\n- [x] {long}\n- [ ] short\n- [ ] tiny\n{EXPL}"
    assert any("much longer" in m for m in warnings_for(tmp_path, body))
    body = f"## Which is the capital of France, the city of paris?\n\n- [x] the city of paris\n- [ ] rome\n{EXPL}"
    assert any("already contains" in m for m in warnings_for(tmp_path, body))


def test_short_explanation(tmp_path):
    body = "## Q\n\n- [x] a\n- [ ] b\n\n> [!explanation]\n> Because.\n"
    assert any("too short" in m for m in warnings_for(tmp_path, body))


def test_answer_position_skew(tmp_path):
    one = f"- [x] aaa\n- [ ] bbb\n- [ ] ccc\n{EXPL}"
    body = "\n".join(f"## Q{i}\n\n{one}" for i in range(9))
    assert any("option A" in m for m in warnings_for(tmp_path, body))
    assert not any(
        "option A" in m
        for m in warnings_for(tmp_path, body, "title: T\nshuffle_choices: true\n")
    )


def test_inspect(tmp_path, capsys):
    assert main(["inspect", str(FIX / "all-types.md"), "--json"]) == 0
    d = json.loads(capsys.readouterr().out)
    assert d["questions"] == 12 and d["types"]["blanks"] == 2
    assert main(["inspect", str(FIX / "all-types.md")]) == 0
    assert "Types:" in capsys.readouterr().out
    assert main(["inspect", str(tmp_path / "missing.md")]) == 2


def test_inspect_shows_ungraded_questions(capsys):
    assert main(["inspect", str(FIX / "mixed.md")]) == 0
    out = capsys.readouterr().out
    assert "3 ungraded" in out and "scale (ungraded) 1" in out
    assert "answer positions: B 1" in out  # only the graded single counts
    assert main(["inspect", str(FIX / "survey.md")]) == 0
    out = capsys.readouterr().out
    assert "survey: nothing is scored" in out and "points" not in out
    assert "answer positions" not in out
    assert main(["inspect", str(FIX / "survey.md"), "--json"]) == 0
    data = json.loads(capsys.readouterr().out)
    assert data["mode"] == "survey" and data["ungraded"] == 8


def test_weak_question_lints_skip_ungraded_questions(tmp_path):
    p = tmp_path / "q.md"
    p.write_text(
        "---\ntitle: T\nmode: survey\n---\n\n"
        "## Pick {type=single}\n\n- [ ] Same\n- [ ] Same\n- [ ] All of the above\n",
        encoding="utf-8",
    )
    _, findings, _ = load_quiz(p)
    assert not findings.has_errors
    assert not list(findings)
