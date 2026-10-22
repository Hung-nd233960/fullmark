import json
import shutil
import threading
import time
import urllib.error
import urllib.request
from argparse import Namespace
from pathlib import Path

import pytest
from helpers import SCHEMAS
from jsonschema import Draft202012Validator
from test_report import make_results

from fullmark.cli import main, review
from fullmark.review import (
    block_hashes,
    counts,
    items_from_results,
    load_review,
    make_form,
    match_items,
    merge,
    new_review,
    review_findings,
    unseen,
)
from fullmark.validate import load_quiz

ROOT = Path(__file__).parent.parent
EXAMPLES = ROOT / "src" / "fullmark" / "examples"
FIX = Path(__file__).parent / "fixtures"
SCHEMA = json.loads((SCHEMAS / "review-v1.schema.json").read_text(encoding="utf-8"))

QUIZ = """---
title: Review me
id: rv
---

# Part one

## What is 2 + 2? {id=add}

- [ ] 3
- [x] 4

> [!explanation]
> Two plus two is four, because adding two twice counts four units in all.

## Name a prime. {type=short id=prime}

```answer
accept: [2, 3]
```

> [!explanation]
> Both two and three are prime: neither has any divisor other than one and itself.

# Part two

## The sky is blue. {type=truefalse id=sky}

```answer
value: true
```

> [!explanation]
> Air scatters short blue wavelengths far more strongly than long red ones (Rayleigh scattering).
"""


def write_quiz(folder: Path, text: str = QUIZ, name: str = "quiz.md") -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    p = folder / name
    p.write_text(text, encoding="utf-8", newline="\n")
    return p


def load(path: Path):
    quiz, findings, text = load_quiz(path)
    assert quiz is not None and not findings.has_errors, [f.format() for f in findings]
    return quiz, text


def item(quiz_hashes, qid, verdict, text="", problems=(), note=""):
    return {
        "hash": quiz_hashes[qid],
        "verdict": verdict,
        "text": text,
        "problems": list(problems),
        "note": note,
    }


def review_doc(quiz, items):
    doc = new_review(quiz)
    doc["items"] = items
    return doc


def rules(quiz, text, doc):
    return {
        (f.question, f.rule, f.severity)
        for f in review_findings(quiz, text, doc, "quiz.md")
    }


# ---------------------------------------------------------------- the form


@pytest.mark.parametrize("name", [p.name for p in sorted(EXAMPLES.glob("*.md"))])
def test_review_form_passes_check_for_every_example(name, tmp_path):
    shutil.copytree(EXAMPLES / "assets", tmp_path / "assets")
    src = write_quiz(tmp_path, (EXAMPLES / name).read_text(encoding="utf-8"))
    quiz, _ = load(src)
    form, findings, text = make_form(quiz, tmp_path)
    assert form is not None
    assert not list(findings), [f.format() for f in findings]
    assert form.meta.mode == "survey" and form.id == f"{quiz.id}-review"
    # one card (section) per question, with a verdict, problems and a note under each
    assert len(form.sections) == len(quiz.questions)
    assert len(form.questions) == 3 * len(quiz.questions)
    # and it can be written to a file and checked like any quiz
    path = tmp_path / "form.md"
    path.write_text(text, encoding="utf-8")
    assert main(["check", str(path), "--strict"]) == 0


def test_form_shows_the_key_for_every_type():
    quiz, _ = load(EXAMPLES / "blank.md")
    form, findings, text = make_form(quiz, EXAMPLES)
    assert form is not None and not findings.has_errors
    for q in quiz.questions:
        assert f"`{q.id}`" in text
    assert "**Answer key**" in text and "Correct order:" in text
    assert "▁▁▁▁" in text  # blanks are hidden in the question and listed in the key
    assert "[[" not in text.replace(
        "`[[", ""
    )  # nothing left that would parse as a blank


# ---------------------------------------------------------------- hashes and matching


def test_hash_covers_the_block_and_survives_line_endings_and_trailing_blanks(tmp_path):
    quiz, text = load(write_quiz(tmp_path))
    h = block_hashes(quiz, text)
    crlf = text.replace("\n", "\r\n") + "\r\n\r\n"
    quiz2, text2 = load(write_quiz(tmp_path / "b", crlf))
    assert block_hashes(quiz2, text2) == h
    edited = text.replace("- [x] 4", "- [x] four")
    h2 = block_hashes(*load(write_quiz(tmp_path / "c", edited)))
    assert h2["add"] != h["add"] and h2["prime"] == h["prime"] and h2["sky"] == h["sky"]


def test_matching_by_id_then_hash_including_after_reordering():
    hashes = {"q1": "A", "q2": "B", "q3": "C"}
    # review made when the questions were q1=B, q2=A, q3=C: the default ids moved
    items = {
        "q1": {"hash": "B", "verdict": "keep"},
        "q2": {"hash": "A", "verdict": "drop"},
        "q3": {"hash": "C", "verdict": "keep"},
    }
    assert match_items(hashes, items) == {"q1": "q2", "q2": "q1", "q3": "q3"}
    # an edited question keeps its explicit id: matched by id, hash differs
    assert match_items({"x": "NEW"}, {"x": {"hash": "OLD", "verdict": "fix"}}) == {
        "x": "x"
    }
    # a new question has no item
    assert match_items(
        {"x": "1", "y": "2"}, {"x": {"hash": "1", "verdict": "keep"}}
    ) == {
        "x": "x",
        "y": None,
    }
    # an id match is not reused for a second question
    two = {"a": "1", "b": "1"}
    got = match_items(two, {"a": {"hash": "1", "verdict": "keep"}})
    assert sorted(v for v in got.values() if v) == ["a"]


def test_unseen_lists_new_and_changed_questions(tmp_path):
    quiz, text = load(write_quiz(tmp_path))
    h = block_hashes(quiz, text)
    doc = review_doc(
        quiz, {"add": item(h, "add", "keep"), "sky": item(h, "sky", "keep")}
    )
    assert unseen(quiz, text, doc) == {"prime"}
    edited = text.replace("accept: [2, 3]", "accept: [2, 3, 5]")
    quiz2, text2 = load(write_quiz(tmp_path / "b", edited))
    assert unseen(
        quiz2, text2, review_doc(quiz2, {k: {**v} for k, v in doc["items"].items()})
    ) == {"prime"}


# ---------------------------------------------------------------- the check rules


def test_each_review_rule(tmp_path):
    quiz, text = load(write_quiz(tmp_path))
    h = block_hashes(quiz, text)
    doc = review_doc(
        quiz,
        {
            "add": item(h, "add", "drop", "not in lecture 3"),
            "prime": item(h, "prime", "fix", "2 is the only even prime", ["unclear"]),
            "sky": item(h, "sky", "keep", "", ["key-wrong"]),
        },
    )
    got = rules(quiz, text, doc)
    assert ("add", "review.drop", "error") in got
    assert ("prime", "review.fix", "error") in got
    assert ("sky", "review.key-wrong", "error") in got
    msg = next(
        f for f in review_findings(quiz, text, doc, "quiz.md") if f.rule == "review.fix"
    )
    assert "2 is the only even prime" in msg.message and msg.line > 1

    # a fix that changed is only info; a kept question that changed is unreviewed
    doc["items"]["prime"]["hash"] = "0" * 16
    doc["items"]["sky"] = {**doc["items"]["sky"], "hash": "1" * 16}
    got = rules(quiz, text, doc)
    assert ("prime", "review.changed", "info") in got
    assert ("sky", "review.unreviewed", "warning") in got
    assert not any(
        r[1] == "review.key-wrong" for r in got
    )  # changed, so no longer flagged
    # no item at all
    del doc["items"]["sky"]
    assert ("sky", "review.unreviewed", "warning") in rules(quiz, text, doc)


def test_check_cli_with_review(tmp_path, capsys):
    src = write_quiz(tmp_path)
    quiz, text = load(src)
    h = block_hashes(quiz, text)
    doc = review_doc(
        quiz,
        {
            "add": item(h, "add", "fix", "ask about 3 + 3"),
            "prime": item(h, "prime", "keep"),
            "sky": item(h, "sky", "keep"),
        },
    )
    rv = tmp_path / "review.json"
    rv.write_text(json.dumps(doc), encoding="utf-8")
    assert main(["check", str(src), "--review", str(rv)]) == 1
    out = capsys.readouterr()
    assert "[review.fix]" in out.out and "ask about 3 + 3" in out.out
    assert main(["check", str(src), "--review", str(rv), "--json"]) == 1
    data = json.loads(capsys.readouterr().out)
    assert [d["rule"] for d in data if "rule" in d] == ["review.fix"]
    # edit the flagged question: passes, with an info line, and --strict still passes
    src.write_text(
        text.replace("What is 2 + 2?", "What is 3 + 3?")
        .replace("- [ ] 3", "- [ ] 5")
        .replace("- [x] 4", "- [x] 6"),
        encoding="utf-8",
    )
    assert main(["check", str(src), "--review", str(rv), "--strict"]) == 0
    assert "[review.changed]" in capsys.readouterr().out
    # a review of another quiz, or a broken file, is a usage error
    other = tmp_path / "other.json"
    other.write_text(
        json.dumps({**doc, "quiz": {"id": "x", "source_hash": "1"}}), encoding="utf-8"
    )
    assert main(["check", str(src), "--review", str(other)]) == 2
    bad = tmp_path / "bad.json"
    bad.write_text("[]", encoding="utf-8")
    assert main(["check", str(src), "--review", str(bad)]) == 2
    assert main(["check", str(src), "--review", str(tmp_path / "missing.json")]) == 2
    capsys.readouterr()


def test_inspect_review_counts(tmp_path, capsys):
    src = write_quiz(tmp_path)
    quiz, text = load(src)
    h = block_hashes(quiz, text)
    doc = review_doc(
        quiz,
        {"add": item(h, "add", "fix", "x"), "prime": item(h, "prime", "drop", "y")},
    )
    assert counts(quiz, text, doc) == {
        "kept": 0,
        "to_fix": 1,
        "to_drop": 1,
        "changed": 0,
        "unreviewed": 1,
    }
    rv = tmp_path / "review.json"
    rv.write_text(json.dumps(doc), encoding="utf-8")
    assert main(["inspect", str(src), "--review", str(rv), "--json"]) == 0
    assert json.loads(capsys.readouterr().out)["review"]["to_drop"] == 1


# ---------------------------------------------------------------- the file


def test_schema_accepts_what_review_writes_and_rejects_the_rest(tmp_path):
    quiz, text = load(write_quiz(tmp_path))
    h = block_hashes(quiz, text)
    good = review_doc(
        quiz, {"add": item(h, "add", "fix", "t", ["key-wrong", "unclear"])}
    )
    Draft202012Validator(SCHEMA).validate(good)
    for mutate in (
        lambda d: d.update(version=2),
        lambda d: d.update(by="someone"),
        lambda d: d["items"]["add"].update(verdict="maybe"),
        lambda d: d["items"]["add"].update(problems=["bad"]),
        lambda d: d["items"]["add"].pop("hash"),
    ):
        broken = json.loads(json.dumps(good))
        mutate(broken)
        assert not Draft202012Validator(SCHEMA).is_valid(broken)


def test_merge_replaces_newer_keeps_the_rest_and_drops_the_same_question_under_an_old_id(
    tmp_path,
):
    quiz, text = load(write_quiz(tmp_path))
    h = block_hashes(quiz, text)
    base = review_doc(
        quiz,
        {"add": item(h, "add", "fix", "old"), "old-id": {**item(h, "sky", "keep")}},
    )
    new = {"add": item(h, "add", "keep"), "sky": item(h, "sky", "drop", "why")}
    out = merge(base, new, quiz)
    assert out["items"]["add"]["verdict"] == "keep"
    assert out["items"]["sky"]["verdict"] == "drop" and "old-id" not in out["items"]
    assert out["by"] == "quiz review"
    Draft202012Validator(SCHEMA).validate(out)


def test_load_review_rejects_garbage(tmp_path):
    from fullmark.review import ReviewError

    for text in (
        "nope",
        "[]",
        '{"version": 1}',
        '{"version":1,"quiz":{},"items":{"a":{"hash":"x","verdict":"?"}}}',
    ):
        p = tmp_path / "r.json"
        p.write_text(text, encoding="utf-8")
        with pytest.raises(ReviewError):
            load_review(p)


# ---------------------------------------------------------------- serve round trip


def make_args(src, **kw):
    base = {
        "file": str(src),
        "out": None,
        "since": None,
        "once": True,
        "timeout": 20,
        "open": False,
        "port": 0,
        "json": False,
        "tui": False,
    }
    return Namespace(**{**base, **kw})


class Running:
    """`quiz review` in a thread that the test always stops."""

    def __init__(self, src, **kw):
        self.args = make_args(src, **kw)
        self.stop = threading.Event()
        self.urls: list[str] = []
        self.code: int | None = None
        self.thread = threading.Thread(target=self._run)

    def _run(self):
        self.code = review(self.args, self.stop.is_set, self.urls.append)

    def __enter__(self):
        self.thread.start()
        for _ in range(300):
            if self.urls:
                break
            time.sleep(0.02)
        assert self.urls, "server did not start"
        self.url = self.urls[0]
        self.base = self.url.split("/?")[0]
        self.token = self.url.split("t=")[1]
        return self

    def __exit__(self, *exc):
        self.stop.set()
        self.thread.join(10)
        assert not self.thread.is_alive()

    def post(self, data):
        req = urllib.request.Request(
            self.base + "/submit",
            json.dumps(data).encode("utf-8"),
            {"Content-Type": "application/json", "X-Fullmark-Token": self.token},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status
        except urllib.error.HTTPError as exc:
            return exc.code

    def finish(self):
        self.thread.join(10)
        assert not self.thread.is_alive()
        return self.code


def answers(verdicts: dict[str, tuple]) -> dict:
    """Survey responses for the review form: {qid: (verdict index, text, problem indexes, note)}."""
    out = {}
    for qid, (v, text, probs, note) in verdicts.items():
        out[f"{qid}-verdict"] = {
            "choice": v,
            **({"inputs": {str(v): text}} if text else {}),
        }
        if probs:
            out[f"{qid}-problems"] = {"choices": probs}
        if note:
            out[f"{qid}-note"] = {"text": note}
    return out


def form_results(quiz, responses, only=None, folder=EXAMPLES):
    form, findings, _ = make_form(quiz, folder, only)
    assert form is not None and not findings.has_errors
    return make_results(form, responses, source_file="review-form", mode="survey")


def test_round_trip_writes_review_json_and_nothing_else(tmp_path):
    src = write_quiz(tmp_path)
    quiz, _ = load(src)
    results = form_results(
        quiz,
        answers(
            {
                "add": (1, "use 3 + 3", [0], "check the key"),
                "prime": (0, "", [], ""),
                "sky": (2, "off topic", [1], ""),
            }
        ),
    )
    before = {p.name for p in tmp_path.iterdir()}
    with Running(src) as s:
        page = urllib.request.urlopen(s.url).read().decode("utf-8")
        assert "window.FULLMARK_SUBMIT" in page and "Your verdict on question 1" in page
        assert s.post(results) == 200
        assert s.finish() == 0
    assert {p.name for p in tmp_path.iterdir()} - before == {
        "review.json"
    }  # no results file
    doc = json.loads((tmp_path / "review.json").read_text(encoding="utf-8"))
    Draft202012Validator(SCHEMA).validate(doc)
    assert doc["by"] == "quiz review" and doc["quiz"]["id"] == "rv"
    items = doc["items"]
    assert items["add"]["verdict"] == "fix" and items["add"]["text"] == "use 3 + 3"
    assert (
        items["add"]["problems"] == ["key-wrong"]
        and items["add"]["note"] == "check the key"
    )
    assert items["prime"]["verdict"] == "keep" and items["prime"]["text"] == ""
    assert items["sky"]["verdict"] == "drop" and items["sky"]["problems"] == [
        "not-in-material"
    ]
    quiz_hashes = block_hashes(*load(src))
    assert all(items[k]["hash"] == quiz_hashes[k] for k in items)


def test_cards_without_a_verdict_are_not_reviewed(tmp_path):
    src = write_quiz(tmp_path)
    quiz, text = load(src)
    results = form_results(
        quiz, answers({"add": (0, "", [], ""), "sky": (1, "x", [], "")})
    )
    hashes = block_hashes(quiz, text)
    items, skipped = items_from_results(results, quiz, hashes)
    assert sorted(items) == ["add", "sky"] and skipped == 1  # prime has no verdict
    assert counts(quiz, text, merge(new_review(quiz), items, quiz))["unreviewed"] == 1


def test_a_second_review_never_overwrites_and_since_merges(tmp_path):
    src = write_quiz(tmp_path)
    quiz, _ = load(src)
    first = form_results(
        quiz,
        answers(
            {"add": (0, "", [], ""), "prime": (1, "t", [], ""), "sky": (0, "", [], "")}
        ),
    )
    with Running(src) as s:
        assert s.post(first) == 200
        s.finish()
    # same default name again: written beside it as review-2.json, the first is untouched
    original = (tmp_path / "review.json").read_text(encoding="utf-8")
    with Running(src) as s:
        assert s.post(first) == 200
        s.finish()
    assert (tmp_path / "review.json").read_text(encoding="utf-8") == original
    assert (tmp_path / "review-2.json").is_file()

    # --since asks only about the changed question and merges into that file
    text = src.read_text(encoding="utf-8").replace(
        "accept: [2, 3]", "accept: [2, 3, 5]"
    )
    src.write_text(text, encoding="utf-8")
    quiz2, _ = load(src)
    since = str(tmp_path / "review.json")
    results = form_results(quiz2, answers({"prime": (0, "", [], "")}), only={"prime"})
    with Running(src, since=since) as s:
        page = urllib.request.urlopen(s.url).read().decode("utf-8")
        assert "Your verdict on question 2" in page
        assert (
            "Your verdict on question 1" not in page
            and "Your verdict on question 3" not in page
        )
        assert s.post(results) == 200
        assert s.finish() == 0
    merged = json.loads((tmp_path / "review.json").read_text(encoding="utf-8"))
    assert merged["items"]["prime"]["verdict"] == "keep"
    assert set(merged["items"]) == {"add", "prime", "sky"}  # unchanged ones kept
    assert main(["check", str(src), "--review", since]) == 0


def test_since_with_nothing_new_does_not_serve(tmp_path, capsys):
    src = write_quiz(tmp_path)
    quiz, text = load(src)
    h = block_hashes(quiz, text)
    doc = review_doc(quiz, {k: item(h, k, "keep") for k in h})
    rv = tmp_path / "review.json"
    rv.write_text(json.dumps(doc), encoding="utf-8")
    assert main(["review", str(src), "--since", str(rv), "--json"]) == 0
    assert json.loads(capsys.readouterr().out)["status"] == "nothing"


def test_json_output_timeout_and_errors(tmp_path, capsys):
    src = write_quiz(tmp_path)
    assert main(["review", str(src), "--timeout", "0.3", "--json"]) == 2
    out = capsys.readouterr()
    assert (
        json.loads(out.out)["status"] == "timeout" and "no answers arrived" in out.err
    )
    assert not (tmp_path / "review.json").exists()
    assert main(["review", str(tmp_path / "nope.md")]) == 2
    assert main(["review", str(src), "--tui"]) == 2
    assert "not built yet" in capsys.readouterr().err
    bad = write_quiz(tmp_path / "bad", "## Q\n\n- [x] a\n- [ ] b\n")
    assert main(["review", str(bad), "--timeout", "1"]) == 1
    capsys.readouterr()


def test_json_outcome_lists_what_to_fix(tmp_path, capsys):
    src = write_quiz(tmp_path)
    quiz, _ = load(src)
    results = form_results(
        quiz, answers({"add": (1, "wrong key", [0], ""), "sky": (0, "", [], "")})
    )
    with Running(src, json=True) as s:
        assert s.post(results) == 200
        assert s.finish() == 0
    out = json.loads(capsys.readouterr().out)
    assert out["status"] == "submitted" and out["counts"]["to_fix"] == 1
    assert [f["id"] for f in out["flagged"]] == ["add"] and out["flagged"][0][
        "text"
    ] == "wrong key"
    assert out["without_verdict"] == 1


def test_warns_about_questions_without_explicit_ids(tmp_path, capsys):
    text = QUIZ.replace(" {id=add}", "")
    src = write_quiz(tmp_path, text)
    assert main(["review", str(src), "--timeout", "0.2"]) == 2
    assert "1 question(s) have no explicit" in capsys.readouterr().out


def test_review_key_needs_survey_mode(tmp_path):
    from fullmark.validate import load_quiz_text

    text = "---\ntitle: T\nreview: true\n---\n\n## Q {type=numeric}\n\n```answer\nvalue: 1\n```\n"
    _, findings = load_quiz_text(text, "t.md", "t", tmp_path)
    assert any("only for the form" in f.message for f in findings)
