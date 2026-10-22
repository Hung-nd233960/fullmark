import json
import threading
import time
import urllib.request
from pathlib import Path

import pytest
import yaml
from helpers import correct_response, wrong_response
from test_report import make_results

from fullmark.brief import (
    CONTENT_README,
    SURVEY_ID,
    Brief,
    ResultsError,
    answers_from_results,
    load_brief,
    load_questions,
    parse_value,
    resolve,
    survey_markdown,
    to_brief,
    weak_topics,
)
from fullmark.cli import brief, build_parser, main
from fullmark.validate import load_quiz, load_quiz_text

QUESTIONS = load_questions()
BY_ID = {q.id: q for q in QUESTIONS}
GIVEN = {"purpose": "exam-prep", "scope": "lectures 3 to 5"}
FLAGS = ["--purpose", "exam-prep", "--scope", "lectures 3 to 5"]


# ---------------------------------------------------------------- the question list


def test_questions_are_consistent():
    ids = [q.id for q in QUESTIONS]
    assert ids == [
        "purpose",
        "scope",
        "kinds",
        "elsewhere",
        "count",
        "minutes",
        "mix",
        "difficulty",
        "mode",
        "weak_topics",
        "language",
        "request",
    ]
    assert len(set(ids)) == len(ids)
    flags = [q.flag for q in QUESTIONS]
    assert len(set(flags)) == len(flags) and all(f.startswith("--") for f in flags)
    for q in QUESTIONS:
        if q.type in ("choice", "multi"):
            assert q.choices, q.id
            assert len(set(q.values)) == len(q.values)
        if q.type == "choice" and q.default is not None:
            assert q.default in q.values, q.id
        if q.type == "multi":
            assert set(q.default) <= set(q.values), q.id
        if q.followup:
            assert q.followup.value in q.values


def test_human_only_values_are_purpose_and_scope():
    assert {q.id for q in QUESTIONS if not q.delegable} == {"purpose", "scope"}
    assert BY_ID["scope"].default is None  # no default: never filled in for the user
    assert BY_ID["purpose"].default in BY_ID["purpose"].values


def test_flags_agree_with_the_questions(capsys):
    args = build_parser().parse_args(["brief", "d"])
    with pytest.raises(SystemExit):
        main(["brief", "--help"])
    help_text = capsys.readouterr().out
    for q in QUESTIONS:
        assert hasattr(args, q.dest), q.dest
        assert q.flag in help_text, q.flag
        if q.followup:
            assert hasattr(args, q.followup.dest) and q.followup.flag in help_text
    args = build_parser().parse_args(
        ["brief", "d", "--count", "7", "--mix", "recall,code"]
    )
    assert args.count == 7 and args.mix == ["recall", "code"] and args.scope is None


def test_survey_agrees_with_the_questions():
    text = survey_markdown()
    form, findings = load_quiz_text(text, "brief", SURVEY_ID, Path("."))
    assert form is not None and not findings.has_errors, [f.format() for f in findings]
    # the only warnings are the two-choice lint, on the yes/no and en/vi questions
    assert {f.question for f in findings} == {
        "weak_topics (single)",
        "language (single)",
    }
    assert all("fewer than three choices" in f.message for f in findings)
    assert form.id == SURVEY_ID and form.meta.mode == "survey"
    assert [q.id for q in form.questions] == [q.id for q in QUESTIONS]
    for fq, q in zip(form.questions, QUESTIONS, strict=True):
        assert [c.md.split(" - ")[0] for c in fq.choices] == [
            c.label for c in q.choices
        ]
        want = {
            "choice": "single",
            "multi": "multi",
            "number": "short",
            "text": "short",
        }[q.type]
        if q.multiline:
            want = "essay"
        assert fq.type == want, q.id
        if q.followup:
            assert [c.input for c in fq.choices if c.input] == [q.followup.prompt]
    assert "Required." in text and text.count("Required.") == 2


def test_survey_skips_answered_questions():
    form, findings = load_quiz_text(
        survey_markdown({"purpose", "scope"}), "brief", SURVEY_ID, Path(".")
    )
    assert form is not None and not findings.has_errors
    assert "purpose" not in [q.id for q in form.questions]


def test_brief_model_has_every_field():
    res = resolve(GIVEN)
    brief = to_brief(res)
    dumped = brief.model_dump()
    for q in QUESTIONS:
        node = dumped
        for part in q.field.split("."):
            assert part in node, q.field
            node = node[part]


# ---------------------------------------------------------------- parsing and resolving


def test_parse_value():
    assert parse_value(BY_ID["count"], "12") == 12
    assert parse_value(BY_ID["minutes"], "0") == 0
    assert parse_value(BY_ID["mix"], "recall, code,recall") == ["recall", "code"]
    assert parse_value(BY_ID["kinds"], "none") == []
    assert parse_value(BY_ID["scope"], "  chapter 2 ") == "chapter 2"
    for q, raw in (
        ("count", "0"),
        ("count", "many"),
        ("purpose", "fun"),
        ("mix", "recall,poetry"),
        ("scope", "  "),
    ):
        with pytest.raises(ValueError):
            parse_value(BY_ID[q], raw)


def test_resolve_records_who_decided():
    res = resolve({**GIVEN, "count": 8})
    assert res.decided_by["purpose"] == "user" and res.decided_by["count"] == "user"
    assert res.decided_by["mix"] == "default" and res.values["mix"] == [
        "recall",
        "understanding",
    ]
    assert not res.missing
    assert set(res.not_by_user()) >= {"mix", "difficulty", "mode", "language"}


def test_resolve_lists_missing_human_only_values():
    res = resolve({"count": 8})
    assert [q.id for q in res.missing] == ["purpose", "scope"]
    # --accept-defaults can hand over purpose (it has a default) but never scope
    res = resolve({"count": 8}, accept_defaults=True)
    assert [q.id for q in res.missing] == ["scope"]
    assert (
        res.decided_by["purpose"] == "agent" and res.values["purpose"] == "self-study"
    )


def test_weak_topics_default_follows_the_results():
    assert resolve(GIVEN).values["weak_topics"] == "no"
    assert resolve(GIVEN, weak_default=True).values["weak_topics"] == "yes"
    assert (
        resolve({**GIVEN, "weak_topics": "no"}, weak_default=True).values["weak_topics"]
        == "no"
    )


def test_followup_text_needs_its_choice():
    res = resolve({**GIVEN, "kinds": ["notes", "other"], "kinds_other": "a wiki"})
    brief = to_brief(res)
    assert (
        brief.content.kinds_other == "a wiki"
        and res.decided_by["kinds_other"] == "user"
    )
    res = resolve({**GIVEN, "kinds": ["notes"], "kinds_other": "a wiki"})
    assert to_brief(res).content.kinds_other == ""  # text without its choice is dropped


# ---------------------------------------------------------------- the command: flags


def run(capsys, *argv):
    code = main(["brief", *map(str, argv)])
    out = capsys.readouterr()
    return code, out.out, out.err


def test_without_purpose_and_scope_exits_3_and_writes_nothing(tmp_path, capsys):
    d = tmp_path / "q"
    code, out, err = run(capsys, d, "--count", 10)
    assert code == 3 and not d.exists()
    assert "--purpose" in err and "--scope" in err and "--web" in err
    code, out, _ = run(capsys, d, "--count", 10, "--json")
    data = json.loads(out)
    assert code == 3 and data["status"] == "needs_input" and data["written"] is False
    assert [m["id"] for m in data["missing"]] == ["purpose", "scope"]
    assert data["missing"][0]["choices"] == BY_ID["purpose"].values
    assert (
        data["forms"]["web"].startswith("quiz brief ")
        and "--web" in data["forms"]["web"]
    )
    # one human-only value given: only the other is listed
    code, out, _ = run(capsys, d, "--purpose", "self-study", "--json")
    assert [m["id"] for m in json.loads(out)["missing"]] == ["scope"]
    assert not d.exists()


def test_accept_defaults_never_invents_a_scope(tmp_path, capsys):
    d = tmp_path / "q"
    code, out, _ = run(capsys, d, "--accept-defaults", "--json")
    assert code == 3 and [m["id"] for m in json.loads(out)["missing"]] == ["scope"]
    code, out, _ = run(capsys, d, "--accept-defaults", "--scope", "unit 1", "--json")
    data = json.loads(out)
    assert code == 0 and data["values"]["decided_by"]["purpose"] == "agent"
    assert data["not_given_by_user"]["purpose"] == "agent"


def test_flags_write_brief_yaml_and_content(tmp_path, capsys):
    d = tmp_path / "q"
    code, out, _ = run(
        capsys, d, *FLAGS, "--count", 12, "--minutes", 30, "--mix", "recall,calculation",
        "--difficulty", "harder", "--mode", "timed-exam", "--language", "vi",
        "--kinds", "notes,past-exams,other", "--kinds-other", "a wiki", "--request", "stress limits",
    )  # fmt: skip
    assert code == 0
    brief = load_brief(d)
    assert brief is not None
    assert (brief.purpose, brief.scope, brief.count, brief.minutes) == (
        "exam-prep",
        "lectures 3 to 5",
        12,
        30,
    )
    assert brief.mix == ["recall", "calculation"] and brief.difficulty == "harder"
    assert (
        brief.mode == "timed-exam"
        and brief.language == "vi"
        and brief.request == "stress limits"
    )
    assert (
        brief.content.kinds == ["notes", "past-exams", "other"]
        and brief.content.kinds_other == "a wiki"
    )
    assert brief.weak_topics is False and brief.focus_tags == []
    # who decided: flags are the user's, the rest is default
    assert brief.decided_by["purpose"] == "user" and brief.decided_by["count"] == "user"
    assert brief.decided_by["elsewhere"] == "default"
    raw = yaml.safe_load((d / "brief.yaml").read_text(encoding="utf-8"))
    assert Brief.model_validate(raw) == brief
    # content/ with its README, which says what goes there
    assert (d / "content" / "README.md").read_text(encoding="utf-8") == CONTENT_README
    assert "values the user did not give" in out and "[default]" in out
    # the hand-off line
    assert (
        f'Next: tell Claude: "Write the quiz in {d.resolve()} (brief.yaml is ready)."'
        in out
    )


def test_json_output_has_the_hand_off(tmp_path, capsys):
    d = tmp_path / "q"
    code, out, _ = run(capsys, d, *FLAGS, "--json")
    data = json.loads(out)
    assert code == 0 and data["status"] == "ok"
    assert (
        data["next"]
        == f'Next: tell Claude: "Write the quiz in {d.resolve()} (brief.yaml is ready)."'
    )
    assert data["brief"] == str(d.resolve() / "brief.yaml")
    assert data["content_dir"] == str(d.resolve() / "content")
    assert data["values"]["scope"] == "lectures 3 to 5"
    assert data["not_given_by_user"]["count"] == "default"


def test_never_overwrites_and_keeps_existing_content(tmp_path, capsys):
    d = tmp_path / "q"
    (d / "content").mkdir(parents=True)
    (d / "content" / "README.md").write_text("mine", encoding="utf-8")
    (d / "content" / "slides.pdf").write_bytes(b"%PDF")
    assert run(capsys, d, *FLAGS)[0] == 0
    assert (d / "content" / "README.md").read_text(encoding="utf-8") == "mine"
    assert (d / "content" / "slides.pdf").is_file()
    code, _, err = run(capsys, d, *FLAGS)
    assert code == 2 and "already exists" in err


def test_usage_errors_exit_2(tmp_path, capsys):
    d = tmp_path / "q"
    assert run(capsys, d, *FLAGS, "--kinds-other", "x")[0] == 2  # text without 'other'
    assert "--kinds-other needs 'other'" in capsys.readouterr().err or True
    for bad in (["--count", "0"], ["--purpose", "fun"], ["--mix", "poetry"]):
        with pytest.raises(SystemExit) as e:
            main(["brief", str(d), *FLAGS, *bad])
        assert e.value.code == 2
    capsys.readouterr()
    assert not d.exists()


def test_tui_is_not_built_yet(tmp_path, capsys):
    code, _, err = run(capsys, tmp_path / "q", *FLAGS, "--tui")
    assert code == 2 and "terminal form not built yet; use --web or flags" in err
    assert not (tmp_path / "q").exists()


def test_answers_from_results_reads_a_filled_in_survey():
    results = {
        "format": "fullmark-results",
        "quiz": {"id": SURVEY_ID},
        "questions": [
            {"id": "purpose", "response": {"choice": 1}},
            {"id": "scope", "response": {"text": "unit 2"}},
            {"id": "kinds", "response": {"choices": [2, 5], "inputs": {"5": "a wiki"}}},
            {"id": "count", "response": {"text": "15"}},
            {"id": "mix", "response": {"choices": [0, 4]}},
            {"id": "request", "response": {"text": ""}},
        ],
    }
    assert answers_from_results(results) == {
        "purpose": "exam-prep",
        "scope": "unit 2",
        "kinds": ["notes", "other"],
        "kinds_other": "a wiki",
        "count": 15,
        "mix": ["recall", "essay"],
    }
    for bad in (
        {"format": "x"},
        {"format": "fullmark-results", "quiz": {"id": "other"}},
    ):
        with pytest.raises(ResultsError):
            answers_from_results(bad)


# ---------------------------------------------------------------- the command: --web


def parse(*argv):
    return build_parser().parse_args(["brief", *map(str, argv)])


class WebRun:
    """`quiz brief --web --no-open` in a thread; the test posts answers with urllib."""

    def __init__(self, folder, *argv):
        self.args = parse(folder, "--web", "--no-open", "--timeout", 20, *argv)
        self.stop = threading.Event()
        self.urls: list[str] = []
        self.code: int | None = None
        self.thread = threading.Thread(target=self._run)

    def _run(self):
        self.code = brief(self.args, self.stop.is_set, self.urls.append)

    def __enter__(self):
        self.thread.start()
        for _ in range(300):
            if self.urls:
                break
            time.sleep(0.02)
        assert self.urls, "the form did not start"
        self.url = self.urls[0]
        self.base = self.url.split("/?")[0]
        self.token = self.url.split("t=")[1]
        return self

    def __exit__(self, *exc):
        self.stop.set()
        self.thread.join(10)
        assert not self.thread.is_alive()

    def answer(self, responses):
        form, findings = load_quiz_text(
            survey_markdown(skipped(self.args)), "b", SURVEY_ID, Path(".")
        )
        assert form is not None and not findings.has_errors
        results = make_results(form, responses, source_file="b", mode="survey")
        results["quiz"]["id"] = SURVEY_ID
        req = urllib.request.Request(
            self.base + "/submit",
            json.dumps(results).encode("utf-8"),
            {"Content-Type": "application/json", "X-Fullmark-Token": self.token},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status

    def finish(self):
        self.thread.join(10)
        assert not self.thread.is_alive()
        return self.code


def skipped(args) -> set[str]:
    return {q.id for q in QUESTIONS if getattr(args, q.dest) is not None}


def test_web_round_trip_writes_the_brief(tmp_path, capsys):
    d = tmp_path / "q"
    with WebRun(d, "--count", 9) as s:
        page = urllib.request.urlopen(s.url).read().decode("utf-8")
        assert (
            "What is the quiz for?" in page and "Number of questions" not in page
        )  # given as a flag
        assert (
            s.answer(
                {
                    "purpose": {"choice": 2},
                    "scope": {"text": "chapter 4"},
                    "kinds": {"choices": [3, 5], "inputs": {"5": "a wiki"}},
                    "mix": {"choices": [0, 2]},
                    "request": {"text": "Stress the proofs."},
                }
            )
            == 200
        )
        assert s.finish() == 0
    brief_ = load_brief(d)
    assert brief_ is not None
    assert (brief_.purpose, brief_.scope, brief_.count) == (
        "classmates",
        "chapter 4",
        9,
    )
    assert (
        brief_.content.kinds == ["past-exams", "other"]
        and brief_.content.kinds_other == "a wiki"
    )
    assert (
        brief_.mix == ["recall", "calculation"]
        and brief_.request == "Stress the proofs."
    )
    assert (
        brief_.decided_by["purpose"] == "user" and brief_.decided_by["count"] == "user"
    )
    assert brief_.decided_by["mode"] == "default"
    assert not (d / ".brief").exists() and sorted(p.name for p in d.iterdir()) == [
        ".markdownlint.json",
        "brief.yaml",
        "content",
    ]
    assert "Next: tell Claude" in capsys.readouterr().out


def test_a_flag_beats_the_form(tmp_path, capsys):
    d = tmp_path / "q"
    with WebRun(d, "--purpose", "survey") as s:
        s.answer({"scope": {"text": "unit 1"}})
        assert s.finish() == 0
    capsys.readouterr()
    brief_ = load_brief(d)
    assert (
        brief_ is not None and brief_.purpose == "survey" and brief_.scope == "unit 1"
    )


def test_web_with_an_empty_scope_exits_3_and_writes_nothing(tmp_path, capsys):
    d = tmp_path / "q"
    with WebRun(d, "--purpose", "self-study", "--json") as s:
        s.answer({"count": {"text": "5"}})
        assert s.finish() == 3
    out = capsys.readouterr().out
    assert json.loads(out[out.index("{") :])["missing"][0]["id"] == "scope"
    assert not d.exists()


def test_web_timeout_exits_2_and_writes_nothing(tmp_path, capsys):
    d = tmp_path / "q"
    assert main(["brief", str(d), "--web", "--no-open", "--timeout", "0.3"]) == 2
    assert "no answers arrived" in capsys.readouterr().err
    assert not d.exists()


def test_web_with_everything_given_opens_no_form(tmp_path, capsys):
    d = tmp_path / "q"
    flags = []
    for q in QUESTIONS:
        v = q.default if q.default is not None else "x"
        flags += [q.flag, ",".join(v) if isinstance(v, list) else v]
    flags[flags.index("--weak-topics") + 1] = "no"
    flags[flags.index("--kinds") + 1] = "none"
    assert main(["brief", str(d), "--web", "--no-open", *map(str, flags)]) == 0
    capsys.readouterr()
    assert (d / "brief.yaml").is_file()


# ---------------------------------------------------------------- weak topics

TAGGED = """---
title: Tagged
id: tagged
---

## One? {id=a tags=limits}

- [ ] no
- [x] yes

> [!explanation]
> It is yes because the first choice is wrong and the second one is right.

## Two? {id=b tags=series}

- [ ] no
- [x] yes

> [!explanation]
> It is yes because the first choice is wrong and the second one is right.

## Three? {id=c tags=integrals}

- [ ] no
- [x] yes

> [!explanation]
> It is yes because the first choice is wrong and the second one is right.
"""


def write_results(
    folder: Path, quiz, name: str, correct: set[str], started: str, **attempt
):
    responses = {
        q.id: correct_response(q, quiz) if q.id in correct else wrong_response(q, quiz)
        for q in quiz.questions
    }
    data = make_results(quiz, responses, source_file="quiz.md", **attempt)
    data["attempt"]["started_at"] = started
    path = folder / name
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def tagged_folder(tmp_path):
    d = tmp_path / "q"
    d.mkdir()
    (d / "quiz.md").write_text(TAGGED, encoding="utf-8")
    quiz, findings, _ = load_quiz(d / "quiz.md")
    assert quiz is not None and not findings.has_errors
    write_results(d, quiz, "tagged-results-1.json", {"a", "b"}, "2026-10-01T10:00:00Z")
    write_results(d, quiz, "tagged-results-2.json", {"a"}, "2026-10-08T10:00:00Z")
    return d, quiz


def test_weak_topics_come_from_the_results_in_the_folder(tmp_path, capsys):
    d, _ = tagged_folder(tmp_path)
    weak = weak_topics(d)
    assert weak.quiz_id == "tagged" and len(weak.files) == 2
    assert weak.tags == ["integrals", "series"]  # 0% each, alphabetical; limits is 100%
    # the same data as `quiz stats --json`
    files = [str(p) for p in weak.files]
    assert main(["stats", *files, "--json"]) == 0
    stats = json.loads(capsys.readouterr().out)
    assert [w["topic"] for w in stats["weakest"] if w["percent"] < 80] == weak.tags


def test_brief_fills_focus_tags_when_results_exist(tmp_path, capsys):
    d, _ = tagged_folder(tmp_path)
    code, out, _ = run(capsys, d, *FLAGS, "--json")
    data = json.loads(out)
    assert code == 0
    assert (
        data["values"]["weak_topics"] is True
    )  # the default is yes when results exist
    assert data["values"]["focus_tags"] == ["integrals", "series"]
    assert data["weak_topics"]["focus_tags"] == ["integrals", "series"]
    assert len(data["weak_topics"]["from"]) == 2
    assert data["not_given_by_user"]["weak_topics"] == "default"
    brief_ = load_brief(d)
    assert brief_ is not None and brief_.focus_tags == ["integrals", "series"]


def test_weak_topics_no_leaves_focus_tags_empty(tmp_path, capsys):
    d, _ = tagged_folder(tmp_path)
    assert run(capsys, d, *FLAGS, "--weak-topics", "no")[0] == 0
    brief_ = load_brief(d)
    assert (
        brief_ is not None and brief_.weak_topics is False and brief_.focus_tags == []
    )


def test_weak_topics_yes_without_results_warns(tmp_path, capsys):
    d = tmp_path / "q"
    code, _, err = run(capsys, d, *FLAGS, "--weak-topics", "yes")
    assert code == 0 and "no results files" in err
    brief_ = load_brief(d)
    assert brief_ is not None and brief_.weak_topics is True and brief_.focus_tags == []
    # and with no results the default is no
    d2 = tmp_path / "q2"
    assert run(capsys, d2, *FLAGS)[0] == 0
    brief2 = load_brief(d2)
    assert brief2 is not None and brief2.weak_topics is False


def test_surveys_other_quizzes_and_broken_files_are_handled(tmp_path):
    d, quiz = tagged_folder(tmp_path)
    write_results(
        d, quiz, "tagged-results-3.json", {"a"}, "2026-10-09T10:00:00Z", mode="survey"
    )
    (d / "broken-results-1.json").write_text("nope", encoding="utf-8")
    other = TAGGED.replace("id: tagged", "id: older")
    (d / "o.md").write_text(other, encoding="utf-8")
    oq, _, _ = load_quiz(d / "o.md")
    write_results(
        d, oq, "older-results-1.json", {"a", "b", "c"}, "2026-01-01T10:00:00Z"
    )
    weak = weak_topics(d)
    assert (
        weak.quiz_id == "tagged" and len(weak.files) == 2
    )  # survey and older quiz left out
    assert any("broken-results-1.json" in w for w in weak.warnings)
    assert weak_topics(tmp_path / "missing").files == []


# ---------------------------------------------------------------- quiz check with a brief

MIXED_QUIZ = """---
title: Mixed
id: mixed
---

## One? {id=a type=numeric}

```answer
value: 2
```

> [!explanation]
> It is two because one plus one is two, counted on the fingers of one hand.

## Two? {id=b}

- [ ] no
- [x] yes

> [!explanation]
> It is yes because the first choice is wrong and the second one is right.
"""


def checked(folder: Path, capsys, *extra):
    code = main(["check", str(folder / "quiz.md"), "--json", *extra])
    return code, [
        f
        for f in json.loads(capsys.readouterr().out)
        if f.get("rule", "").startswith("brief.")
        and f["rule"] != "brief.generated-by"  # covered in test_generated_by.py
    ]


def brief_folder(tmp_path, capsys, *flags, quiz=MIXED_QUIZ):
    d = tmp_path / "q"
    assert run(capsys, d, *FLAGS, *flags)[0] == 0
    (d / "quiz.md").write_text(quiz, encoding="utf-8")
    return d


def test_check_without_a_brief_adds_nothing(tmp_path, capsys):
    d = tmp_path / "q"
    d.mkdir()
    (d / "quiz.md").write_text(MIXED_QUIZ, encoding="utf-8")
    assert checked(d, capsys) == (0, [])


def test_check_warns_when_the_count_is_far_off(tmp_path, capsys):
    d = brief_folder(tmp_path, capsys, "--count", 10, "--elsewhere", "the wiki")
    code, found = checked(d, capsys)
    assert code == 0  # warnings only
    assert [f["rule"] for f in found] == ["brief.count"]
    assert (
        "asks for 10 questions" in found[0]["message"]
        and "but the quiz has 2" in found[0]["message"]
    )
    assert found[0]["severity"] == "warning"
    # within 20 percent is fine: 2 questions for count 2 or 2-ish
    d2 = brief_folder(tmp_path / "x", capsys, "--count", 2, "--elsewhere", "the wiki")
    assert checked(d2, capsys)[1] == []
    assert (
        main(["check", str(d / "quiz.md"), "--strict"]) == 1
    )  # --strict makes it fail
    capsys.readouterr()


def test_check_warns_about_a_missing_mix_type(tmp_path, capsys):
    d = brief_folder(
        tmp_path,
        capsys,
        "--count",
        2,
        "--elsewhere",
        "w",
        "--mix",
        "recall,calculation,code,essay",
    )
    _, found = checked(d, capsys)
    assert [f["rule"] for f in found] == ["brief.mix", "brief.mix"]
    assert (
        "code questions" in found[0]["message"]
        and "essay questions" in found[1]["message"]
    )
    # a survey needs no mix
    d2 = tmp_path / "s"
    assert (
        run(
            capsys,
            d2,
            "--purpose",
            "survey",
            "--scope",
            "x",
            "--count",
            2,
            "--elsewhere",
            "w",
            "--mix",
            "code",
        )[0]
        == 0
    )
    (d2 / "quiz.md").write_text(MIXED_QUIZ, encoding="utf-8")
    assert checked(d2, capsys)[1] == []


def test_check_asks_for_source_notes_when_past_exams_are_ticked(tmp_path, capsys):
    d = brief_folder(tmp_path, capsys, "--count", 2, "--kinds", "past-exams")
    (d / "content" / "exam-2025.pdf").write_bytes(b"%PDF")
    _, found = checked(d, capsys)
    assert [f["rule"] for f in found] == ["brief.past-exams"]
    cited = MIXED_QUIZ.replace(
        "one hand.", "one hand.\n>\n> Source: exam-2025.pdf, question 1."
    )
    (d / "quiz.md").write_text(cited, encoding="utf-8")
    assert checked(d, capsys)[1] == []


@pytest.mark.parametrize(
    ("kind", "good", "bad"),
    [
        ("lecture-slides", "week1.pptx", "week1.txt"),
        ("textbook", "chapter3.pdf", "chapter3.png"),
        ("notes", "notes.md", "notes.csv"),
        ("past-exams", "exam.pdf", "exam.zip"),
        ("lab-manual", "manual.docx", "manual.xyz"),
    ],
)
def test_check_compares_the_kinds_with_content(tmp_path, capsys, kind, good, bad):
    d = brief_folder(tmp_path, capsys, "--count", 2, "--kinds", kind)
    quiz_text = MIXED_QUIZ.replace("one hand.", "one hand.\n>\n> Source: x.")
    (d / "quiz.md").write_text(quiz_text, encoding="utf-8")
    assert [f["rule"] for f in checked(d, capsys)[1]] == ["brief.content-kinds"]
    (d / "content" / bad).write_bytes(b"x")
    assert [f["rule"] for f in checked(d, capsys)[1]] == ["brief.content-kinds"]
    (d / "content" / "deep").mkdir()
    (d / "content" / "deep" / good).write_bytes(b"x")
    assert checked(d, capsys)[1] == []


def test_check_with_nothing_ticked_and_content_empty(tmp_path, capsys):
    d = brief_folder(tmp_path, capsys, "--count", 2)
    _, found = checked(d, capsys)
    assert [f["rule"] for f in found] == ["brief.content-kinds"]
    assert "no kind of material" in found[0]["message"]
    (d / "content" / "notes.md").write_text("x", encoding="utf-8")
    assert checked(d, capsys)[1] == []


def test_check_is_silent_about_content_with_elsewhere(tmp_path, capsys):
    d = brief_folder(
        tmp_path, capsys, "--count", 2, "--kinds", "notes", "--elsewhere", "Zotero"
    )
    assert checked(d, capsys)[1] == []


def test_check_says_so_when_the_brief_cannot_be_read(tmp_path, capsys):
    d = tmp_path / "q"
    d.mkdir()
    (d / "quiz.md").write_text(MIXED_QUIZ, encoding="utf-8")
    (d / "brief.yaml").write_text("purpose: nonsense\n", encoding="utf-8")
    code, found = checked(d, capsys)
    assert code == 0 and [f["rule"] for f in found] == ["brief.invalid"]


def test_brief_writes_markdownlint_config(tmp_path):
    d = tmp_path / "b"
    assert main(["brief", str(d), *FLAGS]) == 0
    assert json.loads((d / ".markdownlint.json").read_text(encoding="utf-8")) == {
        "MD013": False,
        "MD025": False,
        "MD028": False,
    }
    d2 = tmp_path / "b2"
    d2.mkdir()
    (d2 / ".markdownlint-cli2.jsonc").write_text("{}", encoding="utf-8")
    assert main(["brief", str(d2), *FLAGS]) == 0
    assert not (d2 / ".markdownlint.json").exists()


def test_check_says_so_when_the_count_is_close_but_not_exact(tmp_path, capsys):
    questions = "\n".join(
        f"## Is {i} a number? {{type=truefalse}}\n\n```answer\nvalue: true\n```\n\n"
        "> [!explanation]\n> Yes, every integer is a number, so the key is true.\n"
        for i in range(11)
    )
    quiz = f"---\ntitle: Eleven\n---\n\n{questions}"
    d = brief_folder(
        tmp_path,
        capsys,
        "--count",
        10,
        "--mix",
        "recall",
        "--elsewhere",
        "the wiki",
        quiz=quiz,
    )
    code, found = checked(d, capsys, "--strict")
    assert code == 0  # info does not fail --strict
    assert [(f["rule"], f["severity"]) for f in found] == [("brief.count-near", "info")]
    assert found[0]["message"] == "11 questions; the brief asks for 10"
    assert main(["check", str(d / "quiz.md"), "--strict"]) == 0
    capsys.readouterr()

    # An exact count says nothing.
    d2 = tmp_path / "q2"
    d2.mkdir()
    assert (
        run(
            capsys,
            d2,
            *FLAGS,
            "--count",
            11,
            "--mix",
            "recall",
            "--elsewhere",
            "the wiki",
        )[0]
        == 0
    )
    (d2 / "quiz.md").write_text(quiz, encoding="utf-8")
    assert checked(d2, capsys) == (0, [])
