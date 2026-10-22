"""`quiz review`: a review form per question, the review file it writes, and the check.

The learner judges the questions an agent wrote (keep, fix or drop, and what is wrong).
The form is an ordinary survey made in memory from the quiz, served by `quiz serve`'s
machinery. `review.json` records the verdicts; `quiz check --review` then holds the author
to them. Questions are matched to review items by id and by a hash of their source block.
"""

import hashlib
import json
import re
from datetime import datetime
from pathlib import Path

from .blanks import BLANK_RE, find_blanks
from .models import Finding, Findings, Question, Quiz

VERDICTS = ("keep", "fix", "drop")
PROBLEMS = {
    "key-wrong": "The answer key is wrong",
    "not-in-material": "Not in my material",
    "unclear": "Unclear wording",
    "too-easy": "Too easy",
    "too-hard": "Too hard",
    "duplicate": "Duplicate of another question",
}
FORMAT_BY = "quiz review"
SCHEMA = Path(__file__).parent / "schemas" / "review-v1.schema.json"


class ReviewError(Exception):
    pass


# ---------------------------------------------------------------- hashes and matching


def block_hashes(quiz: Quiz, text: str) -> dict[str, str]:
    """Question id -> SHA-256 (16 hex) of its normalized source block.

    The block runs from the `##` heading to the line before the next heading of a
    question or section, with line endings normalized and trailing blanks removed."""
    lines = text.replace("\r\n", "\n").split("\n")
    bounds = {q.line for q in quiz.questions}
    bounds |= {s.line for s in quiz.sections if s.title}
    ordered = sorted(bounds)
    out = {}
    for q in quiz.questions:
        nxt = next((b for b in ordered if b > q.line), len(lines) + 1)
        block = [ln.rstrip() for ln in lines[q.line - 1 : nxt - 1]]
        while block and not block[-1]:
            block.pop()
        out[q.id] = hashlib.sha256("\n".join(block).encode("utf-8")).hexdigest()[:16]
    return out


def match_items(
    hashes: dict[str, str],
    items: dict[str, dict],
    explicit: set[str] | None = None,
) -> dict[str, str | None]:
    """Question id -> the key of its review item (or None).

    Three passes, each on what is left: id and hash both equal; hash equal (the id is
    missing or a default `qN` that moved); id equal (the question was edited; explicit ids only)."""
    result: dict[str, str | None] = dict.fromkeys(hashes)
    free = dict(items)

    def take(pairs):
        for qid, key in pairs:
            if result[qid] is None and key in free:
                result[qid] = key
                del free[key]

    take(
        (qid, qid)
        for qid, h in hashes.items()
        if qid in free and free[qid]["hash"] == h
    )
    for qid, h in hashes.items():
        if result[qid] is None:
            key = next((k for k, it in free.items() if it["hash"] == h), None)
            if key is not None:
                result[qid] = key
                del free[key]
    # a default qN says nothing about which question this is, so only explicit ids count
    take((qid, qid) for qid in hashes if explicit is None or qid in explicit)
    return result


# ---------------------------------------------------------------- the file


def new_review(quiz: Quiz) -> dict:
    return {
        "version": 1,
        "by": FORMAT_BY,
        "quiz": {"id": quiz.id, "source_hash": quiz.source_hash},
        "reviewed_at": now(),
        "items": {},
    }


def now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def load_review(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError) as exc:
        raise ReviewError(f"cannot read {path}: {exc}") from exc
    except ValueError as exc:
        raise ReviewError(f"{path} is not valid JSON: {exc}") from exc
    if not isinstance(data, dict) or data.get("version") != 1:
        raise ReviewError(f"{path} is not a fullmark review file (version 1)")
    if not isinstance(data.get("quiz"), dict) or not isinstance(
        data.get("items"), dict
    ):
        raise ReviewError(f"{path}: needs 'quiz' and 'items' objects")
    for key, it in data["items"].items():
        if (
            not isinstance(it, dict)
            or not isinstance(it.get("hash"), str)
            or it.get("verdict") not in VERDICTS
        ):
            raise ReviewError(
                f"{path}: item {key!r} needs a 'hash' and a verdict of keep, fix or drop"
            )
        it.setdefault("text", "")
        it.setdefault("problems", [])
        it.setdefault("note", "")
    return data


def merge(base: dict, new_items: dict[str, dict], quiz: Quiz) -> dict:
    """`base` with newer items replacing older ones; items not shown are kept."""
    out = dict(base)
    items = dict(base["items"])
    for key, it in new_items.items():
        for old_key in [
            k for k, o in items.items() if o["hash"] == it["hash"] and k != key
        ]:
            del items[old_key]  # the same question under an older id
        items[key] = it
    out["items"] = items
    out["by"] = FORMAT_BY
    out["quiz"] = {"id": quiz.id, "source_hash": quiz.source_hash}
    out["reviewed_at"] = now()
    return out


def write_review(path: Path, review: dict) -> None:
    path.write_text(
        json.dumps(review, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def counts(quiz: Quiz, text: str, review: dict | None) -> dict:
    """How the questions stand against a review."""
    hashes = block_hashes(quiz, text)
    items = review["items"] if review else {}
    matched = match_items(hashes, items, explicit_ids(quiz, text))
    c = {"kept": 0, "to_fix": 0, "to_drop": 0, "changed": 0, "unreviewed": 0}
    for qid, key in matched.items():
        it = items.get(key) if key else None
        if it is None:
            c["unreviewed"] += 1
        elif it["verdict"] == "drop":
            c["to_drop"] += 1
        elif it["hash"] != hashes[qid]:
            c["changed" if it["verdict"] == "fix" else "unreviewed"] += 1
        elif it["verdict"] == "fix":
            c["to_fix"] += 1
        else:
            c["kept"] += 1
    return c


def unseen(quiz: Quiz, text: str, review: dict) -> set[str]:
    """Ids of the questions that are new or changed since `review`."""
    hashes = block_hashes(quiz, text)
    matched = match_items(hashes, review["items"], explicit_ids(quiz, text))
    return {
        qid
        for qid, key in matched.items()
        if key is None or review["items"][key]["hash"] != hashes[qid]
    }


def missing_ids(quiz: Quiz, text: str) -> list[Question]:
    """Questions whose `##` heading has no explicit id= (they are matched by hash only)."""
    lines = text.split("\n")
    return [q for q in quiz.questions if not re.search(r"\bid=", lines[q.line - 1])]


def explicit_ids(quiz: Quiz, text: str) -> set[str]:
    loose = {q.id for q in missing_ids(quiz, text)}
    return {q.id for q in quiz.questions} - loose


# ---------------------------------------------------------------- the check


def review_findings(quiz: Quiz, text: str, review: dict, file: str) -> Findings:
    """Findings (rule ids review.*) for a quiz held against its review."""
    found = Findings(file)
    hashes = block_hashes(quiz, text)
    items = review["items"]
    matched = match_items(hashes, items, explicit_ids(quiz, text))

    def add(sev, q, rule, msg):
        found.append(Finding(file, q.line, sev, msg, q.id, rule))

    for q in quiz.questions:
        it = items.get(matched[q.id]) if matched[q.id] else None
        if it is None:
            add(
                "warning",
                q,
                "review.unreviewed",
                "this question has no review verdict; run quiz review --since",
            )
            continue
        same = it["hash"] == hashes[q.id]
        reason = f": {it['text']}" if it["text"] else ""
        if it["verdict"] == "drop":
            add(
                "error",
                q,
                "review.drop",
                f"the reviewer marked this question to drop{reason}",
            )
        elif it["verdict"] == "fix":
            if same:
                add(
                    "error",
                    q,
                    "review.fix",
                    f"the reviewer asked for a fix and the question is unchanged{reason}",
                )
            else:
                add(
                    "info",
                    q,
                    "review.changed",
                    "a flagged question was changed; re-review it with quiz review --since",
                )
        elif not same:
            add(
                "warning",
                q,
                "review.unreviewed",
                "this question changed after it was kept; re-review it with quiz review --since",
            )
        if "key-wrong" in it["problems"] and same:
            add(
                "error",
                q,
                "review.key-wrong",
                "the reviewer says the answer key is wrong and the question is unchanged",
            )
    return found


# ---------------------------------------------------------------- the review survey


def _code(s: str) -> str:
    """Inline code that survives any backticks inside `s`."""
    runs = [len(m) for m in re.findall(r"`+", s)]
    fence = "`" * (max(runs, default=0) + 1)
    pad = " " if s.startswith("`") or s.endswith("`") else ""
    return f"{fence}{pad}{s}{pad}{fence}"


def _quote(md: str) -> str:
    return "\n".join(f"> {ln}" if ln else ">" for ln in md.split("\n"))


def _indent(md: str) -> str:
    return md.replace("\n", "\n    ")


def _num(v: float) -> str:
    return f"{v:g}"


def _blank_words(md: str) -> str:
    return BLANK_RE.sub("▁▁▁▁", md)


def key_lines(q: Question) -> list[str]:
    """The answer key as Markdown lines, as the type has it."""
    spec = q.spec
    if q.ungraded:
        return ["No answer key: this question is not scored."]
    t = q.type
    if t in ("single", "multi"):
        right = [i for i, c in enumerate(q.choices) if c.correct]
        return ["Correct: " + ", ".join(f"**{chr(65 + i)}**" for i in right)]
    if t == "truefalse":
        return [f"Correct: **{'True' if spec.value else 'False'}**"]
    if t == "numeric":
        tol = (
            f" (relative tolerance {_num(spec.rel_tolerance)})"
            if spec.rel_tolerance is not None
            else f" (tolerance {_num(spec.tolerance)})"
            if spec.tolerance
            else ""
        )
        unit = f" {spec.unit}" if spec.unit else ""
        return ["Accepted: " + ", ".join(_num(v) for v in spec.targets()) + unit + tol]
    if t == "short":
        out = (
            ["Accepted: " + ", ".join(_code(a) for a in spec.accept)]
            if spec.accept
            else []
        )
        if spec.patterns:
            out.append("Patterns: " + ", ".join(_code(p) for p in spec.patterns))
        return [*out, f"Case: {q.case}"]
    if t == "blanks":
        out = []
        for n, b in enumerate(find_blanks(q.title_md + " \n" + q.prompt_md), 1):
            if b.numeric:
                out.append(
                    f"- Blank {n}: {_num(b.value or 0)} (tolerance {_num(b.tolerance)})"
                )
            else:
                out.append(f"- Blank {n}: " + ", ".join(_code(v) for v in b.variants))
        return out
    if t == "fields":
        out = []
        for f in spec.fields:
            if f.kind == "numeric":
                ans = ", ".join(_num(v) for v in f.targets()) + (
                    f" (tolerance {_num(f.tolerance)})" if f.tolerance else ""
                )
            else:
                ans = ", ".join(_code(a) for a in f.accept) or "(pattern)"
            out.append(f"- {f.label}: {ans}")
        return out
    if t == "ordering":
        return [
            "Correct order:",
            *(f"{n}. {_indent(c.md)}" for n, c in enumerate(q.items, 1)),
        ]
    if t == "matching" and q.match:
        m = q.match
        out = [
            f"- {left} :: {m['rights'][m['answer'][i]]}"
            for i, left in enumerate(m["lefts"])
        ]
        extra = [r for i, r in enumerate(m["rights"]) if i not in m["answer"]]
        return out + [f"- Distractor: {r}" for r in extra]
    if t in ("essay", "code"):
        out = []
        if t == "essay" and (spec.min_words or spec.max_words):
            out.append(
                f"Words: {spec.min_words or 0} to {spec.max_words or 'no limit'}"
            )
        out += [f"- Rubric: {r}" for r in spec.rubric] or ["No rubric."]
        ref = spec.sample_answer if t == "essay" else spec.reference
        if ref.strip():
            out += ["", "Model answer:", "", ref.strip()]
        return out
    return []


def card_intro(q: Question, total: int) -> str:
    """The Markdown shown above a question's three review inputs."""
    blanks = q.type == "blanks"
    show = _blank_words if blanks else (lambda s: s)
    facts = [
        f"`{q.id}`",
        q.type + (" (not scored)" if q.ungraded else ""),
        f"source line {q.line}",
    ]
    if not q.ungraded:
        facts.insert(2, f"{_num(q.points)} point{'s' if q.points != 1 else ''}")
    if q.tags:
        facts.append("tags: " + ", ".join(q.tags))
    shown = [f"**{show(q.title_md)}**"]
    if q.prompt_md:
        shown.append(show(q.prompt_md))
    if q.choices:
        shown.append(
            "\n".join(
                f"- **{chr(65 + i)}.** {_indent(show(c.md))}"
                for i, c in enumerate(q.choices)
            )
        )
    if q.type == "ordering":
        shown.append(
            "Items, as the learner sees them (shuffled):\n\n"
            + "\n".join(f"- {_indent(c.md)}" for c in q.items)
        )
    if q.type == "matching" and q.match:
        shown.append(
            "Left side: "
            + "; ".join(q.match["lefts"])
            + "\n\nRight side: "
            + "; ".join(q.match["rights"])
        )
    if q.hint_md:
        shown.append(f"_Hint:_ {q.hint_md}")
    parts = [
        " · ".join(facts),
        _quote("\n\n".join(shown)),
        "**Answer key**",
        "\n".join(key_lines(q)),
    ]
    if q.explanation_md:
        parts += ["**Explanation**", q.explanation_md]
    return "\n\n".join(p for p in parts if p)


def survey_ids(qid: str) -> dict[str, str]:
    return {
        "verdict": f"{qid}-verdict",
        "problems": f"{qid}-problems",
        "note": f"{qid}-note",
    }


def build_survey(quiz: Quiz, only: set[str] | None = None) -> str:
    """The review form as quiz Markdown (a survey), one section per question."""
    shown = [q for q in quiz.questions if only is None or q.id in only]
    head = [
        "---",
        f"title: {json.dumps('Review: ' + quiz.meta.title, ensure_ascii=False)}",
        "description: Check each question against your material. Keep it, ask for a fix, or drop it. Nothing is scored.",
        "mode: survey",
        "review: true",
        f"id: {quiz.id}-review",
        "---",
        "",
        "Each card shows a question as it appears in the quiz, with its answer key. Press **Finish** when you are done; cards without a verdict count as not reviewed.",
        "",
    ]
    body = []
    for q in shown:
        ids = survey_ids(q.id)
        body += [
            f"# Question {q.index} of {len(quiz.questions)}",
            "",
            card_intro(q, len(quiz.questions)),
            "",
            f"## Your verdict on question {q.index} {{id={ids['verdict']}}}",
            "",
            "- [ ] Keep",
            '- [ ] Fix {input="What should change?"}',
            '- [ ] Drop {input="Why?"}',
            "",
            f"## What is wrong with question {q.index}? (optional) {{type=multi id={ids['problems']}}}",
            "",
            *(f"- [ ] {label}" for label in PROBLEMS.values()),
            "",
            f"## A note on question {q.index} (optional) {{type=short id={ids['note']}}}",
            "",
        ]
    return "\n".join(head + body)


def items_from_results(
    results: dict, quiz: Quiz, hashes: dict[str, str]
) -> tuple[dict, int]:
    """Review items from the posted survey answers, and how many cards had no verdict."""
    answers = {q["id"]: q.get("response") or {} for q in results["questions"]}
    problem_ids = list(PROBLEMS)
    out, skipped = {}, 0
    for q in quiz.questions:
        ids = survey_ids(q.id)
        if ids["verdict"] not in answers:
            continue  # not on this form (--since)
        verdict = answers[ids["verdict"]]
        if "choice" not in verdict:
            skipped += 1
            continue
        idx = int(verdict["choice"])
        text = (verdict.get("inputs") or {}).get(str(idx), "").strip()
        picked = answers[ids["problems"]].get("choices") or []
        out[q.id] = {
            "hash": hashes[q.id],
            "verdict": VERDICTS[idx],
            "text": text if idx else "",
            "problems": [
                problem_ids[i] for i in sorted(set(picked)) if 0 <= i < len(problem_ids)
            ],
            "note": (answers[ids["note"]].get("text") or "").strip(),
        }
    return out, skipped


def make_form(
    quiz: Quiz, base_dir: Path, only: set[str] | None = None
) -> tuple[Quiz | None, Findings, str]:
    """The review survey parsed and validated like any quiz: (form, findings, source)."""
    from .validate import load_quiz_text

    text = build_survey(quiz, only)
    form, findings = load_quiz_text(text, "review-form", f"{quiz.id}-review", base_dir)
    return form, findings, text
