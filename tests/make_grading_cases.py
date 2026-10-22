"""Write tests/grading_cases.json: golden cases shared by the Python and JavaScript graders.

Expectations are written by hand (never computed by the graders).
Run: uv run python tests/make_grading_cases.py
"""

import json
from pathlib import Path

CASES: list[dict] = []


def case(name, qtype, spec, response, earned, status, **extra):
    spec = {"points": 1, "case": "insensitive", **spec}
    row = {"name": name, "type": qtype, "spec": spec, "response": response}
    row.update(expected_earned=earned, expected_status=status, **extra)
    CASES.append(row)


# ---------------------------------------------------------------- single
S = {"correct": 1}
case("single right", "single", S, {"choice": 1}, 1, "correct")
case("single wrong", "single", S, {"choice": 0}, 0, "incorrect")
case(
    "single first index right",
    "single",
    {"correct": 0, "points": 2},
    {"choice": 0},
    2,
    "correct",
)
case("single unanswered null", "single", S, None, 0, "unanswered")
case("single unanswered empty", "single", S, {}, 0, "unanswered")
case("single unanswered choice null", "single", S, {"choice": None}, 0, "unanswered")

# ---------------------------------------------------------------- multi
M = {"correct": [0, 2], "points": 2}
case("multi exact", "multi", M, {"choices": [0, 2]}, 2, "correct")
case("multi exact other order", "multi", M, {"choices": [2, 0]}, 2, "correct")
case("multi half", "multi", M, {"choices": [0]}, 1, "partial")
case("multi one right one wrong", "multi", M, {"choices": [0, 1]}, 0, "incorrect")
case("multi right plus wrong", "multi", M, {"choices": [0, 2, 1]}, 1, "partial")
case("multi only wrong", "multi", M, {"choices": [1]}, 0, "incorrect")
case("multi floor at zero", "multi", M, {"choices": [1, 3]}, 0, "incorrect")
case("multi unanswered", "multi", M, {"choices": []}, 0, "unanswered")
case("multi null", "multi", M, None, 0, "unanswered")
case(
    "multi thirds rounded",
    "multi",
    {"correct": [0, 1, 2], "points": 1},
    {"choices": [0]},
    0.33,
    "partial",
)
case(
    "multi two thirds rounded",
    "multi",
    {"correct": [0, 1, 2], "points": 1},
    {"choices": [0, 1]},
    0.67,
    "partial",
)
case(
    "multi a-o-n exact",
    "multi",
    {**M, "scoring": "all_or_nothing"},
    {"choices": [0, 2]},
    2,
    "correct",
)
case(
    "multi a-o-n partial gets zero",
    "multi",
    {**M, "scoring": "all_or_nothing"},
    {"choices": [0]},
    0,
    "incorrect",
)
case(
    "multi a-o-n extra gets zero",
    "multi",
    {**M, "scoring": "all_or_nothing"},
    {"choices": [0, 1, 2]},
    0,
    "incorrect",
)
case(
    "multi single correct set",
    "multi",
    {"correct": [1], "points": 1},
    {"choices": [1]},
    1,
    "correct",
)

# ---------------------------------------------------------------- truefalse
case("tf true right", "truefalse", {"value": True}, {"value": True}, 1, "correct")
case("tf false right", "truefalse", {"value": False}, {"value": False}, 1, "correct")
case("tf wrong", "truefalse", {"value": True}, {"value": False}, 0, "incorrect")
case("tf unanswered", "truefalse", {"value": True}, None, 0, "unanswered")
case(
    "tf unanswered null value",
    "truefalse",
    {"value": False},
    {"value": None},
    0,
    "unanswered",
)

# ---------------------------------------------------------------- numeric
N = {"values": [0.3333], "tolerance": 0.001, "rel_tolerance": None}
case("num exact", "numeric", N, {"raw": "0.3333"}, 1, "correct")
case("num within tolerance", "numeric", N, {"raw": "0.3340"}, 1, "correct")
case("num boundary inclusive", "numeric", N, {"raw": "0.3343"}, 1, "correct")
case("num outside tolerance", "numeric", N, {"raw": "0.335"}, 0, "incorrect")
case("num fraction", "numeric", N, {"raw": "1/3"}, 1, "correct")
case("num fraction spaces", "numeric", N, {"raw": " 1 / 3 "}, 1, "correct")
case("num fraction zero denominator", "numeric", N, {"raw": "1/0"}, 0, "incorrect")
case(
    "num scientific",
    "numeric",
    {"values": [0.001], "tolerance": 0},
    {"raw": "1e-3"},
    1,
    "correct",
)
case(
    "num scientific capital",
    "numeric",
    {"values": [1500], "tolerance": 0},
    {"raw": "1.5E3"},
    1,
    "correct",
)
case(
    "num integer",
    "numeric",
    {"values": [42], "tolerance": 0},
    {"raw": "42"},
    1,
    "correct",
)
case(
    "num negative",
    "numeric",
    {"values": [-1], "tolerance": 0},
    {"raw": "-1"},
    1,
    "correct",
)
case(
    "num unicode minus",
    "numeric",
    {"values": [-1], "tolerance": 0},
    {"raw": "\N{MINUS SIGN}1"},
    1,
    "correct",
)
case(
    "num leading plus",
    "numeric",
    {"values": [5], "tolerance": 0},
    {"raw": "+5"},
    1,
    "correct",
)
case(
    "num leading dot",
    "numeric",
    {"values": [0.5], "tolerance": 0},
    {"raw": ".5"},
    1,
    "correct",
)
case(
    "num comma decimal rejected",
    "numeric",
    {"values": [3.14], "tolerance": 0.01},
    {"raw": "3,14"},
    0,
    "incorrect",
)
case("num garbage", "numeric", N, {"raw": "abc"}, 0, "incorrect")
case("num empty", "numeric", N, {"raw": "  "}, 0, "unanswered")
case("num null response", "numeric", N, None, 0, "unanswered")
case(
    "num relative within",
    "numeric",
    {"values": [100], "rel_tolerance": 0.01},
    {"raw": "100.9"},
    1,
    "correct",
)
case(
    "num relative outside",
    "numeric",
    {"values": [100], "rel_tolerance": 0.01},
    {"raw": "102"},
    0,
    "incorrect",
)
case(
    "num relative negative target",
    "numeric",
    {"values": [-200], "rel_tolerance": 0.05},
    {"raw": "-195"},
    1,
    "correct",
)
case(
    "num several values second",
    "numeric",
    {"values": [2, -2], "tolerance": 0},
    {"raw": "-2"},
    1,
    "correct",
)
case(
    "num zero tolerance wrong",
    "numeric",
    {"values": [2], "tolerance": 0},
    {"raw": "2.0001"},
    0,
    "incorrect",
)

# ---------------------------------------------------------------- short
SH = {"accept": ["3"], "patterns": []}
case("short exact", "short", SH, {"text": "3"}, 1, "correct")
case("short trims", "short", SH, {"text": "  3  "}, 1, "correct")
case("short wrong", "short", SH, {"text": "4"}, 0, "incorrect")
case("short empty", "short", SH, {"text": ""}, 0, "unanswered")
case("short whitespace only", "short", SH, {"text": "   "}, 0, "unanswered")
case("short null", "short", SH, None, 0, "unanswered")
case(
    "short case insensitive",
    "short",
    {"accept": ["Hello World"], "patterns": []},
    {"text": "hello WORLD"},
    1,
    "correct",
)
case(
    "short case sensitive wrong",
    "short",
    {"accept": ["Hello"], "patterns": [], "case": "sensitive"},
    {"text": "hello"},
    0,
    "incorrect",
)
case(
    "short case sensitive right",
    "short",
    {"accept": ["Hello"], "patterns": [], "case": "sensitive"},
    {"text": "Hello"},
    1,
    "correct",
)
case(
    "short collapses whitespace",
    "short",
    {"accept": ["a b c"], "patterns": []},
    {"text": "a   b\t c"},
    1,
    "correct",
)
case(
    "short second accept",
    "short",
    {"accept": ["x", "y"], "patterns": []},
    {"text": "y"},
    1,
    "correct",
)
case(
    "short pattern full match",
    "short",
    {"accept": [], "patterns": ["^3(\\.0)?$"]},
    {"text": "3.0"},
    1,
    "correct",
)
case(
    "short pattern must be full",
    "short",
    {"accept": [], "patterns": ["3"]},
    {"text": "33"},
    0,
    "incorrect",
)
case(
    "short pattern case sensitive",
    "short",
    {"accept": [], "patterns": ["A+"], "case": "sensitive"},
    {"text": "aaa"},
    0,
    "incorrect",
)
case(
    "short pattern case insensitive",
    "short",
    {"accept": [], "patterns": ["A+"]},
    {"text": "aaa"},
    1,
    "correct",
)
case(
    "short pattern digits ascii",
    "short",
    {"accept": [], "patterns": ["\\d+"]},
    {"text": "٣"},
    0,
    "incorrect",
)
case(
    "short unicode accept",
    "short",
    {"accept": ["Na⁺"], "patterns": []},
    {"text": "na⁺"},
    1,
    "correct",
)
case(
    "short points kept",
    "short",
    {"accept": ["ok"], "patterns": [], "points": 4},
    {"text": "ok"},
    4,
    "correct",
)

# ---------------------------------------------------------------- blanks
B2 = {
    "blanks": [
        {"numeric": False, "accept": ["cos x", "cos(x)"]},
        {"numeric": False, "accept": ["e^x", "exp(x)"]},
    ]
}
case(
    "blanks all right",
    "blanks",
    {**B2, "points": 2},
    {"blanks": ["cos x", "e^x"]},
    2,
    "correct",
    expected_results=[True, True],
)
case(
    "blanks variant",
    "blanks",
    {**B2, "points": 2},
    {"blanks": ["cos(x)", "EXP(x)"]},
    2,
    "correct",
    expected_results=[True, True],
)
case(
    "blanks one of two",
    "blanks",
    {**B2, "points": 2},
    {"blanks": ["cos x", "x"]},
    1,
    "partial",
    expected_results=[True, False],
)
case(
    "blanks none right",
    "blanks",
    {**B2, "points": 2},
    {"blanks": ["a", "b"]},
    0,
    "incorrect",
    expected_results=[False, False],
)
case(
    "blanks all empty",
    "blanks",
    {**B2, "points": 2},
    {"blanks": ["", ""]},
    0,
    "unanswered",
    expected_results=[False, False],
)
case(
    "blanks null",
    "blanks",
    {**B2, "points": 2},
    None,
    0,
    "unanswered",
    expected_results=[False, False],
)
case(
    "blanks short list",
    "blanks",
    {**B2, "points": 2},
    {"blanks": ["cos x"]},
    1,
    "partial",
    expected_results=[True, False],
)
case(
    "blanks split in thirds",
    "blanks",
    {"blanks": [{"numeric": False, "accept": ["a"]}] * 3, "points": 1},
    {"blanks": ["a", "x", "x"]},
    0.33,
    "partial",
    expected_results=[True, False, False],
)
case(
    "blanks case sensitive",
    "blanks",
    {"blanks": [{"numeric": False, "accept": ["mut"]}], "case": "sensitive"},
    {"blanks": ["Mut"]},
    0,
    "incorrect",
    expected_results=[False],
)
BN = {"blanks": [{"numeric": True, "value": 0.5, "tolerance": 0.01}]}
case(
    "blanks numeric within",
    "blanks",
    BN,
    {"blanks": ["0.505"]},
    1,
    "correct",
    expected_results=[True],
)
case(
    "blanks numeric fraction",
    "blanks",
    BN,
    {"blanks": ["1/2"]},
    1,
    "correct",
    expected_results=[True],
)
case(
    "blanks numeric outside",
    "blanks",
    BN,
    {"blanks": ["0.6"]},
    0,
    "incorrect",
    expected_results=[False],
)
case(
    "blanks numeric text",
    "blanks",
    BN,
    {"blanks": ["half"]},
    0,
    "incorrect",
    expected_results=[False],
)
case(
    "blanks symbol",
    "blanks",
    {"blanks": [{"numeric": False, "accept": ["&"]}]},
    {"blanks": ["&"]},
    1,
    "correct",
    expected_results=[True],
)


# ---------------------------------------------------------------- fields
def fld(label, **kw):
    base = {
        "label": label,
        "kind": "none",
        "points": None,
        "values": [],
        "tolerance": 0,
        "rel_tolerance": None,
        "accept": [],
        "patterns": [],
    }
    return {**base, **kw}


F4 = {
    "points": 4,
    "fields": [
        fld("f'", kind="text", accept=["3x^2-3", "3x^2 - 3"]),
        fld("count", kind="numeric", values=[2]),
        fld("max", kind="numeric", values=[-1]),
        fld("min", kind="numeric", values=[1]),
    ],
}
case(
    "fields all right",
    "fields",
    F4,
    {"fields": ["3x^2-3", "2", "-1", "1"]},
    4,
    "correct",
    expected_results=[True, True, True, True],
)
case(
    "fields text variant",
    "fields",
    F4,
    {"fields": ["3x^2 - 3", "2", "-1", "1"]},
    4,
    "correct",
    expected_results=[True, True, True, True],
)
case(
    "fields half",
    "fields",
    F4,
    {"fields": ["3x^2-3", "2", "1", "-1"]},
    2,
    "partial",
    expected_results=[True, True, False, False],
)
case(
    "fields none right",
    "fields",
    F4,
    {"fields": ["x", "9", "9", "9"]},
    0,
    "incorrect",
    expected_results=[False, False, False, False],
)
case(
    "fields all empty",
    "fields",
    F4,
    {"fields": ["", "", "", ""]},
    0,
    "unanswered",
    expected_results=[False, False, False, False],
)
case(
    "fields null",
    "fields",
    F4,
    None,
    0,
    "unanswered",
    expected_results=[False, False, False, False],
)
case(
    "fields one filled",
    "fields",
    F4,
    {"fields": ["", "2"]},
    1,
    "partial",
    expected_results=[False, True, False, False],
)
FX = {
    "points": 3,
    "fields": [
        fld("a", kind="numeric", values=[1]),
        fld("free text", kind="none"),
        fld("b", kind="text", accept=["yes"]),
    ],
}
case(
    "fields ungraded ignored",
    "fields",
    FX,
    {"fields": ["1", "anything", "yes"]},
    3,
    "correct",
    expected_results=[True, None, True],
)
case(
    "fields ungraded half",
    "fields",
    FX,
    {"fields": ["1", "anything", "no"]},
    1.5,
    "partial",
    expected_results=[True, None, False],
)
case(
    "fields only ungraded answered is not scored",
    "fields",
    FX,
    {"fields": ["", "essay", ""]},
    0,
    "unanswered",
    expected_results=[False, None, False],
)
FP = {
    "points": 4,
    "fields": [
        fld("big", kind="numeric", values=[1], points=3),
        fld("small", kind="numeric", values=[2]),
    ],
}
case(
    "fields explicit points big only",
    "fields",
    FP,
    {"fields": ["1", "0"]},
    3,
    "partial",
    expected_results=[True, False],
)
case(
    "fields explicit points small only",
    "fields",
    FP,
    {"fields": ["0", "2"]},
    1,
    "partial",
    expected_results=[False, True],
)
case(
    "fields numeric tolerance",
    "fields",
    {"points": 1, "fields": [fld("x", kind="numeric", values=[10], tolerance=0.5)]},
    {"fields": ["10.4"]},
    1,
    "correct",
    expected_results=[True],
)
case(
    "fields text pattern",
    "fields",
    {"points": 1, "fields": [fld("x", kind="text", patterns=["a+b"])]},
    {"fields": ["AAB"]},
    1,
    "correct",
    expected_results=[True],
)
case(
    "fields all ungraded",
    "fields",
    {"points": 2, "fields": [fld("x")]},
    {"fields": ["notes"]},
    None,
    "pending",
)

# ---------------------------------------------------------------- essay / code
case(
    "essay answered is pending",
    "essay",
    {"points": 10},
    {"text": "Some words here.", "word_count": 3},
    None,
    "pending",
)
case("essay empty", "essay", {"points": 10}, {"text": "  "}, None, "unanswered")
case("essay null", "essay", {"points": 10}, None, None, "unanswered")
case(
    "code answered is pending",
    "code",
    {"points": 3},
    {"language": "rust", "code": "fn f() {}"},
    None,
    "pending",
)
case(
    "code empty",
    "code",
    {"points": 3},
    {"language": "rust", "code": ""},
    None,
    "unanswered",
)
case("code null", "code", {"points": 3}, None, None, "unanswered")

# ---------------------------------------------------------------- ordering
O = {"n": 4, "points": 4}
case(
    "ordering exact",
    "ordering",
    O,
    {"order": [0, 1, 2, 3]},
    4,
    "correct",
    expected_results=[True, True, True, True],
)
case(
    "ordering two swapped",
    "ordering",
    O,
    {"order": [1, 0, 2, 3]},
    2,
    "partial",
    expected_results=[False, False, True, True],
)
case(
    "ordering reversed even",
    "ordering",
    O,
    {"order": [3, 2, 1, 0]},
    0,
    "incorrect",
    expected_results=[False, False, False, False],
)
case(
    "ordering reversed odd keeps middle",
    "ordering",
    {"n": 3, "points": 3},
    {"order": [2, 1, 0]},
    1,
    "partial",
    expected_results=[False, True, False],
)
case(
    "ordering a-o-n exact",
    "ordering",
    {**O, "scoring": "all_or_nothing"},
    {"order": [0, 1, 2, 3]},
    4,
    "correct",
)
case(
    "ordering a-o-n one wrong gets zero",
    "ordering",
    {**O, "scoring": "all_or_nothing"},
    {"order": [0, 1, 3, 2]},
    0,
    "incorrect",
)
case(
    "ordering thirds rounded",
    "ordering",
    {"n": 3, "points": 1},
    {"order": [0, 2, 1]},
    0.33,
    "partial",
)
case("ordering null", "ordering", O, None, 0, "unanswered")
case("ordering empty", "ordering", O, {}, 0, "unanswered")
case("ordering wrong length", "ordering", O, {"order": [0, 1]}, 0, "unanswered")

# ---------------------------------------------------------------- matching
X = {"answer": [0, 1, 2], "points": 3}
case(
    "matching all right",
    "matching",
    X,
    {"pairs": [0, 1, 2]},
    3,
    "correct",
    expected_results=[True, True, True],
)
case(
    "matching one right",
    "matching",
    X,
    {"pairs": [0, 2, 1]},
    1,
    "partial",
    expected_results=[True, False, False],
)
case(
    "matching distractor chosen",
    "matching",
    X,
    {"pairs": [3, 3, 3]},
    0,
    "incorrect",
    expected_results=[False, False, False],
)
case(
    "matching some left empty",
    "matching",
    X,
    {"pairs": [0, None, None]},
    1,
    "partial",
    expected_results=[True, False, False],
)
case(
    "matching short list is padded",
    "matching",
    X,
    {"pairs": [0, 1]},
    2,
    "partial",
    expected_results=[True, True, False],
)
case(
    "matching all empty",
    "matching",
    X,
    {"pairs": [None, None, None]},
    0,
    "unanswered",
    expected_results=[False, False, False],
)
case("matching null", "matching", X, None, 0, "unanswered")
case(
    "matching a-o-n all right",
    "matching",
    {**X, "scoring": "all_or_nothing"},
    {"pairs": [0, 1, 2]},
    3,
    "correct",
)
case(
    "matching a-o-n one wrong gets zero",
    "matching",
    {**X, "scoring": "all_or_nothing"},
    {"pairs": [0, 1, 3]},
    0,
    "incorrect",
)
case(
    "matching index zero is an answer",
    "matching",
    {"answer": [0, 1], "points": 2},
    {"pairs": [0, 0]},
    1,
    "partial",
    expected_results=[True, False],
)

# ---------------------------------------------------------------- ungraded
# Ungraded questions never earn points: `earned` is null whether answered or not.
U = {"points": 0, "ungraded": True}
case("ungraded single picked", "single", U, {"choice": 0}, None, "ungraded")
case("ungraded single unanswered", "single", U, None, None, "unanswered")
case("ungraded single choice null", "single", U, {"choice": None}, None, "unanswered")
case("ungraded multi picked", "multi", U, {"choices": [0, 2]}, None, "ungraded")
case("ungraded multi empty", "multi", U, {"choices": []}, None, "unanswered")
case("ungraded multi null", "multi", U, None, None, "unanswered")
case("ungraded short text", "short", U, {"text": "anything"}, None, "ungraded")
case("ungraded short blank", "short", U, {"text": "   "}, None, "unanswered")
case("ungraded short null", "short", U, None, None, "unanswered")
UF = {**U, "fields": [fld("A"), fld("B")]}
case(
    "ungraded fields one filled", "fields", UF, {"fields": ["", "x"]}, None, "ungraded"
)
case(
    "ungraded fields all blank", "fields", UF, {"fields": ["", " "]}, None, "unanswered"
)
case("ungraded fields null", "fields", UF, None, None, "unanswered")
case(
    "ungraded essay text",
    "essay",
    U,
    {"text": "my view", "word_count": 2},
    None,
    "ungraded",
)
case("ungraded essay blank", "essay", U, {"text": ""}, None, "unanswered")
case("ungraded essay null", "essay", U, None, None, "unanswered")
UO = {**U, "n": 3}
case("ungraded ordering ranked", "ordering", UO, {"order": [2, 0, 1]}, None, "ungraded")
case(
    "ungraded ordering written order",
    "ordering",
    UO,
    {"order": [0, 1, 2]},
    None,
    "ungraded",
)
case(
    "ungraded ordering wrong length",
    "ordering",
    UO,
    {"order": [0, 1]},
    None,
    "unanswered",
)
case("ungraded ordering null", "ordering", UO, None, None, "unanswered")
SC = {"points": 0, "min": 1, "max": 5, "labels": {}}
case("scale answered", "scale", SC, {"value": 4}, None, "ungraded")
case("scale at the low end", "scale", SC, {"value": 1}, None, "ungraded")
case(
    "scale zero is an answer", "scale", {**SC, "min": 0}, {"value": 0}, None, "ungraded"
)
case("scale unanswered", "scale", SC, None, None, "unanswered")
case("scale value null", "scale", SC, {"value": None}, None, "unanswered")
case("scale without ungraded flag", "scale", SC, {"value": 3}, None, "ungraded")

# ---------------------------------------------------------------- follow-up text
# {input} text never changes the grade. `inputs` is keyed by original choice index.
case(
    "single right with follow-up text",
    "single",
    S,
    {"choice": 1, "inputs": {"1": "a hackathon"}},
    1,
    "correct",
)
case(
    "single wrong with follow-up text",
    "single",
    S,
    {"choice": 0, "inputs": {"0": "because"}},
    0,
    "incorrect",
)
case("single right without follow-up text", "single", S, {"choice": 1}, 1, "correct")
case(
    "single hidden text for an unselected choice",
    "single",
    S,
    {"choice": 1, "inputs": {"0": "left over"}},
    1,
    "correct",
)
case(
    "single text without a choice is unanswered",
    "single",
    S,
    {"choice": None, "inputs": {"2": "typed"}},
    0,
    "unanswered",
)
case("single follow-up text on the null response", "single", S, None, 0, "unanswered")
case(
    "multi right with follow-up text",
    "multi",
    M,
    {"choices": [0, 2], "inputs": {"2": "details"}},
    2,
    "correct",
)
case(
    "multi partial with follow-up text",
    "multi",
    M,
    {"choices": [0], "inputs": {"0": "x"}},
    1,
    "partial",
)
case(
    "multi hidden text for an unselected choice",
    "multi",
    M,
    {"choices": [0, 2], "inputs": {"1": "left over"}},
    2,
    "correct",
)
case(
    "multi empty choices with text is unanswered",
    "multi",
    M,
    {"choices": [], "inputs": {"2": "typed"}},
    0,
    "unanswered",
)
case(
    "ungraded single with follow-up text",
    "single",
    U,
    {"choice": 2, "inputs": {"2": "a hackathon"}},
    None,
    "ungraded",
)
case(
    "ungraded single unselected with hidden text",
    "single",
    U,
    {"choice": None, "inputs": {"2": "typed"}},
    None,
    "unanswered",
)
case(
    "ungraded multi with follow-up text",
    "multi",
    U,
    {"choices": [1, 2], "inputs": {"2": "x"}},
    None,
    "ungraded",
)

if __name__ == "__main__":
    out = Path(__file__).parent / "grading_cases.json"
    out.write_text(
        json.dumps(CASES, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"wrote {len(CASES)} cases")
