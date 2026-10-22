"""Authoritative grading. Mirrored one-to-one by the grader in static/quiz.js.

Every function works on plain dicts so the same golden cases (tests/grading_cases.json)
can drive both implementations. A grading spec always carries `points`; see `grading_spec`.
"""

import math
import re

from .models import AUTO_TYPES, Question, Quiz
from .numparse import parse_number

EPS = 1e-9
STATUSES = ("correct", "partial", "incorrect", "unanswered", "pending", "ungraded")


def round2(x: float) -> float:
    """Round half up to 2 decimals (same formula as the JavaScript grader)."""
    return math.floor(x * 100 + 0.5 + EPS) / 100


def normalize_text(text: str, case: str = "insensitive") -> str:
    s = re.sub(r"\s+", " ", text.strip())
    return s if case == "sensitive" else s.lower()


def match_text(text: str, accept: list[str], patterns: list[str], case: str) -> bool:
    s = normalize_text(text, case)
    if not s:
        return False
    if any(s == normalize_text(a, case) for a in accept):
        return True
    flags = re.ASCII | (0 if case == "sensitive" else re.IGNORECASE)
    return any(re.fullmatch(p, s, flags) for p in patterns)


def match_number(
    raw: str, values: list[float], tolerance: float, rel_tolerance: float | None
) -> bool:
    x = parse_number(raw)
    if x is None:
        return False
    for t in values:
        allowed = rel_tolerance * abs(t) if rel_tolerance is not None else tolerance
        if abs(x - t) <= allowed + EPS:
            return True
    return False


def _result(earned: float, status: str, **extra) -> dict:
    return {"earned": earned, "status": status, **extra}


def _scored(points: float, share: float, answered: bool) -> dict:
    """Turn a 0..1 share of the points into earned/status."""
    if not answered:
        return _result(0, "unanswered")
    earned = round2(points * share)
    if earned >= points - EPS:
        return _result(points, "correct")
    return _result(earned, "partial" if earned > 0 else "incorrect")


def _text(response: dict | None, key: str = "text") -> str:
    if not response:
        return ""
    v = response.get(key)
    return v if isinstance(v, str) else ""


def grade_question(qtype: str, spec: dict, response: dict | None) -> dict:
    """Grade one response. Returns {earned, status, ...}; essay/code are never graded here."""
    points = spec["points"]
    case = spec.get("case", "insensitive")

    if spec.get("ungraded") or qtype == "scale":
        return _grade_ungraded(qtype, spec, response)

    if qtype in ("essay", "code"):
        key = "text" if qtype == "essay" else "code"
        return _result(
            None, "pending" if _text(response, key).strip() else "unanswered"
        )

    if qtype == "single":
        choice = response.get("choice") if response else None
        if choice is None:
            return _result(0, "unanswered")
        return _scored(points, 1.0 if choice == spec["correct"] else 0.0, True)

    if qtype == "multi":
        chosen = set(response.get("choices") or []) if response else set()
        if not chosen:
            return _result(0, "unanswered")
        correct = set(spec["correct"])
        if spec.get("scoring", "partial") == "all_or_nothing":
            share = 1.0 if chosen == correct else 0.0
        else:
            share = max(
                0.0, (len(chosen & correct) - len(chosen - correct)) / len(correct)
            )
        return _scored(points, share, True)

    if qtype == "truefalse":
        value = response.get("value") if response else None
        if not isinstance(value, bool):
            return _result(0, "unanswered")
        return _scored(points, 1.0 if value == spec["value"] else 0.0, True)

    if qtype == "numeric":
        raw = _text(response, "raw")
        if not raw.strip():
            return _result(0, "unanswered")
        ok = match_number(
            raw, spec["values"], spec.get("tolerance", 0), spec.get("rel_tolerance")
        )
        return _scored(points, 1.0 if ok else 0.0, True)

    if qtype == "short":
        text = _text(response)
        if not text.strip():
            return _result(0, "unanswered")
        ok = match_text(text, spec["accept"], spec["patterns"], case)
        return _scored(points, 1.0 if ok else 0.0, True)

    if qtype == "blanks":
        given = list(response.get("blanks") or []) if response else []
        blanks = spec["blanks"]
        given += [""] * (len(blanks) - len(given))
        results = [
            _blank_ok(b, str(g or ""), case)
            for b, g in zip(blanks, given, strict=False)
        ]
        answered = any(str(g or "").strip() for g in given)
        out = _scored(points, sum(results) / len(blanks), answered)
        out["results"] = results if answered else [False] * len(blanks)
        return out

    if qtype == "fields":
        return _grade_fields(spec, response, case)

    if qtype == "ordering":
        order = response.get("order") if response else None
        if not isinstance(order, list) or len(order) != spec["n"]:
            return _result(0, "unanswered")
        results = [pos == item for pos, item in enumerate(order)]
        out = _scored(points, _share(results, spec), True)
        out["results"] = results
        return out

    if qtype == "matching":
        given = list(response.get("pairs") or []) if response else []
        answer = spec["answer"]
        given += [None] * (len(answer) - len(given))
        results = [g == a for g, a in zip(given, answer, strict=False)]
        answered = any(g is not None for g in given)
        out = _scored(points, _share(results, spec), answered)
        out["results"] = results if answered else [False] * len(answer)
        return out

    raise ValueError(f"unknown question type {qtype!r}")


def _grade_ungraded(qtype: str, spec: dict, response: dict | None) -> dict:
    """Ungraded questions collect an answer: `ungraded` when given, else `unanswered`.

    `earned` is always null, so nothing counts toward any total.
    """
    r = response or {}
    if qtype == "single":
        answered = r.get("choice") is not None
    elif qtype == "multi":
        answered = bool(r.get("choices"))
    elif qtype in ("short", "essay"):
        answered = bool(_text(response).strip())
    elif qtype == "fields":
        answered = any(str(g or "").strip() for g in r.get("fields") or [])
    elif qtype == "ordering":
        order = r.get("order")
        answered = isinstance(order, list) and len(order) == spec["n"]
    elif qtype == "scale":
        v = r.get("value")
        answered = isinstance(v, int) and not isinstance(v, bool)
    else:
        raise ValueError(f"question type {qtype!r} cannot be ungraded")
    return _result(None, "ungraded" if answered else "unanswered")


def _share(results: list[bool], spec: dict) -> float:
    """Share of the points for ordering and matching (partial per item, or all or nothing)."""
    if spec.get("scoring", "partial") == "all_or_nothing":
        return 1.0 if all(results) else 0.0
    return sum(results) / len(results)


def _blank_ok(blank: dict, text: str, case: str) -> bool:
    if blank["numeric"]:
        return match_number(text, [blank["value"]], blank["tolerance"], None)
    return match_text(text, blank["accept"], [], case)


def _grade_fields(spec: dict, response: dict | None, case: str) -> dict:
    points = spec["points"]
    fields = spec["fields"]
    given = list(response.get("fields") or []) if response else []
    given += [""] * (len(fields) - len(given))
    graded = [i for i, f in enumerate(fields) if f["kind"] != "none"]
    if not graded:
        return _result(
            None,
            "pending" if any(str(g or "").strip() for g in given) else "unanswered",
        )

    explicit = sum(
        fields[i]["points"] for i in graded if fields[i]["points"] is not None
    )
    unset = [i for i in graded if fields[i]["points"] is None]
    share = max(points - explicit, 0) / len(unset) if unset else 0
    weights = {
        i: fields[i]["points"] if fields[i]["points"] is not None else share
        for i in graded
    }
    total = sum(weights.values())

    results: list[bool | None] = [None] * len(fields)
    for i in graded:
        f, text = fields[i], str(given[i] or "")
        if f["kind"] == "numeric":
            results[i] = match_number(
                text, f["values"], f["tolerance"], f["rel_tolerance"]
            )
        else:
            results[i] = match_text(text, f["accept"], f["patterns"], case)
    answered = any(str(given[i] or "").strip() for i in graded)
    got = sum(weights[i] for i in graded if results[i])
    out = _scored(points, got / total if total else 0.0, answered)
    out["results"] = results
    return out


# ------------------------------------------------------------------ specs from models


def grading_spec(q: Question, quiz: Quiz) -> dict | None:
    """Canonical grading spec for a parsed question (the answer key entry)."""
    spec: dict = {"points": q.points, "case": q.case}
    if q.ungraded:
        spec["ungraded"] = True
        if q.type == "ordering":
            spec["n"] = len(q.items)
        elif q.type == "fields":
            spec["fields"] = q.spec.canonical()["fields"]
        elif q.type == "scale":
            spec.update(q.spec.canonical())
        elif q.type == "essay":
            spec.update({"min_words": q.spec.min_words, "max_words": q.spec.max_words})
        return spec
    if q.type == "single":
        spec["correct"] = next(i for i, c in enumerate(q.choices) if c.correct)
    elif q.type == "multi":
        spec["correct"] = [i for i, c in enumerate(q.choices) if c.correct]
        spec["scoring"] = quiz.meta.multi_scoring
    elif q.type == "blanks":
        spec["blanks"] = q.blanks
    elif q.type in ("truefalse", "numeric", "short", "fields"):
        spec.update(q.spec.canonical())
    elif q.type == "ordering":
        spec.update({"n": len(q.items), "scoring": quiz.meta.multi_scoring})
    elif q.type == "matching":
        spec.update({"answer": q.match["answer"], "scoring": quiz.meta.multi_scoring})
    elif q.type == "essay":
        spec.update({"min_words": q.spec.min_words, "max_words": q.spec.max_words})
    return spec


# ------------------------------------------------------------------ quiz-level score


def score_attempt(
    quiz: Quiz, responses: dict[str, dict | None], drawn: list[str] | None = None
) -> dict:
    """Grade a whole attempt. `responses` maps question id -> response (or None).

    `drawn` lists the question ids of a question-bank attempt; others are left out.
    """
    per_question = {}
    earned = possible_auto = pending = 0.0
    questions = [q for q in quiz.questions if drawn is None or q.id in drawn]
    for q in questions:
        r = grade_question(q.type, grading_spec(q, quiz), responses.get(q.id))
        per_question[q.id] = r
        if q.ungraded:
            continue
        if q.type in AUTO_TYPES and r["status"] != "pending":
            possible_auto += q.points
            earned += r["earned"]
        else:
            pending += q.points
    earned = round2(earned)
    pct = round2(earned / possible_auto * 100) if possible_auto else None
    pass_mark = quiz.meta.pass_mark
    return {
        "per_question": per_question,
        "score": {
            "earned": earned,
            "possible_auto": possible_auto,
            "pending_points": pending,
            "possible_total": sum(q.points for q in questions if not q.ungraded),
            "percent_auto": pct,
            "passed": (pct >= pass_mark)
            if (pct is not None and pass_mark is not None)
            else None,
        },
    }
