import json
from pathlib import Path

import pytest

from fullmark.cli import main
from fullmark.validate import load_quiz

FIX = Path(__file__).parent / "fixtures"
EXPECTED = json.loads((FIX / "invalid" / "expected.json").read_text(encoding="utf-8"))


def test_all_types_fixture_is_clean():
    quiz, findings, _ = load_quiz(FIX / "all-types.md")
    assert not findings.has_errors, [f.format() for f in findings]
    assert [q.type for q in quiz.questions] == [
        "single", "multi", "truefalse", "numeric", "short",
        "blanks", "blanks", "fields", "essay", "code",
        "ordering", "matching",
    ]  # fmt: skip
    assert [s.title for s in quiz.sections] == [
        "Choices",
        "Typed answers",
        "Written work",
        "Order and match",
    ]
    assert quiz.sections[0].time == "5m"
    assert quiz.meta.time_limit_seconds == 1200
    blanks1 = quiz.questions[5]
    assert len(blanks1.blanks) == 2 and blanks1.blanks[1]["numeric"]
    assert len(quiz.questions[6].blanks) == 1
    assert [f.kind for f in quiz.questions[7].spec.fields] == [
        "text",
        "numeric",
        "none",
    ]
    assert quiz.questions[8].spec.rubric[0].startswith("Task achievement: ")


def test_type_inference():
    quiz, _, _ = load_quiz(FIX / "all-types.md")
    assert quiz.questions[0].type == "single"
    assert quiz.questions[1].choices[0].correct


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_invalid_fixture(name):
    _, findings, _ = load_quiz(FIX / "invalid" / f"{name}.md")
    want = EXPECTED[name]
    errors = [f for f in findings if f.severity == "error"]
    hits = [f for f in errors if want["message"] in f.message]
    assert hits, (
        f"{name}: no error containing {want['message']!r}; got {[f.format() for f in errors]}"
    )
    # an answer block's content starts on the line after the fence
    assert any(f.line in (want["line"], want["line"] + 1) for f in hits), [
        f.format() for f in hits
    ]


def test_cli_exit_codes(tmp_path, capsys):
    assert main(["check", str(FIX / "all-types.md")]) == 0
    assert main(["check", str(FIX / "invalid" / "unknown-type.md")]) == 1
    assert main(["check", str(tmp_path / "missing.md")]) == 2


def test_cli_json(capsys):
    main(["check", "--json", str(FIX / "invalid" / "numeric-not-number.md")])
    data = json.loads(capsys.readouterr().out)
    err = next(d for d in data if d["severity"] == "error")
    assert err["file"] == "numeric-not-number.md"
    assert err["question"] == "q1 (numeric)"
    assert set(err) == {"file", "line", "severity", "question", "message"}


def test_warnings_do_not_fail(tmp_path):
    p = tmp_path / "w.md"
    p.write_text(
        "---\ntitle: T\n---\n\n## Q\n\n![](a.png)\n\n- [x] a\n- [ ] b\n",
        encoding="utf-8",
    )
    (tmp_path / "a.png").write_bytes(b"x")
    _, findings, _ = load_quiz(p)
    assert not findings.has_errors
    msgs = [f.message for f in findings]
    assert "no explanation" in msgs and any("empty alt" in m for m in msgs)
    assert main(["check", str(p)]) == 0


def test_essay_and_code_without_rubric_warn(tmp_path):
    p = tmp_path / "e.md"
    p.write_text(
        "---\ntitle: T\n---\n\n## E {type=essay}\n\nWrite.\n\n## C {type=code}\n\n```answer\nlanguage: python\n```\n",
        encoding="utf-8",
    )
    _, findings, _ = load_quiz(p)
    assert not findings.has_errors
    assert sum("without a rubric" in f.message for f in findings) == 2


def test_blank_outside_code_only(tmp_path):
    p = tmp_path / "c.md"
    p.write_text(
        "---\ntitle: T\n---\n\n## Q {type=short}\n\n```python\nm = [[1, 2], [3, 4]]\n```\n\n```answer\naccept: [x]\n```\n",
        encoding="utf-8",
    )
    _, findings, _ = load_quiz(p)
    assert not findings.has_errors


def test_crlf_source(tmp_path):
    p = tmp_path / "crlf.md"
    p.write_bytes(b"---\r\ntitle: T\r\n---\r\n\r\n## Q\r\n\r\n- [x] a\r\n- [ ] b\r\n")
    quiz, findings, _ = load_quiz(p)
    assert not findings.has_errors and len(quiz.questions[0].choices) == 2


def test_strict_turns_warnings_into_failures(tmp_path, capsys):
    warn = tmp_path / "w.md"
    warn.write_text(
        "---\ntitle: T\n---\n\n## Q\n\n- [x] a\n- [ ] b\n", encoding="utf-8"
    )
    clean = tmp_path / "ok.md"
    clean.write_text(
        "---\ntitle: T\n---\n\n## Q\n\n- [x] a\n- [ ] b\n\n> [!explanation]\n> Because b is the only consistent option.\n",
        encoding="utf-8",
    )
    assert main(["check", str(warn)]) == 0
    assert main(["check", str(warn), "--strict"]) == 1
    assert main(["check", str(clean), "--strict"]) == 0
    capsys.readouterr()
    assert main(["check", str(warn), "--strict", "--json"]) == 1
    assert isinstance(
        json.loads(capsys.readouterr().out), list
    )  # JSON shape is unchanged

    out = warn.with_suffix(".html")
    assert main(["build", str(warn), "--strict"]) == 1
    assert not out.exists()  # nothing written
    assert main(["build", str(warn)]) == 0 and out.exists()
    assert main(["build", str(clean), "--strict"]) == 0


SURVEY_OK = """---
title: Check-in
mode: survey
---

# Habits

## How do you study? {id=how}

- [ ] Alone
- [ ] With friends
- [ ] Both

## Which help? {type=multi}

- [ ] Notes
- [ ] Videos

## Confidence {type=scale}

```answer
min: 1
max: 7
labels:
  1: Low
  7: High
```

## Rank these {type=ordering}

1. Sleep
2. Exercise
3. Study

## Details {type=fields}

```answer
fields:
  - label: Course
  - label: Year
```

## Comments {type=essay}

Anything else?
"""


def _load(tmp_path, text):
    p = tmp_path / "q.md"
    p.write_text(text, encoding="utf-8")
    return load_quiz(p)


def test_survey_file_is_clean(tmp_path):
    quiz, findings, _ = _load(tmp_path, SURVEY_OK)
    assert not findings.has_errors, [f.format() for f in findings]
    assert quiz.meta.mode == "survey"
    assert all(q.ungraded for q in quiz.questions)
    assert [q.type for q in quiz.questions] == [
        "single", "multi", "scale", "ordering", "fields", "essay",
    ]  # fmt: skip
    assert quiz.total_points == 0
    scale = quiz.questions[2].spec
    assert (scale.min, scale.max, scale.labels) == (1, 7, {1: "Low", 7: "High"})
    # no "no explanation" or rubric warnings on ungraded questions
    assert not [
        f for f in findings if "explanation" in f.message or "rubric" in f.message
    ]


def test_graded_false_in_a_quiz(tmp_path):
    text = (
        "---\ntitle: T\n---\n\n"
        "## Sure? {graded=false points=3}\n\n- [ ] Yes\n- [ ] No\n- [ ] Unsure\n\n"
        "## Real\n\n- [x] a\n- [ ] b\n\n> [!explanation]\n> Because a is the only option.\n"
    )
    quiz, findings, _ = _load(tmp_path, text)
    assert not findings.has_errors, [f.format() for f in findings]
    first, second = quiz.questions
    assert first.ungraded and first.type == "single" and first.points == 0
    assert not second.ungraded and second.points == 1
    assert quiz.total_points == 1
    assert any("no points" in f.message for f in findings)
    assert not any(
        f.question and "q1" in f.question and f.message == "no explanation"
        for f in findings
    )


def test_ungraded_warnings(tmp_path):
    text = (
        "---\ntitle: T\nmode: survey\n---\n\n"
        "## Two {type=single}\n\n- [ ] Yes\n- [ ] No\n\n"
        "## Bare scale {type=scale}\n"
    )
    _, findings, _ = _load(tmp_path, text)
    msgs = [f.message for f in findings if f.severity == "warning"]
    assert any("fewer than three choices" in m for m in msgs)
    assert any("scale without labels" in m for m in msgs)
    # an ungraded multi with no "none" option is not a warning
    text = "---\ntitle: T\nmode: survey\n---\n\n## M {type=multi}\n\n- [ ] a\n- [ ] b\n"
    _, findings, _ = _load(tmp_path, text)
    assert not list(findings)


def test_scale_defaults(tmp_path):
    text = "---\ntitle: T\n---\n\n## S {type=scale}\n"
    quiz, findings, _ = _load(tmp_path, text)
    assert not findings.has_errors
    assert (quiz.questions[0].spec.min, quiz.questions[0].spec.max) == (1, 5)


def _parse(tmp_path, body, head="---\ntitle: T\n---\n\n"):
    f = tmp_path / "q.md"
    f.write_text(head + body, encoding="utf-8", newline="\n")
    return load_quiz(f)


def test_input_marker_is_stripped_and_kept_as_a_prompt(tmp_path):
    quiz, findings, _ = _parse(
        tmp_path,
        '## Q\n\n- [x] A\n- [ ] Plain\n- [ ] Else {input}\n- [ ] Other {input="What is it?"}\n',
    )
    assert not findings.has_errors
    c = quiz.questions[0].choices
    assert [x.md for x in c] == ["A", "Plain", "Else", "Other"]
    assert [x.input for x in c] == [None, None, "Please specify", "What is it?"]


def test_input_works_with_correct_mark_survey_and_multi(tmp_path):
    quiz, findings, _ = _parse(
        tmp_path,
        "## Q {type=multi}\n\n- [x] A {input}\n- [x] B\n- [ ] C\n",
    )
    assert not findings.has_errors and quiz.questions[0].choices[0].correct
    quiz, findings, _ = _parse(
        tmp_path,
        '## Q\n\n- [ ] A\n- [ ] B\n- [ ] Else {input="Which?"}\n',
        head="---\ntitle: T\nmode: survey\n---\n\n",
    )
    assert not findings.has_errors and quiz.questions[0].choices[2].input == "Which?"


def test_input_in_the_middle_of_a_line_is_plain_text(tmp_path):
    quiz, findings, _ = _parse(tmp_path, "## Q\n\n- [x] use {input} here\n- [ ] b\n")
    assert not findings.has_errors
    assert quiz.questions[0].choices[0].input is None
