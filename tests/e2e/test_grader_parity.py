"""The browser grader must agree with grading.py on every golden case."""

import json
from pathlib import Path

CASES = json.loads(
    (Path(__file__).parent.parent / "grading_cases.json").read_text(encoding="utf-8")
)


def test_js_grader_matches_golden_cases(page, kitchen_html):
    page.goto(kitchen_html.as_uri())
    got = page.evaluate(
        "cases => cases.map(c => window.fullmark.gradeQuestion(c.type, c.spec, c.response))",
        CASES,
    )
    bad = []
    for c, g in zip(CASES, got, strict=True):
        ok = g["status"] == c["expected_status"]
        if c["expected_earned"] is None:
            ok = ok and g["earned"] is None
        else:
            ok = (
                ok
                and g["earned"] is not None
                and abs(g["earned"] - c["expected_earned"]) < 1e-9
            )
        if "expected_results" in c:
            ok = ok and g.get("results") == c["expected_results"]
        if not ok:
            bad.append((c["name"], g, c["expected_status"], c["expected_earned"]))
    assert not bad, bad
    assert not page.errors


def test_js_grader_matches_python_on_fuzzed_numbers(page, kitchen_html):
    from fullmark.grading import grade_question

    page.goto(kitchen_html.as_uri())
    raws = [
        "1/3",
        "0.33",
        "-0",
        "1e2",
        "100",
        " 5 ",
        "5.",
        ".5",
        "+.5",
        "1/ 3",
        "1,5",
        "0x1",
        "",
        "--1",
        "1e",
        "1/0",
        "\u22122",
    ]
    spec = {"points": 1, "values": [0.5, 100], "tolerance": 0.01, "rel_tolerance": None}
    got = page.evaluate(
        "([spec, raws]) => raws.map(r => window.fullmark.gradeQuestion('numeric', spec, {raw: r}))",
        [spec, raws],
    )
    for raw, g in zip(raws, got, strict=True):
        want = grade_question("numeric", spec, {"raw": raw})
        assert (g["status"], g["earned"]) == (want["status"], want["earned"]), raw
