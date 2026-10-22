"""Shared test helpers: correct/wrong responses from a quiz key, and filling them into a page."""

import json
from pathlib import Path

from jsonschema import Draft202012Validator

from fullmark.grading import grading_spec

SCHEMAS = Path(__file__).parent.parent / "src" / "fullmark" / "schemas"


def _validate(data: dict, name: str) -> None:
    schema = json.loads(
        (SCHEMAS / f"{name}-v1.schema.json").read_text(encoding="utf-8")
    )
    errors = sorted(
        Draft202012Validator(schema).iter_errors(data), key=lambda e: list(e.path)
    )
    assert not errors, [f"{'/'.join(map(str, e.path))}: {e.message}" for e in errors]


def validate_results(data: dict) -> None:
    """Fail if a results export does not match results-v1.schema.json."""
    _validate(data, "results")


def validate_report(data: dict) -> None:
    """Fail if a JSON report does not match report-v1.schema.json."""
    _validate(data, "report")


def answer_ungraded(q, spec):
    """Some answer to an ungraded question (there is no right one)."""
    t = q.type
    if t == "single":
        return {"choice": 0}
    if t == "multi":
        return {"choices": [0]}
    if t == "short":
        return {"text": "anything"}
    if t == "fields":
        return {"fields": ["x"] * len(spec["fields"])}
    if t == "ordering":
        return {"order": list(reversed(range(spec["n"])))}
    if t == "scale":
        return {"value": spec["max"]}
    return {"text": "word " * 20, "word_count": 20}


def correct_response(q, quiz):
    spec = grading_spec(q, quiz)
    if q.ungraded:
        return answer_ungraded(q, spec)
    t = q.type
    if t == "single":
        return {"choice": spec["correct"]}
    if t == "multi":
        return {"choices": spec["correct"]}
    if t == "truefalse":
        return {"value": spec["value"]}
    if t == "numeric":
        return {"raw": str(spec["values"][0])}
    if t == "short":
        return {"text": spec["accept"][0]}
    if t == "blanks":
        return {
            "blanks": [
                str(b["value"]) if b["numeric"] else b["accept"][0]
                for b in spec["blanks"]
            ]
        }
    if t == "fields":
        out = []
        for f in spec["fields"]:
            if f["kind"] == "none":
                out.append("notes")
            elif f["kind"] == "numeric":
                out.append(str(f["values"][0]))
            else:
                out.append(f["accept"][0])
        return {"fields": out}
    if t == "ordering":
        return {"order": list(range(spec["n"]))}
    if t == "matching":
        return {"pairs": list(spec["answer"])}
    if t == "essay":
        return {"text": "word " * 200, "word_count": 200}
    return {"language": q.spec.language, "code": q.spec.reference}


def wrong_response(q, quiz):
    spec = grading_spec(q, quiz)
    t = q.type
    if t == "single":
        return {
            "choice": next(i for i in range(len(q.choices)) if i != spec["correct"])
        }
    if t == "multi":
        wrong = [i for i in range(len(q.choices)) if i not in spec["correct"]]
        return {"choices": wrong[:1]}
    if t == "truefalse":
        return {"value": not spec["value"]}
    if t == "numeric":
        return {"raw": "987654"}
    if t == "short":
        return {"text": "definitely not it"}
    if t == "blanks":
        return {"blanks": ["zzz"] * len(spec["blanks"])}
    if t == "fields":
        return {
            "fields": ["zzz" if f["kind"] != "none" else "" for f in spec["fields"]]
        }
    if t == "ordering":
        return {"order": list(reversed(range(spec["n"])))}
    if t == "matching":
        n = len(q.match["rights"])
        return {"pairs": [(a + 1) % n for a in spec["answer"]]}
    raise ValueError(t)


def fill(page, q, resp):
    _fill(page, q, resp)
    if q.type in ("single", "multi"):
        card = page.locator(f"#card-{q.id}")
        for k, v in (resp.get("inputs") or {}).items():
            card.locator(f".qm-followup-input[data-followup='{k}']").fill(v)


def _fill(page, q, resp):
    """Type/click a response (export shape) into question `q`'s card."""
    card = page.locator(f"#card-{q.id}")
    t = q.type
    if t == "single":
        card.locator(f"input[name='c-{q.id}'][value='{resp['choice']}']").check()
    elif t == "multi":
        for c in resp["choices"]:
            card.locator(f"input[name='c-{q.id}'][value='{c}']").check()
    elif t == "truefalse":
        card.locator(
            f"input[name='c-{q.id}'][value='{str(resp['value']).lower()}']"
        ).check()
    elif t in ("numeric", "short"):
        card.locator(".qm-input").fill(resp.get("raw", resp.get("text")))
    elif t == "blanks":
        for i, v in enumerate(resp["blanks"]):
            card.locator(f".qm-blank[data-blank='{i}']").fill(v)
    elif t == "fields":
        for i, v in enumerate(resp["fields"]):
            card.locator(f"[data-field='{i}']").fill(v)
    elif t == "ordering":
        items = card.locator(".qm-order > li")
        for pos, want in enumerate(resp["order"]):
            while items.nth(pos).get_attribute("data-item") != str(want):
                src = card.locator(f".qm-order > li[data-item='{want}']")
                src.locator("[data-dir='-1']").click()
    elif t == "matching":
        for i, v in enumerate(resp["pairs"]):
            card.locator(f"[data-pair='{i}']").select_option(
                "" if v is None else str(v)
            )
    elif t == "scale":
        card.locator(f"input[name='c-{q.id}'][value='{resp['value']}']").check(
            force=True
        )
    elif t == "essay":
        card.locator("textarea").fill(resp["text"])
    elif t == "code":
        card.locator("textarea").fill(resp["code"])
