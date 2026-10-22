import re

import pytest

from fullmark.blanks import blank_bucket, find_blanks
from fullmark.build import build_html
from fullmark.validate import load_quiz


@pytest.mark.parametrize(
    ("text", "bucket"),
    [
        ("[[abcde]]", "s"),
        ("[[abcdef]]", "m"),
        ("[[abcdefghi]]", "m"),
        ("[[abcdefghij]]", "l"),
        ("[[" + "a" * 15 + "]]", "l"),
        ("[[" + "a" * 16 + "]]", "xl"),
        # every variant counts, not only the first
        ("[[ab|" + "c" * 12 + "]]", "l"),
        # numeric blanks use the formatted value
        ("[[=3.14159]]", "m"),
        ("[[=0.5±0.01]]", "s"),
        # the longest blank in the question decides
        ("[[a]] and [[" + "b" * 20 + "]]", "xl"),
    ],
)
def test_bucket_thresholds(text, bucket):
    assert blank_bucket(find_blanks(text)) == bucket


def test_all_blanks_of_a_question_share_one_class(tmp_path):
    src = tmp_path / "q.md"
    src.write_text(
        "---\ntitle: T\n---\n\n"
        "## Short and long. {id=a type=blanks}\n\nA [[x]] and B [[a very long answer|y]].\n\n"
        "## Only short. {id=b type=blanks}\n\n[[ab]] [[cd]]\n",
        encoding="utf-8",
    )
    quiz, findings, _ = load_quiz(src)
    assert not findings.has_errors
    html = build_html(quiz, tmp_path).html
    classes = re.findall(r"qm-blank (qm-blank-\w+)", html)
    assert classes == ["qm-blank-xl"] * 2 + ["qm-blank-s"] * 2
    assert "maxlength" not in html
