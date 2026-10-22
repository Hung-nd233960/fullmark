"""quiz inspect: a structural summary of a quiz (types, points, tags, answer positions)."""

from collections import Counter

from .models import Quiz


def inspect_quiz(quiz: Quiz) -> dict:
    qs = quiz.questions
    types = Counter(f"{q.type} (ungraded)" if q.ungraded else q.type for q in qs)
    tags: dict[str, dict] = {}
    for q in qs:
        for t in q.tags:
            e = tags.setdefault(t, {"questions": 0, "points": 0.0})
            e["questions"] += 1
            e["points"] += q.points
    auto = sum(q.points for q in qs if q.auto)
    total = sum(q.points for q in qs)
    positions = Counter(
        chr(65 + next(i for i, c in enumerate(q.choices) if c.correct))
        for q in qs
        if q.type == "single" and not q.ungraded and any(c.correct for c in q.choices)
    )
    sections = []
    for i, s in enumerate(quiz.sections):
        mine = [q for q in qs if q.section == i]
        sections.append(
            {
                "title": s.title,
                "questions": len(mine),
                "points": sum(q.points for q in mine),
            }
        )
    return {
        "title": quiz.meta.title,
        "mode": quiz.meta.mode,
        "ungraded": sum(1 for q in qs if q.ungraded),
        "questions": len(qs),
        "points": total,
        "auto_points": auto,
        "manual_points": total - auto,
        "types": dict(sorted(types.items(), key=lambda kv: -kv[1])),
        "sections": sections,
        "tags": dict(sorted(tags.items())),
        "untagged": sum(1 for q in qs if not q.tags),
        "single_answer_positions": dict(sorted(positions.items())),
        "time_limit": quiz.meta.time_limit,
        "generated_by": quiz.meta.generated_by,
        "shuffle_choices": quiz.meta.shuffle_choices,
    }


def render_inspect(d: dict) -> str:
    if d["mode"] == "survey":
        summary = f"{d['questions']} questions (survey: nothing is scored)"
    else:
        summary = (
            f"{d['questions']} questions, {d['points']:g} points "
            f"({d['auto_points']:g} auto-graded, {d['manual_points']:g} manual)"
        )
        if d["ungraded"]:
            summary += f"; {d['ungraded']} ungraded"
    out = [
        f"{d['title']}",
        summary,
        "",
        "Types: " + ", ".join(f"{t} {n}" for t, n in d["types"].items()),
    ]
    if d["single_answer_positions"]:
        pos = ", ".join(f"{k} {v}" for k, v in d["single_answer_positions"].items())
        shuf = " (choices are shuffled)" if d["shuffle_choices"] else ""
        out.append(f"Single-choice answer positions: {pos}{shuf}")
    if d.get("generated_by"):
        out.append(f"Written by: {d['generated_by']}")
    out += ["", "Sections:"]
    pts = d["mode"] != "survey"
    out += [
        f"  {s['title']}: {s['questions']} questions"
        + (f", {s['points']:g} points" if pts else "")
        for s in d["sections"]
    ]
    if d["tags"]:
        out += ["", "Tags:"]
        out += [
            f"  {t}: {e['questions']} questions"
            + (f", {e['points']:g} points" if pts else "")
            for t, e in d["tags"].items()
        ]
    if d.get("review"):
        r = d["review"]
        line = (
            f"Review: {r['kept']} kept, {r['to_fix']} to fix, {r['to_drop']} to drop, "
        )
        line += f"{r['changed']} changed since flagged, {r['unreviewed']} unreviewed"
        out += ["", line]
    if d["untagged"]:
        out.append(
            f"  ({d['untagged']} questions have no tag and are left out of the topic report)"
        )
    return "\n".join(out) + "\n"
