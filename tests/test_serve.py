import copy
import json
import re
import threading
import time
import urllib.error
import urllib.request
from argparse import Namespace
from pathlib import Path

import pytest
from helpers import validate_results
from test_report import RESPONSES, SURVEY_RESPONSES, make_results

from fullmark.build import build_html
from fullmark.cli import main, serve
from fullmark.serve import SubmitServer, quiz_id_of_html, quiz_meta_of_html
from fullmark.serve import validate_results as served_check
from fullmark.validate import load_quiz

FIX = Path(__file__).parent / "fixtures"


def load(path):
    quiz, findings, _ = load_quiz(path)
    assert quiz is not None and not findings.has_errors
    return quiz


def make_args(src, **kw):
    base = {
        "file": str(src),
        "out": None,
        "once": True,
        "timeout": 20,
        "open": False,
        "port": 0,
        "json": False,
        "autosave": None,
    }
    return Namespace(**{**base, **kw})


class Running:
    """`quiz serve` in a thread that the test always stops."""

    def __init__(self, src, **kw):
        self.args = make_args(src, **kw)
        self.stop = threading.Event()
        self.urls: list[str] = []
        self.code: int | None = None
        self.thread = threading.Thread(target=self._run)

    def _run(self):
        self.code = serve(self.args, self.stop.is_set, self.urls.append)

    def __enter__(self):
        self.thread.start()
        for _ in range(200):
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

    def post(self, data, token=None, origin=None, raw=None, route="/submit"):
        headers = {"Content-Type": "application/json"}
        if token != "none":
            headers["X-Fullmark-Token"] = token or self.token
        if origin:
            headers["Origin"] = origin
        body = raw if raw is not None else json.dumps(data).encode("utf-8")
        req = urllib.request.Request(self.base + route, body, headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as exc:
            raw_reply = exc.read()
            try:
                return exc.code, json.loads(raw_reply or b"{}")
            except ValueError:  # send_error answers 404 with an HTML page
                return exc.code, {}

    def post_progress(self, body, token=None, origin=None, raw=None):
        return self.post(body, token, origin, raw, route="/progress")

    def page(self):
        with urllib.request.urlopen(self.url, timeout=10) as r:
            return r.read().decode("utf-8")

    def finish(self):
        self.thread.join(10)
        assert not self.thread.is_alive()
        return self.code


@pytest.fixture
def survey(tmp_path):
    src = tmp_path / "survey.md"
    src.write_text((FIX / "survey.md").read_text(encoding="utf-8"), encoding="utf-8")
    quiz, f, _ = load_quiz(src)
    assert not f.has_errors
    return src, make_results(
        quiz, SURVEY_RESPONSES, source_file="survey.md", mode="survey"
    )


def results_files(folder):
    return sorted(folder.glob("*-results-*.json"))


def test_valid_submit_writes_the_file_and_exits(survey, tmp_path):
    src, results = survey
    with Running(src) as s:
        page = urllib.request.urlopen(s.url).read().decode("utf-8")
        assert "window.FULLMARK_SUBMIT" in page and s.token in page
        assert "connect-src 'self'" in page
        code, body = s.post(results)
        assert code == 200 and body["ok"]
        assert s.finish() == 0
    files = results_files(tmp_path)
    assert len(files) == 1 and files[0].name == body["path"]
    saved = json.loads(files[0].read_text(encoding="utf-8"))
    validate_results(saved)
    assert saved["quiz"]["id"] == results["quiz"]["id"]


def test_page_needs_the_token_and_other_routes_are_404(survey):
    src, _ = survey
    with Running(src) as s:
        for path, want in (
            ("/", 403),
            ("/?t=wrong", 403),
            ("/survey.md", 404),
            ("/x", 404),
        ):
            with pytest.raises(urllib.error.HTTPError) as e:
                urllib.request.urlopen(s.base + path)
            assert e.value.code == want
        assert s.post(None, raw=b"{}")[0] == 400  # passes the token, then is rejected


def test_wrong_token_or_origin_gives_403(survey, tmp_path):
    src, results = survey
    with Running(src) as s:
        assert s.post(results, token="nope")[0] == 403
        assert s.post(results, token="none")[0] == 403
        assert s.post(results, origin="http://evil.example")[0] == 403
        assert results_files(tmp_path) == []
        assert s.post(results, origin=s.base)[0] == 200
        s.finish()
    assert len(results_files(tmp_path)) == 1


def test_wrong_quiz_id_and_invalid_schema_give_400(survey, tmp_path):
    src, results = survey
    other = copy.deepcopy(results)
    other["quiz"]["id"] = "another-quiz"
    broken = copy.deepcopy(results)
    broken["version"] = 2
    with Running(src) as s:
        code, body = s.post(other)
        assert code == 400 and "another-quiz" in body["error"]
        assert s.post(broken)[0] == 400
        assert s.post(None, raw=b"not json")[0] == 400
        assert results_files(tmp_path) == []
        assert s.post(results)[0] == 200
        s.finish()
    assert len(results_files(tmp_path)) == 1


def test_timeout_exits_2(survey, capsys):
    src, _ = survey
    assert serve(make_args(src, timeout=0.3)) == 2
    assert "no answers arrived" in capsys.readouterr().err


def test_never_overwrites_an_existing_file(survey, tmp_path):
    src, results = survey
    out = tmp_path / "answers.json"
    out.write_text("keep me", encoding="utf-8")
    with Running(src, out=str(out)) as s:
        assert s.post(results)[0] == 200
        s.finish()
    assert out.read_text(encoding="utf-8") == "keep me"
    validate_results(
        json.loads((tmp_path / "answers-2.json").read_text(encoding="utf-8"))
    )


def test_server_accepts_several_submits(survey, tmp_path):
    src, results = survey
    quiz = load(src)
    server = SubmitServer(
        build_html(quiz, src.parent).html, quiz.id, tmp_path / "r.json"
    )
    server.start()
    try:
        for _ in range(2):
            req = urllib.request.Request(
                f"http://127.0.0.1:{server.port}/submit",
                json.dumps(results).encode(),
                {"X-Fullmark-Token": server.token},
                method="POST",
            )
            assert urllib.request.urlopen(req, timeout=10).status == 200
    finally:
        server.stop()
    assert [p.name for p in server.paths] == ["r.json", "r-2.json"]


def test_json_output_and_html_input(survey, tmp_path, capsys):
    src, results = survey
    quiz = load(src)
    html = tmp_path / "built.html"
    html.write_text(build_html(quiz, src.parent).html, encoding="utf-8")
    assert quiz_id_of_html(html.read_text(encoding="utf-8")) == quiz.id
    with Running(html, json=True) as s:
        assert s.post(results)[0] == 200
        assert s.finish() == 0
    out = json.loads(capsys.readouterr().out)
    assert out["status"] == "submitted" and Path(out["path"]).is_file()
    assert serve(make_args(html, json=True, timeout=0.2)) == 2
    out = json.loads(capsys.readouterr().out)
    assert out == {"status": "timeout", "path": None, "paths": []}


def test_input_errors_exit_without_serving(tmp_path, capsys):
    assert main(["serve", str(tmp_path / "missing.md")]) == 2
    bad = tmp_path / "bad.md"
    bad.write_text("## Q\n\n- [x] a\n- [ ] b\n", encoding="utf-8")  # no title
    assert main(["serve", str(bad), "--timeout", "1"]) == 1
    notquiz = tmp_path / "x.html"
    notquiz.write_text("<html></html>", encoding="utf-8")
    assert main(["serve", str(notquiz), "--timeout", "1"]) == 2
    capsys.readouterr()


def test_the_page_on_disk_stays_offline_only():
    quiz = load(FIX / "survey.md")
    html = build_html(quiz, FIX).html
    assert "<script>window.FULLMARK_SUBMIT" not in html and "connect-src" not in html


def test_small_validator_agrees_with_jsonschema():
    quiz = load(FIX / "all-types.md")
    good = make_results(quiz, RESPONSES)
    assert served_check(good, quiz.id) == []
    mutations = [
        lambda r: r.update(version=2),
        lambda r: r.pop("score"),
        lambda r: r["quiz"].pop("hash"),
        lambda r: r["questions"][0].update(response={"choice": "A"}),
        lambda r: r["questions"][0].update(points=-1),
        lambda r: r["attempt"].update(submitted="yes"),
        lambda r: r.update(questions="none"),
    ]
    for mutate in mutations:
        bad = copy.deepcopy(good)
        mutate(bad)
        with pytest.raises(AssertionError):
            validate_results(bad)  # the real schema rejects it
        assert served_check(bad, quiz.id), (
            "the built-in check missed what the schema rejects"
        )


def test_small_validator_checks_follow_up_inputs():
    quiz = load(FIX / "all-types.md")
    good = make_results(quiz, RESPONSES)
    good["questions"][0]["response"] = {"choice": 1, "inputs": {"1": "a hackathon"}}
    good["questions"][1]["response"] = {"choices": [0, 2], "inputs": {"2": "x"}}
    assert served_check(good, quiz.id) == []
    validate_results(good)
    mutations = [
        lambda r: r["questions"][0]["response"].update(inputs={"1": 5}),
        lambda r: r["questions"][0]["response"].update(inputs={"first": "x"}),
        lambda r: r["questions"][0]["response"].update(inputs=["x"]),
        lambda r: r["questions"][1]["response"].update(inputs={"2": None}),
    ]
    for mutate in mutations:
        bad = copy.deepcopy(good)
        mutate(bad)
        with pytest.raises(AssertionError):
            validate_results(bad)
        assert served_check(bad, quiz.id), (
            "the built-in check missed a bad inputs value"
        )


# ------------------------------------------------------------------ --autosave


def progress_body(quiz, state=None, saved=1000):
    return {
        "hash": quiz.source_hash,
        "saved": saved,
        "state": {"started": True, "answers": {"q1": {"choice": 0}}}
        if state is None
        else state,
    }


def injected(page):
    """The FULLMARK_SUBMIT config of a served page, parsed."""
    m = re.search(r"<script>window\.FULLMARK_SUBMIT = (.*?);</script>", page, re.DOTALL)
    assert m
    return json.loads(m.group(1))


@pytest.fixture
def auto(survey, tmp_path):
    src, results = survey
    return src, results, tmp_path / "progress.json", load(src)


def test_progress_is_404_without_autosave(survey):
    src, _ = survey
    quiz = load(src)
    with Running(src) as s:
        assert s.post_progress(progress_body(quiz))[0] == 404
        cfg = injected(s.page())
        assert cfg["autosave"] is None and cfg["progress"] is None
        s.stop.set()


def test_progress_is_written_atomically_and_replaced(auto, tmp_path):
    src, _, prog, quiz = auto
    with Running(src, autosave=str(prog)) as s:
        assert injected(s.page())["autosave"] == "/progress"
        code, body = s.post_progress(progress_body(quiz, saved=5))
        assert code == 200 and body == {"ok": True}
        saved = json.loads(prog.read_text(encoding="utf-8"))
        assert saved["hash"] == quiz.source_hash and saved["saved"] == 5
        assert saved["state"]["answers"] == {"q1": {"choice": 0}}
        second = {"started": True, "answers": {"q1": {"choice": 1}}}
        assert s.post_progress(progress_body(quiz, second, saved=9))[0] == 200
        saved = json.loads(prog.read_text(encoding="utf-8"))
        assert saved["saved"] == 9 and saved["state"] == second
    assert sorted(p.name for p in tmp_path.glob("progress*")) == ["progress.json"]


def test_progress_needs_token_and_origin(auto):
    src, _, prog, quiz = auto
    with Running(src, autosave=str(prog)) as s:
        body = progress_body(quiz)
        assert s.post_progress(body, token="nope")[0] == 403
        assert s.post_progress(body, token="none")[0] == 403
        assert s.post_progress(body, origin="http://evil.example")[0] == 403
        assert not prog.exists()
        assert s.post_progress(body, origin=s.base)[0] == 200


def test_progress_refuses_big_and_malformed_bodies(auto, monkeypatch):
    src, _, prog, quiz = auto
    with Running(src, autosave=str(prog)) as s:
        assert s.post_progress(progress_body(quiz))[0] == 200
        before = prog.read_text(encoding="utf-8")
        assert s.post_progress(None, raw=b"not json")[0] == 400
        monkeypatch.setattr("fullmark.serve.MAX_BODY", 10)
        try:
            code = s.post_progress(progress_body(quiz))[0]
        except OSError:
            # the server refuses without reading the oversized body; under load Windows
            # may abort the upload (WinError 10053) before the 400 is read
            code = None
        assert code in (400, None)
        assert prog.read_text(encoding="utf-8") == before


def test_progress_for_another_hash_or_bad_state_gives_400(auto):
    src, _, prog, quiz = auto
    with Running(src, autosave=str(prog)) as s:
        other = progress_body(quiz)
        other["hash"] = "0123456789abcdef"
        code, body = s.post_progress(other)
        assert code == 400 and "another version" in body["error"]
        bad = progress_body(quiz)
        bad["state"] = "text"
        assert s.post_progress(bad)[0] == 400
        assert not prog.exists()


def test_null_or_submitted_state_deletes_the_progress(auto):
    src, _, prog, quiz = auto
    with Running(src, autosave=str(prog)) as s:
        for state in (None, {"started": True, "submitted": True}):
            assert s.post_progress(progress_body(quiz))[0] == 200 and prog.exists()
            body = progress_body(quiz)
            body["state"] = state
            code, reply = s.post_progress(body)
            assert code == 200 and reply == {"ok": True, "deleted": True}
            assert not prog.exists()
        assert s.post_progress(body)[0] == 200  # deleting nothing is fine


def test_accepted_submit_deletes_the_progress(auto, tmp_path):
    src, results, prog, quiz = auto
    with Running(src, autosave=str(prog)) as s:
        assert s.post_progress(progress_body(quiz))[0] == 200
        assert s.post(results)[0] == 200
        s.finish()
    assert not prog.exists()
    assert len(results_files(tmp_path)) == 1


def test_page_carries_matching_progress_only(auto):
    src, _, prog, quiz = auto
    good = {"started": True, "answers": {"q1": {"choice": 2}}}
    with Running(src, autosave=str(prog)) as s:
        assert injected(s.page())["progress"] is None
        assert s.post_progress(progress_body(quiz, good))[0] == 200
        assert injected(s.page())["progress"] == good
        cases = {
            "hash": {"hash": "other", "saved": 1, "state": good},
            "submitted": {
                "hash": quiz.source_hash,
                "saved": 1,
                "state": {"submitted": True},
            },
        }
        for name, record in cases.items():
            text = json.dumps(record)
            prog.write_text(text, encoding="utf-8")
            assert injected(s.page())["progress"] is None, name
            assert prog.read_text(encoding="utf-8") == text
        prog.write_text("{not json", encoding="utf-8")
        assert injected(s.page())["progress"] is None
        assert prog.read_text(encoding="utf-8") == "{not json"


def test_progress_text_cannot_end_the_script(auto):
    src, _, prog, quiz = auto
    nasty = "</script><script>alert(1)</script>"
    state = {"started": True, "answers": {"q1": {"text": nasty}}}
    with Running(src, autosave=str(prog)) as s:
        assert s.post_progress(progress_body(quiz, state))[0] == 200
        page = s.page()
        assert "</script><script>alert" not in page
        assert injected(page)["progress"] == state


def test_autosave_with_a_built_page(auto, tmp_path):
    src, _, prog, quiz = auto
    html = tmp_path / "built.html"
    html.write_text(build_html(quiz, src.parent).html, encoding="utf-8")
    meta = quiz_meta_of_html(html.read_text(encoding="utf-8"))
    assert meta is not None and meta["hash"] == quiz.source_hash
    with Running(html, autosave=str(prog)) as s:
        assert s.post_progress(progress_body(quiz))[0] == 200
        assert injected(s.page())["progress"]["started"] is True


def test_serve_help_lists_autosave(capsys):
    with pytest.raises(SystemExit):
        main(["serve", "--help"])
    assert "--autosave" in capsys.readouterr().out


def test_focus_is_injected_only_when_asked(tmp_path):
    for focus in (False, True):
        server = SubmitServer(
            "<html><body></body></html>", "q", tmp_path / "r.json", focus=focus
        )
        server.start()
        try:
            url = f"http://127.0.0.1:{server.port}/?t={server.token}"
            page = urllib.request.urlopen(url, timeout=5).read().decode()
        finally:
            server.stop()
        assert injected(page)["focus"] is focus


def test_serve_and_take_accept_focus():
    from fullmark.cli import build_parser

    parser = build_parser()
    assert parser.parse_args(["serve", "q.md", "--focus"]).focus is True
    assert parser.parse_args(["library", "take", "x", "--focus"]).focus is True
    assert parser.parse_args(["serve", "q.md"]).focus is False
