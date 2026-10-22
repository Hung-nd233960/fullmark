"""results.json -> Markdown report (re-graded in Python when the quiz source is available)."""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from .grades import results_hash, validate_grades
from .grading import grade_question, grading_spec, round2
from .models import AUTO_TYPES, Question, Quiz
from .validate import media_refs

FORMAT = "fullmark-results"


class ResultsError(Exception):
    """The results file is unreadable or not a fullmark export."""


def load_results(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except OSError as exc:
        raise ResultsError(f"cannot read {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ResultsError(f"{path} is not valid JSON: {exc}") from exc
    if not isinstance(data, dict) or data.get("format") != FORMAT:
        raise ResultsError(
            f"{path} is not a fullmark results file (format must be {FORMAT!r})"
        )
    if data.get("version") != 1:
        raise ResultsError(
            f"unsupported results version {data.get('version')!r} (this tool reads version 1)"
        )
    for key in ("quiz", "attempt", "score", "questions"):
        if key not in data:
            raise ResultsError(f"results file is missing the {key!r} section")
    if not isinstance(data["questions"], list):
        raise ResultsError("'questions' must be a list")
    return data


def word_count(text: str) -> int:
    return sum(1 for w in text.split() if re.search(r"[^\W_]", w))


# ---------------------------------------------------------------- formatting helpers


def _one_line(s: str) -> str:
    return re.sub(r"\s+", " ", str(s)).strip()


def _code(s: str) -> str:
    """Inline code that survives backticks inside `s`."""
    s = _one_line(s)
    ticks = "`" * (max((len(m) for m in re.findall(r"`+", s)), default=0) + 1)
    pad = " " if s.startswith("`") or s.endswith("`") else ""
    return f"{ticks}{pad}{s}{pad}{ticks}"


def _fence(text: str, lang: str = "text") -> str:
    n = max([3] + [len(m) + 1 for m in re.findall(r"`{3,}", text)])
    f = "`" * n
    return f"{f}{lang}\n{text.rstrip()}\n{f}"


def _quote(md: str) -> str:
    return "\n".join(f"> {ln}".rstrip() for ln in md.strip().split("\n"))


def _pts(x: float | None) -> str:
    if x is None:
        return "?"
    x = round2(x)
    return str(int(x)) if x == int(x) else str(x)


def _letter(i: int) -> str:
    return chr(ord("A") + i) if i < 26 else str(i + 1)


@dataclass
class Row:
    q: dict  # the exported question
    src: Question | None
    status: str
    earned: float | None
    results: list | None = None
    note: str = ""
    tags: list[str] = field(default_factory=list)
    quiz: Quiz | None = None
    ungraded: bool = False  # collects an answer with no right one


def _follow_up(r: dict | None, i: int) -> str:
    """The follow-up text typed under selected choice `i` (a stray entry for an unselected one is
    never asked for), as ': text', or ''."""
    text = ((r or {}).get("inputs") or {}).get(str(i))
    return f": {_one_line(text)}" if isinstance(text, str) and text.strip() else ""


def _choice_text(src: Question | None, i: int, r: dict | None = None) -> str:
    if src is not None and 0 <= i < len(src.choices):
        return f"{_letter(i)}. {_one_line(src.choices[i].md)}{_follow_up(r, i)}"
    return f"choice {i + 1}{_follow_up(r, i)}"


def _item_text(src: Question | None, i: int) -> str:
    if src is not None and 0 <= i < len(src.items):
        return _one_line(src.items[i].md)
    return f"item {i + 1}"


def fmt_response(row: Row) -> str:
    q, r, src = row.q, row.q.get("response"), row.src
    if not r:
        return "(no answer)"
    t = q["type"]
    if t == "single":
        return _choice_text(src, r["choice"], r)
    if t == "multi":
        return "; ".join(_choice_text(src, i, r) for i in r["choices"])
    if t == "truefalse":
        return "True" if r["value"] else "False"
    if t == "scale":
        return _scale_text(row)
    if t == "numeric":
        return _code(r["raw"])
    if t == "short":
        return _code(r["text"])
    if t == "blanks":
        return "; ".join(
            f"{i + 1}. {_code(b) if b else '(empty)'}"
            for i, b in enumerate(r["blanks"])
        )
    if t == "fields":
        labels = (
            [f.label for f in src.spec.fields]
            if src is not None
            else [None] * len(r["fields"])
        )
        return "; ".join(
            f"{_one_line(lbl) if lbl else i + 1}: {_code(v) if v else '(empty)'}"
            for i, (lbl, v) in enumerate(zip(labels, r["fields"], strict=False))
        )
    if t == "ordering":
        order = r.get("order") or []
        return " → ".join(_item_text(src, i) for i in order)
    if t == "matching":
        pairs = r.get("pairs") or []
        lefts = src.match["lefts"] if src is not None and src.match else []
        rights = src.match["rights"] if src is not None and src.match else []
        return "; ".join(
            f"{_one_line(lefts[i]) if i < len(lefts) else i + 1} → "
            + (_one_line(rights[p]) if p is not None and p < len(rights) else "(none)")
            for i, p in enumerate(pairs)
        )
    return "(see below)"


def _scale_text(row: Row) -> str:
    """'4 / 5 (label)' when the quiz source says what the scale is, else just the number."""
    v = (row.q.get("response") or {}).get("value")
    spec = row.src.spec if row.src is not None else None
    if spec is None:
        return str(v)
    label = spec.labels.get(v)
    return f"{v} / {spec.max}" + (f" ({_one_line(label)})" if label else "")


def _choice_plain(src: Question | None, i: int, r: dict | None = None) -> str:
    if src is not None and 0 <= i < len(src.choices):
        return _one_line(src.choices[i].md) + _follow_up(r, i)
    return f"choice {i + 1}" + _follow_up(r, i)


def answer_lines(row: Row, with_inputs: bool = True) -> list[str]:
    """An ungraded answer as readable lines (several for multi, fields and rankings).

    Follow-up text typed under a choice reads 'Something else: a hackathon'; `with_inputs=False`
    gives the choice text only (used by `quiz stats`)."""
    r, src, t = row.q.get("response"), row.src, row.q["type"]
    if not r:
        return []
    if not with_inputs:
        r = {k: v for k, v in r.items() if k != "inputs"}
    if t == "single":
        return [_choice_plain(src, r["choice"], r)]
    if t == "multi":
        return [_choice_plain(src, i, r) for i in r["choices"]]
    if t in ("short", "essay"):
        return [r.get("text", "")]
    if t == "fields":
        labels = (
            [_one_line(f.label) for f in src.spec.fields]
            if src is not None
            else [str(i + 1) for i in range(len(r["fields"]))]
        )
        return [
            f"{lbl}: {v or '(empty)'}"
            for lbl, v in zip(labels, r["fields"], strict=False)
        ]
    if t == "ordering":
        return [_item_text(src, i) for i in r.get("order") or []]
    if t == "scale":
        return [_scale_text(row)]
    return [str(r)]


def answer_text(row: Row, with_inputs: bool = True) -> str:
    """One string for the JSON report: rankings are numbered lines, choices joined by '; '."""
    lines = answer_lines(row, with_inputs)
    if not lines:
        return "(no answer)"
    if row.q["type"] == "ordering":
        return "\n".join(f"{i}. {x}" for i, x in enumerate(lines, 1))
    if row.q["type"] in ("multi", "fields"):
        return "; ".join(lines)
    return lines[0]


def _answer_md(row: Row) -> list[str]:
    """Markdown for an ungraded answer: a list for several lines, a fence for an essay."""
    lines = answer_lines(row)
    t = row.q["type"]
    if not lines:
        return ["_(no answer)_", ""]
    if t == "ordering":
        return [f"{i}. {x}" for i, x in enumerate(lines, 1)] + [""]
    if t in ("multi", "fields"):
        return [f"- {x}" for x in lines] + [""]
    if t == "essay" or "\n" in lines[0]:
        return [_fence(lines[0]), ""]
    return [_code(lines[0]) if t == "short" else lines[0], ""]


def fmt_correct(row: Row) -> str:
    src, c = row.src, row.q.get("correct")
    if src is not None:
        spec = grading_spec(src, row.quiz)
        t = src.type
        if t == "single":
            return _choice_text(src, spec["correct"])
        if t == "multi":
            return "; ".join(_choice_text(src, i) for i in spec["correct"])
        if t == "truefalse":
            return "True" if spec["value"] else "False"
        if t == "numeric":
            tol = (
                f" (within {spec['rel_tolerance'] * 100:g}%)"
                if spec["rel_tolerance"]
                else f" (within {spec['tolerance']:g})"
                if spec["tolerance"]
                else ""
            )
            return " or ".join(f"{v:g}" for v in spec["values"]) + tol
        if t == "short":
            return " | ".join(
                [_code(a) for a in spec["accept"]]
                + [f"regex {_code(p)}" for p in spec["patterns"]]
            )
        if t == "blanks":
            return "; ".join(
                f"{i + 1}. "
                + (
                    f"{b['value']:g}"
                    + (f" ±{b['tolerance']:g}" if b["tolerance"] else "")
                    if b["numeric"]
                    else " / ".join(_code(a) for a in b["accept"])
                )
                for i, b in enumerate(spec["blanks"])
            )
        if t == "ordering":
            return " → ".join(_one_line(it.md) for it in src.items)
        if t == "matching":
            m = src.match
            return "; ".join(
                f"{_one_line(left)} → {_one_line(m['rights'][a])}"
                for left, a in zip(m["lefts"], m["answer"], strict=True)
            )
        if t == "fields":
            parts = []
            for f, fs in zip(src.spec.fields, spec["fields"], strict=True):
                if fs["kind"] == "none":
                    continue
                want = (
                    " or ".join(f"{v:g}" for v in fs["values"])
                    if fs["kind"] == "numeric"
                    else " / ".join(
                        _code(a)
                        for a in fs["accept"] + [f"regex {p}" for p in fs["patterns"]]
                    )
                )
                parts.append(f"{_one_line(f.label)}: {want}")
            return "; ".join(parts)
    if isinstance(c, dict):
        return _code(json.dumps(c, ensure_ascii=False))
    return "(not available)"


# ---------------------------------------------------------------- re-grading


def bank_info(results: dict) -> dict | None:
    """The question-bank record of an attempt ({seed, pool, drawn}), or None."""
    b = results["attempt"].get("bank")
    return b if isinstance(b, dict) else None


def check_draw(results: dict, quiz: Quiz, warnings: list[str]) -> None:
    """Warn when the recorded draw does not fit the quiz's bank settings."""
    bank = bank_info(results)
    if results["attempt"].get("retry_of") and bank is not None:
        # a retry holds the missed questions of an earlier attempt, not a fresh draw
        unknown = set(bank.get("drawn", [])) - {q.id for q in quiz.questions}
        if unknown:
            warnings.append(
                f"retried question(s) not in the quiz source: {', '.join(sorted(unknown))}"
            )
        return
    if bank is None:
        if quiz.has_bank:
            warnings.append(
                "the quiz uses a question bank but the results record no draw"
            )
        return
    if not quiz.has_bank:
        warnings.append("the results record a question-bank draw but the quiz has none")
        return
    drawn = set(bank.get("drawn", []))
    unknown = drawn - {q.id for q in quiz.questions}
    if unknown:
        warnings.append(
            f"drawn question(s) not in the quiz source: {', '.join(sorted(unknown))}"
        )
    for pool, n in quiz.bank_groups():
        got = sum(1 for q in pool if q.id in drawn)
        if got != n:
            warnings.append(
                f"the draw has {got} question(s) from a pool where {n} were expected"
            )
            break


def report_mode(results: dict, quiz: Quiz | None) -> str:
    """'survey' or 'quiz': from the quiz source when there is one, else from the export."""
    if quiz is not None:
        return quiz.meta.mode
    return "survey" if results["attempt"].get("mode") == "survey" else "quiz"


def regrade(results: dict, quiz: Quiz | None, warnings: list[str]) -> list[Row]:
    if quiz is not None:
        check_draw(results, quiz, warnings)
    mode = report_mode(results, quiz)
    by_id = {q.id: q for q in quiz.questions} if quiz else {}
    rows = []
    for eq in sorted(results["questions"], key=lambda x: x.get("index", 0)):
        src = by_id.get(eq["id"])
        if quiz is not None and src is None:
            warnings.append(
                f"question {eq['id']} is not in the quiz source any more; using the browser's grade"
            )
        if src is not None and src.type != eq["type"]:
            warnings.append(
                f"question {eq['id']} changed type ({eq['type']} -> {src.type}); using the browser's grade"
            )
            src = None
        if src is None:
            rows.append(
                Row(
                    eq,
                    None,
                    eq.get("status", "unanswered"),
                    eq.get("earned"),
                    (eq.get("correct") or {}).get("results"),
                    tags=eq.get("tags", []),
                    ungraded=mode == "survey"
                    or eq.get("status") == "ungraded"
                    or eq["type"] == "scale"
                    or (eq.get("points") == 0 and eq.get("earned") is None),
                )
            )
            continue
        g = grade_question(src.type, grading_spec(src, quiz), eq.get("response"))
        if g["status"] != eq.get("status") or (g["earned"] or 0) != (
            eq.get("earned") or 0
        ):
            warnings.append(
                f"{eq['id']}: the browser said {eq.get('status')} ({eq.get('earned')}) but Python grades "
                f"{g['status']} ({g['earned']}); using the Python result"
            )
        rows.append(
            Row(
                eq,
                src,
                g["status"],
                g["earned"],
                g.get("results"),
                tags=list(src.tags),
                quiz=quiz,
                ungraded=src.ungraded,
            )
        )
    return rows


def summarize(rows: list[Row], quiz: Quiz | None, results: dict) -> dict:
    earned = possible = pending = 0.0
    for r in rows:
        pts = r.q["points"]
        if r.ungraded:
            continue
        if r.q["type"] in AUTO_TYPES and r.status != "pending":
            possible += pts
            earned += r.earned or 0
        else:
            pending += pts
    earned = round2(earned)
    pct = round2(earned / possible * 100) if possible else None
    pass_mark = quiz.meta.pass_mark if quiz else None
    passed = (
        (pct >= pass_mark)
        if (pct is not None and pass_mark is not None)
        else results["score"].get("passed")
    )
    return {
        "earned": earned,
        "possible_auto": possible,
        "pending": pending,
        "percent": pct,
        "passed": passed,
        "pass_mark": pass_mark,
    }


# ---------------------------------------------------------------- AI grades


def _ai_criteria(r: Row) -> list[str]:
    spec = r.src.spec if r.src is not None else None
    rubric = getattr(spec, "rubric", []) if spec is not None else []
    return [re.split(r":\s", x, maxsplit=1)[0].strip() for x in rubric] or [
        "Overall quality"
    ]


def _is_band(r: Row) -> bool:
    return r.src is not None and getattr(r.src.spec, "scoring", "points") == "band"


def _counts_by_ai(r: Row) -> bool:
    """AI points add to the total only for questions the auto-grader left pending,
    and never for band questions (a band is not a number of points)."""
    auto_counted = r.q["type"] in AUTO_TYPES and r.status != "pending"
    return not auto_counted and not _is_band(r) and not r.ungraded


def checked_grades(
    grades: dict | None, rows: list[Row], results: dict, warnings: list[str]
) -> dict[str, dict]:
    """The validated grades by question id; raises GradesError on bad input."""
    if grades is None:
        return {}
    by_id = {r.q["id"]: r for r in rows if _needs_ai(r)}
    validate_grades(
        grades,
        {k: {"points": r.q["points"]} for k, r in by_id.items()},
        results,
        warnings,
        ungraded={r.q["id"] for r in rows if r.ungraded},
    )
    missing = [k for k in by_id if k not in grades["grades"]]
    if missing:
        warnings.append(f"no AI grade given for: {', '.join(missing)}")
    return dict(grades["grades"])


def final_totals(rows: list[Row], summary: dict, given: dict[str, dict]) -> dict:
    earned, possible = summary["earned"], summary["possible_auto"]
    for r in rows:
        g = given.get(r.q["id"])
        if g and g.get("score") is not None and _counts_by_ai(r):
            earned += g["score"]
            possible += r.q["points"]
    earned = round2(earned)
    return {
        "final_earned": earned,
        "final_possible": possible,
        "final_percent": round2(earned / possible * 100) if possible else None,
    }


# ---------------------------------------------------------------- the report


def make_report(
    results: dict,
    quiz: Quiz | None,
    warnings: list[str],
    grades: dict | None = None,
) -> str:
    rows = regrade(results, quiz, warnings)
    given = checked_grades(grades, rows, results, warnings)
    if report_mode(results, quiz) == "survey":
        return _survey_report(rows, results, warnings)
    s = summarize(rows, quiz, results)
    att = results["attempt"]
    qinfo = results["quiz"]
    out: list[str] = [f"# Report: {_one_line(qinfo['title'])}", ""]

    # 1. summary
    out += ["## Summary", ""]
    when = att.get("submitted_at") or att.get("started_at") or "unknown"
    out.append(f"- **Quiz:** {_one_line(qinfo['title'])} (`{qinfo['id']}`)")
    out.append(f"- **Date:** {when}")
    used = att.get("elapsed_seconds")
    limit = att.get("time_limit_seconds")
    if used is not None:
        out.append(
            f"- **Time used:** {used // 60} min {used % 60} s"
            + (f" of {limit // 60} min" if limit else "")
        )
    if not att.get("submitted"):
        out.append("- **Status:** not submitted (exported before the end)")
    if att.get("timed_out"):
        out.append("- **Timed out:** yes, answers were submitted automatically")
    if att.get("overtime_seconds"):
        out.append(f"- **Overtime:** {att['overtime_seconds']} s")
    if s["percent"] is not None:
        out.append(
            f"- **Score:** {_pts(s['earned'])} of {_pts(s['possible_auto'])} auto-graded points ({s['percent']:g}%)"
        )
    else:
        out.append("- **Score:** no auto-graded points")
    if s["passed"] is not None:
        mark = f" (pass mark {s['pass_mark']:g}%)" if s["pass_mark"] is not None else ""
        out.append(f"- **Result:** {'passed' if s['passed'] else 'not passed'}{mark}")
    out.append(
        f"- **Pending review:** {_pts(s['pending'])} points (essay, code and ungraded fields)"
    )
    if grades is not None:
        f = final_totals(rows, s, given)
        pct = "" if f["final_percent"] is None else f" ({f['final_percent']:g}%)"
        out.append(
            f"- **Final score (with AI grades):** {_pts(f['final_earned'])} of {_pts(f['final_possible'])} points{pct}"
        )
    bank = bank_info(results)
    if att.get("retry_of") and bank:
        out.append(
            f"- **Retry:** {len(bank.get('drawn', []))} missed question(s) from the attempt started {att['retry_of']}"
        )
    elif bank:
        out.append(
            f"- **Question bank:** {len(bank.get('drawn', []))} questions drawn from a pool of {bank.get('pool')}"
        )
    if quiz is None:
        out.append(
            "- **Grading source:** the browser's grades (no quiz source found; pass `--quiz` to re-grade)"
        )
    out.append("")
    if warnings:
        out += ["Warnings:", ""] + [f"- {w}" for w in warnings] + [""]

    # 2. per-tag
    tag_stats: dict[str, list[float]] = {}
    for r in rows:
        if r.q["type"] in AUTO_TYPES and r.status != "pending" and not r.ungraded:
            for t in r.tags:
                st = tag_stats.setdefault(t, [0.0, 0.0])
                st[0] += r.earned or 0
                st[1] += r.q["points"]
    out += ["## By topic", ""]
    if tag_stats:
        out += ["| Topic | Earned | Possible | Percent |", "|---|---|---|---|"]
        for t in sorted(tag_stats):
            e, p = tag_stats[t]
            out.append(f"| {t} | {_pts(e)} | {_pts(p)} | {round2(e / p * 100):g}% |")
    else:
        out.append("No tagged auto-graded questions.")
    out.append("")

    # 3. question table
    out += ["## Questions", "", "| # | Type | Status | Points |", "|---|---|---|---|"]
    for r in rows:
        if r.ungraded:
            out.append(f"| {r.q['index']} | {r.q['type']} | {r.status} | not scored |")
            continue
        earned = "?" if r.earned is None else _pts(r.earned)
        out.append(
            f"| {r.q['index']} | {r.q['type']} | {r.status} | {earned} / {_pts(r.q['points'])} |"
        )
    out.append("")

    # 3b. ungraded answers
    unscored = [r for r in rows if r.ungraded]
    if unscored:
        out += ["## Answers", ""]
        for r in unscored:
            out += [f"### Q{r.q['index']}: {_one_line(r.q.get('title', ''))}", ""]
            out += _answer_md(r)

    # 4. review
    wrong = [
        r
        for r in rows
        if r.status in ("incorrect", "partial", "unanswered")
        and r.q["type"] in AUTO_TYPES
        and not r.ungraded
    ]
    out += ["## Review these", ""]
    if not wrong:
        out += ["Nothing to review: every auto-graded question is correct.", ""]
    for r in wrong:
        q = r.q
        out += [
            f"### Q{q['index']}: {q['type']}, {r.status} ({_pts(r.earned)} of {_pts(q['points'])} pts)",
            "",
        ]
        out += ["Prompt:", "", _quote(_prompt(r)), ""]
        out.append(f"- **Your answer:** {fmt_response(r)}")
        out.append(f"- **Correct answer:** {fmt_correct(r)}")
        if r.tags:
            out.append(f"- **Topics:** {', '.join(r.tags)}")
        out.append("")
        if r.src is not None and r.src.explanation_md.strip():
            out += ["Explanation:", "", _quote(r.src.explanation_md), ""]

    # 5. pending
    out += ["## Pending AI review", ""]
    pend = [r for r in rows if _needs_ai(r)]
    if not pend:
        out += ["No essay, code or ungraded answers.", ""]
    for r in pend:
        out += _pending_section(r, given.get(r.q["id"]))
    return "\n".join(out).rstrip() + "\n"


def _survey_report(rows: list[Row], results: dict, warnings: list[str]) -> str:
    """A survey has no score: the report is the list of answers, grouped by section."""
    att, qinfo = results["attempt"], results["quiz"]
    out: list[str] = [f"# Answers: {_one_line(qinfo['title'])}", ""]
    when = att.get("submitted_at") or att.get("started_at") or "unknown"
    answered = sum(1 for r in rows if r.q.get("response"))
    out.append(f"- **Survey:** {_one_line(qinfo['title'])} (`{qinfo['id']}`)")
    out.append(f"- **Date:** {when}")
    used = att.get("elapsed_seconds")
    if used is not None:
        out.append(f"- **Time used:** {used // 60} min {used % 60} s")
    if not att.get("submitted"):
        out.append("- **Status:** not finished (exported before the end)")
    out.append(f"- **Answered:** {answered} of {len(rows)} questions")
    out.append("")
    if warnings:
        out += ["Warnings:", ""] + [f"- {w}" for w in warnings] + [""]
    last: object = object()
    for r in rows:
        section = r.q.get("section")
        if section != last:
            last = section
            if section:
                out += [f"## {_one_line(section)}", ""]
        out += [f"### {r.q['index']}. {_one_line(r.q.get('title', ''))}", ""]
        out += _answer_md(r)
    return "\n".join(out).rstrip() + "\n"


def _prompt(r: Row) -> str:
    q = r.q
    if r.src is None:
        return _one_line(q.get("title", ""))
    parts = [r.src.title_md]
    if r.src.prompt_md.strip():
        parts.append(r.src.prompt_md)
    return "\n\n".join(parts)


def _needs_ai(r: Row) -> bool:
    t = r.q["type"]
    if r.ungraded:
        return False
    if t in ("essay", "code"):
        return r.status != "unanswered"
    if t == "fields" and r.src is not None:
        return any(f.kind == "none" for f in r.src.spec.fields) and bool(
            r.q.get("response")
        )
    return False


def _graded_block(r: Row, g: dict) -> list[str]:
    out = ["#### Grading", ""]
    if g.get("band") is not None:
        out.append(f"- Overall band: {g['band']:g}")
    if g.get("score") is not None:
        out.append(f"- Overall score: {g['score']:g} / {_pts(r.q['points'])}")
    for name, v in (g.get("criteria") or {}).items():
        if v is not None:
            out.append(f"  - {_one_line(name)}: {v:g}")
    if g.get("justification"):
        out.append(f"- Justification: {_one_line(g['justification'])}")
    if g.get("improvement"):
        out.append(f"- Improvement: {_one_line(g['improvement'])}")
    return out + [""]


def _pending_section(r: Row, grade: dict | None = None) -> list[str]:
    q, src = r.q, r.src
    spec = src.spec if src is not None else None
    resp = q.get("response") or {}
    out = [
        f"### Q{q['index']}: {q['type']} ({_pts(q['points'])} pts)",
        "",
        "Prompt:",
        "",
        _quote(_prompt(r)),
        "",
    ]
    if src is not None:
        imgs = [
            path
            for text in (src.title_md, src.prompt_md)
            for _, path in media_refs(text)
        ]
        if imgs:
            out += [
                "Media in the prompt (not included here): "
                + ", ".join(_code(i) for i in imgs),
                "",
            ]
    rubric = spec.rubric if spec is not None and hasattr(spec, "rubric") else []
    if rubric:
        out += ["Rubric:", ""] + [f"- {_one_line(x)}" for x in rubric] + [""]
    elif src is None:
        out += ["Rubric: not available (pass `--quiz` with the quiz source).", ""]

    if q["type"] == "essay":
        text = resp.get("text", "")
        n = word_count(text)
        lo, hi = (spec.min_words, spec.max_words) if spec is not None else (0, 0)
        limits = []
        if lo:
            limits.append(f"minimum {lo}")
        if hi:
            limits.append(f"maximum {hi}")
        verdict = ""
        if lo and n < lo:
            verdict = ", below the minimum"
        elif hi and n > hi:
            verdict = ", over the maximum"
        out += [
            f"Word count: {n}" + (f" ({', '.join(limits)}{verdict})" if limits else ""),
            "",
            "Response:",
            "",
            _fence(text),
            "",
        ]
    elif q["type"] == "code":
        lang = resp.get("language") or (spec.language if spec is not None else "text")
        out += [
            f"Language: {lang} (the code was not executed)",
            "",
            "Response:",
            "",
            _fence(resp.get("code", ""), lang),
            "",
        ]
    else:  # fields with ungraded entries
        out += ["Ungraded fields:", ""]
        vals = resp.get("fields", [])
        for i, f in enumerate(spec.fields):
            if f.kind == "none":
                v = vals[i] if i < len(vals) else ""
                out += [f"- {_one_line(f.label)}: {_code(v) if v else '(empty)'}"]
        out.append("")

    if grade is not None:
        return out + _graded_block(r, grade)
    band = spec is not None and getattr(spec, "scoring", "points") == "band"
    out += ["#### Grading", ""]
    names = [re.split(r":\s", x, maxsplit=1)[0].strip() for x in rubric] or [
        "Overall quality"
    ]
    if band:
        out += [
            "Give a band from 0 to 9 (half bands allowed) for each criterion and overall.",
            "",
        ]
        out += [f"- {n} band: ?" for n in names]
        out += ["- Overall band: ?"]
    else:
        out += ["- Score per rubric line:"] + [f"  - {n}: ?" for n in names]
        out += [f"- Overall score: ? / {_pts(q['points'])}"]
    out += ["- Strengths:", "  - ?", "  - ?", "- Improvements:", "  - ?", "  - ?", ""]
    return out


# ---------------------------------------------------------------- the JSON report


def make_report_json(
    results: dict,
    quiz: Quiz | None,
    warnings: list[str],
    grades: dict | None = None,
) -> dict:
    """Same content as make_report, as plain data for programs and agents."""
    rows = regrade(results, quiz, warnings)
    given = checked_grades(grades, rows, results, warnings)
    s = summarize(rows, quiz, results)
    if grades is not None:
        s.update(final_totals(rows, s, given))
    tag_stats: dict[str, list[float]] = {}
    for r in rows:
        if r.q["type"] in AUTO_TYPES and r.status != "pending" and not r.ungraded:
            for t in r.tags:
                st = tag_stats.setdefault(t, [0.0, 0.0])
                st[0] += r.earned or 0
                st[1] += r.q["points"]
    questions = []
    for r in rows:
        q = r.q
        auto = q["type"] in AUTO_TYPES and not r.ungraded
        item = {
            "index": q["index"],
            "id": q["id"],
            "type": q["type"],
            "status": r.status,
            "earned": None if r.earned is None else round2(r.earned),
            "points": q["points"],
            "tags": r.tags,
            "prompt": _prompt(r),
            "your_answer": answer_text(r) if r.ungraded else fmt_response(r),
            "needs_review": auto and r.status in ("incorrect", "partial", "unanswered"),
            "needs_ai_grading": _needs_ai(r),
        }
        if auto:
            item["correct_answer"] = fmt_correct(r)
        inputs = (q.get("response") or {}).get("inputs")
        if inputs and q["type"] in ("single", "multi"):
            item["inputs"] = inputs
            item["answer_text"] = answer_text(r)
        if r.ungraded:
            item["ungraded"] = True
            item["section"] = q.get("section")
            item["response"] = q.get("response")
            item["answer_text"] = answer_text(r)
        if r.src is not None and r.src.explanation_md.strip():
            item["explanation"] = r.src.explanation_md.strip()
        if item["needs_ai_grading"]:
            item["ai_grading"] = _ai_block(r)
            if q["id"] in given:
                item["ai_grading"]["result"] = given[q["id"]]
        questions.append(item)
    att = results["attempt"]
    return {
        "format": "fullmark-report",
        "version": 1,
        "quiz": results["quiz"],
        "attempt": att,
        "results_hash": results_hash(results),
        "graded_from_source": quiz is not None,
        "mode": report_mode(results, quiz),
        "question_bank": bank_info(results),
        "summary": s,
        "warnings": warnings,
        "by_topic": [
            {
                "topic": t,
                "earned": round2(e),
                "possible": p,
                "percent": round2(e / p * 100),
            }
            for t, (e, p) in sorted(tag_stats.items())
        ],
        "questions": questions,
    }


def _ai_block(r: Row) -> dict:
    """What an agent needs to grade an essay, code or ungraded-field answer."""
    q, src = r.q, r.src
    spec = src.spec if src is not None else None
    resp = q.get("response") or {}
    rubric = [_one_line(x) for x in getattr(spec, "rubric", [])] if spec else []
    block: dict = {
        "rubric": rubric,
        "criteria": [re.split(r":\s", x, maxsplit=1)[0].strip() for x in rubric]
        or ["Overall quality"],
        "scoring": getattr(spec, "scoring", "points") if spec else "points",
    }
    if q["type"] == "essay":
        text = resp.get("text", "")
        block["response"] = text
        block["word_count"] = word_count(text)
        if spec is not None:
            block["min_words"], block["max_words"] = spec.min_words, spec.max_words
    elif q["type"] == "code":
        block["response"] = resp.get("code", "")
        block["language"] = resp.get("language") or (
            spec.language if spec is not None else "text"
        )
        block["executed"] = False
    else:
        vals = resp.get("fields", [])
        block["ungraded_fields"] = [
            {"label": _one_line(f.label), "value": vals[i] if i < len(vals) else ""}
            for i, f in enumerate(spec.fields)
            if f.kind == "none"
        ]
    return block
