"""grades-v1: the scores an agent gives to essay, code and ungraded-field answers."""

import hashlib
import json
from pathlib import Path

FORMAT = "fullmark-grades"


class GradesError(Exception):
    """The grades file is unreadable, or does not fit the results."""

    def __init__(self, problems: list[str]):
        super().__init__("; ".join(problems))
        self.problems = problems


def results_hash(results: dict) -> str:
    """A stable fingerprint of a results file (key order and spacing do not matter)."""
    text = json.dumps(
        results, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def load_grades(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except OSError as exc:
        raise GradesError([f"cannot read {path}: {exc}"]) from exc
    except json.JSONDecodeError as exc:
        raise GradesError([f"{path} is not valid JSON: {exc}"]) from exc
    if not isinstance(data, dict) or data.get("format") != FORMAT:
        raise GradesError(
            [f"{path} is not a fullmark grades file (format must be {FORMAT!r})"]
        )
    if data.get("version") != 1:
        raise GradesError(
            [
                f"unsupported grades version {data.get('version')!r} (this tool reads version 1)"
            ]
        )
    if not isinstance(data.get("grades"), dict):
        raise GradesError(["'grades' must be an object keyed by question id"])
    return data


def _number(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def validate_grades(
    grades: dict,
    ai: dict[str, dict],
    results: dict,
    warnings: list[str],
    ungraded: set[str] | None = None,
) -> None:
    """Raise GradesError listing every problem. `ai` maps id -> {points, counts}
    for the questions that need AI grading."""
    problems: list[str] = []
    want = grades.get("results_hash")
    if want and want != results_hash(results):
        warnings.append(
            "the grades were made for a different results file (results_hash does not match)"
        )
    for qid, g in grades["grades"].items():
        if ungraded and qid in ungraded:
            problems.append(f"{qid}: an ungraded question takes no grade")
            continue
        if qid not in ai:
            problems.append(f"{qid}: no such question needing AI grading")
            continue
        if not isinstance(g, dict):
            problems.append(f"{qid}: the grade must be an object")
            continue
        pts = ai[qid]["points"]
        score, band = g.get("score"), g.get("band")
        if score is not None and (not _number(score) or not 0 <= score <= pts):
            problems.append(
                f"{qid}: score {score!r} must be a number from 0 to {pts:g}"
            )
        if band is not None and (
            not _number(band) or not 0 <= band <= 9 or (band * 2) % 1 != 0
        ):
            problems.append(f"{qid}: band {band!r} must be 0 to 9 in steps of 0.5")
        crit = g.get("criteria", {})
        if not isinstance(crit, dict) or any(
            v is not None and not _number(v) for v in crit.values()
        ):
            problems.append(f"{qid}: criteria must map names to numbers")
    if problems:
        raise GradesError(problems)


def template(results: dict, ai_items: list[tuple[str, list[str]]]) -> dict:
    """An empty grades file for the agent to fill in. ai_items is [(id, criteria)]."""
    return {
        "format": FORMAT,
        "version": 1,
        "results_hash": results_hash(results),
        "grades": {
            qid: {
                "score": None,
                "band": None,
                "criteria": dict.fromkeys(criteria),
                "justification": "",
                "improvement": "",
            }
            for qid, criteria in ai_items
        },
    }
