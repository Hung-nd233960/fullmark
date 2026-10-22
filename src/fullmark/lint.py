"""Quality warnings: things that parse fine but make a weak question."""

import re
from collections import Counter

from .models import Findings, Question, Quiz

_NONE_ABOVE_RE = re.compile(
    r"^\s*(all|none|both|neither)\s+of\s+(the\s+)?(above|these|those)\b", re.IGNORECASE
)
_WORD_RE = re.compile(r"\w+")


def _norm(md: str) -> str:
    return " ".join(md.lower().split())


def lint(quiz: Quiz, findings: Findings) -> None:
    for q in quiz.questions:
        if q.ungraded:
            continue
        _lint_choices(q, findings)
        _lint_explanation(q, findings)
    _lint_positions(quiz, findings)


def _lint_choices(q: Question, findings: Findings) -> None:
    if q.type not in ("single", "multi") or len(q.choices) < 2:
        return
    seen: dict[str, int] = {}
    for c in q.choices:
        key = _norm(c.md)
        if key in seen:
            findings.warn(
                c.line, f"choice repeats the one on line {seen[key]}", q.label
            )
        seen.setdefault(key, c.line)
        if _NONE_ABOVE_RE.match(c.md):
            findings.warn(
                c.line,
                "'all/none of the above' choices break when choices are shuffled "
                "and let learners guess; rewrite the options",
                q.label,
            )
    right = [c for c in q.choices if c.correct]
    wrong = [c for c in q.choices if not c.correct]
    if q.type != "single" or len(right) != 1:
        return
    if len(wrong) >= 2:
        longest = max(len(c.md) for c in wrong)
        if len(right[0].md) > 40 and len(right[0].md) > 1.8 * longest:
            findings.warn(
                right[0].line,
                "the correct choice is much longer than every distractor, which gives it away",
                q.label,
            )
    stem = _norm(q.prompt_md + " " + q.title_md)
    key = _norm(right[0].md)
    if len(key) >= 12 and key in stem:
        findings.warn(
            right[0].line,
            "the question text already contains the correct choice",
            q.label,
        )


def _lint_explanation(q: Question, findings: Findings) -> None:
    if q.auto and q.explanation_md and len(_WORD_RE.findall(q.explanation_md)) < 4:
        findings.warn(
            q.line,
            "explanation is too short to teach anything; say why the answer is right",
            q.label,
        )


def _lint_positions(quiz: Quiz, findings: Findings) -> None:
    if quiz.meta.shuffle_choices:
        return
    singles = [
        q
        for q in quiz.questions
        if q.type == "single"
        and not q.ungraded
        and len(q.choices) >= 3
        and q.shuffle is not True
    ]
    if len(singles) < 8:
        return
    pos = Counter(
        next(i for i, c in enumerate(q.choices) if c.correct) for q in singles
    )
    place, n = pos.most_common(1)[0]
    if n / len(singles) > 0.5:
        findings.warn(
            1,
            f"{n} of {len(singles)} single-choice answers are option {chr(65 + place)}; "
            "vary the position or set shuffle_choices: true",
        )
