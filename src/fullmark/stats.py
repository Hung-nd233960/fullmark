"""quiz stats: progress across several attempts at the same quiz."""

from pathlib import Path

from .grading import round2
from .models import AUTO_TYPES, Quiz
from .report import ResultsError, answer_text, load_results, regrade, summarize

# Ungraded questions whose answers are worth following over time.
TRACKED = ("scale", "single")


def attempt_stats(path: Path, quiz: Quiz | None, warnings: list[str]) -> dict:
    results = load_results(path)
    local: list[str] = []
    rows = regrade(results, quiz, local)
    warnings += [f"{path.name}: {w}" for w in local]
    s = summarize(rows, quiz, results)
    tags: dict[str, list[float]] = {}
    answers = {}
    for r in rows:
        if r.ungraded:
            if r.q["type"] in TRACKED and r.q.get("response"):
                answers[r.q["id"]] = {
                    "index": r.q["index"],
                    "type": r.q["type"],
                    "title": r.q.get("title", ""),
                    "text": answer_text(r, with_inputs=False),
                }
            continue
        if r.q["type"] in AUTO_TYPES and r.status != "pending":
            for t in r.tags:
                st = tags.setdefault(t, [0.0, 0.0])
                st[0] += r.earned or 0
                st[1] += r.q["points"]
    return {
        "file": path.name,
        "quiz_id": results["quiz"].get("id"),
        "quiz_hash": results["quiz"].get("hash"),
        "started_at": results["attempt"].get("started_at") or "",
        "earned": s["earned"],
        "possible": s["possible_auto"],
        "percent": s["percent"],
        "answers": answers,
        "tags": {t: round2(e / p * 100) for t, (e, p) in sorted(tags.items()) if p},
    }


def collect(paths: list[Path], quiz: Quiz | None) -> tuple[dict, list[str]]:
    """Stats for every file, oldest first. Raises ResultsError for unusable input."""
    warnings: list[str] = []
    attempts = [attempt_stats(p, quiz, warnings) for p in paths]
    ids = {a["quiz_id"] for a in attempts}
    if len(ids) > 1:
        raise ResultsError(
            "these results belong to different quizzes: "
            + ", ".join(sorted(map(str, ids)))
        )
    if len({a["quiz_hash"] for a in attempts}) > 1:
        warnings.append(
            "the quiz changed between attempts (different hashes); topic changes may not compare like for like"
        )
    attempts.sort(key=lambda a: a["started_at"])
    first, last = attempts[0], attempts[-1]
    tag_names = sorted({t for a in attempts for t in a["tags"]})
    topics = []
    for t in tag_names:
        series = [a["tags"].get(t) for a in attempts]
        seen = [v for v in series if v is not None]
        change = round2(seen[-1] - seen[0]) if len(seen) > 1 else None
        topics.append({"topic": t, "percent": series, "change": change})
    weakest = sorted(last["tags"].items(), key=lambda kv: (kv[1], kv[0]))[:3]
    seen_q: dict[str, dict] = {}
    for a in attempts:
        for qid, info in a["answers"].items():
            seen_q.setdefault(qid, info)
    answers_over_time = [
        {
            "id": qid,
            "type": info["type"],
            "title": info["title"],
            "values": [a["answers"].get(qid, {}).get("text") for a in attempts],
        }
        for qid, info in sorted(seen_q.items(), key=lambda kv: kv[1]["index"])
    ]
    return (
        {
            "quiz": {"id": first["quiz_id"]},
            "attempts": attempts,
            "topics": topics,
            "answers_over_time": answers_over_time,
            "weakest": [{"topic": t, "percent": p} for t, p in weakest],
        },
        warnings,
    )


def _cell(text: str, limit: int) -> str:
    """One line for a table cell: no pipes, no line breaks, shortened."""
    one = " ".join(text.split()).replace("|", "\\|")
    return one if len(one) <= limit else one[: limit - 1].rstrip() + "..."


def _pct(x) -> str:
    return "-" if x is None else f"{x:g}%"


def render(stats: dict) -> str:
    atts = stats["attempts"]
    out = [f"# Progress: {stats['quiz']['id']}", "", "## Attempts", ""]
    out += ["| # | Date | Score | Percent |", "|---|---|---|---|"]
    for i, a in enumerate(atts, 1):
        score = (
            "not scored"
            if not a["possible"]
            else f"{a['earned']:g} / {a['possible']:g}"
        )
        out.append(
            f"| {i} | {a['started_at'] or 'unknown'} | {score} | {_pct(a['percent'])} |"
        )
    out += ["", "## By topic", ""]
    if stats["topics"]:
        head = ["Topic"] + [f"#{i}" for i in range(1, len(atts) + 1)] + ["Change"]
        out += ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
        for t in stats["topics"]:
            change = "-" if t["change"] is None else f"{t['change']:+g}"
            cells = [t["topic"]] + [_pct(v) for v in t["percent"]] + [change]
            out.append("| " + " | ".join(cells) + " |")
    else:
        out.append("No tagged auto-graded questions.")
    if stats["answers_over_time"]:
        out += ["", "## Answers over time", ""]
        head = ["Question"] + [f"#{i}" for i in range(1, len(atts) + 1)]
        out += ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
        for row in stats["answers_over_time"]:
            cells = [_cell(row["title"], 60)] + [
                "-" if v is None else _cell(v, 40) for v in row["values"]
            ]
            out.append("| " + " | ".join(cells) + " |")
    out += ["", "## Weakest topics (latest attempt)", ""]
    if stats["weakest"]:
        out += [
            f"{i}. {w['topic']}: {_pct(w['percent'])}"
            for i, w in enumerate(stats["weakest"], 1)
        ]
    else:
        out.append("None.")
    return "\n".join(out) + "\n"
