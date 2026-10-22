"""Question banks (pick) and `quiz watch`."""

import threading
import time
from argparse import Namespace
from pathlib import Path

from fullmark.cli import main, watch
from fullmark.grading import score_attempt
from fullmark.report import make_report, make_report_json
from fullmark.validate import load_quiz

BANK = """---
title: Bank
{front}---

# Limits {{pick=2}}

## L1?

- [x] a
- [ ] b

## L2?

- [x] a
- [ ] b

## L3?

- [x] a
- [ ] b

# Rules

## R1?

- [x] a
- [ ] b
"""


def write(tmp_path: Path, front: str = "", text: str | None = None) -> Path:
    p = tmp_path / "bank.md"
    p.write_text(
        text if text is not None else BANK.format(front=front), encoding="utf-8"
    )
    return p


def errors(path: Path) -> list[str]:
    _, findings, _ = load_quiz(path)
    return [f.message for f in findings.sorted() if f.severity == "error"]


def test_section_pick_parses_and_validates(tmp_path):
    quiz, findings, _ = load_quiz(write(tmp_path))
    assert not findings.has_errors
    assert quiz.sections[0].pick == 2 and quiz.sections[1].pick is None
    assert quiz.has_bank
    sizes = [(len(pool), n) for pool, n in quiz.bank_groups()]
    assert sizes == [(3, 2), (1, 1)]


def test_global_pick(tmp_path):
    text = BANK.format(front="pick: 3\n").replace(" {pick=2}", "")
    quiz, findings, _ = load_quiz(write(tmp_path, text=text))
    assert not findings.has_errors and quiz.meta.pick == 3
    assert [(len(p), n) for p, n in quiz.bank_groups()] == [(4, 3)]


def test_pick_errors(tmp_path):
    assert any("cannot be combined" in e for e in errors(write(tmp_path, "pick: 2\n")))
    text = BANK.format(front="").replace("pick=2", "pick=9")
    assert any("more than its 3" in e for e in errors(write(tmp_path, text=text)))
    text = BANK.format(front="pick: 9\n").replace(" {pick=2}", "")
    assert any("more than the 4" in e for e in errors(write(tmp_path, text=text)))
    text = BANK.format(front="").replace("pick=2", "pick=0")
    assert any(
        "pick must be a whole number" in e for e in errors(write(tmp_path, text=text))
    )
    assert any(
        "pick must be at least 1" in e
        for e in errors(
            write(
                tmp_path,
                "pick: 0\n",
                BANK.format(front="pick: 0\n").replace(" {pick=2}", ""),
            )
        )
    )


def test_no_bank_has_no_pick_data(tmp_path):
    quiz, _, _ = load_quiz(
        write(tmp_path, text=BANK.format(front="").replace(" {pick=2}", ""))
    )
    assert not quiz.has_bank


def results_for(quiz, drawn):
    qs = [q for q in quiz.questions if q.id in drawn]
    return {
        "format": "fullmark-results",
        "version": 1,
        "quiz": {"id": quiz.id, "title": quiz.meta.title, "hash": quiz.source_hash},
        "attempt": {"submitted": True, "bank": {"seed": 1, "pool": 4, "drawn": drawn}},
        "score": {},
        "questions": [
            {
                "id": q.id,
                "index": q.index,
                "type": q.type,
                "points": q.points,
                "tags": [],
                "status": "correct",
                "earned": 1,
                "response": {"choice": 0},
                "title": q.title_md,
            }
            for q in qs
        ],
    }


def test_score_attempt_only_counts_drawn(tmp_path):
    quiz, _, _ = load_quiz(write(tmp_path))
    resp = {q.id: {"choice": 0} for q in quiz.questions}
    full = score_attempt(quiz, resp)["score"]
    part = score_attempt(quiz, resp, drawn=["q1", "q4"])["score"]
    assert full["possible_total"] == 4 and part["possible_total"] == 2
    assert part["earned"] == 2 and part["percent_auto"] == 100


def test_report_checks_the_draw(tmp_path):
    quiz, _, _ = load_quiz(write(tmp_path))
    good = results_for(quiz, ["q1", "q3", "q4"])
    warnings: list[str] = []
    md = make_report(good, quiz, warnings)
    assert warnings == [] and "3 questions drawn from a pool of 4" in md
    assert make_report_json(good, quiz, [])["question_bank"]["drawn"] == [
        "q1",
        "q3",
        "q4",
    ]
    bad = results_for(quiz, ["q1", "q2", "q3", "q4"])  # 3 from a pick=2 section
    warnings = []
    make_report(bad, quiz, warnings)
    assert any("expected" in w for w in warnings)
    missing = results_for(quiz, ["q1", "q4"])
    missing["attempt"]["bank"] = None
    warnings = []
    make_report(missing, quiz, warnings)
    assert any("record no draw" in w for w in warnings)


# ---------------------------------------------------------------- watch


def test_watch_rebuilds_on_change_and_keeps_good_build(tmp_path, capsys):
    src = write(tmp_path, text=BANK.format(front="").replace(" {pick=2}", ""))
    out = tmp_path / "out.html"
    args = Namespace(file=str(src), output=str(out), open=False)
    stop = threading.Event()
    t = threading.Thread(target=watch, args=(args, 0.05, stop.is_set))
    t.start()

    def wait_for(cond):
        for _ in range(100):
            if cond():
                return True
            time.sleep(0.05)
        return False

    try:
        assert wait_for(out.exists)
        first = out.read_text(encoding="utf-8")
        src.write_text(
            src.read_text(encoding="utf-8").replace("title: Bank", "title: Bank two"),
            encoding="utf-8",
        )
        assert wait_for(lambda: "Bank two" in out.read_text(encoding="utf-8"))
        good = out.read_text(encoding="utf-8")
        assert good != first
        src.write_text(
            "---\ntitle: Broken\n---\n", encoding="utf-8"
        )  # no questions: error
        time.sleep(0.4)
        assert out.read_text(encoding="utf-8") == good  # last good build kept
    finally:
        stop.set()
        t.join(timeout=5)
    assert "kept the previous build" in capsys.readouterr().out


def test_watch_missing_file_is_a_usage_error(tmp_path, capsys):
    assert main(["watch", str(tmp_path / "nope.md")]) == 2


def test_watch_serve_reloads_and_normal_build_is_untouched(tmp_path):
    import urllib.error
    import urllib.request

    src = write(tmp_path, text=BANK.format(front="").replace(" {pick=2}", ""))
    out = tmp_path / "out.html"
    args = Namespace(file=str(src), output=str(out), open=False, serve=True)
    stop = threading.Event()
    urls: list[str] = []
    t = threading.Thread(target=watch, args=(args, 0.05, stop.is_set, urls.append))
    t.start()
    try:
        for _ in range(100):
            if urls and out.exists():
                break
            time.sleep(0.05)
        url = urls[0]
        assert url.startswith("http://127.0.0.1:") and url.endswith("/out.html")
        served = urllib.request.urlopen(url).read().decode("utf-8")
        assert 'new EventSource("/events")' in served and "connect-src 'self'" in served
        # the file on disk (what the learner gets) has neither
        on_disk = out.read_text(encoding="utf-8")
        assert "EventSource" not in on_disk and "connect-src" not in on_disk

        events = urllib.request.urlopen(url.rsplit("/", 1)[0] + "/events", timeout=10)
        src.write_text(
            src.read_text(encoding="utf-8").replace("title: Bank", "title: Bank two"),
            encoding="utf-8",
        )
        seen = ""
        for _ in range(40):
            seen += events.readline().decode("utf-8")
            if "data: reload" in seen:
                break
        assert "data: reload" in seen
        assert "Bank two" in urllib.request.urlopen(url).read().decode("utf-8")
        # nothing else is served: not the quiz source, not other files
        for bad in ("/bank.md", "/../bank.md", "/other"):
            try:
                urllib.request.urlopen(url.rsplit("/", 1)[0] + bad)
                raise AssertionError(bad)
            except urllib.error.HTTPError as exc:
                assert exc.code == 404
        events.close()
    finally:
        stop.set()
        t.join(5)
    assert not t.is_alive()
